## Why

The `k8s-ready` tool currently requires users to clone the repository and install via `pip`, which assumes Python, pip, and git are available on the target machine. For a tool that targets freshly provisioned bare-metal nodes, this multi-step installation is friction that delays adoption. Operators expect a single `curl | sudo bash` one-liner — the industry-standard distribution pattern for infrastructure CLI tools (similar to how Docker, Helm, and k3s are installed).

## What Changes

- **New bash installer script (`install.sh`)**: A self-contained shell script that auto-detects architecture, downloads the correct pre-compiled binary from GitHub Releases, and installs it to `/usr/local/bin/k8s-ready`.
- **Multi-architecture binary distribution**: Pre-compiled standalone binaries for `x86_64` (AMD64) and `aarch64` (ARM64) published as GitHub Release assets.
- **Root/sudo enforcement at installer level**: The installer itself validates root privileges before touching the filesystem.
- **Dependency pre-checks**: The installer validates that `curl`/`wget` and `ca-certificates` are present before attempting to download release assets.
- **Post-install verification**: The installer verifies a successful install by running `k8s-ready --version`.

## Capabilities

### New Capabilities
- `bash-installer`: One-liner bash installer script with architecture auto-detection, GitHub Release asset fetching, global binary installation, and pre-flight guardrails (root check, dependency verification).
- `binary-distribution`: GitHub Release asset naming conventions, multi-arch (AMD64/ARM64) compiled binary packaging, and release publishing workflow.

### Modified Capabilities
_(none — additive change to existing project)_

## Impact

- **New files**: `install.sh` at repository root, GitHub Actions workflow for building and publishing multi-arch binaries.
- **Distribution model**: Shifts from `pip install` to standalone binary + `curl` installer. The pip pathway remains available but is no longer the primary method.
- **GitHub Releases**: Requires structured release assets with architecture-specific naming (e.g., `k8s-ready-linux-amd64`, `k8s-ready-linux-arm64`).
- **Target path**: `/usr/local/bin/k8s-ready` — requires root write access.
- **Network dependency**: Installer requires outbound HTTPS to `github.com` and `objects.githubusercontent.com`.
