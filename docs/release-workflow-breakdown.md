# Release Workflow Skill, Script, And Agent Breakdown

This is an honest accounting of the release workflow around
`ArchonVII/github-workflows` as of 2026-06-02. It separates what exists in this
repo from what the global Pigafetta-style skills expect and from what is still
planned. It intentionally calls out gaps, duplication, and places where the
instruction exists but the command does not.

Sources checked: this repo's `README.md`, `HANDOFF.md`, `.github/workflows/**`,
`scripts/**`, GitHub workflow/branch metadata, and the local shared skills for
`using-superpowers`, `session`, `open`, `release-commander`, `close`,
`jma-commit`, `jma-git-pr-lifecycle`, `jma-commit-push-pr`,
`archon-ecosystem-sync`, `bookmark`, `manager`, `github`, and `release-cut`.
Freshness refresh also checked `github-workflows` PRs #39 and #43 plus
`archon-setup` PR #94.

## Part 1: What Actually Exists Now

### Chronological Standard Flow, As Installed Today

1. The user engages with a new agent for the repo.
   The active agent is expected to follow global instructions, but this repo has
   no repo-local `AGENTS.md`. The active policy came from the external
   Pigafetta-style global instructions supplied in the session.

2. The agent selects workflow skills and orients itself.
   This is skill-driven, not repo-enforced. The relevant skills are
   `using-superpowers`, `napkin`, `session`, `open`, `github`, and
   `release-commander`. This repo does not provide a script that verifies those
   skills ran.

3. The agent checks repo status.
   Global policy says to run `npm run agent:prune` and `npm run agent:status`
   when present. In this repo, both scripts are absent. `package.json` currently
   exposes `agent:close-preflight`, `agent:pr-ready`, `pr:contract`, and
   `test`.

4. The agent creates or confirms the issue.
   There is no repo-local issue bootstrap. The agent uses `gh issue` directly
   when the policy requires an issue.

5. The agent creates the work lane.
   Global policy prefers `npm run agent:start-task -- <issue> [--agent <name>]`.
   This repo does not have `agent:start-task` locally, although
   `archon-setup` can now install and audit the repo-template agent lifecycle
   baseline in target repos. Until this repo adopts that baseline, the current
   real path here is manual: fetch `origin/main`, create
   `agent/<tool>/<issue>-<slug>`, and add a worktree from `origin/main`.

6. The agent claims files.
   The instruction exists in the global policy, `release-commander`, `close`,
   and `jma-git-pr-lifecycle`. The command does not exist in this repo. There is
   no `npm run agent:claim`, no `npm run agent:release`, and no
   `scripts/agent-claims.mjs`. Today, conflict avoidance is mostly branch,
   worktree, status, and human/agent discipline.

7. The implementation or docs agent changes files.
   For this repo, that normally means editing reusable workflow YAML, example
   callers, scripts, tests, or docs. Shared docs such as `README.md` are
   protected by the global policy, even though GitHub currently reports no
   classic branch protection and no rulesets for `main` on this repository.

8. The agent verifies locally.
   The repo-owned command is `npm test`, which runs Vitest tests for
   `scripts/**` and workflow structure assertions. `npm run pr:contract`
   validates PR title, body, branch, changed files, and verification ceremony.
   The package also exposes `agent:close-preflight` and `agent:pr-ready`
   wrappers for the PR promotion path. There is no local `close:scan:complete`,
   `close:ci:guard`, `wiki:status`, or `wiki:record` command in this repo.

9. The agent commits.
   The current safe-commit instruction lives in `jma-commit` and
   `jma-commit-push-pr`: stage only specific files, avoid `git add .`, use a
   conventional commit, and leave unrelated dirty state alone. The repo has no
   custom commit wrapper.

10. The agent pushes and opens or updates a PR.
    The current PR lifecycle combines repo-owned PR contract wrappers with
    skills such as `jma-git-pr-lifecycle`, `jma-commit-push-pr`, `github`, and
    `release-commander`. This repo does not contain a local PR template, but the
    organization default PR template exists in `ArchonVII/.github`.

11. GitHub Actions run.
    The repo has 16 reusable workflows plus one direct self-test workflow:
    `actionlint`, `anomaly-to-issue`, `anomaly-triage`,
    `auto-merge-dependabot`, `branch-naming`, `changelog-fragment`,
    `dependency-review`, `labeler`, `lock-threads`, `node-ci`,
    `pr-body-autoinject`, `pr-policy`, `python-ci`, `repo-required-gate`,
    `semantic-pr-title`, `stale`, and direct non-reusable `self-test`.
    The reusable workflows are active, but they run only when called by a
    consumer workflow. For this repo itself, `self-test.yml` is the only local
    workflow with normal `pull_request` / `push` triggers.

