## ADDED Requirements

### Requirement: Root privilege enforcement
The installer script SHALL verify that it is running as root (UID 0) or via `sudo` at the very start of execution, before performing any other operations. If not root, it MUST abort immediately with an error message.

#### Scenario: Installer run as root
- **WHEN** the installer is executed with UID 0
- **THEN** the installer proceeds to the next step

#### Scenario: Installer run as non-root
- **WHEN** the installer is executed with UID != 0
- **THEN** the installer prints "Error: This installer must be run as root. Use: curl -fsSL <url> | sudo bash" and exits with code 1

### Requirement: Architecture auto-detection
The installer script SHALL detect the host CPU architecture using `uname -m` and map it to a GitHub Release asset suffix. Supported architectures MUST be `x86_64` (mapped to `linux-amd64`) and `aarch64` (mapped to `linux-arm64`).

#### Scenario: x86_64 machine
- **WHEN** `uname -m` returns `x86_64`
- **THEN** the installer targets the release asset named `k8s-ready-linux-amd64`

#### Scenario: aarch64 machine
- **WHEN** `uname -m` returns `aarch64`
- **THEN** the installer targets the release asset named `k8s-ready-linux-arm64`

#### Scenario: Unsupported architecture
- **WHEN** `uname -m` returns a value other than `x86_64` or `aarch64` (e.g., `armv7l`, `s390x`)
- **THEN** the installer prints "Error: Unsupported architecture: <arch>. Only x86_64 and aarch64 are supported." and exits with code 1

### Requirement: Dependency pre-checks
The installer script SHALL verify that either `curl` or `wget` is available, and that `ca-certificates` is installed, before attempting any network operations.

#### Scenario: curl is available
- **WHEN** `curl` is found in PATH
- **THEN** the installer uses `curl` for all HTTP requests

#### Scenario: curl not available but wget is
- **WHEN** `curl` is not found but `wget` is found in PATH
- **THEN** the installer uses `wget` as a fallback for all HTTP requests

#### Scenario: Neither curl nor wget available
- **WHEN** neither `curl` nor `wget` is found in PATH
- **THEN** the installer prints "Error: curl or wget is required. Install with: apt-get install -y curl" and exits with code 1

#### Scenario: ca-certificates missing
- **WHEN** `ca-certificates` is not installed (checked via `dpkg -l ca-certificates` or by testing HTTPS connectivity)
- **THEN** the installer prints "Error: ca-certificates is required for HTTPS. Install with: apt-get install -y ca-certificates" and exits with code 1

### Requirement: Dynamic GitHub Release asset fetching
The installer script SHALL query the GitHub Releases API at `/repos/<owner>/k8s-ready/releases/latest` to discover the download URL for the architecture-matched binary asset from the latest published release.

#### Scenario: Latest release has matching asset
- **WHEN** the GitHub Releases API returns a latest release containing an asset matching the detected architecture pattern
- **THEN** the installer downloads the binary from the asset's `browser_download_url`

#### Scenario: Latest release has no matching asset
- **WHEN** the latest release does not contain an asset matching the detected architecture
- **THEN** the installer prints "Error: No binary found for <arch> in the latest release" and exits with code 1

#### Scenario: GitHub API unreachable
- **WHEN** the GitHub API request fails (network error, timeout, or HTTP error)
- **THEN** the installer prints "Error: Failed to reach GitHub API. Check your network connection." and exits with code 1

### Requirement: Global binary installation
The installer script SHALL download the binary to a temporary location, move it to `/usr/local/bin/k8s-ready`, and set executable permissions using `chmod +x`.

#### Scenario: Successful installation
- **WHEN** the binary is downloaded successfully
- **THEN** the installer moves it to `/usr/local/bin/k8s-ready`, sets `chmod +x`, and the binary is executable from any shell session

#### Scenario: Previous installation exists
- **WHEN** `/usr/local/bin/k8s-ready` already exists from a prior installation
- **THEN** the installer overwrites the existing binary with the new version

### Requirement: Post-install verification
The installer script SHALL verify the installation by executing `k8s-ready --version` and printing the output. If the command fails, the installer MUST report an installation error.

#### Scenario: Verification succeeds
- **WHEN** `k8s-ready --version` executes successfully
- **THEN** the installer prints "k8s-ready <version> installed successfully to /usr/local/bin/k8s-ready"

#### Scenario: Verification fails
- **WHEN** `k8s-ready --version` fails (non-zero exit code)
- **THEN** the installer prints "Warning: Installation completed but version check failed. The binary may be corrupt." and exits with code 1
