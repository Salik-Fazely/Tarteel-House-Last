NODE ?= node
PYTHON ?= python3

.PHONY: dev dev-ledger check check-browser check-release verify-release

# Local fake booking/notification/measurement environment. Stop with Ctrl+C.
dev:
	$(NODE) scripts/qa_server.js

dev-ledger:
	$(NODE) staff-ledger/scripts/qa_server.js

# Standard-library checks; no package installation is required.
check:
	$(NODE) --test tests/*_test.js
	$(PYTHON) -m unittest discover -s tests -p '*_test.py'
	$(PYTHON) scripts/sync_shared_layout.py --check
	git diff --check

# Optional real-browser checks; install tests/browser dependencies first.
check-browser:
	npm --prefix tests/browser test

# Local candidate checks. Does not publish or contact production services.
check-release: check check-browser

# Read-only checks; the caller must explicitly select the preview/production URL.
verify-release:
	$(PYTHON) scripts/verify_release.py --base-url "$(RELEASE_URL)"
