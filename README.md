# github-workflows

Reusable GitHub Actions workflows + a per-repo setup script, shared across all repos under [@ArchonVII](https://github.com/ArchonVII).

Each workflow uses `on: workflow_call`. A consumer repo opts in by adding a tiny caller workflow that holds the actual trigger (`pull_request`, `schedule`, etc.) and `uses:` the reusable version. Pin to `@v1` so an upstream change doesn't deploy silently everywhere.

Agent and maintainer governance for this repository lives in [`AGENTS.md`](AGENTS.md). Start there before changing workflows, setup scripts, or PR policy helpers; operational changes are logged in [`docs/repo-update-log.md`](docs/repo-update-log.md).

Companion repos:

- **[`ArchonVII/.github`](https://github.com/ArchonVII/.github)** — auto-applied community health files (PR template, issue forms, `SECURITY.md`, `release.yml`). See [`STARTER.md`](https://github.com/ArchonVII/.github/blob/main/STARTER.md) for the full document-policy guide.
- **[`ArchonVII/repo-template`](https://github.com/ArchonVII/repo-template)** — clone-and-go bootstrap with all the caller workflows pre-wired. Mark "Use this template" when creating a new repo.

For the current skill, script, and agent responsibility map around the release
workflow, see [`docs/release-workflow-breakdown.md`](docs/release-workflow-breakdown.md).

---

## Workflows

### PR contract & hygiene

| Workflow                                                             | Purpose                                                                                                                                       | Example                                                              |
| -------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`pr-policy.yml`](.github/workflows/pr-policy.yml)                   | Enforce the shared PR contract validator: canonical title/body structure, linked issue, verification notes, and checked verification. Doc-only PRs skip body ceremony. Also warns on role-separation concerns and can hard-gate protected agent PR paths. Also runs `actionlint`. | [`examples/pr-policy.yml`](examples/pr-policy.yml)                   |
| [`pr-body-autoinject.yml`](.github/workflows/pr-body-autoinject.yml) | When a bot opens a non-doc PR with a freehand body, prepend an intentionally incomplete scaffold that agents must fill before ready-for-review. Human PRs untouched. | [`examples/pr-body-autoinject.yml`](examples/pr-body-autoinject.yml) |
| [`semantic-pr-title.yml`](.github/workflows/semantic-pr-title.yml)   | Enforce Conventional Commits format on PR titles. Wraps `amannn/action-semantic-pull-request@v5`.                                             | [`examples/semantic-pr-title.yml`](examples/semantic-pr-title.yml)   |
| [`branch-naming.yml`](.github/workflows/branch-naming.yml)           | Enforce the `open`-skill branch convention (`agent/<tool>/<issue>-<slug>` or `<type>/<slug>`). Configurable regex.                            | [`examples/branch-naming.yml`](examples/branch-naming.yml)           |
| [`changelog-fragment.yml`](.github/workflows/changelog-fragment.yml) | Require a new file under `.changelog/unreleased/` whenever a PR touches `src/`. Skippable via `no-changelog` label.                           | [`examples/changelog-fragment.yml`](examples/changelog-fragment.yml) |
| [`labeler.yml`](.github/workflows/labeler.yml)                       | Thin wrapper around `actions/labeler@v5`.                                                                                                     | [`examples/labeler.yml`](examples/labeler.yml)                       |

### Security & dependencies

| Workflow                                                                   | Purpose                                                                                                                             | Example                                                                    |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| [`dependency-review.yml`](.github/workflows/dependency-review.yml)         | Block PRs that introduce vulnerable or copyleft-licensed dependencies. Operates on the lockfile diff.                               | [`examples/dependency-review.yml`](examples/dependency-review.yml)         |
| [`auto-merge-dependabot.yml`](.github/workflows/auto-merge-dependabot.yml) | Auto-merge Dependabot PRs that match the allowed update types (default: patch + minor) and pass CI.                                 | [`examples/auto-merge-dependabot.yml`](examples/auto-merge-dependabot.yml) |

### Generic CI

| Workflow                                           | Purpose                                                                                                                                    | Example                                            |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| [`repo-required-gate.yml`](.github/workflows/repo-required-gate.yml) | Always-reporting PR gate for branch protection. Detects changed files, runs relevant internal checks, and exposes one stable `repo-required-gate / decision` check. | [`examples/repo-required-gate.yml`](examples/repo-required-gate.yml) |
| [`node-ci.yml`](.github/workflows/node-ci.yml)     | Install + lint + typecheck + test for Node projects. Auto-detects `npm` / `pnpm` / `yarn` from lockfile. Matrix over Node versions and OS. | [`examples/node-ci.yml`](examples/node-ci.yml)     |
| [`python-ci.yml`](.github/workflows/python-ci.yml) | Install (uv or pip) + ruff lint + ruff format-check + pyright + pytest. Each step opt-out. Matrix over Python versions and OS.             | [`examples/python-ci.yml`](examples/python-ci.yml) |
| [`go-ci.yml`](.github/workflows/go-ci.yml)         | Discover every tracked `go.mod` (`git ls-files`, skipping build artifacts) and run `go build` / `go vet` / `go test` per module. Optional codegen + dirty-tree drift check. Matrix over Go versions and OS. | [`examples/go-ci.yml`](examples/go-ci.yml)         |

### Agent workflow

| Workflow                                                     | Purpose                                                                                                                                                                                                                                                       | Example                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| [`anomaly-triage.yml`](.github/workflows/anomaly-triage.yml) | Read `.archon/anomalies-thispr.md` written by an agent during a PR. Classify each entry as related-to-PR (post sticky review comment) or unrelated (file a new issue, optionally in a downstream repo). Idempotent across re-runs. Tool-agnostic by contract. | [`examples/anomaly-triage.yml`](examples/anomaly-triage.yml) |

### Repo hygiene

| Workflow                                                         | Purpose                                                                                                      | Example                                                          |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| [`stale.yml`](.github/workflows/stale.yml)                       | Auto-mark and auto-close stale issues/PRs. Wraps `actions/stale@v9`.                                         | [`examples/stale.yml`](examples/stale.yml)                       |
| [`lock-threads.yml`](.github/workflows/lock-threads.yml)         | Lock closed issues/PRs after N days of inactivity. Wraps `dessant/lock-threads@v5`.                          | [`examples/lock-threads.yml`](examples/lock-threads.yml)         |
| [`anomaly-to-issue.yml`](.github/workflows/anomaly-to-issue.yml) | On PR merge, scan for new files in `.anomalies/` and promote each to a GitHub issue with parsed frontmatter. | [`examples/anomaly-to-issue.yml`](examples/anomaly-to-issue.yml) |

---

## How to consume

In any repo where you want one of these, copy the example caller into `.github/workflows/` and commit it. Inputs are all optional; the PR contract defaults are intentionally strict for ready-for-review.

For branch protection, prefer the single-gate contract:

```text
Required status check:
repo-required-gate / decision
```

Keep targeted checks inside the gate or leave them non-required. Do not make branch protection depend on workflows that can be skipped by path filters; GitHub can leave those required checks pending.

The required-gate caller listens for `labeled` and `unlabeled` events only to
preserve the `ci:full` escape hatch. The caller job and concurrency expression
are guarded so `ci:full` is the only label change that can run or cancel the
required branch-protection gate. Other labels such as `no-changelog` may create
a skipped caller run in a separate `label-skip-*` concurrency group, but they do
not start `repo-required-gate / decision`, cancel an in-flight required-gate
run, or replace a pending gate run in the real required-gate concurrency group.
If a repo overrides the `force-full-ci-label` input, update the caller guard and
concurrency label name to match.

For agent closeout, use the shared local preflight instead of direct promotion:

```bash
npm run agent:close-preflight -- --repo OWNER/REPO --pr 123
npm run agent:pr-ready -- --repo OWNER/REPO --pr 123
```

Agents must not run `gh pr ready` directly. `agent:pr-ready` fetches the PR title, body, head branch, and changed files; runs `scripts/pr-contract.mjs`; prints exact repair failures; and only then calls `gh pr ready`.

The canonical scaffold lives at [`contracts/pr-template.md`](contracts/pr-template.md). It is intentionally invalid until the TODOs are replaced with real summary, verification, docs/changelog, and issue-link content.

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
    # Optional: fail agent-managed PRs touching protected paths unless an
    # independent approval or non-author Release-Admiral marker is present.
    # Defaults are warning-only per ArchonVII/.github#14.
    # with:
    #   enforce-role-separation: true
```

### PR role-separation policy

`pr-policy.yml` includes the F7 role-separation check from
[`ArchonVII/.github#14`](https://github.com/ArchonVII/.github/issues/14).
By default, the workflow emits warnings when PR metadata suggests the same
account both authored and is preparing to close agent-managed work. This is not
a universal hard block because the ArchonVII solo-owner workflow permits Joseph
to be the human merging account for legitimate work.

Consumers that want scoped hard enforcement can set:

```yaml
with:
  enforce-role-separation: true
```

When enabled, agent-managed PRs touching protected paths must have either an
independent approving review or a PR-body marker such as
`Release-Admiral: @reviewer-name`, where the marker names a non-author. The
default protected path set covers `.github/**`, `.githooks/**`, `.agent/**`,
agent authority docs, package manifests/locks, `src/**`, and `scripts/**`. Use
`role-protected-paths` to override that list.

The Owner Maintenance Lane is direct-commit-only and intentionally has no PR
exemption here. Dependabot auto-merge is the explicit exception.

---

## Per-repo setup script

`scripts/setup-repo.mjs` applies the standard label set and branch protection to a target repo via `gh api`. Idempotent — safe to re-run after adding labels here.

```bash
# Dry-run first to preview changes
node scripts/setup-repo.mjs ArchonVII/new-thing --dry-run

# Apply for real
node scripts/setup-repo.mjs ArchonVII/new-thing

# Solo repo (skip the "require 1 approving review" rule)
node scripts/setup-repo.mjs ArchonVII/new-thing --solo
```

What the script applies:

- **Standard label set** (~30 labels):
  - Type: `bug`, `enhancement`, `documentation`, `chore`, `refactor`, `tests`, `performance`, `dependencies`, `security`, `breaking`
  - Severity (for `anomaly-to-issue`): `severity:low|medium|high|critical`
  - Priority: `priority:p0|p1|p2|p3`
  - Effort (from the `open` skill): `effort:s|m|l|xl`
  - Status: `wip`, `blocked`, `stale`, `pinned`, `roadmap`, `needs-triage`
  - Workflow: `no-changelog`, `anomaly`, `ignore-for-release`, `auto-merge`
  - PRD: `prd`, `tracer-bullet`
- **Branch protection** on the default branch: require PR, dismiss stale reviews on push, linear history, no force-push, no deletions, conversations must resolve. `--solo` sets required approvals to 0; default is 1.

What the script does NOT do (do these by hand or via PR):

- Write files into the target repo (`CODEOWNERS`, `dependabot.yml`) — the script prints templates instead. The `repo-template` repo has these pre-wired.
- Add reusable workflow callers — pick those per repo from `examples/` (or use `repo-template`).
- Configure required status checks — after the first PR run, set repo Settings → Branches to require `repo-required-gate / decision`.

---

## Versioning

Tags `v1`, `v2`, ... are the consumer-facing API surface. Breaking changes bump the major. Bug fixes and additive workflows/inputs land on `main` and the major tag is fast-forwarded — consumers pinned to `@v1` get them on the next workflow run.

To pin to a specific commit instead of a moving tag, replace `@v1` with the full SHA.

---

## Why three repos

- **[`ArchonVII/.github`](https://github.com/ArchonVII/.github)** — community health _files_. GitHub picks these up automatically as defaults for every repo without its own copy. No CI, no opt-in.
- **`ArchonVII/github-workflows`** (this repo) — reusable _workflows_ and a _setup script_. Consumers opt in per repo.
- **[`ArchonVII/repo-template`](https://github.com/ArchonVII/repo-template)** — _bootstrap template_ for new repos. Marked as a GitHub template repo; clone it via "Use this template" to start with all the callers, a `dependabot.yml`, `CHANGELOG.md`, `AGENTS.md`, etc. already in place.

The three layers compose: the template gets you wired up on day one, the workflows keep working forever, and the `.github` defaults patch any holes in repos that drift from the template.
