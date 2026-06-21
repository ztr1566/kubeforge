## 1. Kubernetes Version Resolver

- [x] 1.1 Create `src/version.js` with a `fetchReleases()` function that makes an HTTPS GET request to `https://api.github.com/repos/kubernetes/kubernetes/releases?per_page=100` using the built-in `https` module, returning parsed JSON; throw on non-200 status or network error
- [x] 1.2 Implement `filterStableReleases(releases)` that excludes entries with `prerelease: true`, `draft: true`, or `tag_name` containing `-alpha`, `-beta`, or `-rc` suffixes
- [x] 1.3 Implement `resolveLatestVersions(stableReleases)` that groups by major.minor, picks the latest patch for each, sorts descending, and returns the top 3 version strings
- [x] 1.4 Export a `fetchVersionChoices()` async function that chains fetch → filter → resolve and returns the array of version strings
- [x] 1.5 Add a `selectVersion(versions)` function that presents a numbered interactive prompt using `readline` and returns the selected version string; handle Ctrl+C as clean exit

## 2. Package Repository Provisioning

- [x] 2.1 Create `src/repo.js` with an `execute({ version })` function
- [x] 2.2 Implement `ensureKeyringsDir()` that calls `fs.mkdirSync('/etc/apt/keyrings', { recursive: true })`
- [x] 2.3 Implement `downloadGpgKey(majorMinor)` that fetches the ASCII-armored key from `https://pkgs.k8s.io/core:/stable:/v<M>.<m>/deb/Release.key` via the built-in `https` module, then pipes it through `gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg` via `execSync` with stdin input; throw on fetch or gpg failure
- [x] 2.4 Implement `writeSourcesList(majorMinor)` that writes the apt source definition `deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v<M>.<m>/deb/ /` to `/etc/apt/sources.list.d/kubernetes.list`
- [x] 2.5 Extract `major.minor` from the full version string (e.g., `v1.32.4` → `1.32`) and wire `ensureKeyringsDir` → `downloadGpgKey` → `writeSourcesList` inside `execute()`

## 3. Kubernetes Binary Installation

- [x] 3.1 Create `src/kube-install.js` with an `execute({ version })` function
- [x] 3.2 Strip the `v` prefix from version string (e.g., `v1.32.4` → `1.32.4`) and construct the apt install command: `apt-get install -y kubelet=<ver>-* kubeadm=<ver>-* kubectl=<ver>-*`
- [x] 3.3 Run `apt-get update` with `DEBIAN_FRONTEND=noninteractive`; throw on failure
- [x] 3.4 Run the constructed install command with `DEBIAN_FRONTEND=noninteractive`; throw on failure
- [x] 3.5 Run `apt-mark hold kubelet kubeadm kubectl` via `execSync`; throw on failure
- [x] 3.6 Run `systemctl enable kubelet` and `systemctl start kubelet`; throw on failure

## 4. Flannel Network Preparation

- [x] 4.1 Create `src/network.js` with an `execute({ version, role })` function
- [x] 4.2 If role is `master`: create `/etc/kubernetes/` directory if missing, write a kubeadm init config YAML to `/etc/kubernetes/kubeadm-init-config.yaml` with `podSubnet: "10.244.0.0/16"` under `networking`
- [x] 4.3 If role is `master`: print guidance message with the recommended `kubeadm init --pod-network-cidr=10.244.0.0/16` command
- [x] 4.4 If role is `worker`: print guidance message about using `kubeadm join` with the token from the master node
- [x] 4.5 Ensure idempotency: re-running overwrites config file and re-prints guidance without error

## 5. Pipeline Integration

- [x] 5.1 In `src/index.js`, require the new modules: `version`, `repo`, `kube-install`, `network`
- [x] 5.2 After role selection and before hardware validation, call `fetchVersionChoices()` to resolve versions, then call `selectVersion()` to get the user's choice; store as `selectedVersion`
- [x] 5.3 Add three new stages to the pipeline array after `Containerd CRI`: `{ name: 'Kubernetes Repository', execute: () => repoModule.execute({ version: selectedVersion }) }`, `{ name: 'Kubernetes Binaries', execute: () => kubeInstallModule.execute({ version: selectedVersion }) }`, `{ name: 'Flannel Network Prep', execute: () => networkModule.execute({ version: selectedVersion, role }) }`
- [x] 5.4 Update the final success message to include role-specific post-provisioning guidance
