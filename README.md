# KubeForge

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](https://www.apache.org/licenses/LICENSE-2.0)
[![Platform: Linux](https://img.shields.io/badge/Platform-Linux-blueviolet.svg)](#system-requirements)
[![Arch: x86_64 | aarch64](https://img.shields.io/badge/Arch-x86__64%20%7C%20aarch64-orange.svg)](#supported-architectures)
[![Node.js: 20](https://img.shields.io/badge/Node.js-20-339933.svg)](https://nodejs.org)
[![Zero Runtime Deps](https://img.shields.io/badge/Runtime-none-success.svg)](#binary-requirements)

**KubeForge** is a single-binary, zero-dependency CLI utility that converts a fresh Debian or Ubuntu host into a fully bootstrapped, Flannel-CNI-provisioned, `Ready`-state Kubernetes control-plane node — with one command and zero manual follow-up steps.

> From a bare-metal or cloud VM to a `k8s-ready` cluster in a single `sudo kubeforge prepare` invocation.

---

## Table of Contents

- [Features](#features)
- [Quick Install](#quick-install)
- [The 5-Stage Provisioning Pipeline](#the-5-stage-provisioning-pipeline)
  - [Stage 1 — Pre-Flight: Hardware, Swap & Kernel](#stage-1--pre-flight-hardware-swap--kernel)
  - [Stage 2 — Container Runtime: Containerd + SystemdCgroup](#stage-2--container-runtime-containerd--systemdcgroup)
  - [Stage 3 — Repository & Version Resolution](#stage-3--repository--version-resolution)
  - [Stage 4 — Kubernetes Binaries with Strict Pinning](#stage-4--kubernetes-binaries-with-strict-pinning)
  - [Stage 5 — Zero-Touch Control-Plane Bootstrap](#stage-5--zero-touch-control-plane-bootstrap)
- [Manual Install](#manual-install)
- [Supported Architectures](#supported-architectures)
- [System Requirements](#system-requirements)
- [Usage](#usage)
- [Development](#development)
- [Releases & CI/CD](#releases--cicd)
- [Author](#author)
- [License](#license)

---

## Features

- **Single static binary** — compiled with `@yao-pkg/pkg`, ships with no Node.js, Python, or external runtime dependencies (glibc only).
- **Cross-architecture matrix** — pre-built binaries for `linux/amd64` and `linux/arm64`.
- **5-stage sequential pipeline** — pre-flight validation → containerd → repo/version → binaries → bootstrap, with hard `try/catch` failure isolation per stage.
- **Zero-touch cluster bootstrap** — runs `kubeadm init`, hands kubeconfig ownership back to the invoking non-root user, deploys Flannel, and polls until the node reports `Ready: True`.
- **Modern upstream repositories** — uses `pkgs.k8s.io/core:/stable:/vX.Y` (the canonical replacement for the legacy `apt.kubernetes.io`).
- **Strict package pinning** — `apt-mark hold kubelet kubeadm kubectl` immediately after install to prevent accidental upgrades.
- **Reproducible CI** — `npm ci` from a committed lockfile, deterministic version injection from Git tags, and verification on a minimal `ubuntu:22.04` container with explicit runtime absence assertions.

---

## Quick Install

Install the latest release on any supported Linux host:

```bash
curl -fsSL https://raw.githubusercontent.com/ztr1566/KubeForge/main/install.sh | sudo bash
```

The installer:

1. Verifies it is running as root (via `sudo`).
2. Confirms `curl` (or `wget`) and `ca-certificates` are present.
3. Detects the host architecture (`x86_64` or `aarch64`).
4. Queries the GitHub Releases API for the latest published asset.
5. Downloads the architecture-matched binary to a temporary file.
6. Installs it to `/usr/local/bin/kubeforge` with `0755` permissions.
7. Runs `kubeforge --version` to confirm the binary is intact.

### Inspect before running

```bash
curl -fsSL https://raw.githubusercontent.com/ztr1566/KubeForge/main/install.sh -o install.sh
less install.sh
sudo bash install.sh
```

---

## The 5-Stage Provisioning Pipeline

`KubeForge` runs a deterministic, ordered pipeline of provisioning stages. Each stage is isolated via `try/catch`; the pipeline aborts on the first failure with a descriptive error identifying the failing stage.

### Stage 1 — Pre-Flight: Hardware, Swap & Kernel

| Check | Master Profile | Worker Profile |
|---|---|---|
| CPU cores | ≥ 2 | ≥ 1 |
| RAM | ≥ 2 GB | ≥ 1 GB |
| Swap | MUST be disabled | MUST be disabled |

Hardware is detected via the Node.js `os` module (`os.cpus().length`, `os.totalmem()`) and `/proc/swaps`. If any check fails, the pipeline aborts with code 1 — unless the operator passes `--force`.

Once validation passes, the pipeline executes the system tuning steps:

- **Swap purging** — `swapoff -a` is executed immediately; swap entries in `/etc/fstab` are commented out to persist across reboots (kubelet refuses to start on hosts with active swap).
- **Kernel module injection** — `overlay` and `br_netfilter` are loaded with `modprobe`, and persisted in `/etc/modules-load.d/k8s.conf`.
- **Sysctl networking** — `net.bridge.bridge-nf-call-iptables = 1`, `net.ipv4.ip_forward = 1`, and related parameters are written to `/etc/sysctl.d/99-kubernetes-cri.conf` and applied live.

### Stage 2 — Container Runtime: Containerd + SystemdCgroup

Containerd is installed via the upstream `apt` package and the default `/etc/containerd/config.toml` is regenerated. The pipeline then performs **automated SystemdCgroup tuning**:

- The kubelet defaults to the `systemd` cgroup driver on modern Kubernetes.
- Containerd's default is `cgroupfs`.
- KubeForge searches the generated config for `SystemdCgroup = false` and rewrites it to `SystemdCgroup = true` to match the kubelet's expectation.
- The pipeline then restarts and `enable`s the `containerd` systemd unit and waits for the socket at `/run/containerd/containerd.sock` to be live before proceeding.

### Stage 3 — Repository & Version Resolution

KubeForge resolves the target Kubernetes version dynamically and configures the modern upstream repository layers:

1. **Version resolver** — `fetchVersionChoices()` calls `https://api.github.com/repos/kubernetes/kubernetes/releases?per_page=100` and parses the JSON.
2. The top **3 latest stable** minor/patch releases are extracted (excluding pre-releases and draft releases) and presented to the operator via a numbered interactive prompt.
3. The selected major.minor (e.g., `1.30`) is used to construct the modern repository URL: `https://pkgs.k8s.io/core:/stable:/v1.30/deb/`.
4. The repository's signing key is downloaded from `https://pkgs.k8s.io/core:/stable:/v1.30/deb/Release.key`, dearmored with `gpg --dearmor`, and written to `/etc/apt/keyrings/kubernetes-apt-keyring.gpg`.
5. The `kubeadm init` configuration YAML (with `podSubnet: "10.244.0.0/16"`) is written to `/etc/kubernetes/kubeadm-init-config.yaml` — used downstream by Stage 5.
6. `apt-get update` refreshes the package index against the new repository.

### Stage 4 — Kubernetes Binaries with Strict Pinning

`kubelet`, `kubeadm`, and `kubectl` are installed at the version selected in Stage 3.

**Immediately after install**, KubeForge executes:

```bash
apt-mark hold kubelet kubeadm kubectl
```

This is critical: the kubeadm-deployed control plane assumes a specific minor version on every node. Accidental `apt upgrade` runs would skew the version matrix and corrupt the cluster. The `hold` flag prevents `apt` from ever auto-upgrading these packages.

### Stage 5 — Zero-Touch Control-Plane Bootstrap

This is the marquee capability. When the role is `master`, Stage 5 replaces what would otherwise be 4+ separate manual commands with a single atomic sequence:

#### 5.1 — `kubeadm init`
`kubeadm init --config /etc/kubernetes/kubeadm-init-config.yaml` is invoked via `child_process.execSync` with `stdio: 'inherit'` so the operator watches the real-time installation progress. The full pre-written YAML is consumed, including `podSubnet: 10.244.0.0/16` and the `criSocket: unix:///run/containerd/containerd.sock` line from Stage 2.

#### 5.2 — Dynamic kubeconfig handover via `SUDO_USER`
After init, `/etc/kubernetes/admin.conf` exists but is owned by `root`. KubeForge resolves the real invoking user through a strict priority chain:

1. `process.env.SUDO_USER` (set by `sudo`)
2. Fall back to `process.env.USER` if the first is empty or `root`
3. Default to `root` (with a printed warning) if both resolve to root

The numeric `uid` and `gid` are obtained by shelling out to `id -u <user>` and `id -g <user>`. The home directory is `/home/<user>` for non-root users, or `/root` for root.

Then:

- `<homeDir>/.kube/` is created via `fs.mkdirSync({ recursive: true })`.
- `/etc/kubernetes/admin.conf` is copied to `<homeDir>/.kube/config` via `fs.copyFileSync`.
- `fs.chownSync` is called on **both** the directory and the file with the resolved UID/GID.

The operator can immediately run `kubectl` as themselves — no `sudo`, no `export KUBECONFIG=...` boilerplate.

#### 5.3 — Flannel CNI deployment
`kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml` runs with `KUBECONFIG` set to the newly-chowned config path. The `env` object passed to `execSync` is `{ ...process.env, KUBECONFIG: <home>/.kube/config }` — never relying on kubectl's default config discovery.

#### 5.4 — Active readiness polling loop
KubeForge synchronously polls `kubectl get nodes -o json` (with `KUBECONFIG` env and `stdio: 'pipe'`) on a fixed cadence:

- Default: **18 iterations × 10 seconds = 3-minute total timeout**.
- The JSON is parsed; `items[0].status.conditions` is searched for the entry where `type === 'Ready'`.
- If `status === 'True'`, the loop returns immediately and the bootstrap is declared successful.
- Each iteration prints a synchronized progress line: `Waiting for node to become Ready... (n/18) Status: <status>`.
- If `kubectl` itself errors (e.g., the API server is still booting), the failure is **swallowed** and the iteration is treated as "not ready" — preventing the API-server-startup race from aborting the bootstrap.
- If 18 attempts exhaust without `True`, KubeForge throws with the last observed status and instructions to run `kubectl get nodes` manually.

When the loop returns, the master is genuinely `Ready`.

---

## Manual Install

If you prefer to download the binary directly from [GitHub Releases](https://github.com/ztr1566/KubeForge/releases):

1. Pick the asset for your architecture:
   - **x86_64** — `kubeforge-linux-amd64`
   - **aarch64** — `kubeforge-linux-arm64`

2. Install:

   ```bash
   chmod +x kubeforge-linux-amd64
   sudo mv kubeforge-linux-amd64 /usr/local/bin/kubeforge
   ```

3. Verify:

   ```bash
   kubeforge --version
   # → KubeForge vX.Y.Z
   ```

---

## Supported Architectures

| `uname -m` | Release Asset | Description |
|---|---|---|
| `x86_64` | `kubeforge-linux-amd64` | 64-bit Intel / AMD (servers, laptops, most cloud VMs) |
| `aarch64` | `kubeforge-linux-arm64` | 64-bit ARM (Raspberry Pi 4/5, AWS Graviton, Ampere Altra) |

Other architectures (`armv7l`, `s390x`, `ppc64le`) are not built and will produce an `unsupported architecture` error from the installer.

---

## System Requirements

### Installer requirements (`install.sh`)

- **OS** — Linux (any distribution with `bash`)
- **Privileges** — root or `sudo`
- **HTTP client** — `curl` (preferred) or `wget`
- **TLS** — `ca-certificates` package installed
- **Network** — outbound HTTPS to `github.com` and `objects.githubusercontent.com`

### Binary requirements (the `kubeforge` executable)

- **OS** — Debian or Ubuntu (target distribution for the CLI tool)
- **Architecture** — `x86_64` or `aarch64`
- **Runtime** — none. The binary is fully self-contained (no Node.js, no Python, no shared objects beyond glibc). Verified on a minimal `ubuntu:22.04` container.

### CLI tool requirements (for provisioning a node)

- **OS** — Debian or Ubuntu (verified via `/etc/os-release`)
- **Privileges** — root (UID 0); the binary checks `process.getuid() === 0` and exits if not
- **Network** — outbound HTTPS to `api.github.com` (version resolution), `pkgs.k8s.io` (repo + GPG key), and `raw.githubusercontent.com` (Flannel manifest)
- **Kubernetes** — targets kubeadm-based clusters with the Flannel CNI

---

## Usage

```bash
kubeforge --version     # Print version
kubeforge --help        # Print help
```

Full provisioning (interactive):

```bash
sudo kubeforge prepare
```

`prepare` walks the operator through role selection (Master / Worker), version selection (top 3 stable releases), hardware validation, and then runs the full 5-stage pipeline. On a master, the final output is:

```
✔ Cluster bootstrapped successfully. Node is officially READY.
```

On a worker, the final output is:

```
✔ Node provisioning complete. Ready for kubeadm join.
```

`--force` bypasses failed hardware checks:

```bash
sudo kubeforge prepare --force
```

---

## Development

### Prerequisites

- Node.js 20+
- npm

### Local development

```bash
npm install
node src/index.js --version
```

### Build binaries locally

```bash
npm run build:amd64    # Build for x86_64
npm run build:arm64    # Build for aarch64
npm run build          # Build both
```

Binaries are emitted to `dist/`:

```
dist/kubeforge-linux-amd64
dist/kubeforge-linux-arm64
```

The build is driven by `@yao-pkg/pkg` with `node20-linux-x64` and `node20-linux-arm64` targets.

---

## Releases & CI/CD

Releases are fully automated via the workflow at [`.github/workflows/release.yml`](.github/workflows/release.yml).

### Trigger

Pushing a Git tag matching `v*.*.*` (e.g., `v1.0.0`, `v0.3.0-rc.2`).

```bash
git tag v1.0.0
git push origin v1.0.0
```

### What the pipeline does

1. **`build` job** (matrix, `fail-fast: false`)
   - Checks out the repo
   - Sets up Node.js 20
   - Installs dependencies via `npm install --no-fund --no-audit`
   - Extracts the version from `GITHUB_REF_NAME` (strips the `v` prefix) and injects it into `package.json` via `npm version --no-git-tag-version --allow-same-version` — so the compiled binary's `--version` output matches the tag
   - Compiles both `linux-amd64` and `linux-arm64` binaries in parallel
   - Runs `file` and `ls -la` for build inspection
   - Asserts `--version` output starts with `KubeForge v` on the build runner
   - Uploads each binary as a 7-day-retention artifact

2. **`verify-minimal-ubuntu` job** (`needs: build`)
   - Runs on `ubuntu-latest` (no job-level `container:` to prevent Node.js injection)
   - Downloads the amd64 artifact to `dist/`
   - Runs an **inline `docker run ubuntu:22.04`** from the host with `-v ${{ github.workspace }}/dist:/tmp/binaries`
   - Inside the container, asserts `command -v node` and `command -v python3` both fail — confirming zero runtime dependencies — then executes the binary and asserts it produces `KubeForge v*`

3. **`release` job** (`needs: [build, verify-minimal-ubuntu]`)
   - Downloads all artifacts to `/tmp/artifacts`
   - Stages both binaries into `release-assets/` with `chmod +x`
   - Publishes a GitHub Release via `softprops/action-gh-release@v2` with `files: release-assets/kubeforge-linux-*`, `generate_release_notes: true`, and `fail_on_unmatched_files: true`

If the verification job fails, the release is blocked — broken binaries can never be published.

---

## Author

**Ziad T. Rashid**

---

## License

This project is licensed under the **Apache License, Version 2.0**.

You may obtain a copy of the License at:

```
http://www.apache.org/licenses/LICENSE-2.0
```

Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the [`LICENSE`](LICENSE) file for the full license text.
