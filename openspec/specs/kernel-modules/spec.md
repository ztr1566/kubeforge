# Kernel Modules

## Purpose
Defines the behavior of the kernel module provisioning stage, which writes a modules-load configuration for `overlay` and `br_netfilter` and loads them into the running kernel. Required so that containerd and Kubernetes networking (bridge netfilter) can operate.

## Requirements

### Requirement: Write kernel module configuration file
The system SHALL write a configuration file at `/etc/modules-load.d/k8s.conf` containing the module names `overlay` and `br_netfilter`, one per line. If the file already exists, it SHALL be overwritten.

#### Scenario: File does not exist
- **WHEN** `/etc/modules-load.d/k8s.conf` does not exist
- **THEN** the file is created with contents `overlay\nbr_netfilter\n`

#### Scenario: File already exists with correct content
- **WHEN** `/etc/modules-load.d/k8s.conf` already contains `overlay` and `br_netfilter`
- **THEN** the file is overwritten with the same content (idempotent)

### Requirement: Load kernel modules immediately
The system SHALL execute `modprobe overlay` and `modprobe br_netfilter` to load both modules into the running kernel immediately.

#### Scenario: Modules not yet loaded
- **WHEN** `overlay` and `br_netfilter` are not in the running kernel
- **THEN** both `modprobe` commands execute successfully and the modules become available

#### Scenario: Modules already loaded
- **WHEN** both modules are already loaded in the kernel
- **THEN** `modprobe` commands succeed as no-ops

#### Scenario: modprobe fails
- **WHEN** `modprobe overlay` or `modprobe br_netfilter` returns a non-zero exit code
- **THEN** the system throws an error with the failing module name and stderr output

### Requirement: Idempotent kernel module provisioning
The kernel module provisioning operation SHALL be safe to run multiple times without side effects.

#### Scenario: Re-run after successful provisioning
- **WHEN** kernel modules were already provisioned by a previous k8s-ready run
- **THEN** the config file is overwritten identically and modprobe commands succeed as no-ops
