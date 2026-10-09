"""Registered free public reads; pinned public IPs, bounded work and adapter-owned facts.

No provider, discovery engine, arbitrary URL, warehouse write or dataset acquisition.
Only supporting excerpts/structured facts enter the bounded process cache and durable turns.
"""

from __future__ import annotations

import hashlib
import http.client
import ipaddress
import re
import socket
import ssl
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor
from contextlib import suppress
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from html.parser import HTMLParser
from typing import Literal
from urllib.parse import urljoin, urlsplit

from courtlens.domain.hybrid_assistant import AnswerSource, Failure, SourceFact

REGISTRY_VERSION = "courtload-public-nba-v1"
PARSER_VERSION = "nba-article-bindings-v1"
MAX_REQUESTS = 4
MAX_REDIRECTS = 2
MAX_RESPONSE_BYTES = 256 * 1024
MAX_TEXT_BYTES = 128 * 1024
REQUEST_SECONDS = 8.0
CACHE_ENTRIES = 32


@dataclass(frozen=True)
class SourceSpec:
    key: str
    url: str
    title: str
    publisher: str
    period: str
    adapter: Literal["schedule", "assist"]
    ttl_seconds: int
    # Restrict automated reuse to small supporting excerpts, attribution and source links.
    reuse: str = "Personal local research; retain attribution and excerpts only, no redistribution."
    terms_url: str = "https://www.nba.com/termsofuse"


SOURCES = (
    SourceSpec(
        "schedule-2023-24",
        "https://pr.nba.com/2023-24-nba-regular-season-schedule/",
        "NBA announces schedule for 2023-24 regular season",
        "NBA Communications",
        "2023-24 regular season",
        "schedule",
        86400,
    ),
    SourceSpec(
        "schedule-2026-27",
        "https://pr.nba.com/2026-27-nba-regular-season-schedule/",
        "NBA announces schedule for 2026-27 regular season",
        "NBA Communications",
        "2026-27 regular season",
        "schedule",
        3600,
    ),
    SourceSpec(
        "assist-definition",
        "https://videorulebook.nba.com/archive/assist-pass-leads-directly-to-made-field-goal-pass-and-jump-shot-2/",
        "Assist, pass leads directly to made field goal - pass and jump shot",
        "NBA Video Rulebook",
        "NBA assist definition; page update date unknown",
        "assist",
        86400,
    ),
)
ALLOWED_URLS = frozenset(source.url for source in SOURCES)


class RetrievalFailure(Exception):
    """Sanitized outcome; transport exceptions and content never become user instructions."""

    def __init__(self, kind: Failure = "external_unavailable") -> None:
        self.kind = kind
        self.source: AnswerSource | None = None
        super().__init__(kind)


@dataclass
class RetrievalBudget:
    deadline: float
    requests: int = 0
    text_bytes: int = 0
    response_bytes: int = 0
    lock: threading.Lock = field(default_factory=threading.Lock, repr=False)

    def remaining(self) -> float:
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise RetrievalFailure()
        return remaining

    def request(self) -> None:
        with self.lock:
            self.remaining()
            if self.requests >= MAX_REQUESTS:
                raise RetrievalFailure()
            self.requests += 1

    def extracted(self, text: str) -> None:
        with self.lock:
            self.remaining()
            count = len(text.encode())
            if self.text_bytes + count > MAX_TEXT_BYTES:
                raise RetrievalFailure()
            self.text_bytes += count


def validated_url(url: str) -> str:
    if url not in ALLOWED_URLS or any(ord(char) < 33 for char in url):
        raise RetrievalFailure()
    parsed = urlsplit(url)
    if (
        parsed.scheme != "https"
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
        or parsed.query
        or parsed.fragment
    ):
        raise RetrievalFailure()
    return url


def public_addresses(host: str) -> list[str]:
    addresses = list(
        dict.fromkeys(
            str(item[4][0]) for item in socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
        )
    )
    if not addresses or any(
        not ipaddress.ip_address(value).is_global or ipaddress.ip_address(value).is_multicast
        for value in addresses
    ):
        raise RetrievalFailure()
    return addresses


