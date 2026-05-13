# github-workflows

Reusable GitHub Actions workflows shared across repos under [@ArchonVII](https://github.com/ArchonVII).

Each workflow here uses `on: workflow_call`, so a consumer repo opts in by adding a tiny caller workflow that holds the actual trigger (`pull_request`, etc.) and `uses:` the reusable version. Pin the caller to a tag like `@v1` — that way a breaking change here does not auto-deploy everywhere.

## Workflows

| Workflow                 | Purpose                                                                                                                                       | Example caller                                                       |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `pr-policy.yml`          | Enforce PR body has `## Verification` / `### Verification Notes` / a checked box / a linked issue. Doc-only PRs skip. Also runs `actionlint`. | [`examples/pr-policy.yml`](examples/pr-policy.yml)                   |
| `pr-body-autoinject.yml` | When a bot opens a non-doc PR with a freehand body, prepend a stub that satisfies `pr-policy`. Human PRs untouched.                           | [`examples/pr-body-autoinject.yml`](examples/pr-body-autoinject.yml) |
| `changelog-fragment.yml` | Require a new file under `.changelog/unreleased/` (or your configured dir) whenever a PR touches `src/`. Skippable via `no-changelog` label.  | [`examples/changelog-fragment.yml`](examples/changelog-fragment.yml) |
| `anomaly-to-issue.yml`   | On PR merge, scan for new files in `.anomalies/` and promote each to a GitHub issue with parsed frontmatter (`title`, `severity`, `labels`).  | [`examples/anomaly-to-issue.yml`](examples/anomaly-to-issue.yml)     |
| `labeler.yml`            | Thin wrapper around `actions/labeler@v5` so all repos pin the same version.                                                                   | [`examples/labeler.yml`](examples/labeler.yml)                       |
| `stale.yml`              | Auto-mark and auto-close stale issues/PRs. Wraps `actions/stale@v9`. Exempt labels configurable.                                              | [`examples/stale.yml`](examples/stale.yml)                           |
| `lock-threads.yml`       | Lock closed issues/PRs after N days of inactivity. Wraps `dessant/lock-threads@v5`.                                                           | [`examples/lock-threads.yml`](examples/lock-threads.yml)             |
| `semantic-pr-title.yml`  | Enforce Conventional Commits format on PR titles (`feat(scope): ...`). Wraps `amannn/action-semantic-pull-request@v5`.                        | [`examples/semantic-pr-title.yml`](examples/semantic-pr-title.yml)   |

## How to consume

In any repo where you want one of these, copy the example caller into `.github/workflows/` and commit it. Inputs are all optional — defaults match the original Pigafetta behavior.

```yaml
# .github/workflows/pr-policy.yml in a consumer repo
name: PR Policy
on:
  pull_request:
    types: [opened, edited, reopened, synchronize]
permissions:
  pull-requests: read
  contents: read
jobs:
  policy:
    uses: ArchonVII/github-workflows/.github/workflows/pr-policy.yml@v1
```

## Per-repo setup script

`scripts/setup-repo.mjs` applies the standard label set and branch protection to a target repo via `gh api`. Idempotent — safe to re-run after adding labels here.

```bash
# Dry-run first to see what would change
node scripts/setup-repo.mjs ArchonVII/new-thing --dry-run

# Apply for real
node scripts/setup-repo.mjs ArchonVII/new-thing

# Solo repo (skip the "require 1 approving review" rule — you can't approve your own PRs)
node scripts/setup-repo.mjs ArchonVII/new-thing --solo
```

What the script does:

- Creates / updates the standard label set (~26 labels: type, severity, priority, status, workflow).
- Enables branch protection on the default branch: require PR, dismiss stale reviews on push, linear history, no force-push, no deletions, conversations must resolve.

What it does NOT do (do these by hand or via PR):

- Write files into the target repo (`CODEOWNERS`, `dependabot.yml`) — the script prints templates instead.
- Add reusable workflow callers — pick those per repo from `examples/`.
- Configure required status checks — set in repo Settings → Branches once you know which workflows the repo runs.

## Versioning

Tags `v1`, `v2`, ... are the consumer-facing API surface. Breaking changes bump the major. Bug fixes and additive inputs land on `main` and the tag is fast-forwarded.

To pin to a specific commit instead of a moving tag, replace `@v1` with the full SHA.

## Why two repos, not one

- **`ArchonVII/.github`** holds community health files (PR template, issue templates, profile README) that GitHub picks up automatically as defaults for every repo with no own copy. No workflow plumbing involved.
- **`ArchonVII/github-workflows`** (this repo) holds reusable workflows. Consumers explicitly opt in per repo via a thin caller workflow.

Keeping them separate means a repo can use the templates without paying any CI cost, and another repo can use the workflows without inheriting the templates.
