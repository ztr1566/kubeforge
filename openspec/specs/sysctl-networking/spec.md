# Sysctl Networking

## Purpose
Defines the behavior of the sysctl networking provisioning stage, which writes the canonical Kubernetes networking sysctl parameters to `/etc/sysctl.d/k8s.conf` and applies them with `sysctl --system`. Required so that bridged traffic is seen by iptables and IP forwarding is enabled for pods.

## Requirements

### Requirement: Write sysctl configuration file
The system SHALL write a configuration file at `/etc/sysctl.d/k8s.conf` containing the following parameters:
```
net.bridge.bridge-nf-call-iptables  = 1
net.bridge.bridge-nf-call-ip6tables = 1
net.ipv4.ip_forward                 = 1
```
If the file already exists, it SHALL be overwritten.

#### Scenario: File does not exist
- **WHEN** `/etc/sysctl.d/k8s.conf` does not exist
- **THEN** the file is created with all three sysctl parameters

#### Scenario: File already exists
- **WHEN** `/etc/sysctl.d/k8s.conf` already exists with the same or different content
- **THEN** the file is overwritten with the canonical parameter set

### Requirement: Apply sysctl parameters immediately
The system SHALL execute `sysctl --system` to apply all sysctl configuration files, including the newly written `/etc/sysctl.d/k8s.conf`, to the running kernel.

#### Scenario: Parameters applied successfully
- **WHEN** `sysctl --system` executes without error
- **THEN** `net.bridge.bridge-nf-call-iptables`, `net.bridge.bridge-nf-call-ip6tables`, and `net.ipv4.ip_forward` are active in the running kernel

#### Scenario: sysctl --system fails
- **WHEN** `sysctl --system` returns a non-zero exit code
- **THEN** the system throws an error with the command's stderr output

### Requirement: Kernel modules must be loaded before sysctl
The sysctl networking stage SHALL only execute after the kernel modules stage has completed successfully, because `br_netfilter` must be loaded for the bridge-nf sysctl parameters to exist.

#### Scenario: br_netfilter not loaded
- **WHEN** the sysctl stage runs but `br_netfilter` was not loaded by the kernel modules stage
- **THEN** `sysctl --system` would fail on bridge-nf parameters — this is prevented by the sequential pipeline ordering

### Requirement: Idempotent sysctl configuration
The sysctl configuration operation SHALL be safe to run multiple times without side effects.

#### Scenario: Re-run after successful provisioning
- **WHEN** sysctl configuration was already applied by a previous k8s-ready run
- **THEN** the config file is overwritten identically and `sysctl --system` reapplies the same values
