## MODIFIED Requirements

### Requirement: Execution blocking with --force bypass
The system SHALL block further execution and exit with code 1 if any compatibility check fails, UNLESS the `--force` flag is present in `process.argv`. When execution continues (all checks pass or `--force` is used), the system SHALL proceed to execute the provisioning pipeline in the following order: swap management, kernel modules, sysctl networking, containerd CRI, Kubernetes repo setup, Kubernetes binary install, Flannel network preparation, and cluster bootstrap (master only). The version selection prompt SHALL appear after role selection and before hardware validation. Each stage MUST print its name before executing. If any stage fails, the pipeline MUST abort with an error message identifying the failed stage.

#### Scenario: Validation fails without --force
- **WHEN** one or more checks fail and `--force` is not in argv
- **THEN** the system prints the report, prints "Aborting. Use --force to override.", and exits with code 1

#### Scenario: Validation fails with --force
- **WHEN** one or more checks fail and `--force` is in argv
- **THEN** the system prints the report, prints a warning "⚠ Proceeding despite failed checks (--force)", and continues to the provisioning pipeline

#### Scenario: All checks pass
- **WHEN** all checks pass regardless of --force flag
- **THEN** the system prints the report and continues to the provisioning pipeline

#### Scenario: Master node completes full bootstrap
- **WHEN** all provisioning stages and the bootstrap module complete without error and role is master
- **THEN** the system prints "✔ Cluster bootstrapped successfully. Node is officially READY." and exits with code 0

#### Scenario: Worker node completes provisioning without bootstrap
- **WHEN** all provisioning stages complete without error and role is worker
- **THEN** the bootstrap stage is skipped (or returns immediately), worker join guidance is printed, and the system prints "✔ Node provisioning complete. Ready for kubeadm join." and exits with code 0

#### Scenario: Bootstrap stage fails on master
- **WHEN** the bootstrap module throws an error during kubeadm init, kubeconfig handover, CNI deployment, or readiness polling
- **THEN** the system prints "Error in Cluster Bootstrap: <error-message>" and exits with code 1

#### Scenario: Provisioning pipeline includes bootstrap as final stage
- **WHEN** the pipeline is constructed for a master role
- **THEN** the "Cluster Bootstrap" stage appears as the last entry after "Flannel Network Prep"