12. Policy checks evaluate the PR.
    `repo-required-gate` can route PRs into docs-only, workflow-only,
    policy-only, snapshot-refresh, language CI, or forced-full lanes.
    `pr-policy` can check linked issues, verification sections, checked boxes,
    evidence blocks, actionlint, and role separation. However, evidence
    enforcement and role-separation hard failures are opt-in by default.

13. Role separation is mostly a warning unless opted in.
    `scripts/role-policy.mjs` recognizes agent-managed PRs by `agent/` branches,
    labels, `Project-Lieutenant`, or `LIEUTENANT_HANDOFF`. It can require an
    independent approval or `Release-Admiral: @name` marker for protected paths
    only when `enforce-role-separation` is true. Dependabot is exempt.

14. The user or agent invokes close.
    The exact close pipeline belongs to the `close` skill. The
    `release-commander` skill is the dispatcher and auditor. In this repo, close
    cannot run repo-owned close-scan or claim commands because those commands do
    not exist.

15. If close is review-only, the PR stops at review handoff.
    `close:review` should push, update the PR body, mark the PR ready, and stop.
    It should not merge.

16. If close is shipping, merge authorization must be explicit.
    `close:ship`, `/close`, `ship it`, `land it`, or `merge to main` are treated
    as authorization to finish delivery. The agent still must respect gates and
    should not bypass them.

17. Main and remote are cleaned up.
    The desired final state is: PR merged, issue closed through the PR, local
    `main` fast-forwarded, `origin/main` current, remote feature branch deleted,
    local feature branch removed when safe, retired worktree removed when clean,
    claims released if the repo has claims, and unrelated dirty or untracked
    files left alone. In this repo, most cleanup is manual or skill-driven, not
    enforced by repo scripts.

### Current Package Scripts

| Script | Current role |
| --- | --- |
| `agent:close-preflight` | Runs `scripts/agent-close-preflight.mjs` to validate PR contract state, draft/ready expectations, current branch identity, clean working tree, and push state before close promotion. |
| `agent:pr-ready` | Runs `scripts/agent-pr-ready.mjs` so agents promote PRs only after the shared PR contract passes. Supports `--dry-run`. |
| `pr:contract` | Runs `scripts/pr-contract.mjs`, the shared PR metadata/body contract validator used by local wrappers and reusable workflows. |
| `test` | Runs `vitest run` for scripts and workflow-structure assertions. |

### Current Script Files

| Script | Current role |
| --- | --- |
| `scripts/agent-close-preflight.mjs` | Local wrapper around the PR contract plus git-state checks before close promotion. |
| `scripts/agent-pr-ready.mjs` | Local wrapper that validates the PR contract before calling `gh pr ready`, or reports what would happen with `--dry-run`. |
| `scripts/pr-contract.mjs` | Shared PR title/body/branch/verification validator used locally and by reusable workflows. |
| `scripts/setup-repo.mjs` | Applies standard labels and branch protection to a target repo through `gh api`; does not write files or add workflow callers. |
| `scripts/classify-pr.mjs` | Pure helper loaded by `repo-required-gate.yml` to choose docs, workflow, policy, snapshot, code, or forced-full lanes. |
| `scripts/parse-evidence.mjs` | Pure helper loaded by `pr-policy.yml` to validate fenced `evidence` blocks under checked verification items. |
| `scripts/role-policy.mjs` | Pure helper loaded by `pr-policy.yml` to warn or hard-fail role-separation violations when configured. |
| `scripts/*.test.mjs` | Vitest coverage for classifier, PR contract, evidence parser, role policy, and workflow structure. |

### Current Agent And Skill Inventory

| Component | Current owner of the task |
| --- | --- |
| User / human owner | Starts work, answers policy questions, and authorizes shipping language. |
| Active implementation agent | Makes the actual repo changes in a branch/worktree lane. |
| `release-commander` agent/skill | Audits lane state, dispatches close/PR/merge work, validates docs/changelog/wiki decisions. |
| `close` skill | Owns the exact close pipeline and the `close:review` versus `close:ship` split. |
| `open` skill | Owns issue orientation and branch/worktree setup expectations. |
| `jma-commit` | Owns selective staging and safe commit discipline. |
| `jma-git-pr-lifecycle` | Owns full gated PR creation, CI loop, and ready-for-review promotion. |
| `jma-commit-push-pr` | Owns the faster commit, push, and PR path when full CI polling is not requested. |
| `archon-ecosystem-sync` | Owns cross-repo workflow/template/instruction propagation. |
| `bookmark` | Saves pause/resume memory without commits, pushes, or repo doc edits. |
| `manager` | Plans, briefs, tracks workstreams, and coordinates agents without writing product code. |
| `github` skill | Uses `gh` for issues, PRs, workflow runs, and API queries. |
| `release-cut` | Planned/release-only path for folding changelog fragments and tagging releases; not a normal PR close step. |
| Release-Admiral | Currently a PR-body marker or independent reviewer concept in role policy, not a repo-local executable agent. |
| Project-Lieutenant | Currently a PR-body marker recognized by role policy, not a repo-local executable agent. |
| Dependabot | GitHub-managed dependency PR author; can be auto-merged by the reusable Dependabot workflow. |
| OpenAI Codex dynamic agent | GitHub lists this as an active dynamic agent workflow for the repo. |

