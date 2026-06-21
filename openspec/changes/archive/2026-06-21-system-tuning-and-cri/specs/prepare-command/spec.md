## MODIFIED Requirements

### Requirement: Execution blocking with --force bypass
The system SHALL block further execution and exit with code 1 if any compatibility check fails, UNLESS the `--force` flag is present in `process.argv`. When execution continues (all checks pass or `--force` is used), the system SHALL proceed to execute the provisioning pipeline in the following order: swap management, kernel modules, sysctl networking, containerd CRI. Each stage MUST print its name before executing. If any stage fails, the pipeline MUST abort with an error message identifying the failed stage.

#### Scenario: Validation fails without --force
- **WHEN** one or more checks fail and `--force` is not in argv
- **THEN** the system prints the report, prints "Aborting. Use --force to override.", and exits with code 1

#### Scenario: Validation fails with --force
- **WHEN** one or more checks fail and `--force` is in argv
- **THEN** the system prints the report, prints a warning "⚠ Proceeding despite failed checks (--force)", and continues to the provisioning pipeline

#### Scenario: All checks pass
- **WHEN** all checks pass regardless of --force flag
- **THEN** the system prints the report and continues to the provisioning pipeline

#### Scenario: Provisioning pipeline executes in order
- **WHEN** execution continues past pre-flight validation
- **THEN** the system runs swap management, kernel modules, sysctl networking, and containerd CRI in strict sequential order

#### Scenario: Provisioning stage fails
- **WHEN** any provisioning stage throws an error
- **THEN** the system prints "Error in <stage-name>: <error-message>" and exits with code 1

#### Scenario: All provisioning stages succeed
- **WHEN** all four provisioning stages complete without error
- **THEN** the system prints "✔ Node provisioning complete. Ready for kubeadm." and exits with code 0
