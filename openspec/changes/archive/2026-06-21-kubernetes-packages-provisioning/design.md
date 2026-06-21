## Context

The `k8s-ready prepare` pipeline currently runs 4 stages (swap → kernel → sysctl → containerd). This change adds 4 more stages (version resolve → repo setup → binary install → network prep) that require the user-selected Kubernetes version to flow through the pipeline. The codebase is zero-dependency Node.js compiled via `@yao-pkg/pkg`. All system interaction uses `child_process.execSync` and `fs`. Network requests will use the built-in `https` module.

Current pipeline modules all export `execute()` with no parameters. The new stages introduce a data dependency: the user's version choice must propagate from the wizard through the new stages.

## Goals / Non-Goals

**Goals:**
- Resolve latest stable Kubernetes versions from GitHub without adding npm dependencies.
- Configure the modern `pkgs.k8s.io` repository (the legacy `apt.kubernetes.io` is deprecated and will be shut down).
- Install exact-version packages and pin them to prevent accidental upgrades.
- Prepare master nodes with the Flannel-compatible pod CIDR configuration.
- Maintain the existing module interface pattern while passing version/role context to new stages.

**Non-Goals:**
- Supporting alternative CNI plugins (Calico, Cilium) — Flannel only.
- Running `kubeadm init` or `kubeadm join` — that is a future change.
- Authenticated GitHub API access or token management.
- Supporting non-Debian/Ubuntu package managers (`yum`, `dnf`, `zypper`).
- Offline/air-gapped installation (requires network for GitHub API + apt).

## Decisions

### 1. Built-in `https` module for GitHub API instead of `fetch` or npm packages

Node.js 20 includes a global `fetch`, but `@yao-pkg/pkg` bundles may have compatibility issues with undici-based fetch. The `https` module is battle-tested in pkg binaries. We wrap it in a simple Promise-returning helper that returns the parsed JSON body.

**Alternative considered**: `node-fetch` or native `fetch`. Rejected to maintain zero npm runtime dependencies and ensure pkg compatibility.

### 2. GitHub Releases API endpoint for version resolution

Use `GET https://api.github.com/repos/kubernetes/kubernetes/releases` with pagination to find the latest 3 stable minor releases. Filter out pre-releases (`prerelease: true`) and draft releases. Extract the `tag_name` field (e.g., `v1.32.4`). Group by minor version and pick the latest patch for each.

**Alternative considered**: Scraping `dl.k8s.io` or parsing `CHANGELOG.md`. Rejected because the Releases API provides structured JSON with clear pre-release flags.

### 3. Version selection injected between role selection and hardware detection

The version prompt appears after the user picks Master/Worker but before hardware validation. This lets the entire pipeline have both `role` and `selectedVersion` available. The version choice does not affect hardware thresholds, so ordering is flexible — but placing it early means any failure in network fetch is caught before system mutations begin.

### 4. New module signatures accept context object

The existing 4 stages export `execute()` with no args. The new stages need version and role info. Rather than refactoring existing modules, the new modules export `execute({ version, role })`. The pipeline in `index.js` passes the context object only to stages that need it. This is backward-compatible — existing stages continue with `execute()`.

### 5. GPG key download via `https` module, not `curl`

The GPG signing key at `https://pkgs.k8s.io/core:/stable:/v<major>.<minor>/deb/Release.key` is downloaded using the built-in `https` module and piped through `execSync('gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg')` to convert from ASCII-armored to binary format. This avoids depending on `curl` or `wget` being installed on the target.

**Alternative considered**: Shelling out to `curl | gpg --dearmor`. Rejected because curl may not be installed on minimal Debian installs. The `https` module is always available.

### 6. Flannel CIDR output as guidance, not automatic kubeadm config

For master nodes, the tool prints the required `kubeadm init` command including `--pod-network-cidr=10.244.0.0/16`. It does NOT automatically run `kubeadm init` — that is the operator's explicit next step. Optionally, a `kubeadm-init.yaml` config snippet can be written to `/etc/kubernetes/kubeadm-init-config.yaml` for reference.

**Alternative considered**: Automatically running `kubeadm init`. Rejected — cluster initialization is a distinct lifecycle step with many operator-specific parameters (API server advertise address, etc.).

## Risks / Trade-offs

- **[Risk]** GitHub API rate limit (60 req/hr unauthenticated) could block version resolution → **Mitigation**: Cache is not needed for a one-shot provisioning tool. If rate-limited, print a clear error with instructions to wait or pass `--k8s-version` flag manually (future enhancement).
- **[Risk]** `pkgs.k8s.io` GPG key URL structure changes → **Mitigation**: The URL pattern `https://pkgs.k8s.io/core:/stable:/v<M>.<m>/deb/Release.key` has been stable since the repo migration. If it changes, the error from `https` fetch is passed through clearly.
- **[Risk]** Exact-version `apt-get install` fails if the version string doesn't match the repo format → **Mitigation**: The GitHub tag format `v1.32.4` is converted to apt format `1.32.4-*` for installation, matching the package naming convention in `pkgs.k8s.io`.
- **[Risk]** Network unavailable during provisioning → **Mitigation**: All network-dependent stages (version resolve, repo setup, binary install) fail with clear error messages. The prior OS tuning stages (swap, kernel, sysctl, containerd) do not require network and will have already completed successfully.
