### Fixed

- Stop the required-gate caller example from rerunning on arbitrary PR label changes. The `ci:full` classifier label still works when the gate runs, but labels such as `no-changelog` no longer restart the branch-protection gate.
