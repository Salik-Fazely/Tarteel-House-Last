"""Compare selected public release fields with local source using GET only.

This checks HTTP delivery, titles, canonical links, shared asset references and
bytes, the booking form action, and the branded missing route. It does not prove
complete content, rendering, JavaScript behavior, or booking delivery.
"""

import argparse
import base64
import hashlib
import json
import math
import socket
import subprocess
import sys
import time
from dataclasses import dataclass, field
from email.message import Message
from http.client import HTTPException
from html.parser import HTMLParser
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urljoin, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener
import xml.etree.ElementTree as ET
import re


ROOT = Path(__file__).resolve().parents[1]
ASSET_PATHS = (
    "/assets/css/styles.css",
    "/assets/js/main.js",
    "/assets/js/consent.js",
    "/assets/js/analytics-events.js",
)
NOT_FOUND_ROUTE = "/__tarteel_release_not_found__/"
MAX_RESPONSE_BYTES = 2 * 1024 * 1024
MAX_REDIRECTS = 10
REDIRECT_STATUSES = {301, 302, 303, 307, 308}
HTML_TYPES = {"text/html", "application/xhtml+xml"}
JAVASCRIPT_TYPES = {"text/javascript", "application/javascript", "application/x-javascript",
                    "text/ecmascript", "application/ecmascript"}


@dataclass
class VerificationResult:
    checked_pages: int = 0
    checked_assets: int = 0
    checked_not_found: bool = False
    errors: list[str] = field(default_factory=list)


class CheckFailure(ValueError):
    """A safe diagnostic that never includes a served response or form target."""


class PageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.references = []
        self.titles = []
        self.canonicals = []
        self.form_actions = []
        self._title_parts = None

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "title":
            self._title_parts = []
        elif tag == "script" and attrs.get("src"):
            self.references.append(attrs["src"])
        elif tag == "link":
            rel = (attrs.get("rel") or "").lower().split()
            if "stylesheet" in rel:
                self.references.append(attrs.get("href", ""))
            if "canonical" in rel:
                self.canonicals.append(attrs.get("href", ""))
        elif tag == "form" and attrs.get("id") == "trial-form":
            self.form_actions.append(attrs.get("action", ""))

    def handle_data(self, data):
        if self._title_parts is not None:
            self._title_parts.append(data)

    def handle_endtag(self, tag):
        if tag == "title" and self._title_parts is not None:
            self.titles.append(" ".join("".join(self._title_parts).split()))
            self._title_parts = None

    def shared_assets(self):
        references = {path: [] for path in ASSET_PATHS}
        for reference in self.references:
            try:
                path = urlsplit(reference).path
            except ValueError:
                continue
            if path in references:
                references[path].append(reference)
        return references


def validate_base_url(value):
    """Return an explicit origin, permitting plain HTTP only for loopback."""
    message = "base URL must be an HTTPS origin or HTTP localhost/127.0.0.1/[::1] origin"
    if not isinstance(value, str) or not value or any(ord(char) <= 32 or ord(char) == 127 for char in value):
        raise ValueError(message)
    if "\\" in value or "?" in value or "#" in value:
        raise ValueError(message + "; credentials, paths, queries, and fragments are forbidden")
    try:
        parsed = urlsplit(value)
        port = parsed.port
        if (parsed.scheme not in {"https", "http"} or not parsed.hostname
                or parsed.username is not None or parsed.password is not None
                or parsed.path not in {"", "/"} or parsed.netloc.endswith(":")):
            raise ValueError(message)
        if port is not None and not 1 <= port <= 65535:
            raise ValueError(message)
        if parsed.scheme == "http" and parsed.hostname.lower() not in {"localhost", "127.0.0.1", "::1"}:
            raise ValueError(message)
    except ValueError:
        raise ValueError(message + "; credentials, paths, queries, and fragments are forbidden") from None
    return urlunsplit((parsed.scheme, parsed.netloc, "", "", ""))


def _timeout(value):
    try:
        value = float(value)
    except (TypeError, ValueError):
        raise ValueError("timeout must be between 0.1 and 60 seconds") from None
    if not math.isfinite(value) or not 0.1 <= value <= 60:
        raise ValueError("timeout must be between 0.1 and 60 seconds")
    return value


