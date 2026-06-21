## ADDED Requirements

### Requirement: Poll node readiness status
The system SHALL execute `kubectl get nodes -o json` with the `KUBECONFIG` environment variable set, parse the JSON output, and inspect the node's `status.conditions` array for a condition where `type` equals `Ready` and `status` equals `True`.

#### Scenario: Node is immediately Ready
- **WHEN** the first poll returns a node with `Ready: True`
- **THEN** the polling loop exits immediately and the bootstrap succeeds

#### Scenario: Node becomes Ready after multiple polls
- **WHEN** the first 3 polls return `Ready: False` and the 4th returns `Ready: True`
- **THEN** the polling loop exits on the 4th iteration and the bootstrap succeeds

### Requirement: Poll every 10 seconds
The system SHALL wait 10 seconds between each poll iteration. The wait SHALL be implemented using `execSync('sleep 10')` to maintain the synchronous execution model.

#### Scenario: Polling interval is respected
- **WHEN** a poll returns `Ready: False`
- **THEN** the system waits 10 seconds before executing the next poll

### Requirement: Timeout after 3 minutes
The system SHALL enforce a maximum timeout of 3 minutes (18 iterations × 10 seconds). If the node does not reach `Ready: True` within this window, the system MUST exit with code 1.

#### Scenario: Timeout reached
- **WHEN** 18 poll iterations complete without the node reaching `Ready: True`
- **THEN** the system throws an error with a descriptive message including the current node status and suggesting manual inspection via `kubectl get nodes`

### Requirement: Print polling progress
The system SHALL print a progress message on each poll iteration indicating the current attempt number, maximum attempts, and the current node status.

#### Scenario: Progress output during polling
- **WHEN** the system is on poll attempt 5 of 18 and the node status is `NotReady`
- **THEN** the system prints a message like: `Waiting for node to become Ready... (5/18) Status: NotReady`

### Requirement: Parse node conditions from kubectl JSON output
The system SHALL parse the JSON output from `kubectl get nodes -o json`, navigate to `items[0].status.conditions`, and find the condition object where `type === 'Ready'`. The node is considered ready when that condition's `status` field equals `'True'`.

#### Scenario: Valid JSON with Ready condition
- **WHEN** kubectl returns valid JSON with a `Ready` condition having `status: 'True'`
- **THEN** the system detects the node as ready

#### Scenario: Valid JSON with no Ready condition
- **WHEN** kubectl returns valid JSON but no condition with `type === 'Ready'` exists
- **THEN** the system treats the node as not ready and continues polling

#### Scenario: kubectl command fails during polling
- **WHEN** `kubectl get nodes -o json` returns a non-zero exit code during a poll iteration
- **THEN** the system treats the iteration as not ready and continues polling (does not abort — the API server may still be starting)
