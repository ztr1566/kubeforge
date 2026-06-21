## ADDED Requirements

### Requirement: Root privilege guard
The `prepare` command SHALL validate that `process.getuid() === 0` before executing any logic. If not running as root, the process MUST print an error and exit with code 1.

#### Scenario: Running as root
- **WHEN** the user runs `k8s-ready prepare` as root (UID 0)
- **THEN** the command proceeds to the role selection wizard

#### Scenario: Running as non-root
- **WHEN** the user runs `k8s-ready prepare` without root privileges
- **THEN** the command prints "Error: k8s-ready must be run as root. Use: sudo k8s-ready prepare" and exits with code 1

### Requirement: Interactive role selection
The `prepare` command SHALL present an interactive CLI prompt asking the user to select a node profile: "Master Node" or "Worker Node". The selection MUST use a terminal select widget (not free-text input).

#### Scenario: User selects Master Node
- **WHEN** the interactive prompt is shown and the user selects "Master Node"
- **THEN** the system uses master-profile thresholds for compatibility validation

#### Scenario: User selects Worker Node
- **WHEN** the interactive prompt is shown and the user selects "Worker Node"
- **THEN** the system uses worker-profile thresholds for compatibility validation

#### Scenario: User cancels the prompt
- **WHEN** the user presses Ctrl+C during the interactive prompt
- **THEN** the process exits cleanly with code 0 and no error message

### Requirement: Hardware detection via Node.js os module
The system SHALL detect CPU core count using `os.cpus().length`, total RAM in GB using `os.totalmem()`, and swap status by reading `/proc/swaps`.

#### Scenario: Standard machine with swap enabled
- **WHEN** the machine has 4 CPU cores, 8 GB RAM, and an active swap partition
- **THEN** hardware detection returns `{ cpus: 4, ramGB: 8, swapEnabled: true }`

#### Scenario: Machine with swap disabled
- **WHEN** `/proc/swaps` contains only the header line (no swap devices listed)
- **THEN** hardware detection returns `swapEnabled: false`

#### Scenario: /proc/swaps does not exist
- **WHEN** `/proc/swaps` is not readable (non-Linux system)
- **THEN** the system prints a warning "Warning: Cannot read /proc/swaps — assuming swap is enabled" and treats swap as enabled

### Requirement: Compatibility matrix evaluation
The system SHALL evaluate hardware specs against role-specific minimum thresholds. Master profile: minimum 2 vCPUs, 2 GB RAM, swap MUST be disabled. Worker profile: minimum 1 vCPU, 1 GB RAM, swap MUST be disabled.

#### Scenario: Master node meets all requirements
- **WHEN** role is "master" and the machine has 2 CPUs, 4 GB RAM, and swap disabled
- **THEN** all three checks (CPU, RAM, Swap) pass

#### Scenario: Master node fails CPU check
- **WHEN** role is "master" and the machine has 1 CPU
- **THEN** the CPU check fails, RAM and Swap checks evaluate independently

#### Scenario: Worker node with swap enabled
- **WHEN** role is "worker" and swap is enabled
- **THEN** the Swap check fails regardless of CPU and RAM values

### Requirement: Visual status report
The system SHALL display a formatted terminal table showing each check (CPU Cores, RAM, Swap) with columns for "Check", "Current", "Required", and "Status" (green ✔ or red ✘ using ANSI colors).

#### Scenario: All checks pass
- **WHEN** all compatibility checks pass
- **THEN** the report shows green ✔ for each row and a summary line: "✔ System is compatible for <role> node"

#### Scenario: Mixed pass/fail
- **WHEN** CPU passes but Swap fails
- **THEN** the report shows green ✔ for CPU, red ✘ for Swap, and a summary line: "✘ System does NOT meet requirements for <role> node"

### Requirement: Execution blocking with --force bypass
The system SHALL block further execution and exit with code 1 if any compatibility check fails, UNLESS the `--force` flag is present in `process.argv`.

#### Scenario: Validation fails without --force
- **WHEN** one or more checks fail and `--force` is not in argv
- **THEN** the system prints the report, prints "Aborting. Use --force to override.", and exits with code 1

#### Scenario: Validation fails with --force
- **WHEN** one or more checks fail and `--force` is in argv
- **THEN** the system prints the report, prints a warning "⚠ Proceeding despite failed checks (--force)", and continues execution

#### Scenario: All checks pass
- **WHEN** all checks pass regardless of --force flag
- **THEN** the system prints the report and continues execution
