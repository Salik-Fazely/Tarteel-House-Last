"""Exercise the release checker through real, disposable HTTP servers."""

import importlib.util
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit


ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts/verify_release.py"
ASSETS = {
    "/assets/css/styles.css?v=css-1": (b"body { color: green; }", "text/css"),
    "/assets/js/main.js?v=main-1": (b"// main fixture\n", "application/javascript"),
    "/assets/js/consent.js?v=consent-1": (b"// consent fixture\n", "text/javascript"),
    "/assets/js/analytics-events.js?v=events-1": (b"// events fixture\n", "application/javascript"),
}


def page_html(title, canonical=None, form_action=None, sdk=None):
    canonical_tag = f'<link rel="canonical" href="{canonical}">' if canonical else ""
    form = f'<form id="trial-form" action="{form_action}"></form>' if form_action else ""
    scripts = "".join(f'<script src="{url}"></script>' for url in ASSETS if "/js/" in url)
    external = f'<script src="{sdk}"></script>' if sdk else ""
    return (f'<!doctype html><html><head><title>{title}</title>{canonical_tag}'
            '<link rel="stylesheet" href="/assets/css/styles.css?v=css-1">'
            f'</head><body>{form}{scripts}{external}</body></html>').encode()


@contextmanager
def serve(responses):
    """Record all requests; routes can supply a response or a handler callback."""
    requests = []

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            requests.append(("GET", self.path))
            response = responses.get(self.path, (404, b"unexpected route", "text/plain"))
            if callable(response):
                response(self)
                return
            status, body, content_type, *extra = response
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            for key, value in (extra[0] if extra else {}).items():
                self.send_header(key, value)
            self.end_headers()
            try:
                self.wfile.write(body)
            except (BrokenPipeError, ConnectionResetError):
                pass

        def do_POST(self):
            requests.append(("POST", self.path))
            self.send_error(405)

        def log_message(self, *args):
            pass

    server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
    server.daemon_threads = True
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}", requests
    finally:
        server.shutdown()
        server.server_close()
        thread.join()


class ReleaseVerificationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.source = Path(self.temp.name)
        self.pages = {
            "/": page_html("Home | Tarteel House", "https://www.tarteelhouse.com/"),
            "/book-trial/": page_html(
                "Book Trial | Tarteel House", "https://www.tarteelhouse.com/book-trial/",
                "https://script.google.com/macros/s/EXPECTED-ENDPOINT/exec"),
            "/success/": page_html("Received | Tarteel House", "https://www.tarteelhouse.com/success/"),
            "/404.html": page_html("Page Not Found | Tarteel House"),
        }
        for route, body in self.pages.items():
            path = self.source / ("404.html" if route == "/404.html" else route.lstrip("/") + "index.html")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)
        for url, (body, _) in ASSETS.items():
            path = self.source / urlsplit(url).path.lstrip("/")
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(body)
        (self.source / "sitemap.xml").write_text(
            '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'
            '<url><loc>https://www.tarteelhouse.com/</loc></url>'
            '<url><loc>https://www.tarteelhouse.com/book-trial/</loc></url></urlset>', encoding="utf-8")
        self.responses = {route: (200, body, "text/html; charset=utf-8")
                          for route, body in self.pages.items()}
        self.responses.update({url: (200, body, mime) for url, (body, mime) in ASSETS.items()})
        self.responses["/__tarteel_release_not_found__/"] = (404, self.pages["/404.html"], "text/html")

    def checker(self):
        self.assertTrue(SCRIPT.is_file(), "The read-only release checker has not been implemented")
        name = "tarteel_verify_release"
        if name not in sys.modules:
            spec = importlib.util.spec_from_file_location(name, SCRIPT)
            module = importlib.util.module_from_spec(spec)
            sys.modules[name] = module
            spec.loader.exec_module(module)
        return sys.modules[name]

    def test_matching_release_checks_public_pages_assets_and_branded_missing_route(self):
        with serve(self.responses) as (base_url, requests):
            result = self.checker().verify_release(base_url, root=self.source)
        self.assertEqual([], result.errors)
        self.assertEqual(4, result.checked_pages)
        self.assertEqual(4, result.checked_assets)
        self.assertTrue(result.checked_not_found)
        self.assertCountEqual([
            "/", "/book-trial/", "/success/", "/404.html",
            *ASSETS, "/__tarteel_release_not_found__/",
        ], [path for method, path in requests if method == "GET"])
        self.assertTrue(all(method == "GET" for method, _ in requests))

    def check(self, responses=None, timeout=10):
        with serve(self.responses if responses is None else responses) as (base_url, requests):
            try:
                result = self.checker().verify_release(base_url, root=self.source, timeout=timeout)
            except Exception as error:
                self.fail(f"A failed check must be returned instead of raising {type(error).__name__}")
        return result, requests

    def assert_failed_check(self, result, label):
        self.assertTrue(any(label in error for error in result.errors), result.errors)

    def test_page_title_canonical_asset_version_and_form_action_drift_fail(self):
        changes = [
            ("/", b"Home | Tarteel House", b"Wrong title", "title"),
            ("/", b"https://www.tarteelhouse.com/", b"https://wrong.invalid/", "canonical"),
            ("/", b'rel="canonical"', b"rel", "canonical"),
            ("/", b"main.js?v=main-1", b"main.js?v=stale", "main.js"),
            ("/", b"/assets/css/styles.css?v=css-1", b"https://external.invalid/assets/css/styles.css?v=css-1", "styles.css"),
            ("/book-trial/", b"EXPECTED-ENDPOINT", b"WRONG-ENDPOINT", "trial-form action"),
        ]
        for route, old, new, label in changes:
            with self.subTest(label=label):
                responses = dict(self.responses)
                responses[route] = (200, self.pages[route].replace(old, new), "text/html")
                result, _ = self.check(responses)
                self.assert_failed_check(result, label)
                self.assertFalse(any("ENDPOINT" in error for error in result.errors))

    def test_stale_asset_bytes_and_wrong_asset_content_type_fail(self):
        for response, label in [
            ((200, b"// outdated deployed content", "text/javascript"), "SHA-256"),
            ((200, ASSETS["/assets/js/main.js?v=main-1"][0], "text/html"), "Content-Type"),
            ((404, b"missing", "text/javascript"), "HTTP 404"),
        ]:
            with self.subTest(label=label):
                responses = dict(self.responses)
                responses["/assets/js/main.js?v=main-1"] = response
                result, _ = self.check(responses)
                self.assert_failed_check(result, label)

    def test_page_status_and_content_type_fail_without_exposing_response_body(self):
        for status, mime, label in [(403, "text/html", "HTTP 403"),
                                    (200, "application/json", "Content-Type")]:
            with self.subTest(label=label):
                responses = dict(self.responses)
                responses["/"] = (status, b"PRIVATE_RESPONSE_CONTENT", mime)
                result, _ = self.check(responses)
                self.assert_failed_check(result, label)
                self.assertFalse(any("PRIVATE_RESPONSE_CONTENT" in error for error in result.errors))

    def test_missing_route_requires_404_and_local_branded_title_and_assets(self):
        for response, label in [
            ((200, self.pages["/404.html"], "text/html"), "HTTP 200"),
            ((404, b"<title>Generic server error</title>", "text/html"), "title"),
            ((404, self.pages["/404.html"].replace(b"main.js?v=main-1", b"main.js?v=old"), "text/html"), "main.js"),
        ]:
            with self.subTest(label=label):
                responses = dict(self.responses)
                responses["/__tarteel_release_not_found__/"] = response
                result, _ = self.check(responses)
                self.assert_failed_check(result, label)

    def test_direct_404_accepts_404_and_same_origin_redirects(self):
        responses = dict(self.responses)
        responses["/404.html"] = (302, b"", "text/html", {"Location": "/404"})
        responses["/404"] = (404, self.pages["/404.html"], "text/html")
        result, requests = self.check(responses)
        self.assertEqual([], result.errors)
        self.assertIn(("GET", "/404"), requests)

    def test_cross_origin_redirect_is_rejected_before_contacting_target(self):
        with serve({"/target": (200, self.pages["/"], "text/html")}) as (external_url, external_requests):
            responses = dict(self.responses)
            responses["/"] = (302, b"", "text/html", {"Location": external_url + "/target"})
            result, _ = self.check(responses)
        self.assertEqual([], external_requests)
        self.assert_failed_check(result, "cross-origin redirect")

    def test_form_endpoint_and_external_sdk_are_never_contacted(self):
        with serve({}) as (external_url, external_requests):
            body = page_html("Book Trial | Tarteel House", "https://www.tarteelhouse.com/book-trial/",
                             external_url + "/form-endpoint", external_url + "/sdk.js")
            (self.source / "book-trial/index.html").write_bytes(body)
            self.responses["/book-trial/"] = (200, body, "text/html")
            result, requests = self.check()
        self.assertEqual([], result.errors)
        self.assertEqual([], external_requests)
        self.assertTrue(all(method == "GET" for method, _ in requests))

    def test_base_url_requires_https_or_http_loopback_and_an_origin_only(self):
        module = self.checker()
        self.assertTrue(callable(getattr(module, "validate_base_url", None)), "Base URL validation is missing")
        for value in ["https://preview.example", "http://localhost:8123/",
                      "http://127.0.0.1:8123", "http://[::1]:8123/"]:
            with self.subTest(valid=value):
                self.assertTrue(module.validate_base_url(value))
        for value in ["http://remote.example", "ftp://localhost", "https://user:password@preview.example",
                      "https://preview.example/path", "https://preview.example?x=1",
                      "https://preview.example#fragment", "https://preview.example:bad",
                      " https://preview.example", "https://preview.example/\n", "https://", "//preview.example"]:
            with self.subTest(invalid=value):
                with self.assertRaises(ValueError):
                    module.validate_base_url(value)

    def test_invalid_base_and_invalid_source_fail_before_network_requests(self):
        with serve(self.responses) as (base_url, requests):
            result = self.checker().verify_release(base_url + "/path", root=self.source)
            self.assert_failed_check(result, "base URL")
            self.assertEqual([], requests)
            (self.source / "sitemap.xml").write_text(
                '<urlset><url><loc>https://www.tarteelhouse.com/../escape/</loc></url></urlset>', encoding="utf-8")
            result = self.checker().verify_release(base_url, root=self.source)
            self.assert_failed_check(result, "source inventory")
            self.assertEqual([], requests)

    def test_missing_source_and_inconsistent_source_asset_version_fail_before_network(self):
        for mode in ["missing", "version"]:
            with self.subTest(mode=mode):
                path = self.source / "success/index.html"
                if mode == "missing":
                    path.unlink()
                else:
                    path.write_bytes(self.pages["/success/"].replace(b"main.js?v=main-1", b"main.js?v=old"))
                result, requests = self.check()
                self.assert_failed_check(result, "source inventory")
                self.assertEqual([], requests)

    def test_response_larger_than_two_mib_fails(self):
        self.responses["/"] = (200, b"x" * (2 * 1024 * 1024 + 1), "text/html")
        result, _ = self.check()
        self.assert_failed_check(result, "2 MiB")

    def test_timeout_is_a_failed_check(self):
        def delayed(handler):
            time.sleep(0.25)
            handler.send_response(200)
            handler.send_header("Content-Type", "text/html")
            handler.end_headers()
        self.responses["/"] = delayed
        result, _ = self.check(timeout=0.1)
        self.assert_failed_check(result, "timeout")

    def slow_header(self, release):
        def handler(response):
            try:
                response.wfile.write(b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nX-Slow: ")
                response.wfile.flush()
                while not release.wait(0.03):
                    response.wfile.write(b"x")
                    response.wfile.flush()
                response.wfile.write(b"\r\nContent-Length: 0\r\n\r\n")
            except (BrokenPipeError, ConnectionResetError):
                pass
        return handler

    def test_slow_trickled_headers_cannot_keep_a_get_alive_past_its_deadline(self):
        module = self.checker()
        release = threading.Event()
        failures = []
        opener = module.build_opener(module.ProxyHandler({}), module._NoRedirect())
        with serve({"/": self.slow_header(release)}) as (base_url, _):
            def fetch():
                try:
                    module._fetch(opener, base_url + "/", module._origin(base_url), 0.25)
                except Exception as error:
                    failures.append(error)
            thread = threading.Thread(target=fetch, daemon=True)
            thread.start()
            thread.join(1.5)
            still_running = thread.is_alive()
            release.set()
            thread.join(2)
        self.assertFalse(still_running, "A slow header kept the GET alive beyond its hard deadline")
        self.assertEqual(1, len(failures))
        self.assertIsInstance(failures[0], module.CheckFailure)
        self.assertIn("timeout", str(failures[0]))

    def test_delayed_body_read_uses_the_remaining_hard_deadline(self):
        module = self.checker()
        release = threading.Event()
        def delayed_body(response):
            try:
                response.wfile.write(b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nConnection: close\r\n\r\n")
                response.wfile.flush()
                if not release.wait(0.45):
                    response.wfile.write(b"x")
                    response.wfile.flush()
                    release.wait(2)
            except (BrokenPipeError, ConnectionResetError):
                pass
        opener = module.build_opener(module.ProxyHandler({}), module._NoRedirect())
        with serve({"/": delayed_body}) as (base_url, _):
            start = time.monotonic()
            try:
                with self.assertRaises(module.CheckFailure) as caught:
                    module._fetch(opener, base_url + "/", module._origin(base_url), 0.5)
                elapsed = time.monotonic() - start
            finally:
                release.set()
        self.assertIn("timeout", str(caught.exception))
        self.assertLess(elapsed, 0.75, "The body socket read reused the initial timeout after most of the budget elapsed")

    def test_cli_slow_headers_returns_a_safe_failure_and_exits(self):
        release = threading.Event()
        self.responses["/"] = self.slow_header(release)
        with serve(self.responses) as (base_url, _):
            try:
                run = subprocess.run([sys.executable, str(SCRIPT), "--base-url", base_url,
                                      "--root", str(self.source), "--timeout", "0.25"],
                                     capture_output=True, text=True, timeout=3)
            except subprocess.TimeoutExpired:
                self.fail("The CLI stayed alive while the server trickled header bytes")
            finally:
                release.set()
        self.assertEqual(1, run.returncode)
        self.assertIn("timeout", run.stdout)
        self.assertNotIn("Traceback", run.stdout + run.stderr)

    def test_malformed_http_response_is_a_failed_check_without_body_disclosure(self):
        responses = [
            b"PRIVATE_MALFORMED_RESPONSE\r\n\r\n",
            (b"HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nTransfer-Encoding: chunked\r\n\r\n"
             b"PRIVATE_MALFORMED_RESPONSE\r\n"),
        ]
        for raw_response in responses:
            with self.subTest(raw_response=raw_response[:12]):
                def malformed(handler):
                    handler.wfile.write(raw_response)
                self.responses["/"] = malformed
                result, _ = self.check()
                self.assert_failed_check(result, "network request failed")
                self.assertFalse(any("PRIVATE_MALFORMED_RESPONSE" in error for error in result.errors))
                with serve(self.responses) as (base_url, _):
                    run = subprocess.run([sys.executable, str(SCRIPT), "--base-url", base_url,
                                          "--root", str(self.source)], capture_output=True, text=True)
                self.assertEqual(1, run.returncode)
                self.assertIn("network request failed", run.stdout)
                self.assertNotIn("PRIVATE_MALFORMED_RESPONSE", run.stdout + run.stderr)
                self.assertNotIn("Traceback", run.stdout + run.stderr)

    def test_redirects_stop_after_ten_hops(self):
        self.responses["/"] = (302, b"", "text/html", {"Location": "/hop/1"})
        for number in range(1, 12):
            self.responses[f"/hop/{number}"] = (302, b"", "text/html", {"Location": f"/hop/{number + 1}"})
        result, requests = self.check()
        self.assert_failed_check(result, "redirect limit")
        self.assertEqual(10, sum(path.startswith("/hop/") for _, path in requests))

    def test_cli_requires_explicit_base_url_and_explains_actual_scope(self):
        required = subprocess.run([sys.executable, str(SCRIPT)], capture_output=True, text=True)
        self.assertNotEqual(0, required.returncode)
        self.assertIn("--base-url", required.stderr)
        help_result = subprocess.run([sys.executable, str(SCRIPT), "--help"], capture_output=True, text=True)
        self.assertEqual(0, help_result.returncode)
        self.assertIn("GET", help_result.stdout)
        self.assertIn("complete content", help_result.stdout)

    def test_cli_outputs_counts_and_nonzero_exit_for_failed_check(self):
        for valid in [True, False]:
            with self.subTest(valid=valid):
                responses = dict(self.responses)
                if not valid:
                    responses["/"] = (403, b"private", "text/html")
                with serve(responses) as (base_url, _):
                    run = subprocess.run([sys.executable, str(SCRIPT), "--base-url", base_url,
                                          "--root", str(self.source)], capture_output=True, text=True)
                self.assertEqual(0 if valid else 1, run.returncode)
                self.assertIn("4 public pages", run.stdout)
                self.assertIn("4 shared assets", run.stdout)
                self.assertIn("1 missing route", run.stdout)
                if not valid:
                    self.assertIn("HTTP 403", run.stdout)
                    self.assertNotIn("private", run.stdout)


if __name__ == "__main__":
    unittest.main()
