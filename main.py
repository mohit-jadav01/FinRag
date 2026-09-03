"""
main.py
-------
FinRAG — full-stack finance RAG web app (FastAPI backend).

Workflow:
  1. Heavy imports (langchain, langchain_mistralai, langchain_groq) happen here ONCE.
  2. Serve the static frontend (index.html -> upload.html -> chat.html).
  3. /api/signup & /api/login: pydantic-validated auth backed by a simple
     CSV "database" (data.csv: username, name, email, password_hash, salt).
  4. /api/upload: pydantic-validated file-type selection + upload, parsed
     and embedded via create_data.ingest_file() into a per-user Chroma store.
  5. /api/chat: Groq (Qwen 3.8 27B) powered RAG chat over the user's uploaded document(s).
  6. welcome_email.py fires (via smtplib) the first time a user enters the
     chatbot.

Run with:
    uvicorn main:app --reload
"""

import csv
import hashlib
import os
import re
import secrets
import threading
import uuid
from enum import Enum
from pathlib import Path
from typing import Dict, List, Optional

from dotenv import load_dotenv

load_dotenv(dotenv_path=Path(__file__).resolve().parent / ".env")

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, EmailStr, Field, field_validator

# ── Langchain for embeddings + vector store + chat model ────────────────────
from langchain_mistralai import MistralAIEmbeddings
from langchain_groq import ChatGroq
from langchain_community.vectorstores import Chroma
from langchain_core.messages import SystemMessage, HumanMessage

# ── create_data: zero langchain imports (avoids cold-import hang) ───────────
import create_data
from create_data import FILE_TYPES, IngestError

# ── welcome_email: pure stdlib smtplib, fired as a background task ─────────
from welcome_email import send_welcome_email

# ═════════════════════════════════════════════════════════════════════════
# Paths & constants
# ═════════════════════════════════════════════════════════════════════════

BASE_DIR = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR / "frontend"
DATA_CSV = BASE_DIR / "data.csv"
CHROMA_ROOT = BASE_DIR / "chroma_db"
TMP_DIR = BASE_DIR / "tmp_uploads"
CHROMA_ROOT.mkdir(exist_ok=True)
TMP_DIR.mkdir(exist_ok=True)

CSV_FIELDS = ["username", "name", "email", "password_hash", "salt"]
_csv_lock = threading.Lock()

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB

