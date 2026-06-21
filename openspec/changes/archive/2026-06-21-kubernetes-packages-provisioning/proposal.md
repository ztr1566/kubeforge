## Why

The provisioning pipeline currently stops after configuring the host OS and installing containerd. The node still cannot join a kubeadm cluster because no Kubernetes packages (kubelet, kubeadm, kubectl) are installed, no package repository is configured, and the tool does not know which Kubernetes version the operator intends to run. Additionally, master nodes require explicit `--pod-network-cidr=10.244.0.0/16` alignment for Flannel CNI compatibility, which must be communicated to the operator before they run `kubeadm init`.

## What Changes

- Add a GitHub API version resolver (`src/version.js`) that fetches the latest 3 stable Kubernetes minor/patch releases and presents them in the interactive prompt wizard for the user to select.
- Add a package repository provisioning module (`src/repo.js`) that configures the modern `pkgs.k8s.io` apt repository with proper GPG keyring management — **not** the deprecated `apt.kubernetes.io`.
- Add a Kubernetes binary installation module (`src/kube-install.js`) that installs the exact versions of `kubelet`, `kubeadm`, and `kubectl` matching the user's selection, then holds them with `apt-mark hold`.
- Add a Flannel networking preparation module (`src/network.js`) that, for master nodes, outputs the required `--pod-network-cidr=10.244.0.0/16` flag and optionally writes a kubeadm init config snippet.
- Extend the interactive prompt wizard in `src/index.js` to include version selection after role selection.
- Wire all new modules into the provisioning pipeline after the existing containerd stage.

## Capabilities

### New Capabilities
- `kubernetes-version-resolver`: Fetch latest stable Kubernetes releases from GitHub API and present a version selection prompt to the user.
- `kubernetes-repo-setup`: Configure the modern `pkgs.k8s.io` apt repository with GPG keyring at `/etc/apt/keyrings/kubernetes-apt-keyring.gpg` and sources list at `/etc/apt/sources.list.d/kubernetes.list`.
- `kubernetes-binary-install`: Install exact-version `kubelet`, `kubeadm`, `kubectl` packages and lock them with `apt-mark hold`.
- `flannel-network-prep`: For master nodes, output/prepare the `--pod-network-cidr=10.244.0.0/16` configuration required for Flannel CNI compatibility.

### Modified Capabilities
- `prepare-command`: Extends the provisioning pipeline to include version selection in the wizard and four new stages after containerd CRI.

## Impact

- **Files added**: `src/version.js`, `src/repo.js`, `src/kube-install.js`, `src/network.js`
- **Files modified**: `src/index.js` (version selection prompt + new pipeline stages)
- **System files touched at runtime**: `/etc/apt/keyrings/kubernetes-apt-keyring.gpg`, `/etc/apt/sources.list.d/kubernetes.list`
- **System commands invoked**: HTTPS fetch to `https://api.github.com`, `apt-get update`, `apt-get install`, `apt-mark hold`, `systemctl`
- **Network access**: GitHub API (unauthenticated, rate-limited to 60 req/hr) for version resolution
- **Dependencies**: Node.js built-in `https` module for GitHub API calls. No new npm dependencies.
