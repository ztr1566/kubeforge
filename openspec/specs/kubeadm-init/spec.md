# Kubeadm Init

## Purpose
TBD

## Requirements

### Requirement: Execute kubeadm init with config file
The system SHALL execute `kubeadm init --config /etc/kubernetes/kubeadm-init-config.yaml` using `child_process.execSync` when the node role is `master`. The command output MUST be visible to the operator in real-time using `stdio: 'inherit'`.

#### Scenario: kubeadm init succeeds
- **WHEN** role is `master` and the kubeadm init config file exists at `/etc/kubernetes/kubeadm-init-config.yaml`
- **THEN** `kubeadm init --config /etc/kubernetes/kubeadm-init-config.yaml` completes without error and the control plane components are initialized

#### Scenario: kubeadm init fails
- **WHEN** `kubeadm init` returns a non-zero exit code
- **THEN** the system throws an error with a descriptive message including the exit code and the bootstrap pipeline aborts

#### Scenario: Config file does not exist
- **WHEN** `/etc/kubernetes/kubeadm-init-config.yaml` does not exist
- **THEN** `kubeadm init` fails and the error is propagated with a clear message

### Requirement: Skip bootstrap for worker nodes
The system SHALL NOT execute `kubeadm init` or any bootstrap phases when the node role is `worker`. Worker nodes SHALL continue to receive join guidance only.

#### Scenario: Role is worker
- **WHEN** the bootstrap module is called with `role: 'worker'`
- **THEN** the module returns immediately without executing any commands
