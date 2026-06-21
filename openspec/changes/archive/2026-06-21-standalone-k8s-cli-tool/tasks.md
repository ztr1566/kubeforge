## 1. Installer Script Foundation

- [x] 1.1 Create `install.sh` at the repository root with a bash shebang (`#!/usr/bin/env bash`) and `set -euo pipefail` for strict error handling
- [x] 1.2 Implement root/sudo enforcement: check `EUID -ne 0` at script entry, abort with actionable error message if not root
- [x] 1.3 Implement dependency pre-checks: detect `curl` or `wget` in PATH (prefer curl, fallback to wget), exit with install instructions if neither found
- [x] 1.4 Implement `ca-certificates` check: verify HTTPS capability via `dpkg -l ca-certificates` or test HTTPS connectivity, exit with install instructions if missing

## 2. Architecture Detection & Asset Resolution

- [x] 2.1 Implement architecture detection using `uname -m`, mapping `x86_64` → `linux-amd64` and `aarch64` → `linux-arm64`
- [x] 2.2 Implement unsupported architecture handling: exit with clear error listing supported architectures
- [x] 2.3 Construct the GitHub Release asset name using the pattern `k8s-ready-linux-{amd64,arm64}` from the detected architecture

## 3. GitHub Release Asset Fetching

- [x] 3.1 Implement GitHub Releases API query to `/repos/<owner>/k8s-ready/releases/latest` using the detected HTTP client (curl or wget)
- [x] 3.2 Parse the JSON response to extract the `browser_download_url` for the architecture-matched asset (use `grep`/`sed` or lightweight JSON parsing to avoid `jq` dependency)
- [x] 3.3 Implement error handling for API failures: network errors, HTTP errors, missing assets, and rate-limit responses
- [x] 3.4 Download the binary asset to a temporary file (`mktemp`) using the resolved download URL

## 4. Global Binary Installation

- [x] 4.1 Move the downloaded binary from the temp location to `/usr/local/bin/k8s-ready` using `mv -f`
- [x] 4.2 Set executable permissions with `chmod +x /usr/local/bin/k8s-ready`
- [x] 4.3 Implement cleanup: ensure the temp file is removed on both success and failure (use a `trap` handler)

## 5. Post-Install Verification

- [x] 5.1 Run `k8s-ready --version` and capture the output
- [x] 5.2 Print success message with the installed version and binary path on success
- [x] 5.3 Print warning message and exit with error code if version check fails (corrupt or incompatible binary)

## 6. Binary Distribution & Release Pipeline

- [x] 6.1 Add `--version` flag support to the main CLI entry point that prints `k8s-ready v<semver>` and exits with code 0
- [x] 6.2 Define the GitHub Actions workflow (`.github/workflows/release.yml`) that triggers on `v*.*.*` tags, builds multi-arch binaries, and uploads them as release assets with names `k8s-ready-linux-amd64` and `k8s-ready-linux-arm64`
- [x] 6.3 Verify the standalone binary runs on a minimal Ubuntu image without Node.js/Python runtime dependencies

## 7. Documentation Update

- [x] 7.1 Update `README.md` with the one-liner install command: `curl -fsSL https://raw.githubusercontent.com/<owner>/k8s-ready/main/install.sh | sudo bash`
- [x] 7.2 Document the manual install alternative (download binary directly from GitHub Releases)
- [x] 7.3 Document supported architectures (x86_64, aarch64) and minimum system requirements for the installer
