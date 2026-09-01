# FinRAG — Full-Stack Finance RAG Web App

A complete, working web app built on top of the supplied static frontend
(`index.html` → `upload.html` → `chat.html`). The frontend's look, animations,
and layout are untouched — only the JavaScript was updated to talk to a real
FastAPI backend instead of `sessionStorage`-only demo logic.

## Architecture

```
finrag_app/
├── main.py            # FastAPI app: auth, upload, chat routes + static hosting
├── create_data.py     # File parsing/chunking pipeline (8 file types, zero langchain)
├── welcome_email.py   # smtplib welcome-email sender (fired on first chat entry)
├── requirements.txt
├── .env.example
├── data.csv           # auto-created "database": username,name,email,password_hash,salt
├── chroma_db/         # auto-created — one persistent vector collection per user
├── tmp_uploads/        # scratch dir used only by the SQLite loader
└── frontend/
    ├── index.html      # Landing + login/signup modal
    ├── upload.html     # File-type selection + real upload
    ├── chat.html       # RAG chatbot
    ├── css/style.css
    └── js/
        ├── shaders.js  # unchanged — Three.js backgrounds
        ├── main.js     # now calls /api/signup & /api/login
        ├── upload.js   # now uploads real files via XHR to /api/upload
        └── chat.js     # now calls /api/chat/init & /api/chat
```

## How the pieces fit together

1. **Sign up / log in** (`index.html`) → `POST /api/signup` or `/api/login`.
   Pydantic validates name/email/password. Users are stored in `data.csv`
   (PBKDF2-hashed passwords, never plaintext). A session token (UUID) is
   returned and cached in `sessionStorage`; every subsequent request sends it
   as `Authorization: Bearer <token>`.
2. **Pick a file type + upload** (`upload.html`) → `POST /api/upload`
   (multipart: `file_type` + `file`). `file_type` is a Pydantic/FastAPI enum
   (`pdf`, `excel`, `csv`, `json`, `sqlite`, `ppt`, `html`, `text`) validated
   against the file's actual extension in `create_data.py`. The file is
   parsed, chunked, embedded with `MistralAIEmbeddings`, and stored in a
   per-user Chroma collection under `chroma_db/<username>/`.
3. **Chat** (`chat.html`) → on load, `POST /api/chat/init` confirms the
   session, returns the real uploaded-file list, and — the first time that
   user enters the chatbot — fires `welcome_email.py`'s `send_welcome_email()`
   as a background task (so it never blocks the chat UI). Each message goes
   to `POST /api/chat`, which runs an MMR retriever (`k=6, fetch_k=15`) over
   the user's documents and calls `ChatMistralAI` (`mistral-large-latest`)
   with the FinSight system prompt, wrapping retrieved chunks in
   `<document_context>` tags.

## Running it

```bash
cd finrag_app
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env   # fill in MISTRAL_API_KEY and SMTP_* values
uvicorn main:app --reload
```

Open `http://localhost:8000/` — that's it, the same FastAPI app serves the
frontend *and* the API (no separate dev server, no CORS issues).

## Notes & honest limitations

- **Sessions are in-memory.** Restarting the server logs everyone out (their
  account and uploaded-document embeddings persist in `data.csv` and
  `chroma_db/`, only the active session token is lost). Fine for a demo/single
  process; swap in Redis or a signed JWT for production multi-worker use.
- **`data.csv` as a "database"** is intentionally simple per the brief. It's
  guarded by a thread lock for read-modify-write safety but isn't built for
  high concurrency — swap in SQLite/Postgres if you need that.
- **Welcome email failures never break the app** — `send_welcome_email()`
  catches and logs SMTP errors so a misconfigured `.env` won't 500 the chat.
- **25 MB upload limit** is enforced server-side; adjust `MAX_UPLOAD_BYTES`
  in `main.py` if needed.