def _origin(value):
    parsed = urlsplit(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username is not None:
        raise CheckFailure("cross-origin redirect refused")
    return parsed.scheme, parsed.hostname.lower(), parsed.port or (443 if parsed.scheme == "https" else 80)


def _local_file(root, relative):
    path = (root / relative).resolve()
    try:
        path.relative_to(root)
    except ValueError:
        raise CheckFailure("source path escapes repository") from None
    if not path.is_file():
        raise CheckFailure("required local source file is missing")
    return path


def _parse_page(body, charset="utf-8"):
    parser = PageParser()
    try:
        parser.feed(body.decode(charset))
        parser.close()
    except (UnicodeError, LookupError, ValueError):
        raise CheckFailure("HTML could not be parsed") from None
    return parser


def _source_inventory(root):
    """Read only sitemap routes and two explicit pages; never walk the repo."""
    sitemap = _local_file(root, "sitemap.xml")
    locations = ET.parse(sitemap).getroot().findall(".//{*}loc")
    if not locations:
        raise CheckFailure("sitemap has no canonical routes")
    routes = {}
    for location in locations:
        value = (location.text or "").strip()
        parsed = urlsplit(value)
        if (parsed.scheme != "https" or not parsed.netloc or parsed.username is not None
                or parsed.query or parsed.fragment or not re.fullmatch(r"/(?:[A-Za-z0-9_-]+/)*", parsed.path)):
            raise CheckFailure("sitemap contains an invalid canonical route")
        validate_base_url(urlunsplit((parsed.scheme, parsed.netloc, "", "", "")))
        if parsed.path in routes:
            raise CheckFailure("sitemap contains duplicate routes")
        routes[parsed.path] = value
    if "/book-trial/" not in routes:
        raise CheckFailure("sitemap is missing the booking route")
    routes.setdefault("/success/", None)
    routes["/404.html"] = None
    pages = {}
    shared = {}
    for route, canonical in routes.items():
        relative = "404.html" if route == "/404.html" else route.lstrip("/") + "index.html"
        path = _local_file(root, relative)
        parser = _parse_page(path.read_bytes())
        if len(parser.titles) != 1 or not parser.titles[0]:
            raise CheckFailure(f"{route}: local page requires one nonempty title")
        if len(parser.canonicals) > 1 or any(not ref for ref in parser.canonicals):
            raise CheckFailure(f"{route}: local canonical reference is invalid")
        if canonical is not None and parser.canonicals != [canonical]:
            raise CheckFailure(f"{route}: local canonical differs from sitemap")
        assets = parser.shared_assets()
        for asset_path, references in assets.items():
            if len(references) != 1:
                raise CheckFailure(f"{route}: local page requires one reference to {asset_path}")
            reference = references[0]
            parsed = urlsplit(reference)
            versions = parse_qs(parsed.query, keep_blank_values=True)
            if (not reference.startswith("/") or reference.startswith("//") or parsed.scheme or parsed.netloc
                    or parsed.fragment or set(versions) != {"v"} or len(versions["v"]) != 1 or not versions["v"][0]):
                raise CheckFailure(f"{route}: {asset_path} requires a root-relative versioned reference")
            if asset_path in shared and shared[asset_path] != reference:
                raise CheckFailure(f"{route}: local shared asset versions are inconsistent for {asset_path}")
            shared[asset_path] = reference
        if route == "/book-trial/" and (len(parser.form_actions) != 1 or not parser.form_actions[0]):
            raise CheckFailure("/book-trial/: local trial-form action is missing or ambiguous")
        pages[route] = parser
    assets = {reference: hashlib.sha256(_local_file(root, path.lstrip("/")).read_bytes()).digest()
              for path, reference in shared.items()}
    return pages, assets


class _NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, new_url):
        return None


