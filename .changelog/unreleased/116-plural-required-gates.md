### Fixed

- Accept canonical plural `required_gates` check maps in the reusable policy-validation lane while preserving legacy singular `required_gate` compatibility. Every declared gate must contain a unique, non-empty string `check_name`, and ambiguous, empty, duplicate, incorrectly indented, or malformed declarations fail closed.
