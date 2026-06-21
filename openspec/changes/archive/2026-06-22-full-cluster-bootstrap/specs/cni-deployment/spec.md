## ADDED Requirements

### Requirement: Deploy Flannel CNI manifest via kubectl
The system SHALL execute `kubectl apply -f https://raw.githubusercontent.com/flannel-io/flannel/master/Documentation/kube-flannel.yml` with the `KUBECONFIG` environment variable set to the path of the user's kubeconfig file (`<home>/.kube/config`).

#### Scenario: Flannel manifest applied successfully
- **WHEN** `kubectl apply` completes without error
- **THEN** the Flannel DaemonSet and associated resources are created in the cluster

#### Scenario: kubectl apply fails
- **WHEN** `kubectl apply` returns a non-zero exit code
- **THEN** the system throws an error with the command's stderr output including the manifest URL

#### Scenario: Manifest URL is unreachable
- **WHEN** the raw.githubusercontent.com URL is not reachable
- **THEN** `kubectl apply` fails and the error is propagated with a message indicating the Flannel manifest could not be downloaded

### Requirement: Set KUBECONFIG environment variable for all kubectl commands
All `kubectl` invocations in the bootstrap module SHALL include the `KUBECONFIG` environment variable pointing to the copied kubeconfig file path. The command MUST NOT rely on kubectl's default config discovery.

#### Scenario: KUBECONFIG is set correctly
- **WHEN** a kubectl command is executed
- **THEN** the `KUBECONFIG` environment variable in the `execSync` options points to `<home>/.kube/config`