class PinnedHTTPSConnection(http.client.HTTPSConnection):
    """TLS verifies the approved hostname; connect uses only the validated numeric IP.

    There is no second hostname resolution between validation and connection (DNS rebinding).
    No proxy/environment credential or ambient cookie is consulted.
    """

    def __init__(self, host: str, address: str, timeout: float) -> None:
        super().__init__(host, timeout=timeout, context=ssl.create_default_context())
        self.tls_context = ssl.create_default_context()
        self.address = address

    def connect(self) -> None:
        sock = socket.create_connection((self.address, 443), self.timeout)
        try:
            self.sock = self.tls_context.wrap_socket(sock, server_hostname=self.host)
        except BaseException:
            sock.close()
            raise


def fetch(spec: SourceSpec, budget: RetrievalBudget) -> bytes:
    """Every redirect is a new accounted, DNS-validated, exact-allowlist request."""
    url = validated_url(spec.url)
    request_deadline = min(budget.deadline, time.monotonic() + REQUEST_SECONDS)
    for redirects in range(MAX_REDIRECTS + 1):
        budget.request()
        parsed = urlsplit(validated_url(url))
        host = parsed.hostname
        if host is None:
            raise RetrievalFailure()
        addresses = public_addresses(host)
        remaining = min(budget.remaining(), request_deadline - time.monotonic())
        if remaining <= 0:
            raise RetrievalFailure()
        connection = PinnedHTTPSConnection(host, addresses[0], remaining)
        try:
            connection.request(
                "GET",
                parsed.path,
                headers={
                    "User-Agent": "CourtLens/0.1 (bounded local research)",
                    "Accept": "text/html",
                    "Accept-Encoding": "identity",
                },
            )
            response = connection.getresponse()
            if response.status in (301, 302, 303, 307, 308):
                if redirects == MAX_REDIRECTS:
                    raise RetrievalFailure()
                url = validated_url(urljoin(url, response.getheader("Location", "")))
                if url != spec.url:
                    raise RetrievalFailure()
                continue
            if response.status != 200:
                raise RetrievalFailure()
            if response.getheader("Content-Type", "").split(";")[0].strip() != "text/html":
                raise RetrievalFailure()
            if response.getheader("Content-Encoding", "identity") != "identity":
                raise RetrievalFailure()
            length = response.getheader("Content-Length")
            if length is not None and (not length.isdigit() or int(length) > MAX_RESPONSE_BYTES):
                raise RetrievalFailure()
            chunks = []
            size = 0
            while True:
                remaining = min(budget.remaining(), request_deadline - time.monotonic())
                if remaining <= 0:
                    raise RetrievalFailure()
                if connection.sock:
                    connection.sock.settimeout(remaining)
                chunk = response.read1(min(16384, MAX_RESPONSE_BYTES + 1 - size))
                size += len(chunk)
                if size > MAX_RESPONSE_BYTES:
                    raise RetrievalFailure()
                if not chunk:
                    break
                chunks.append(chunk)
            with budget.lock:
                budget.response_bytes += size
            budget.remaining()
            return b"".join(chunks)
        finally:
            connection.close()
    raise RetrievalFailure()


