"""
welcome_email.py
-----------------
Sends the FinRAG "Welcome" HTML email via smtplib.

ZERO langchain / fastapi dependencies — pure stdlib (smtplib + email),
so it can be imported cheaply from main.py and fired in a background task
without slowing down the request that triggered it.

Usage:
    from welcome_email import send_welcome_email
    send_welcome_email("jane@company.com", "Jane")
"""

import os
import smtplib
import ssl
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

# ── SMTP configuration (set these in your .env file) ─────────────────────────
SMTP_HOST = os.getenv("SMTP_HOST", "smtp.gmail.com")
SMTP_PORT = int(os.getenv("SMTP_PORT", "587"))
SMTP_USERNAME = os.getenv("SMTP_USERNAME", "")
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "")
FROM_EMAIL = os.getenv("FROM_EMAIL", SMTP_USERNAME)
FROM_NAME = os.getenv("FROM_NAME", "FinRAG")

# ── The exact welcome email template supplied by the product spec ───────────
# (kept verbatim — table-based layout for maximum email-client compatibility)
WELCOME_EMAIL_HTML = """\
<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<title>Welcome to FinRAG</title>
<!--[if mso]>
<noscript>
<xml>
<o:OfficeDocumentSettings>
<o:PixelsPerInch>96</o:PixelsPerInch>
</o:OfficeDocumentSettings>
</xml>
</noscript>
<![endif]-->
<style>
  body, table, td, p, a { -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
  table, td { mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
  img { -ms-interpolation-mode: bicubic; border: 0; outline: none; text-decoration: none; }
  body { margin: 0; padding: 0; width: 100% !important; height: 100% !important; }

  .page-bg {
    background-color: #b15ad6; /* mso / fallback solid */
    background-image: linear-gradient(135deg, #2f8fe0 0%, #9b6bd9 22%, #e34fd0 42%, #ff3da0 58%, #ff7a4d 78%, #ffb23d 100%);
    background-repeat: no-repeat;
    background-size: cover;
  }

  .gradient-text {
    background: linear-gradient(90deg, #2f8fe0 0%, #e34fd0 45%, #ff7a4d 100%);
    -webkit-background-clip: text;
    background-clip: text;
    color: #e34fd0; /* fallback for clients that ignore background-clip */
  }

  @media screen and (max-width: 600px) {
    .full-width { width: 100% !important; }
    .px-24 { padding-left: 24px !important; padding-right: 24px !important; }
    .welcome-line { font-size: 34px !important; line-height: 38px !important; }
    .brand-line { font-size: 38px !important; line-height: 42px !important; }
  }
</style>
</head>
<body style="margin:0; padding:0;">

  <!-- preheader (hidden) -->
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#ffffff;">
    Your FinRAG account is ready — upload a document and ask your first question.
  </div>

  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="page-bg" bgcolor="#b15ad6">
    <tr>
      <td align="center" style="padding: 56px 16px;">

        <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" class="full-width" style="width:600px; max-width:600px;">

          <!-- Logo / wordmark -->
          <tr>
            <td align="center" style="padding-bottom: 28px;">
              <span style="font-family: Helvetica, Arial, sans-serif; font-size: 15px; font-weight: 800; letter-spacing: 2px; color: #ffffff; text-transform: uppercase; text-shadow: 0 1px 6px rgba(0,0,0,0.15);">
                Fin RAG
              </span>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td style="background-color:#ffffff; border-radius:20px; box-shadow: 0 18px 40px rgba(80,20,90,0.18);">

              <!-- Eyebrow pill -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding: 44px 24px 0 24px;">
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td style="background-color:#fbeefc; border:1px solid #f0d9f3; border-radius:999px; padding:8px 18px;">
                          <span style="font-family: Helvetica, Arial, sans-serif; font-size:12px; font-weight:600; letter-spacing:0.4px; color:#a23ec0;">
                            Powered by Retrieval&#8209;Augmented Generation
                          </span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Headline -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" class="px-24" style="padding: 28px 40px 0 40px;">
                    <div class="welcome-line" style="font-family: Georgia, 'Times New Roman', serif; font-style: italic; font-size: 44px; line-height: 48px; color: #2b2b33; font-weight: 400;">
                      Welcome
                    </div>
                    <div class="brand-line gradient-text" style="font-family: Helvetica, Arial, sans-serif; font-size: 46px; line-height: 50px; font-weight: 800; padding-top: 6px;">
                      to FinRAG
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Body copy -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" class="px-24" style="padding: 22px 56px 0 56px;">
                    <p style="margin:0; font-family: Helvetica, Arial, sans-serif; font-size: 16px; line-height: 26px; color: #6b6b76; text-align: center;">
                      Your account is set up and ready. Upload a statement, report, spreadsheet, or filing, then ask FinRAG a question in plain English &mdash; every answer is grounded in your own documents.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- Plain text link instead of a button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding: 30px 24px 6px 24px;">
                    <a href="#" target="_blank" style="font-family: Helvetica, Arial, sans-serif; font-size:16px; font-weight:700; color:#e34fd0; text-decoration:none; border-bottom: 2px solid #f3c6ec; padding-bottom: 3px;">
                      Start exploring FinRAG &rarr;
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Secondary link -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center" style="padding: 8px 24px 40px 24px;">
                    <a href="#" target="_blank" style="font-family: Helvetica, Arial, sans-serif; font-size: 13px; color: #9a9aa3; text-decoration: underline;">
                      See how it works
                    </a>
                  </td>
                </tr>
              </table>

              <!-- Divider -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td style="padding: 0 40px;">
                    <div style="border-top: 1px solid #efeff2; line-height:1px; font-size:1px;">&nbsp;</div>
                  </td>
                </tr>
              </table>

              <!-- Three quick value props -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td class="px-24" style="padding: 32px 40px 40px 40px;">

                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                      <tr>
                        <td valign="top" width="28" style="padding-bottom: 18px;">
                          <span style="display:inline-block; width:20px; height:20px; border-radius:50%; background-color:#eaf3fd; border:1px solid #2f8fe0; color:#2f8fe0; font-family: Helvetica, Arial, sans-serif; font-size:12px; line-height:18px; text-align:center;">&#10003;</span>
                        </td>
                        <td valign="top" style="padding-bottom: 18px; padding-left: 8px;">
                          <span style="font-family: Helvetica, Arial, sans-serif; font-size:14px; line-height:21px; color:#45454f;">Ask questions in plain English and get answers grounded in your own files</span>
                        </td>
                      </tr>
                      <tr>
                        <td valign="top" width="28" style="padding-bottom: 18px;">
                          <span style="display:inline-block; width:20px; height:20px; border-radius:50%; background-color:#fdeefb; border:1px solid #e34fd0; color:#e34fd0; font-family: Helvetica, Arial, sans-serif; font-size:12px; line-height:18px; text-align:center;">&#10003;</span>
                        </td>
                        <td valign="top" style="padding-bottom: 18px; padding-left: 8px;">
                          <span style="font-family: Helvetica, Arial, sans-serif; font-size:14px; line-height:21px; color:#45454f;">Upload statements, reports, spreadsheets, and filings in seconds</span>
                        </td>
                      </tr>
                      <tr>
                        <td valign="top" width="28">
                          <span style="display:inline-block; width:20px; height:20px; border-radius:50%; background-color:#fff1e8; border:1px solid #ff7a4d; color:#ff7a4d; font-family: Helvetica, Arial, sans-serif; font-size:12px; line-height:18px; text-align:center;">&#10003;</span>
                        </td>
                        <td valign="top" style="padding-left: 8px;">
                          <span style="font-family: Helvetica, Arial, sans-serif; font-size:14px; line-height:21px; color:#45454f;">Every answer points back to its exact source, so nothing is left to guesswork</span>
                        </td>
                      </tr>
                    </table>

                  </td>
                </tr>
              </table>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding: 32px 24px 0 24px;">
              <p style="margin:0 0 8px 0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px; color: #ffffff; opacity: 0.85;">
                Questions? Reply to this email or reach us at <a href="mailto:support@finrag.com" style="color:#ffffff; text-decoration:underline;">support@finrag.com</a>
              </p>
              <p style="margin:0; font-family: Helvetica, Arial, sans-serif; font-size: 12px; line-height: 18px; color: #ffffff; opacity: 0.7;">
                FinRAG, Inc. &middot; <a href="#" style="color:#ffffff; text-decoration:underline;">Unsubscribe</a>
              </p>
            </td>
          </tr>

        </table>

      </td>
    </tr>
  </table>

</body>
</html>"""