## Part 2: What We Expected To Be Occurring Now

1. The user engages with a new agent for the repo.
   The agent should load applicable skills before acting, then declare the
   session topic if the session workflow is being followed.

2. The session opens.
   `session` and `napkin` expect the agent to read reusable context, check git
   state, inspect recent commits and stashes, and identify open plans. Repo
   scripts such as `npm run agent:prune`, `npm run agent:status`, and
   `npm run wiki:status` are expected only when a repo actually provides them.
   `archon-setup` can now install and audit the repo-template baseline for
   `agent:start-task`, `agent:status`, and `agent:prune`; this repo has not
   adopted those lifecycle commands locally beyond its PR contract wrappers.

3. The lane is selected.
   `open` decides whether this is implementation, planning/docs, quick fix, or
   PRD breakdown. For repo-facing docs, the expected path is still issue,
   branch, worktree, and PR.

4. The issue is created or confirmed.
   Protected docs, code, config, behavior, and policy changes should be tied to
   a real issue. The PR later uses `Closes #<issue>` or `Refs #<issue>` instead
   of a fake issue reference.

5. The branch/worktree is created from fresh `origin/main`.
   The preferred command is `npm run agent:start-task -- <issue> [--agent
   <name>]`. If absent, manual `git fetch` plus `git worktree add -b
   agent/<tool>/<issue>-<slug> <path> origin/main` is the fallback. In the
   broader ecosystem, `archon-setup` can now add the repo-template lifecycle
   baseline to repos that should provide the command.

6. Claims are acquired before editing when the repo requires claims.
   Expected commands are `npm run agent:claim -- --agent <name> --issue
   <ticket> --files <path...>` and `npm run agent:release -- --branch
   <branch>`, or a repo-owned `scripts/agent-claims.mjs`. If no claim system is
   installed, the agent should say that instead of pretending claims exist.

7. The implementing agent edits and verifies.
   Docs, changelog fragments, and policy docs belong in the same PR as the
   behavior or workflow they describe. For doc-only changes, heavy code checks
   may be intentionally skipped, but the PR body should state that honestly.

8. The commit is made with selective staging.
   `jma-commit` owns this step. The expected command shape is explicit file
   staging followed by a conventional commit. Bulk staging is not expected.

9. Release Commander prepares delivery.
   `release-commander` should inspect the active repo, issue, branch, worktree,
   PR, installed workflow callers, branch protection, local dirty state,
   changelog mode, PR template, close-scan support, and claims support before
   mutating or merging anything.

10. Close runs in the correct mode.
    `close:review` means PR ready and no merge. `close:ship` means authorized
    delivery through merge and cleanup. User wording is the authorization
    boundary.

11. Close scan and CI guard run when available.
    Expected commands are `npm run close:scan:complete -- --changelog
    <updated|not-needed> --findings <resolved|none> --notes "<summary>"` and
    `npm run close:ci:guard`. These commands are expected in Pigafetta-style
    repos that provide them; they are not present in this repo right now.

12. The PR is created or updated from the template.
    If a repo-local template exists, use it. If not, the org default template
    from `ArchonVII/.github` applies in GitHub. PR bodies should record exact
    verification commands and results, not generic claims.

13. GitHub Actions enforce the machine gates.
    Expected consumer setup is to require `repo-required-gate / decision` as the
    single branch-protection check, with specialized checks routed underneath.
    Separate callers may also run `pr-policy`, `branch-naming`,
    `semantic-pr-title`, `changelog-fragment`, dependency/security checks,
    stale/lock maintenance, or anomaly workflows.

14. Role separation is enforced according to consumer configuration.
    The expected hard gate, when enabled, is: agent-managed PR plus protected
    paths requires an independent approval or non-author `Release-Admiral`
    marker. In warning-only mode, it only reports concerns.

