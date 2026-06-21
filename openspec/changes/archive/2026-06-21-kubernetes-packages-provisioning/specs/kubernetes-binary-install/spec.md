## ADDED Requirements

### Requirement: Update apt package index
The system SHALL execute `apt-get update` with `DEBIAN_FRONTEND=noninteractive` before installing Kubernetes packages to ensure the newly configured `pkgs.k8s.io` repository is indexed.

#### Scenario: apt-get update succeeds
- **WHEN** `apt-get update` completes without error
- **THEN** the package index includes entries from the Kubernetes repository

#### Scenario: apt-get update fails
- **WHEN** `apt-get update` returns a non-zero exit code
- **THEN** the system throws an error with the command's stderr output

### Requirement: Install exact-version kubelet, kubeadm, and kubectl
The system SHALL install `kubelet`, `kubeadm`, and `kubectl` at the exact version selected by the user using `apt-get install -y kubelet=<version>-* kubeadm=<version>-* kubectl=<version>-*` where `<version>` is the semver string without the `v` prefix (e.g., `1.32.4`). The `DEBIAN_FRONTEND` environment variable MUST be set to `noninteractive`.

#### Scenario: Packages install successfully
- **WHEN** the user selected `v1.32.4` and the packages exist in the configured repo
- **THEN** `kubelet`, `kubeadm`, and `kubectl` version `1.32.4-*` are installed

#### Scenario: Version not found in repository
- **WHEN** the specified version does not exist in the `pkgs.k8s.io` repository
- **THEN** `apt-get install` fails and the system throws an error with the apt stderr output

#### Scenario: Packages already installed at the correct version
- **WHEN** `kubelet`, `kubeadm`, and `kubectl` are already installed at the selected version
- **THEN** `apt-get install -y` succeeds as a no-op

### Requirement: Hold Kubernetes packages
The system SHALL execute `apt-mark hold kubelet kubeadm kubectl` immediately after successful installation to prevent automatic upgrades during system updates.

#### Scenario: Hold applied successfully
- **WHEN** `apt-mark hold kubelet kubeadm kubectl` completes without error
- **THEN** the three packages are marked as held

#### Scenario: apt-mark hold fails
- **WHEN** `apt-mark hold` returns a non-zero exit code
- **THEN** the system throws an error with the command's stderr output

#### Scenario: Packages already held
- **WHEN** the packages are already held from a previous run
- **THEN** `apt-mark hold` succeeds as a no-op

### Requirement: Enable and start kubelet service
The system SHALL execute `systemctl enable kubelet` and `systemctl start kubelet` after package installation to ensure the kubelet service is active and configured to start on boot.

#### Scenario: Service enabled and started
- **WHEN** both systemctl commands complete without error
- **THEN** kubelet is running and enabled for automatic start

#### Scenario: systemctl command fails
- **WHEN** either `systemctl enable kubelet` or `systemctl start kubelet` returns a non-zero exit code
- **THEN** the system throws an error with the command's stderr output

### Requirement: Idempotent binary installation
The binary installation operation SHALL be safe to run multiple times without side effects.

#### Scenario: Re-run after successful provisioning
- **WHEN** binaries are already installed, held, and kubelet is running
- **THEN** all commands succeed as no-ops and the operation completes without error
