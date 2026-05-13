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

## Versioning

Tags `v1`, `v2`, ... are the consumer-facing API surface. Breaking changes bump the major. Bug fixes and additive inputs land on `main` and the tag is fast-forwarded.

To pin to a specific commit instead of a moving tag, replace `@v1` with the full SHA.

## Why two repos, not one

- **`ArchonVII/.github`** holds community health files (PR template, issue templates, profile README) that GitHub picks up automatically as defaults for every repo with no own copy. No workflow plumbing involved.
- **`ArchonVII/github-workflows`** (this repo) holds reusable workflows. Consumers explicitly opt in per repo via a thin caller workflow.

Keeping them separate means a repo can use the templates without paying any CI cost, and another repo can use the workflows without inheriting the templates.
