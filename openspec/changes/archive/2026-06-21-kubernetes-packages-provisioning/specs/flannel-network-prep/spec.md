## ADDED Requirements

### Requirement: Output Flannel-compatible kubeadm init guidance for master nodes
The system SHALL, when the selected node role is `master`, print a guidance message to stdout containing the recommended `kubeadm init` command with the `--pod-network-cidr=10.244.0.0/16` flag. This ensures strict compatibility with the Flannel CNI plugin's default CIDR.

#### Scenario: Role is master
- **WHEN** the node role is `master` and all provisioning stages have completed
- **THEN** the system prints a message including: `kubeadm init --pod-network-cidr=10.244.0.0/16`

#### Scenario: Role is worker
- **WHEN** the node role is `worker`
- **THEN** the system does NOT print the kubeadm init guidance and instead prints guidance about using `kubeadm join`

### Requirement: Write kubeadm init config snippet for master nodes
The system SHALL, when the selected node role is `master`, write a kubeadm init configuration YAML file to `/etc/kubernetes/kubeadm-init-config.yaml` containing the `podSubnet: "10.244.0.0/16"` setting under `networking`. The directory `/etc/kubernetes/` SHALL be created if it does not exist.

#### Scenario: Config snippet written for master
- **WHEN** the node role is `master`
- **THEN** a YAML file is written to `/etc/kubernetes/kubeadm-init-config.yaml` containing `podSubnet: "10.244.0.0/16"` under the `networking` key

#### Scenario: /etc/kubernetes/ does not exist
- **WHEN** the `/etc/kubernetes/` directory does not exist
- **THEN** the directory is created with `fs.mkdirSync` using `{ recursive: true }` before writing the config

#### Scenario: Config file already exists
- **WHEN** `/etc/kubernetes/kubeadm-init-config.yaml` already exists from a previous run
- **THEN** the file is overwritten with the current configuration

### Requirement: Use Flannel default CIDR exclusively
The pod network CIDR MUST be `10.244.0.0/16`. The system SHALL NOT allow customization of this value in the current implementation.

#### Scenario: CIDR value in output
- **WHEN** the guidance message or config snippet is generated
- **THEN** the CIDR value is exactly `10.244.0.0/16`

### Requirement: Idempotent network preparation
The network preparation operation SHALL be safe to run multiple times without side effects.

#### Scenario: Re-run on a master node
- **WHEN** network preparation runs again on a master node already provisioned by k8s-ready
- **THEN** the config file is overwritten identically and the guidance message is re-printed