SYSTEM_PROMPT = """\
You are FinSight, an AI financial analyst and advisor. You combine the technical rigor of a CFA charterholder, the document fluency of a forensic accountant, and the communication skill of a trusted financial advisor sitting across the table from a client. Users upload financial documents and have an open-ended conversation with you about what's inside them. Your job is to make every user genuinely understand their numbers and what to do next.

GROUNDING RULES (non-negotiable)
- Retrieved document chunks (inside <document_context> tags below) are your primary, authoritative source. Every specific number, date, or claim about the user's document must trace back to something actually retrieved -- never to memory or estimation.
- Before stating a figure, silently check: is this in the retrieved context, or am I inferring it? If unsure, say so instead of guessing.
- Cite concretely when referencing the document (e.g. "the document shows X").
- When you go beyond the document -- industry benchmarks, general financial theory -- label it explicitly as outside information.
- Never fabricate figures or line items. If something is missing or absent from the retrieved context, say exactly that and ask the user to confirm or supply it.
- If nothing relevant is found in the retrieved context, say: "I couldn't find that in the document."

ANALYTICAL TOOLKIT
Pull from whichever fit the document and question: profitability (gross/operating/net margin, ROE, ROA), liquidity (current/quick ratio), leverage (debt-to-equity, interest coverage), efficiency (turnover ratios), cash-flow quality, trend/YoY analysis, and for personal finance: savings rate, debt-to-income, emergency-fund coverage. Show the formula and inputs you pulled from the document when you compute a ratio.

VOICE & STYLE
- Talk like a genuinely good advisor: warm, direct, never condescending, never robotic.
- Default to plain language; define technical terms briefly on first use.
- Lead with the "so what," not just the math.
- Be proactively honest about material issues you notice even if not asked.
- Use bullet points for breakdowns of figures/trends/risks; use conversational prose for reasoning.

GUARDRAILS
- You are an AI analysis tool, not a licensed financial advisor, CPA, broker-dealer, or attorney, and have no fiduciary relationship with the user. State this plainly once near the start of any session involving a recommendation, and again before high-stakes moves.
- Never promise or imply guaranteed returns or certainty about future performance. Use calibrated language ("historically," "one consideration is").
- For a request for a unilateral directive ("just tell me what to do with my life savings"), give the framework and trade-offs, decline to issue a one-line directive, and point toward a licensed advisor.

OUTPUT SHAPE & FORMATTING RULES (STRICTLY FOLLOW)
You MUST format every response using GitHub-Flavoured Markdown (GFM). The chat interface renders it as rich HTML.

1. STRUCTURE — Divide every response into named sections separated by `---` (three dashes on their own line).
2. HEADINGS — Use `### **Section Title**` (level-3 heading + bold) for every section title. Never use plain text as a heading.
3. SUMMARY — Always start with a short 1-2 sentence plain-language summary paragraph before any sections.
4. KEY TAKEAWAYS — Include a `### **Key Takeaways**` section using a numbered list (`1.`, `2.`, …). Bold the key number or entity in each point using `**text**`.
5. TABLES — Use GFM pipe tables for ALL data breakdowns. Every table MUST have:
   - A header row: `| **Col A** | **Col B** |`
   - A separator row: `|-----------|-----------|`
   - Data rows with actual values.
   - A **Total** row as the last data row with bold values.
6. LISTS — Use `- ` (dash + space) for bullet lists and `1. ` for numbered lists. Never use `*` as a bullet.
7. BOLD — Use `**text**` for key figures, entity names, and important terms. Do not bold whole sentences.
8. If the document only partially covers the question, state clearly what IS and IS NOT covered at the end.
"""

HUMAN_TEMPLATE = """\
<document_context>
{context}
</document_context>

Question:
{question}
"""

# ═════════════════════════════════════════════════════════════════════════
# Tiny CSV "database"
# ═════════════════════════════════════════════════════════════════════════


def _ensure_csv():
    if not DATA_CSV.exists():
        with open(DATA_CSV, "w", newline="", encoding="utf-8") as f:
            csv.DictWriter(f, fieldnames=CSV_FIELDS).writeheader()


def _read_users() -> List[dict]:
    _ensure_csv()
    with open(DATA_CSV, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def _write_users(rows: List[dict]) -> None:
    with open(DATA_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=CSV_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def find_user_by_email(email: str) -> Optional[dict]:
    email = email.strip().lower()
    for row in _read_users():
        if row.get("email", "").strip().lower() == email:
            return row
    return None


def slugify_username(name: str) -> str:
    base = re.sub(r"[^a-z0-9]+", "_", name.strip().lower()).strip("_") or "user"
    return base[:40]


def create_user(name: str, email: str, password: str) -> dict:
    with _csv_lock:
        rows = _read_users()
        if any(r.get("email", "").strip().lower() == email.strip().lower() for r in rows):
            raise ValueError("An account with this email already exists.")

        existing_usernames = {r["username"] for r in rows}
        base = slugify_username(name)
        username = base
        n = 1
        while username in existing_usernames:
            n += 1
            username = f"{base}{n}"

        salt = secrets.token_hex(16)
        password_hash = hash_password(password, salt)

        row = {
            "username": username,
            "name": name.strip(),
            "email": email.strip().lower(),
            "password_hash": password_hash,
            "salt": salt,
        }
        rows.append(row)
        _write_users(rows)
        return row


def hash_password(password: str, salt: str) -> str:
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), bytes.fromhex(salt), 100_000)
    return dk.hex()


