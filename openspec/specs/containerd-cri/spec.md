# Containerd CRI

## Purpose
Defines the behavior of the containerd CRI provisioning stage, which installs the `containerd` package, generates and patches the default config to enable `SystemdCgroup`, writes it to `/etc/containerd/config.toml`, and restarts and enables the service. Provides the container runtime required by kubeadm.

## Requirements

### Requirement: Install containerd package
The system SHALL install the `containerd` package using `apt-get update` followed by `apt-get install -y containerd`. The `DEBIAN_FRONTEND` environment variable MUST be set to `noninteractive` to prevent any interactive prompts.

#### Scenario: containerd not installed
- **WHEN** the `containerd` package is not present on the system
- **THEN** `apt-get update` runs, then `apt-get install -y containerd` installs the package

#### Scenario: containerd already installed
- **WHEN** the `containerd` package is already installed
- **THEN** `apt-get install -y containerd` succeeds as a no-op (package already present)

#### Scenario: apt-get update fails
- **WHEN** `apt-get update` returns a non-zero exit code
- **THEN** the system throws an error with the command's stderr output and aborts

#### Scenario: apt-get install fails
- **WHEN** `apt-get install -y containerd` returns a non-zero exit code
- **THEN** the system throws an error with the command's stderr output and aborts

### Requirement: Generate and patch containerd configuration
The system SHALL generate the default containerd configuration by executing `containerd config default`, then patch the output to set `SystemdCgroup = true` in the `[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]` section.

#### Scenario: Default config contains SystemdCgroup = false
- **WHEN** `containerd config default` produces output containing `SystemdCgroup = false`
- **THEN** the output is patched to replace `SystemdCgroup = false` with `SystemdCgroup = true`

#### Scenario: SystemdCgroup line not found in default config
- **WHEN** `containerd config default` output does not contain `SystemdCgroup = false`
- **THEN** the system throws an error indicating the expected configuration line was not found and the containerd version may be incompatible

#### Scenario: containerd config default command fails
- **WHEN** `containerd config default` returns a non-zero exit code
- **THEN** the system throws an error with the command's stderr output

### Requirement: Write containerd configuration to disk
The system SHALL write the patched containerd configuration to `/etc/containerd/config.toml`. If the directory `/etc/containerd/` does not exist, it SHALL be created. If `config.toml` already exists, a timestamped backup SHALL be created at `/etc/containerd/config.toml.bak.<ISO-timestamp>` before writing.

#### Scenario: /etc/containerd/ exists with existing config
- **WHEN** `/etc/containerd/config.toml` already exists
- **THEN** a backup is created and the file is overwritten with the patched config

#### Scenario: /etc/containerd/ does not exist
- **WHEN** the `/etc/containerd/` directory does not exist
- **THEN** the directory is created and the patched config is written to `config.toml`

### Requirement: Restart and enable containerd service
The system SHALL execute `systemctl restart containerd` followed by `systemctl enable containerd` to activate the container runtime with the new configuration and ensure it starts on boot.

#### Scenario: Service restarts successfully
- **WHEN** `systemctl restart containerd` completes without error
- **THEN** containerd is running with the patched configuration

#### Scenario: Service restart fails
- **WHEN** `systemctl restart containerd` returns a non-zero exit code
- **THEN** the system throws an error with the command's stderr output

#### Scenario: Service enable succeeds
- **WHEN** `systemctl enable containerd` completes without error
- **THEN** containerd is configured to start automatically on boot

### Requirement: Idempotent containerd provisioning
The containerd provisioning operation SHALL be safe to run multiple times. Re-running MUST NOT break an already-configured containerd installation.

#### Scenario: Re-run after successful provisioning
- **WHEN** containerd is already installed and configured with SystemdCgroup = true
- **THEN** apt-get install is a no-op, config is regenerated and patched identically, and the service is restarted cleanly
