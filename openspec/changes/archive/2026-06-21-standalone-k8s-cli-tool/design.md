## Context

The `k8s-ready` project is a CLI tool for provisioning Debian/Ubuntu nodes for kubeadm clusters (see `core-k8s-automation-tool` change). The current distribution model assumes Python + pip on the target machine. This change adds a `curl | sudo bash` installer that downloads a pre-compiled standalone binary, eliminating the Python/pip dependency on target nodes.

The binary is compiled from the existing Node.js codebase using a bundler (e.g., `pkg`, `nexe`, or Node.js SEA) and published as GitHub Release assets per architecture.

## Goals / Non-Goals

**Goals:**
- Enable one-command installation: `curl -fsSL https://raw.githubusercontent.com/<owner>/k8s-ready/main/install.sh | sudo bash`
- Auto-detect host architecture (`x86_64` / `aarch64`) and download the matching binary.
- Install the binary globally to `/usr/local/bin/k8s-ready` with correct permissions.
- Enforce root/sudo at installer entry, not after a partial download.
- Validate that `curl` (or `wget` fallback) and `ca-certificates` exist before attempting network operations.
- Verify successful installation by executing `k8s-ready --version`.

**Non-Goals:**
- Windows or macOS support (Linux-only target).
- Uninstaller or upgrade-in-place logic (users can re-run the installer to overwrite).
- Package manager distribution (apt/yum/brew) — deferred to future work.
- Building the binary itself (CI/CD pipeline design is documented but the build tooling is out of scope for the installer script).
- Signed binaries or checksum verification (deferred — documented as a future hardening step).

## Decisions

### 1. Pure POSIX-compatible bash installer (no external dependencies beyond coreutils)

**Choice:** A single `install.sh` file using `/bin/bash` with no Python, Node.js, or other runtime dependencies. Only requires `curl` or `wget`, and standard coreutils (`uname`, `chmod`, `mv`).

**Rationale:** The installer runs on freshly provisioned machines where only base system packages are guaranteed. POSIX-compatible bash is the lowest common denominator. This matches the pattern used by Docker (`get.docker.com`), Helm, and k3s.

**Alternatives considered:**
- **Python-based installer:** Defeats the purpose — if Python is available, users can pip install directly.
- **Makefile:** Requires `make` which is not always present on minimal server images.

### 2. Architecture detection via `uname -m`

**Choice:** Use `uname -m` to detect the CPU architecture and map it to GitHub Release asset names.

**Mapping:**
| `uname -m` output | Asset suffix |
|---|---|
| `x86_64` | `linux-amd64` |
| `aarch64` | `linux-arm64` |

**Rationale:** `uname -m` is universally available on Linux and returns the kernel architecture. The two-value mapping covers the vast majority of server and cloud workloads. Unsupported architectures cause an immediate exit with a clear error.

**Alternatives considered:**
- **`dpkg --print-architecture`:** Debian-specific, returns `amd64`/`arm64` but not available on all Linux distros.
- **`arch` command:** Alias for `uname -m` on most systems, but not POSIX-specified.

### 3. GitHub Releases API for latest version discovery

**Choice:** Query the GitHub Releases API endpoint (`/repos/<owner>/k8s-ready/releases/latest`) to resolve the download URL for the latest release's architecture-specific asset.

**Rationale:** Avoids hardcoding version numbers in the installer script. The `/latest` endpoint returns a single release object with an `assets` array containing download URLs. The installer matches the asset name pattern `k8s-ready-linux-{amd64,arm64}`.

**Alternatives considered:**
- **Hardcoded version in installer:** Requires updating `install.sh` for every release. Defeats the point of a static install URL.
- **GitHub raw URL to binary:** Raw URLs are for source files, not release assets. Asset download URLs come from the Releases API.

### 4. `curl` primary with `wget` fallback

**Choice:** Prefer `curl` for HTTP requests. If `curl` is not found, fall back to `wget`. If neither is available, exit with an error suggesting `apt-get install curl`.

**Rationale:** `curl` is more commonly pre-installed on Ubuntu/Debian server images. `wget` provides a fallback for minimal images. The installer checks for both before attempting any network operation.

### 5. Install to `/usr/local/bin/k8s-ready`

**Choice:** Place the binary at `/usr/local/bin/k8s-ready` with `chmod +x`.

**Rationale:** `/usr/local/bin` is in `$PATH` on all standard Linux systems, is writable by root, and is the conventional location for locally-installed binaries. Does not conflict with package-manager-managed paths (`/usr/bin`).

## Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| **`curl \| bash` security concerns** | Document that users can download and inspect `install.sh` before executing. Future: add checksum verification for the binary. |
| **GitHub API rate limit on `/releases/latest`** | Unauthenticated limit is 60 req/hr per IP. Acceptable for an installer that runs once per node. |
| **Binary not available for the detected architecture** | Installer prints a clear error: "No binary available for architecture: <arch>" and exits. |
| **Stale `/usr/local/bin/k8s-ready` from previous install** | Installer overwrites unconditionally with `mv -f`. No version comparison needed. |
| **Missing `ca-certificates`** | Installer checks for ca-certificates package and exits with `apt-get install ca-certificates` suggestion if missing. |

## Open Questions

1. **Binary build tooling:** Which Node.js-to-binary compiler to use (`pkg` vs `nexe` vs Node.js SEA)? This is a CI/CD concern outside the installer scope, but the asset naming convention must be agreed upon.
2. **Checksum verification:** Should the installer download a `SHA256SUMS` file and verify the binary? Deferred but recommended for v2.