def verify_password(password: str, salt: str, password_hash: str) -> bool:
    return secrets.compare_digest(hash_password(password, salt), password_hash)


# ═════════════════════════════════════════════════════════════════════════
# Pydantic request/response models
# ═════════════════════════════════════════════════════════════════════════


class FileType(str, Enum):
    pdf = "pdf"
    excel = "excel"
    csv = "csv"
    json = "json"
    sqlite = "sqlite"
    ppt = "ppt"
    html = "html"
    text = "text"


class SignupRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(..., min_length=6, max_length=128)

    @field_validator("name")
    @classmethod
    def name_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Name cannot be blank.")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=1, max_length=128)


class AuthResponse(BaseModel):
    token: str
    name: str
    email: EmailStr


class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)


class ChatResponse(BaseModel):
    answer: str


class UploadResponse(BaseModel):
    filename: str
    size: int
    file_type: str
    chunks: int


# ═════════════════════════════════════════════════════════════════════════
# In-memory session store
#   token -> { username, name, email, vector_store, files: [...], welcomed }
# ═════════════════════════════════════════════════════════════════════════

SESSIONS: Dict[str, dict] = {}
_sessions_lock = threading.Lock()

_embedding_model: Optional[MistralAIEmbeddings] = None
_chat_model: Optional[ChatGroq] = None


def get_mistral_api_key() -> str:
    api_key = os.getenv("MISTRAL_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="MISTRAL_API_KEY not configured on the server.")
    return api_key


def get_groq_api_key() -> str:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="GROQ_API_KEY not configured on the server.")
    return api_key


def get_embedding_model() -> MistralAIEmbeddings:
    global _embedding_model
    if _embedding_model is None:
        _embedding_model = MistralAIEmbeddings(model="mistral-embed", mistral_api_key=get_mistral_api_key())
    return _embedding_model


def get_chat_model() -> ChatGroq:
    global _chat_model
    if _chat_model is None:
        _chat_model = ChatGroq(
            model="qwen/qwen3.8-27b",  # Qwen 3.8 27B on Groq
            groq_api_key=get_groq_api_key(),
            temperature=0.3,
            max_tokens=2048,
        )
    return _chat_model


def build_vector_store(username: str) -> Chroma:
    persist_dir = str(CHROMA_ROOT / username)
    return Chroma(
        persist_directory=persist_dir,
        collection_name=username,
        embedding_function=get_embedding_model(),
    )


def create_session(user_row: dict) -> str:
    token = uuid.uuid4().hex
    with _sessions_lock:
        SESSIONS[token] = {
            "username": user_row["username"],
            "name": user_row["name"],
            "email": user_row["email"],
            "vector_store": build_vector_store(user_row["username"]),
            "files": [],
            "welcomed": False,
        }
    return token


def get_session(authorization: Optional[str]) -> dict:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header.")
    token = authorization.split(" ", 1)[1].strip()
    session = SESSIONS.get(token)
    if not session:
        raise HTTPException(status_code=401, detail="Session expired or invalid. Please log in again.")
    return session


# ═════════════════════════════════════════════════════════════════════════
# FastAPI app
# ═════════════════════════════════════════════════════════════════════════

app = FastAPI(title="FinRAG", description="Finance Report RAG Analyzer")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Disable browser caching for local JS / CSS so changes take effect immediately ──
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request as StarletteRequest

class NoCacheStaticMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: StarletteRequest, call_next):
        response = await call_next(request)
        path = request.url.path
        # Prevent caching for ALL frontend assets so changes take effect immediately
        if path == "/" or path.endswith((".html", ".js", ".css")):
            response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate"
            response.headers["Pragma"] = "no-cache"
            response.headers["Expires"] = "0"
        return response

app.add_middleware(NoCacheStaticMiddleware)


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/file-types")
def list_file_types():
    return FILE_TYPES


@app.post("/api/signup", response_model=AuthResponse)
def signup(payload: SignupRequest):
    try:
        user_row = create_user(payload.name, payload.email, payload.password)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    token = create_session(user_row)
    return AuthResponse(token=token, name=user_row["name"], email=user_row["email"])