WELCOME_EMAIL_TEXT = (
    "Welcome to FinRAG!\n\n"
    "Your account is set up and ready. Upload a statement, report, spreadsheet, "
    "or filing, then ask FinRAG a question in plain English -- every answer is "
    "grounded in your own documents.\n\n"
    "- Ask questions in plain English and get answers grounded in your own files\n"
    "- Upload statements, reports, spreadsheets, and filings in seconds\n"
    "- Every answer points back to its exact source, so nothing is left to guesswork\n\n"
    "Questions? Reply to this email or reach us at support@finrag.com\n"
    "FinRAG, Inc."
)


def is_email_configured() -> bool:
    """True if enough SMTP env vars are present to attempt a real send."""
    return bool(SMTP_USERNAME and SMTP_PASSWORD and FROM_EMAIL)


def send_welcome_email(to_email: str, to_name: str = "") -> bool:
    """
    Send the FinRAG welcome email to `to_email` via smtplib.

    Returns True on success, False on failure (failures are swallowed and
    logged to stdout — a failed welcome email should never break login/signup).
    """
    if not is_email_configured():
        print(f"[welcome_email] SMTP not configured — skipping send to {to_email}.")
        return False

    msg = MIMEMultipart("alternative")
    msg["Subject"] = "Welcome to FinRAG"
    msg["From"] = f"{FROM_NAME} <{FROM_EMAIL}>"
    msg["To"] = to_email

    msg.attach(MIMEText(WELCOME_EMAIL_TEXT, "plain", "utf-8"))
    msg.attach(MIMEText(WELCOME_EMAIL_HTML, "html", "utf-8"))

    try:
        context = ssl.create_default_context()
        with smtplib.SMTP(SMTP_HOST, SMTP_PORT, timeout=15) as server:
            server.ehlo()
            server.starttls(context=context)
            server.ehlo()
            server.login(SMTP_USERNAME, SMTP_PASSWORD)
            server.sendmail(FROM_EMAIL, [to_email], msg.as_string())
        print(f"[welcome_email] Sent welcome email to {to_email}.")
        return True
    except Exception as e:
        print(f"[welcome_email] ERROR sending to {to_email}: {e}")
        return False


if __name__ == "__main__":
    # Quick manual test: python welcome_email.py someone@example.com
    import sys
    target = sys.argv[1] if len(sys.argv) > 1 else None
    if not target:
        print("Usage: python welcome_email.py <email>")
    else:
        ok = send_welcome_email(target, "Analyst")
        print("Success" if ok else "Failed (check SMTP_* env vars)")