def _fetch_in_process(opener, url, origin, timeout):
    deadline = time.monotonic() + timeout
    try:
        for hops in range(MAX_REDIRECTS + 1):
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise CheckFailure("request timeout")
            request = Request(url, method="GET", headers={
                "User-Agent": "Tarteel-House-Release-Check/1.0", "Accept-Encoding": "identity",
            })
            try:
                response = opener.open(request, timeout=remaining)
            except HTTPError as error:
                response = error
            with response:
                status = response.getcode()
                if status in REDIRECT_STATUSES:
                    if hops == MAX_REDIRECTS:
                        raise CheckFailure("redirect limit exceeded (10 hops)")
                    location = response.headers.get("Location")
                    if not location:
                        raise CheckFailure("redirect has no Location")
                    target = urljoin(url, location)
                    if _origin(target) != origin:
                        raise CheckFailure("cross-origin redirect refused; supply the final site origin")
                    url = target
                    continue
                declared = response.headers.get("Content-Length", "")
                if declared.isdigit() and int(declared) > MAX_RESPONSE_BYTES:
                    raise CheckFailure("response exceeds 2 MiB limit")
                chunks = []
                size = 0
                while True:
                    if time.monotonic() >= deadline:
                        raise CheckFailure("response timeout")
                    chunk = response.read1(min(65536, MAX_RESPONSE_BYTES + 1 - size))
                    if not chunk:
                        break
                    chunks.append(chunk)
                    size += len(chunk)
                    if size > MAX_RESPONSE_BYTES:
                        raise CheckFailure("response exceeds 2 MiB limit")
                return status, response.headers, b"".join(chunks)
    except (TimeoutError, socket.timeout):
        raise CheckFailure("request timeout") from None
    except URLError as error:
        if isinstance(error.reason, (TimeoutError, socket.timeout)):
            raise CheckFailure("request timeout") from None
        raise CheckFailure("network request failed") from None
    except (OSError, ValueError, HTTPException) as error:
        if isinstance(error, CheckFailure):
            raise
        raise CheckFailure("network request failed") from None


def _fetch(opener, url, origin, timeout):
    """Bound DNS, headers, redirects and body reads with a killable worker.

    A socket's inactivity timeout cannot bound trickled headers. The worker is
    a separate Python process so timeout kills and reaps the entire GET rather
    than leaving a background request or an executor thread alive. The opener
    argument is retained for the internal call contract; each worker creates
    its own opener without proxies, cookies or automatic redirects.
    """
    if _origin(url) != origin:
        raise CheckFailure("cross-origin redirect refused")
    try:
        run = subprocess.run(
            [sys.executable, str(Path(__file__).resolve()), "--_fetch-worker", url, str(timeout)],
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout, check=False,
        )
    except subprocess.TimeoutExpired:
        raise CheckFailure("request timeout") from None
    except OSError:
        raise CheckFailure("network request failed") from None
    try:
        if run.returncode != 0:
            raise ValueError("worker failed")
        payload = json.loads(run.stdout)
        if "error" in payload:
            raise CheckFailure(payload["error"])
        body = base64.b64decode(payload["body"], validate=True)
        if len(body) > MAX_RESPONSE_BYTES:
            raise CheckFailure("response exceeds 2 MiB limit")
        headers = Message()
        headers["Content-Type"] = payload["content_type"]
        return payload["status"], headers, body
    except CheckFailure:
        raise
    except (ValueError, KeyError, TypeError):
        raise CheckFailure("network request failed") from None


def _fetch_worker(argv):
    """Private pipe protocol; served content never reaches the normal CLI log."""
    try:
        if len(argv) != 2:
            raise CheckFailure("network request failed")
        url, raw_timeout = argv
        parsed = urlsplit(url)
        validate_base_url(urlunsplit((parsed.scheme, parsed.netloc, "", "", "")))
        timeout = _timeout(raw_timeout)
        opener = build_opener(ProxyHandler({}), _NoRedirect())
        status, headers, body = _fetch_in_process(opener, url, _origin(url), timeout)
        payload = {"status": status, "content_type": headers.get("Content-Type", "text/plain"),
                   "body": base64.b64encode(body).decode("ascii")}
    except CheckFailure as error:
        payload = {"error": str(error)}
    except Exception:
        payload = {"error": "network request failed"}
    print(json.dumps(payload))
    return 0


def _check_page(result, label, response, expected, statuses, booking=False):
    status, headers, body = response
    if status not in statuses:
        result.errors.append(f"{label}: HTTP {status}; expected " + "/".join(str(value) for value in sorted(statuses)))
        return
    if headers.get_content_type() not in HTML_TYPES:
        result.errors.append(f"{label}: Content-Type must be HTML")
        return
    try:
        served = _parse_page(body, headers.get_content_charset() or "utf-8")
    except CheckFailure as error:
        result.errors.append(f"{label}: {error}")
        return
    if served.titles != expected.titles:
        result.errors.append(f"{label}: title differs from local source")
    if served.canonicals != expected.canonicals:
        result.errors.append(f"{label}: canonical references differ from local source")
    expected_assets, served_assets = expected.shared_assets(), served.shared_assets()
    for path in ASSET_PATHS:
        if served_assets[path] != expected_assets[path]:
            result.errors.append(f"{label}: shared asset reference differs for {path}")
    if booking and served.form_actions != expected.form_actions:
        result.errors.append(f"{label}: trial-form action differs from local source")