@app.post("/api/login", response_model=AuthResponse)
def login(payload: LoginRequest):
    user_row = find_user_by_email(payload.email)
    if not user_row or not verify_password(payload.password, user_row["salt"], user_row["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    token = create_session(user_row)
    return AuthResponse(token=token, name=user_row["name"], email=user_row["email"])


@app.post("/api/logout")
def logout(authorization: Optional[str] = Header(None)):
    if authorization and authorization.lower().startswith("bearer "):
        SESSIONS.pop(authorization.split(" ", 1)[1].strip(), None)
    return {"status": "logged_out"}


@app.get("/api/session")
def session_info(authorization: Optional[str] = Header(None)):
    session = get_session(authorization)
    return {
        "name": session["name"],
        "email": session["email"],
        "files": session["files"],
    }


@app.post("/api/upload", response_model=UploadResponse)
async def upload_file(
    file_type: FileType = Form(...),
    file: UploadFile = File(...),
    authorization: Optional[str] = Header(None),
):
    session = get_session(authorization)

    data = await file.read()
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File too large (25 MB limit).")

    try:
        chunks = create_data.ingest_file(
            filename=file.filename,
            data=data,
            file_type=file_type.value,
            vector_store=session["vector_store"],
            tmp_dir=TMP_DIR,
        )
    except IngestError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        msg = str(e)
        if "401" in msg or "Unauthorized" in msg:
            raise HTTPException(
                status_code=502,
                detail="Mistral API rejected the request (401 Unauthorized). "
                       "Check that MISTRAL_API_KEY in your .env file is correct "
                       "and has embeddings access.",
            )
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {msg}")

    session["files"].append({"name": file.filename, "size": len(data), "type": file_type.value})

    return UploadResponse(filename=file.filename, size=len(data), file_type=file_type.value, chunks=chunks)


@app.post("/api/chat/init")
def chat_init(background_tasks: BackgroundTasks, authorization: Optional[str] = Header(None)):
    session = get_session(authorization)

    if not session["welcomed"]:
        session["welcomed"] = True
        background_tasks.add_task(send_welcome_email, session["email"], session["name"])

    return {
        "name": session["name"],
        "files": session["files"],
        "has_documents": len(session["files"]) > 0,
    }


@app.post("/api/chat", response_model=ChatResponse)
def chat(payload: ChatRequest, authorization: Optional[str] = Header(None)):
    session = get_session(authorization)

    if not session["files"]:
        raise HTTPException(status_code=400, detail="Please upload a document before asking questions.")

    retriever = session["vector_store"].as_retriever(
        search_type="mmr",
        search_kwargs={"k": 6, "fetch_k": 15, "lambda_mult": 0.5},
    )

    try:
        docs = retriever.invoke(payload.message)
    except Exception as e:
        msg = str(e)
        if "401" in msg or "Unauthorized" in msg:
            raise HTTPException(
                status_code=502,
                detail="Groq API rejected the request (401 Unauthorized). "
                       "Check your GROQ_API_KEY.",
            )
        raise HTTPException(status_code=500, detail=f"Retrieval failed: {msg}")

    if not docs:
        return ChatResponse(answer="I couldn't find that in the document.")

    context = "\n\n".join(doc.page_content for doc in docs)

    messages = [
        SystemMessage(content=SYSTEM_PROMPT),
        HumanMessage(content=HUMAN_TEMPLATE.format(context=context, question=payload.message)),
    ]

    try:
        response = get_chat_model().invoke(messages)
        content = (response.content or "").strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Chat model call failed: {e}")

    if not content:
        raise HTTPException(status_code=500, detail="Empty response from the chat model.")

    return ChatResponse(answer=content)


# ── Serve the static frontend (must be mounted LAST so /api/* wins) ─────────
app.mount("/", StaticFiles(directory=str(FRONTEND_DIR), html=True), name="frontend")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
