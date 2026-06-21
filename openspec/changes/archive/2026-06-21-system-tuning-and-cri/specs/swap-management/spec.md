## ADDED Requirements

### Requirement: Disable swap at runtime
The system SHALL execute `swapoff -a` to immediately disable all swap devices on the host.

#### Scenario: Swap is active
- **WHEN** the system has active swap partitions
- **THEN** `swapoff -a` is executed and all swap is disabled for the current session

#### Scenario: Swap is already disabled
- **WHEN** no swap devices are currently active
- **THEN** `swapoff -a` is executed (no-op) and the operation succeeds without error

#### Scenario: swapoff command fails
- **WHEN** `swapoff -a` returns a non-zero exit code
- **THEN** the system throws an error with the command's stderr output and aborts the provisioning pipeline

### Requirement: Backup /etc/fstab before modification
The system SHALL create a timestamped backup of `/etc/fstab` before making any modifications. The backup file MUST be named `/etc/fstab.bak.<ISO-timestamp>`.

#### Scenario: /etc/fstab exists
- **WHEN** `/etc/fstab` exists on disk
- **THEN** a copy is created at `/etc/fstab.bak.<ISO-timestamp>` before any edits

#### Scenario: /etc/fstab does not exist
- **WHEN** `/etc/fstab` does not exist
- **THEN** the system throws an error indicating the file is missing and aborts

### Requirement: Comment out swap lines in /etc/fstab
The system SHALL parse `/etc/fstab` and comment out any line where the filesystem type field (column 3) is `swap`. Commented lines MUST be prefixed with `# [k8s-ready] ` to mark them as agent-modified. Lines already commented out SHALL be left unchanged.

#### Scenario: fstab contains an active swap entry
- **WHEN** `/etc/fstab` contains a line like `UUID=xxx none swap sw 0 0`
- **THEN** the line is rewritten as `# [k8s-ready] UUID=xxx none swap sw 0 0`

#### Scenario: fstab contains no swap entries
- **WHEN** `/etc/fstab` has no lines with `swap` in the type field
- **THEN** the file is not modified and the operation succeeds

#### Scenario: swap line is already commented
- **WHEN** a swap line is already prefixed with `#`
- **THEN** the line is left unchanged

### Requirement: Rollback fstab on failure
The system SHALL restore `/etc/fstab` from the timestamped backup if any error occurs after the backup was created during the swap management stage.

#### Scenario: Write to fstab fails
- **WHEN** `fs.writeFileSync` throws an error writing the modified fstab
- **THEN** the backup file is copied back to `/etc/fstab` and the error is re-thrown

### Requirement: Idempotent swap management
The swap management operation SHALL be safe to run multiple times. Re-running MUST NOT double-comment already-commented lines or create errors.

#### Scenario: Second run after successful first run
- **WHEN** swap management runs again on a node already provisioned by k8s-ready
- **THEN** swap is already off, fstab lines are already commented, and the operation completes without changes
