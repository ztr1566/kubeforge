## 1. Swap Management Module

- [x] 1.1 Create `src/swap.js` with a `execute()` function that runs `swapoff -a` via `execSync`, catching and re-throwing on failure
- [x] 1.2 Implement fstab backup: read `/etc/fstab`, copy to `/etc/fstab.bak.<ISO-timestamp>` using `fs.copyFileSync`, throw if fstab does not exist
- [x] 1.3 Implement fstab swap-line commenting: parse each line, if column 3 is `swap` and line is not already commented, prepend `# [k8s-ready] `
- [x] 1.4 Write modified fstab back with `fs.writeFileSync`; on write failure, restore from backup and re-throw
- [x] 1.5 Verify idempotency: ensure re-running does not double-comment lines or error on already-disabled swap

## 2. Kernel Modules Module

- [x] 2.1 Create `src/kernel.js` with a `execute()` function that writes `overlay\nbr_netfilter\n` to `/etc/modules-load.d/k8s.conf` via `fs.writeFileSync`
- [x] 2.2 Execute `modprobe overlay` and `modprobe br_netfilter` via `execSync`; throw with module name and stderr on failure
- [x] 2.3 Verify idempotency: ensure re-running overwrites config identically and modprobe succeeds as no-op

## 3. Sysctl Networking Module

- [x] 3.1 Create `src/sysctl.js` with a `execute()` function that writes the three sysctl parameters to `/etc/sysctl.d/k8s.conf` via `fs.writeFileSync`
- [x] 3.2 Execute `sysctl --system` via `execSync`; throw with stderr on failure
- [x] 3.3 Verify idempotency: ensure re-running overwrites config identically and sysctl applies without error

## 4. Containerd CRI Module

- [x] 4.1 Create `src/containerd.js` with a `execute()` function
- [x] 4.2 Implement package installation: run `apt-get update` then `apt-get install -y containerd` with `DEBIAN_FRONTEND=noninteractive` env; throw on failure
- [x] 4.3 Generate default config via `containerd config default`; throw if command fails
- [x] 4.4 Patch the output string: replace `SystemdCgroup = false` with `SystemdCgroup = true`; throw if the target string is not found in the output
- [x] 4.5 If `/etc/containerd/config.toml` exists, back it up to `/etc/containerd/config.toml.bak.<ISO-timestamp>`; create `/etc/containerd/` directory if missing
- [x] 4.6 Write patched config to `/etc/containerd/config.toml`
- [x] 4.7 Run `systemctl restart containerd` then `systemctl enable containerd`; throw on failure

## 5. Pipeline Integration

- [x] 5.1 In `src/index.js`, require all four new modules (`swap`, `kernel`, `sysctl`, `containerd`)
- [x] 5.2 Replace the placeholder message at the end of `runPrepare()` with sequential calls to each module's `execute()` function, printing the stage name before each call
- [x] 5.3 Wrap each stage call in try/catch: on error, print `Error in <stage-name>: <message>` and exit with code 1
- [x] 5.4 After all stages succeed, print `✔ Node provisioning complete. Ready for kubeadm.` and exit with code 0
