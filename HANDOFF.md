# Handoff — github-workflows + companions

Snapshot for a fresh agent picking up this work. Date: 2026-05-13.

## The three repos

| Repo                                                                    | Purpose                                                                                                                                                          | State         | Latest commit |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------- |
| [`ArchonVII/.github`](https://github.com/ArchonVII/.github)             | Community health defaults (PR/issue templates, SECURITY.md, release.yml, profile, STARTER.md doc-policy guide). Auto-applies to every repo without its own copy. | Clean, pushed | `0e4a82a`     |
| **`ArchonVII/github-workflows`** (this repo)                            | 14 reusable workflows + `scripts/setup-repo.mjs`. Tagged `@v1` (sliding major).                                                                                  | Clean, pushed | `be74698`     |
| [`ArchonVII/repo-template`](https://github.com/ArchonVII/repo-template) | Clone-and-go template marked as a GitHub template. Pre-wires 8 caller workflows + dependabot + CHANGELOG modes + AGENTS.md + ADR scaffold.                       | Clean, pushed | `180ba5b`     |

Local working trees: `C:\github\.github\`, `C:\github\github-workflows\`, `C:\github\repo-template\` — all on `main`, no uncommitted work.

## Versioning model

- Workflows live on `main`.
- Tag `v1` is a **sliding pointer** to the latest 1.x commit. Consumers pin to `@v1`. Force-push the tag forward whenever additive or backwards-compatible changes land (`git tag -f v1 && git push -f origin v1`).
- Cut `v2` only on a breaking change (e.g. renaming an input, removing a workflow).
- For consumers that want to freeze, they replace `@v1` with a full SHA.

## What ships today

### Reusable workflows (15)

**PR contract & hygiene:** `pr-policy`, `pr-body-autoinject`, `semantic-pr-title`, `branch-naming`, `changelog-fragment`, `labeler`
**Security & dependencies:** `codeql`, `dependency-review`, `auto-merge-dependabot`
**Generic CI:** `node-ci`, `python-ci`
**Agent workflow:** `anomaly-triage`
**Repo hygiene:** `stale`, `lock-threads`, `anomaly-to-issue`

Each has a matching `examples/<name>.yml` caller. See [`README.md`](README.md) for the full table with descriptions.

### `scripts/setup-repo.mjs`

`node scripts/setup-repo.mjs <owner/repo> [--dry-run] [--solo] [--no-protection]`

Idempotent. Applies ~30 standard labels (type / severity / priority / effort / status / workflow / PRD) and branch protection (require PR, dismiss stale reviews, linear history, no force-push, conversations resolve).

Does NOT write files into the target repo. The template repo is the source for `CODEOWNERS` + `dependabot.yml`.

## Suggested next upgrades (none of these are started)

Ranked by likely value:

1. **`release-drafter.yml`** — reusable workflow wrapping `release-drafter/release-drafter@v6`. Maintains a draft release with categorized changelog as PRs land. Stronger alternative to GitHub's native `.github/release.yml` (already in `ArchonVII/.github`) because it auto-bumps the version on a label.
2. **`release-cut.mjs`** script — folds `.changelog/unreleased/*.md` fragments into `CHANGELOG.md` under `## [Unreleased]`, deletes fragments, creates a versioned section, tags the commit. Pigafetta has this need too; could be ported.
3. **`markdown-lint.yml`** + **`link-check.yml`** reusable workflows for docs-heavy repos. Low priority unless you have a wiki.
4. **Wire pigafetta to consume `@v1`** — pigafetta still has its own inline copies of `pr-policy`, `pr-body-autoinject`, `changelog-fragment`, `anomaly-to-issue`, `labeler` in `.github/workflows/`. Replacing each with a thin caller to `@v1` would prove the loop and reduce duplication. Do this in a single PR on pigafetta, not here.
5. **Lock GitHub Actions versions** — `dependabot.yml` in `repo-template` already pins the github-actions ecosystem; on this repo we use floating refs like `actions/checkout@v4`. If you want SHA-pinning, add a Dependabot config here too — but that's a noise/safety tradeoff for a hobby account.
6. **`codeql.yml` for github-workflows itself** — these JS-in-YAML scripts deserve scanning. Wire a caller in this repo.
7. **Template repo follow-ups** — add commented-out node-ci and python-ci callers behind clear "uncomment for X stack" markers. Today the user must copy from `examples/` after cloning. Optional convenience.
8. **`branch-naming.yml` regex polish** — the default regex was tested by inspection only. Worth running it against a sample of historical branch names if you find one that should match but doesn't.

## Known gaps / things to verify in the wild

- **`auto-merge-dependabot.yml`** has not been observed running. It uses `dependabot/fetch-metadata@v2` then `gh pr merge --auto`. First time a Dependabot PR lands in a consumer repo, verify the gate works end-to-end and that `gh pr merge --auto` succeeds with `GITHUB_TOKEN` (might need `permissions: contents: write`, which the workflow already sets).
- **`codeql.yml` matrix** uses `fromJSON(inputs.languages)` against a JSON array string. Tested by inspection; worth a real run on a consumer repo to confirm the matrix expands correctly.
- **`semantic-pr-title.yml` `pull_request_target`** — be aware that `pull_request_target` runs against the base branch, which is what we want for fork PRs but means a malicious fork can't inject code here (we only read PR metadata). Don't loosen permissions in this workflow.
- **`pr-body-autoinject.yml`** runs only on `opened`. If a bot edits the body later (Copilot sometimes does), the stub stays put and `pr-policy` keeps passing — that's intended.
- The `STARTER.md` "Mode 1 vs Mode 2" CHANGELOG decision is documented but not enforced by tooling. A consumer in Mode 1 who accidentally wires `changelog-fragment.yml` will fail every PR. Worth a "what mode are you in?" comment at the top of the example caller someday.

## How to bootstrap a new repo with all of this

```bash
# 1. Click "Use this template" on github.com/ArchonVII/repo-template
#    or:
gh repo create ArchonVII/<repo> --template ArchonVII/repo-template --public --clone
cd <repo>

# 2. Customize: README content, CODEOWNERS, AGENTS.md, dependabot.yml ecosystems
#    Delete the unused CHANGELOG mode and the bootstrap checklist in README.

# 3. Apply labels + branch protection
node /c/github/github-workflows/scripts/setup-repo.mjs ArchonVII/<repo> --solo

# 4. In repo Settings → Branches → Branch protection → main →
#    Required status checks: tick the workflow checks you kept
#    (e.g. `policy`, `actionlint`, your CI job names).

# 5. Commit any customization and push.
```

## Tested vs untested

| Tested                                                                                 | How                                                                        |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `pr-policy`, `pr-body-autoinject`, `changelog-fragment`, `anomaly-to-issue`, `labeler` | Battle-tested on pigafetta (these are extractions of working workflows)    |
| `setup-repo.mjs` labels API path                                                       | Inspection — Octokit-equivalent calls, exact same as GitHub's docs         |
| `stale`, `lock-threads`, `semantic-pr-title`                                           | Inspection — thin wrappers around mature first/third-party actions         |
| `codeql`, `dependency-review`                                                          | Inspection — GitHub-first-party actions                                    |
| `auto-merge-dependabot`                                                                | Inspection — will exercise on first real Dependabot PR                     |
| `node-ci`, `python-ci`                                                                 | Inspection — manager detection logic should work; verify on first consumer |
| `branch-naming`                                                                        | Inspection — default regex covers the documented conventions               |

No end-to-end run has happened against a real consumer repo yet. First consumer is the load-bearing test.

## Quick links

- Surface: https://github.com/ArchonVII/github-workflows#readme
- Doc-policy guide (the `STARTER.md` you referenced): https://github.com/ArchonVII/.github/blob/main/STARTER.md
- Template repo: https://github.com/ArchonVII/repo-template
- Example callers: https://github.com/ArchonVII/github-workflows/tree/main/examples
- Setup script: https://github.com/ArchonVII/github-workflows/blob/main/scripts/setup-repo.mjs

## Pigafetta context this work came from

This was extracted out of pigafetta's `.github/workflows/` to generalize across all of @ArchonVII's repos. Pigafetta still owns the original inline copies; nothing in pigafetta changed this session. The session itself ran on the `main` branch of `C:\PythonProjects\pigafetta` but only wrote files to `C:\github\*` — pigafetta's working tree is unmodified.

If you want pigafetta to consume `@v1` (item 4 in the upgrades list), do that as a normal pigafetta PR following the pigafetta workflow (issue → branch → worktree → PR), not from this handoff.