15. The PR is either handed off or shipped.
    Review handoff stops at ready-for-review. Ship mode waits for required
    checks, fixes failures in the same lane, merges through PR gates, and does
    not push directly to `main`.

16. The final cleanup returns the repo to a clean state.
    Expected final state: local `main` fast-forwarded to `origin/main`, remote
    feature branch deleted, local branch deleted when safe, retired worktree
    removed when clean, claims released, refs pruned, issue/PR settled, and no
    unrelated dirty state touched.

## Part 3: What Is Planned Or Still Needs To Be Made Real

1. Add or adopt repo-owned agent lifecycle commands where this repo is supposed
   to behave like a full Pigafetta-style lane.
   `archon-setup` can install and audit the repo-template baseline for
   `agent:start-task`, `agent:status`, and `agent:prune`, so the remaining
   decision is whether to onboard this repo to that baseline or keep its local
   lifecycle surface limited to PR contract wrappers. Missing locally today:
   `agent:start-task`, `agent:prune`, `agent:status`, `agent:claim`,
   `agent:release`, `close:scan:complete`, `close:ci:guard`, `wiki:status`,
   and `wiki:record`.

2. Decide whether `main` should be mechanically protected in
   `ArchonVII/github-workflows`.
   GitHub currently reports no classic branch protection and no repo rulesets.
   The policy says agents must still avoid direct protected-doc edits on `main`,
   but the repository does not currently enforce that mechanically.

3. Update README and handoff counts.
   `HANDOFF.md` still says this repo has 14 reusable workflows. The current
   repo has 16 reusable workflow files plus direct non-reusable `self-test`.
   README also does not list `actionlint.yml` or explain `self-test.yml` as the
   repo's own direct-trigger test workflow.

4. Add missing example callers or explicitly document why they are absent.
   `examples/` has callers for most reusable workflows, but not for
   `actionlint.yml`. `self-test.yml` is intentionally not reusable and should
   be documented as such rather than treated like a consumer caller.

5. Rationalize duplicated gates.
   There is useful duplication, but it should be deliberate:
   `branch-naming.yml` overlaps with `repo-required-gate` PR contract,
   `actionlint` appears as a standalone reusable workflow and inside
   `pr-policy` / `repo-required-gate`, and `pr-policy` overlaps with
   `repo-required-gate`'s `pr-contract` job.

6. Clarify the role names.
   `Release Commander` is a real skill/agent persona. `Release-Admiral` is
   currently a marker/reviewer concept in role policy. `Project-Lieutenant` is
   currently a PR-body marker used to identify agent-managed PRs. If those are
   intended to be actual agents, they need source-of-truth definitions and
   commands.

7. Finish planned workflow upgrades from `HANDOFF.md`.
   Planned items include `release-drafter.yml`, `release-cut.mjs`,
   `markdown-lint.yml`, `link-check.yml`, wiring Pigafetta to consume `@v1`,
   optional GitHub Actions SHA pinning and Dependabot configuration,
   repo-template convenience callers, and branch-regex polish against
   historical branch samples.

8. Decide how strict evidence enforcement should become.
   `parse-evidence.mjs` already validates checked verification items, but
   `pr-policy.yml` defaults `enforce-evidence` to false. Phase 2-style hard
   enforcement is planned/configurable, not universally active.

9. Decide how strict role separation should become.
   `role-policy.mjs` already supports hard enforcement, but
   `enforce-role-separation` defaults false. Consumers must opt in after they
   are ready for independent approval or `Release-Admiral` marker discipline.

10. Add a Codex hook surface only when one exists.
    Current close guidance says Claude has hooks, while Codex enforcement comes
    from skills, repo git hooks, and explicit commands. Do not copy Claude hook
    assumptions into Codex until there is a real Codex hook runner.

11. Keep release folding separate from normal close.
    Normal implementation PRs should add fragments only when warranted.
    `release-cut` or a future `release-cut.mjs` should fold fragments into
    `CHANGELOG.md`, bump versions, tag releases, and create releases.

12. Planned end state for a fully implemented workflow:
    The user engages a new agent; the agent opens a session; an issue is
    selected; a clean worktree branch is created; files are claimed; the change
    is implemented; docs/changelog/wiki decisions are made in the same lane;
    verification and close-scan pass; the PR body records exact evidence;
    GitHub checks pass; the user authorizes ship; the PR merges through gates;
    local `main` fast-forwards to `origin/main`; remote and local feature
    branches are gone; the clean worktree is removed; claims are released; refs
    are pruned; and main, remote, issue, PR, changelog, wiki/memory, and local
    state are all accounted for.