def verify_release(base_url, root=ROOT, timeout=10):
    """Return counts and safe failures; this function never submits a form."""
    result = VerificationResult()
    try:
        base_url = validate_base_url(base_url)
        timeout = _timeout(timeout)
    except ValueError as error:
        result.errors.append(f"configuration: {error}")
        return result
    try:
        pages, assets = _source_inventory(Path(root).resolve())
    except (OSError, ValueError, ET.ParseError) as error:
        detail = str(error) if isinstance(error, CheckFailure) else "local sources could not be read or parsed"
        result.errors.append(f"source inventory: {detail}")
        return result
    # No cookie handler, JavaScript engine, proxy, or automatic redirect handler.
    opener = build_opener(ProxyHandler({}), _NoRedirect())
    origin = _origin(base_url)
    for route, expected in pages.items():
        result.checked_pages += 1
        label = f"page {route}"
        try:
            response = _fetch(opener, base_url + route, origin, timeout)
            _check_page(result, label, response, expected, {200, 404} if route == "/404.html" else {200},
                        booking=route == "/book-trial/")
        except CheckFailure as error:
            result.errors.append(f"{label}: {error}")
    for reference, expected_hash in assets.items():
        result.checked_assets += 1
        label = f"asset {urlsplit(reference).path}"
        try:
            status, headers, body = _fetch(opener, base_url + reference, origin, timeout)
            if status != 200:
                result.errors.append(f"{label}: HTTP {status}; expected 200")
                continue
            types = {"text/css"} if urlsplit(reference).path.endswith(".css") else JAVASCRIPT_TYPES
            if headers.get_content_type() not in types:
                result.errors.append(f"{label}: Content-Type does not match CSS/JavaScript")
            if hashlib.sha256(body).digest() != expected_hash:
                result.errors.append(f"{label}: SHA-256 bytes differ from local source")
        except CheckFailure as error:
            result.errors.append(f"{label}: {error}")
    result.checked_not_found = True
    try:
        response = _fetch(opener, base_url + NOT_FOUND_ROUTE, origin, timeout)
        _check_page(result, f"missing route {NOT_FOUND_ROUTE}", response, pages["/404.html"], {404})
    except CheckFailure as error:
        result.errors.append(f"missing route {NOT_FOUND_ROUTE}: {error}")
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(
        description="Read-only GET release checks against an explicit site origin.",
        epilog=("Checks sitemap pages plus /success/ and /404.html, HTTP status, HTML titles/canonical links, "
                "four versioned shared references and asset SHA-256 bytes, booking form action, and a branded 404. "
                "No JavaScript, cookies, form submissions, POST, or external form/SDK requests. "
                "This is not complete content or rendering proof. Same-origin redirects: at most 10 hops; "
                "responses: at most 2 MiB. A failed HTTP/network check is not a website outage diagnosis."),
    )
    parser.add_argument("--base-url", required=True, help="HTTPS site origin, or HTTP loopback origin; no default")
    parser.add_argument("--root", type=Path, default=ROOT, help="Local source root (defaults to this script's repository)")
    parser.add_argument("--timeout", type=float, default=10,
                        help="Hard deadline per GET including redirects/startup, seconds (0.1–60; default 10)")
    args = parser.parse_args(argv)
    result = verify_release(args.base_url, root=args.root, timeout=args.timeout)
    state = "FAIL" if result.errors else "PASS"
    print(f"{state}: {result.checked_pages} public pages, {result.checked_assets} shared assets, "
          f"{int(result.checked_not_found)} missing route; {len(result.errors)} failed checks")
    for error in result.errors:
        print(f"FAIL {error}")
    return 1 if result.errors else 0


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--_fetch-worker":
        raise SystemExit(_fetch_worker(sys.argv[2:]))
    raise SystemExit(main())