class ArticleParser(HTMLParser):
    """Extract paragraphs only from the known article container; omit active/hidden markup."""

    def __init__(self, adapter: str) -> None:
        super().__init__(convert_charrefs=True)
        self.container = "post__content" if adapter == "schedule" else "entry-excerpt"
        self.depth = 0
        self.suppressed: list[str] = []
        self.paragraph = False
        self.current: list[str] = []
        self.paragraphs: list[str] = []
        self.published: date | None = None
        self.count = 0

    def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
        values = dict(attrs)
        if tag == "meta" and values.get("property") == "article:published_time":
            with suppress(ValueError):
                self.published = date.fromisoformat((values.get("content") or "")[:10])
        if tag == "div":
            if self.depth:
                self.depth += 1
            elif self.container in (values.get("class") or "").split():
                self.depth = 1
        void = tag in {
            "area",
            "base",
            "br",
            "col",
            "embed",
            "hr",
            "img",
            "input",
            "link",
            "meta",
            "param",
            "source",
            "track",
            "wbr",
        }
        hidden = (
            "hidden" in values
            or values.get("aria-hidden") == "true"
            or "display:none" in (values.get("style") or "").replace(" ", "").lower()
            or "visibility:hidden" in (values.get("style") or "").replace(" ", "").lower()
        )
        if (
            self.depth
            and not void
            and (
                self.suppressed
                or hidden
                or tag in ("script", "style", "noscript", "iframe", "form", "template")
            )
        ):
            self.suppressed.append(tag)
        if self.depth and not self.suppressed and tag == "p":
            self.paragraph = True
            self.current = []

    def handle_endtag(self, tag: str) -> None:
        if self.suppressed and tag == self.suppressed[-1]:
            self.suppressed.pop()
            if tag == "div" and self.depth:
                self.depth -= 1
            return
        if tag == "p" and self.paragraph:
            text = " ".join("".join(self.current).split())
            if text:
                self.paragraphs.append(text)
            self.paragraph = False
        if tag == "div" and self.depth:
            self.depth -= 1

    def handle_data(self, value: str) -> None:
        if self.depth and self.paragraph and not self.suppressed:
            # Keep plain supporting text; never render fetched HTML or execute instructions.
            value = "".join(c for c in value if c.isprintable() or c.isspace())
            self.count += len(value.encode())
            if self.count > MAX_TEXT_BYTES:
                raise RetrievalFailure()
            self.current.append(value)


def parse(spec: SourceSpec, raw: bytes, budget: RetrievalBudget) -> AnswerSource:
    if len(raw) > MAX_RESPONSE_BYTES:
        raise RetrievalFailure()
    parser = ArticleParser(spec.adapter)
    parser.feed(raw.decode("utf-8", errors="strict"))
    budget.extracted("\n".join(parser.paragraphs))
    candidates: list[tuple[str, str, str, str, str]] = []
    if spec.adapter == "schedule":
        season = spec.period.split()[0]
        if not any(f"for the {season} regular season" in p for p in parser.paragraphs):
            raise RetrievalFailure()
        for index, paragraph in enumerate(parser.paragraphs):
            # Bind the date to the season's opening clause, not an unrelated game date.
            pattern = (
                r"The \d+(?:st|nd|rd|th) NBA regular season will tip off on \w+, "
                r"(?P<month>Oct\.) (?P<day>\d{1,2}), (?P<year>\d{4})"
                if season == "2023-24"
                else r"American Express NBA Tip-Off (?P<year>2026) will begin on \w+, "
                r"(?P<month>Oct\.) (?P<day>\d{1,2})"
            )
            for match in re.finditer(pattern, paragraph):
                year = int(match["year"])
                if year != int(season[:4]):
                    raise RetrievalFailure()
                value = date(year, 10, int(match["day"])).isoformat()
                candidates.append(
                    (
                        value,
                        match[0],
                        f"post__content/p[{index + 1}]",
                        "published regular-season opening date",
                        "date",
                    )
                )
        metric = "announced start date"
        entity = "NBA regular season"
        qualifier = "Published schedule announcement; not a live schedule or proof games occurred"
    else:
        pattern = (
            r"An assist is credited to the player tossing the last pass leading directly "
            r"to a made field goal, but only if the player scoring the goal demonstrates "
            r"an immediate reaction toward the basket after receiving the pass\."
        )
        for index, paragraph in enumerate(parser.paragraphs):
            for match in re.finditer(pattern, paragraph):
                candidates.append(
                    (
                        "a direct scoring pass with an immediate reaction toward the basket",
                        match[0],
                        f"entry-excerpt/p[{index + 1}]",
                        "definition",
                        "concept",
                    )
                )
        metric = "definition"
        entity = "NBA assist"
        qualifier = "NBA Video Rulebook explanation; official rulebook takes precedence"
    if not candidates:
        raise RetrievalFailure()
    if len({item[0] for item in candidates}) != 1:
        raise RetrievalFailure("external_conflict")
    value, excerpt, locator, _, unit = candidates[0]
    fact = SourceFact(
        entity=entity,
        metric=metric,
        value=value,
        unit=unit,
        period=spec.period,
        qualifier=qualifier,
        locator=locator,
        supporting_excerpt=excerpt,
        parser_version=PARSER_VERSION,
    )
    digest = hashlib.sha256(raw).hexdigest()
    return AnswerSource(
        source_id=f"{REGISTRY_VERSION}:{spec.key}:{digest}",
        origin="external",
        title=spec.title,
        publisher=spec.publisher,
        url=spec.url,
        updated_on=parser.published,
        retrieved_at=datetime.now(UTC),
        period=spec.period,
        content_sha256=digest,
        locator=locator,
        excerpt=excerpt,
        verification="verified",
        facts=[fact],
    )


