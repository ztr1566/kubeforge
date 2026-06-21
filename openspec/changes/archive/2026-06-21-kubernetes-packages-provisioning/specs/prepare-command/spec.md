## MODIFIED Requirements

### Requirement: Execution blocking with --force bypass
The system SHALL block further execution and exit with code 1 if any compatibility check fails, UNLESS the `--force` flag is present in `process.argv`. When execution continues (all checks pass or `--force` is used), the system SHALL proceed to execute the provisioning pipeline in the following order: swap management, kernel modules, sysctl networking, containerd CRI, Kubernetes repo setup, Kubernetes binary install, Flannel network preparation. The version selection prompt SHALL appear after role selection and before hardware validation. Each stage MUST print its name before executing. If any stage fails, the pipeline MUST abort with an error message identifying the failed stage.

#### Scenario: Validation fails without --force
- **WHEN** one or more checks fail and `--force` is not in argv
- **THEN** the system prints the report, prints "Aborting. Use --force to override.", and exits with code 1

#### Scenario: Validation fails with --force
- **WHEN** one or more checks fail and `--force` is in argv
- **THEN** the system prints the report, prints a warning "⚠ Proceeding despite failed checks (--force)", and continues to the provisioning pipeline

#### Scenario: All checks pass
- **WHEN** all checks pass regardless of --force flag
- **THEN** the system prints the report and continues to the provisioning pipeline

#### Scenario: Version selection prompt appears after role selection
- **WHEN** the user completes the role selection prompt
- **THEN** the system fetches Kubernetes versions from GitHub and presents a numbered version selection prompt before proceeding to hardware validation

#### Scenario: Provisioning pipeline executes in order
- **WHEN** execution continues past pre-flight validation
- **THEN** the system runs swap management, kernel modules, sysctl networking, containerd CRI, Kubernetes repo setup, Kubernetes binary install, and Flannel network preparation in strict sequential order

#### Scenario: Provisioning stage fails
- **WHEN** any provisioning stage throws an error
- **THEN** the system prints "Error in <stage-name>: <error-message>" and exits with code 1

#### Scenario: All provisioning stages succeed on master node
- **WHEN** all seven provisioning stages complete without error and role is master
- **THEN** the system prints Flannel network guidance followed by "✔ Node provisioning complete. Ready for kubeadm." and exits with code 0

#### Scenario: All provisioning stages succeed on worker node
- **WHEN** all seven provisioning stages complete without error and role is worker
- **THEN** the system prints kubeadm join guidance followed by "✔ Node provisioning complete. Ready for kubeadm." and exits with code 0
