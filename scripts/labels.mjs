// labels.mjs — canonical ArchonVII label seed set.
//
// Applied by setup-repo.mjs and audited by gate-labels.test.mjs. Any label that a
// reusable workflow or script *applies* or *gates on* (see gate-labels.mjs) MUST
// appear here, or `gh ... --label X` and label-gated workflows fail on repos that
// were never seeded with that label. The gate-label audit enforces this.
//
// Source of the gate-required entries: the `*-label` input defaults in
// .github/workflows/*.yml (see gate-labels.mjs `extractLabelInputDefaults`).

export const LABELS = [
  // Type
  { name: 'bug', color: 'D93F0B', description: 'Something is broken' },
  { name: 'enhancement', color: 'A2EEEF', description: 'New feature or capability' },
  { name: 'documentation', color: '0075CA', description: 'Docs gap, error, or improvement' },
  { name: 'chore', color: 'CFD3D7', description: 'Tech debt, refactor, cleanup' },
  { name: 'refactor', color: 'CFD3D7', description: 'Code restructure without behavior change' },
  { name: 'tests', color: '5319E7', description: 'Test-only changes' },
  { name: 'performance', color: 'FBCA04', description: 'Performance improvement' },
  { name: 'dependencies', color: '0366D6', description: 'Dependency bump or change' },
  { name: 'security', color: 'B60205', description: 'Security-relevant change' },
  { name: 'breaking', color: 'B60205', description: 'Breaking change (API, schema, behavior)' },
  // Conventional-commit work types (no dedicated automation; used for triage + scanning).
  { name: 'task', color: 'CFD3D7', description: 'Tracked implementation work' }, // matches chore/refactor neutral grey CFD3D7
  { name: 'ci', color: '0366D6', description: 'CI / automation pipeline change' }, // matches dependencies infra blue 0366D6
  { name: 'build', color: '0366D6', description: 'Build system or tooling change' }, // matches dependencies infra blue 0366D6

  // Compatibility aliases — same color as their canonical label so ArchonVII/.github
  // release.yml groups them together in generated notes. Internally prefer the canonical
  // enhancement/bug/breaking; these exist for imported PRs, bots, and conventional names.
  { name: 'feature', color: 'A2EEEF', description: 'Alias of enhancement (release-note grouping)' }, // = enhancement A2EEEF
  { name: 'fix', color: 'D93F0B', description: 'Alias of bug (release-note grouping)' }, // = bug D93F0B
  { name: 'breaking-change', color: 'B60205', description: 'Alias of breaking (release-note grouping)' }, // = breaking B60205

  // Severity (used by anomaly-to-issue workflow)
  { name: 'severity:low', color: '0E8A16', description: 'Anomaly severity: low' },
  { name: 'severity:medium', color: 'FBCA04', description: 'Anomaly severity: medium' },
  { name: 'severity:high', color: 'D93F0B', description: 'Anomaly severity: high' },
  { name: 'severity:critical', color: 'B60205', description: 'Anomaly severity: critical' },

  // Priority
  { name: 'priority:p0', color: 'B60205', description: 'Drop everything' },
  { name: 'priority:p1', color: 'D93F0B', description: 'Do soon' },
  { name: 'priority:p2', color: 'FBCA04', description: 'Normal' },
  { name: 'priority:p3', color: 'C5DEF5', description: 'Nice to have' },

  // Effort (from the `open` skill — drives triage and PRD breakdown)
  { name: 'effort:s', color: 'C2E0C6', description: '< 1 hour' },
  { name: 'effort:m', color: 'BFE5BF', description: '~ half day' },
  { name: 'effort:l', color: 'FBCA04', description: '1–2 days' },
  { name: 'effort:xl', color: 'D93F0B', description: 'Multi-day' },

  // Status
  { name: 'wip', color: 'FEF2C0', description: 'Work in progress; not ready for review' },
  { name: 'blocked', color: 'E11D21', description: 'Blocked on external dependency' },
  { name: 'stale', color: 'CFD3D7', description: 'Auto-applied by stale workflow' },
  { name: 'pinned', color: '5319E7', description: 'Exempt from stale/lock workflows' },
  { name: 'roadmap', color: '5319E7', description: 'Long-running roadmap tracking issue' },
  { name: 'needs-info', color: 'FEF2C0', description: 'Waiting on the reporter for more information' }, // needs-* mirror needs-triage FEF2C0
  { name: 'needs-reproduction', color: 'FEF2C0', description: 'Needs a reliable reproduction before work can start' }, // needs-* mirror needs-triage FEF2C0
  { name: 'needs-decision', color: 'FEF2C0', description: 'Blocked on a maintainer decision' }, // needs-* mirror needs-triage FEF2C0
  { name: 'ready', color: '0E8A16', description: 'Triaged and ready to be worked' }, // ready-to-go green, matches auto-merge 0E8A16

  // Workflow / release
  { name: 'no-changelog', color: 'EDEDED', description: 'Skip the CHANGELOG fragment requirement' },
  { name: 'anomaly', color: 'B60205', description: 'Auto-promoted from .anomalies/ file on merge' },
  { name: 'ignore-for-release', color: 'EDEDED', description: 'Exclude from auto-generated release notes' },
  { name: 'auto-merge', color: '0E8A16', description: 'Eligible for auto-merge once CI is green' },
  // Gate-required labels surfaced by the gate-label audit (referenced-but-unseeded).
  // Colors are cosmetic; the provenance is the referencing workflow named below.
  { name: 'ci:full', color: '5319E7', description: 'Force the full required-gate CI lanes regardless of changed paths' }, // force-full-ci-label default in repo-required-gate.yml
  { name: 'auto-triaged', color: 'C5DEF5', description: 'Applied by the anomaly auto-triage workflow' }, // auto-triage-label default in anomaly-triage.yml
  { name: 'doc-orphan', color: 'FBCA04', description: 'Durable doc missing from its index (doc-orphan detector)' }, // base-label default in doc-orphan-detector.yml

  // Triage / closure (GitHub's built-in default labels — kept for familiarity + tooling)
  { name: 'duplicate', color: 'CFD3D7', description: 'This issue or PR already exists' }, // GitHub default label palette
  { name: 'invalid', color: 'E4E669', description: 'Not a valid issue or not actionable' }, // GitHub default label palette
  { name: 'question', color: 'D876E3', description: 'Further information is requested' }, // GitHub default label palette
  { name: 'wontfix', color: 'FFFFFF', description: 'This will not be worked on' }, // GitHub default label palette

  // Contributor onboarding (CNCF-recommended names for public discovery)
  { name: 'help wanted', color: '008672', description: 'Extra attention is needed' }, // GitHub default label palette
  { name: 'good first issue', color: '7057FF', description: 'Good for newcomers' }, // GitHub default label palette
  { name: 'contrib-candidate', color: 'C5DEF5', description: 'Potential help-wanted / good-first-issue once groomed' }, // tentative/candidate light blue C5DEF5

  // PRD / breakdown (from the `open` skill)
  { name: 'prd', color: '5319E7', description: 'Parent PRD issue — broken into tracer-bullet sub-issues' },
  { name: 'tracer-bullet', color: 'BFD4F2', description: 'Thin vertical slice cutting through all layers' },
  { name: 'needs-triage', color: 'FEF2C0', description: 'Not yet triaged into a bucket' },
];

export const LABEL_NAMES = new Set(LABELS.map((label) => label.name));