@dataclass(frozen=True)
class CacheEntry:
    expires: float
    source: AnswerSource


_cache: OrderedDict[str, CacheEntry] = OrderedDict()
_cache_lock = threading.Lock()
_slots = threading.BoundedSemaphore(4)
_workers = ThreadPoolExecutor(max_workers=4, thread_name_prefix="courtlens-source")


def clear_cache() -> None:
    with _cache_lock:
        _cache.clear()


def select_source(message: str, season: str | None) -> SourceSpec | None:
    text = message.lower()
    # User URLs and additional fact requests do not expand this registry's authority.
    if re.search(r"https?://|\b(roster|injury|injured|leader|point guard|most assists)\b", text):
        return None
    if re.fullmatch(
        r"(?:according to (?:the )?nba[, ]+)?(?:what is|define|explain) "
        r"(?:an? |the )?(?:nba )?assist(?: definition)?[?.! ]*",
        text.strip(),
    ) or re.fullmatch(
        r"(?:what is|define|explain) (?:an? |the )?assist according to (?:the )?nba[?.! ]*",
        text.strip(),
    ):
        return SOURCES[2]
    if re.fullmatch(
        r"(?:when (?:did|does|will)|what (?:is|was) the (?:announced )?start date (?:of|for)) "
        r"(?:the )?(?:nba )?(?:\d{4}-\d{2} )?regular season(?: (?:in |for )?\d{4}-\d{2})?"
        r"(?: (?:start|begin|tip off))?[?.! ]*",
        text.strip(),
    ):
        return next(
            (
                s
                for s in SOURCES
                if s.adapter == "schedule" and s.period.startswith(season or "unselected")
            ),
            None,
        )
    return None


def retrieve_source(spec: SourceSpec, budget: RetrievalBudget) -> AnswerSource:
    budget.remaining()
    key = f"{REGISTRY_VERSION}:{PARSER_VERSION}:{spec.key}:{spec.url}"
    with _cache_lock:
        cached = _cache.get(key)
        if cached and cached.expires > time.monotonic():
            _cache.move_to_end(key)
            budget.extracted(cached.source.excerpt)
            return cached.source.model_copy(deep=True)
        # Expired support is retained only to report staleness; never served as verified.
    if not _slots.acquire(blocking=False):
        raise RetrievalFailure()

    def work() -> AnswerSource:
        try:
            return parse(spec, fetch(spec, budget), budget)
        finally:
            _slots.release()

    future = _workers.submit(work)
    try:
        source = future.result(timeout=min(REQUEST_SECONDS, budget.remaining()))
        budget.remaining()
    except Exception as exc:
        kind = exc.kind if isinstance(exc, RetrievalFailure) else "external_unavailable"
        if cached and kind == "external_unavailable":
            kind = "external_stale"
        failure = RetrievalFailure(kind)
        if cached:
            failure.source = cached.source.model_copy(
                deep=True,
                update={
                    "verification": "stale" if kind == "external_stale" else "failed",
                    "facts": [],
                },
            )
        else:
            failure.source = AnswerSource(
                source_id=f"{REGISTRY_VERSION}:{spec.key}:failed",
                origin="external",
                title=spec.title,
                publisher=spec.publisher,
                url=spec.url,
                period=spec.period,
                retrieved_at=datetime.now(UTC),
                content_sha256=hashlib.sha256(b"").hexdigest(),
                locator="no-verified-extraction",
                excerpt="No verified supporting text was acquired.",
                verification="failed",
            )
        raise failure from None
    with _cache_lock:
        _cache[key] = CacheEntry(time.monotonic() + spec.ttl_seconds, source.model_copy(deep=True))
        _cache.move_to_end(key)
        while len(_cache) > CACHE_ENTRIES:
            _cache.popitem(last=False)
    return source
