"""Account emails: confirm an address, reset a password (accounts plan).

Sent over plain SMTP so any free provider works. Without ``COURTLENS_SMTP_HOST`` development
logs each link instead of sending it, and production reports email as unavailable, which turns
password sign-up and reset off. A process-wide daily cap keeps under free-tier sending limits.
"""

from __future__ import annotations

import html
import logging
import re
import smtplib
import ssl
import threading
from dataclasses import dataclass, field
from datetime import UTC, datetime
from email.message import EmailMessage
from email.utils import make_msgid

from courtlens.config import Settings, get_settings

logger = logging.getLogger(__name__)


class MailUnavailable(RuntimeError):
    """Email can't be sent now (not configured, today's cap reached, or the server failed)."""


def mail_configured(settings: Settings | None = None) -> bool:
    current = settings or get_settings()
    return bool(current.smtp_host) or current.environment != "production"


@dataclass
class DailyCap:
    """Emails sent today (UTC), in this process. A restart forgets; the provider's cap remains."""

    _lock: threading.Lock = field(default_factory=threading.Lock)
    _day: str = ""
    _sent: int = 0

    def take(self, limit: int, now: datetime | None = None) -> bool:
        day = (now or datetime.now(UTC)).date().isoformat()
        with self._lock:
            if day != self._day:
                self._day, self._sent = day, 0
            if self._sent >= limit:
                return False
            self._sent += 1
            return True

    def reset(self) -> None:
        with self._lock:
            self._day, self._sent = "", 0


CAP = DailyCap()


@dataclass(frozen=True)
class Mail:
    to: str
    subject: str
    text: str


def site_link(path: str, settings: Settings | None = None) -> str:
    current = settings or get_settings()
    return current.public_site_url.rstrip("/") + path


def confirm_mail(to: str, link: str) -> Mail:
    return Mail(
        to=to,
        subject="Confirm your CourtLens account",
        text=(
            "Welcome to CourtLens.\n\n"
            f"Confirm your email to finish creating your account:\n{link}\n\n"
            "The link works once and expires in 24 hours. If you didn't sign up, ignore this "
            "email and the account will be removed.\n"
        ),
    )


def reset_mail(to: str, link: str) -> Mail:
    return Mail(
        to=to,
        subject="Reset your CourtLens password",
        text=(
            f"Choose a new CourtLens password:\n{link}\n\n"
            "The link works once and expires in 1 hour. If you didn't ask for this, ignore this "
            "email; your password hasn't changed.\n"
        ),
    )


def existing_account_mail(to: str, sign_in_link: str, reset_link: str) -> Mail:
    return Mail(
        to=to,
        subject="You already have a CourtLens account",
        text=(
            "Someone tried to create a CourtLens account with this email, but you already have "
            f"one. Sign in here:\n{sign_in_link}\n\n"
            "Forgot your password? Choose a new one (the link expires in 1 hour):\n"
            f"{reset_link}\n\n"
            "If this wasn't you, ignore this email.\n"
        ),
    )


_URL = re.compile(r"https?://\S+")


def html_body(text: str) -> str:
    """The plain text as minimal HTML: one paragraph per block, links clickable, no images or
    tracking. Mail with only a text part looks more like spam to some filters."""
    paragraphs = []
    for block in text.strip().split("\n\n"):
        parts, last = [], 0
        for match in _URL.finditer(block):
            parts.append(html.escape(block[last : match.start()]))
            url = html.escape(match.group(0), quote=True)
            parts.append(f'<a href="{url}">{url}</a>')
            last = match.end()
        parts.append(html.escape(block[last:]))
        paragraphs.append("<p>" + "".join(parts).replace("\n", "<br>\n") + "</p>")
    return (
        '<!doctype html><html><body style="font-family:Arial,sans-serif;font-size:15px;'
        'line-height:1.5;color:#1f2328">' + "\n".join(paragraphs) + "</body></html>"
    )


def send(mail: Mail, settings: Settings | None = None) -> None:
    """Send one email or raise MailUnavailable. Never logs a link in production."""
    current = settings or get_settings()
    if not current.smtp_host:
        if current.environment == "production":
            raise MailUnavailable("email isn't set up on this server")
        logger.warning(
            "account email (not sent, no SMTP) to %s: %s\n%s", mail.to, mail.subject, mail.text
        )
        return
    if not CAP.take(current.emails_per_day):
        raise MailUnavailable("today's email limit is reached")
    message = EmailMessage()
    message["From"] = current.email_from
    message["To"] = mail.to
    message["Subject"] = mail.subject
    domain = current.email_from.rsplit("@", 1)[-1].strip("> ") or None
    message["Message-ID"] = make_msgid(domain=domain)
    message.set_content(mail.text)
    message.add_alternative(html_body(mail.text), subtype="html")
    password = current.smtp_password.get_secret_value() if current.smtp_password else None
    try:
        if current.smtp_security == "ssl":
            context = ssl.create_default_context()
            host, port = current.smtp_host, current.smtp_port
            with smtplib.SMTP_SSL(host, port, timeout=15, context=context) as smtp:
                if current.smtp_username and password:
                    smtp.login(current.smtp_username, password)
                smtp.send_message(message)
        else:
            with smtplib.SMTP(current.smtp_host, current.smtp_port, timeout=15) as smtp:
                if current.smtp_security == "starttls":
                    smtp.starttls(context=ssl.create_default_context())
                if current.smtp_username and password:
                    smtp.login(current.smtp_username, password)
                smtp.send_message(message)
    except (OSError, smtplib.SMTPException) as error:
        logger.error("account email to %s failed: %s", mail.to, type(error).__name__)
        raise MailUnavailable("the email server didn't accept the message") from error
