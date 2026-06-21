## Why

The `prepare` command currently validates hardware compatibility but stops at a "Pre-flight passed" message. After a successful pre-flight, the node still cannot join a kubeadm cluster because swap is still active, required kernel modules are not loaded, network bridging sysctls are not set, and no container runtime is installed. This change implements the actual provisioning pipeline that transforms a bare Debian/Ubuntu host into a kubeadm-ready node.

## What Changes

- Add a swap management module that safely disables swap at runtime and persists the change across reboots by backing up and editing `/etc/fstab`.
- Add a kernel module provisioning module that writes `overlay` and `br_netfilter` to `/etc/modules-load.d/k8s.conf` and loads them immediately via `modprobe`.
- Add a sysctl configuration module that writes Kubernetes networking parameters to `/etc/sysctl.d/k8s.conf` and applies them with `sysctl --system`.
- Add a containerd CRI provisioning module that installs the `containerd` package, generates its default config, patches `SystemdCgroup = true`, writes the result to `/etc/containerd/config.toml`, and restarts/enables the service.
- Wire all new modules into the `prepare` command's execution pipeline after pre-flight validation passes.
- Every file modification creates a timestamped backup before writing and rolls back on failure.

## Capabilities

### New Capabilities
- `swap-management`: Idempotent swap disable with fstab backup, comment-out logic, and rollback on failure.
- `kernel-modules`: Provisioning of `overlay` and `br_netfilter` via `/etc/modules-load.d/` with immediate `modprobe` loading.
- `sysctl-networking`: Write and apply `net.bridge.bridge-nf-call-iptables`, `net.bridge.bridge-nf-call-ip6tables`, and `net.ipv4.ip_forward` parameters.
- `containerd-cri`: Install containerd, generate/patch config for SystemdCgroup, write config, and manage systemd service lifecycle.

### Modified Capabilities
- `prepare-command`: Extends the post-preflight path to call the four new provisioning stages sequentially instead of printing a placeholder message.

## Impact

- **Files added**: `src/swap.js`, `src/kernel.js`, `src/sysctl.js`, `src/containerd.js`
- **Files modified**: `src/index.js` (wire provisioning pipeline after pre-flight)
- **System files touched at runtime**: `/etc/fstab`, `/etc/modules-load.d/k8s.conf`, `/etc/sysctl.d/k8s.conf`, `/etc/containerd/config.toml`
- **System commands invoked**: `swapoff -a`, `modprobe`, `sysctl --system`, `apt-get`, `containerd config default`, `systemctl`
- **Dependencies**: No new npm dependencies. All system interaction via `child_process.execSync` and `fs`.
