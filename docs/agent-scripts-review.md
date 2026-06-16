# steipete/agent-scripts Integration Review

This is a review of the scripts published in
[`steipete/agent-scripts`](https://github.com/steipete/agent-scripts) against the
ArchonVII automation layer, requested in issue #85. For each upstream script it
records what the script does, whether the ArchonVII OS already has an equivalent,
and whether adopting or adapting it is worthwhile. It also records the
source-of-truth boundary that any adoption would have to respect.

This is an assessment, not an integration. Nothing here is wired in yet; the
"Recommendation" lines call out the small number of items worth a follow-up
issue and where that work would land.

## How `agent-scripts` is shaped

`agent-scripts` is one person's local workspace contract. It bundles three
things that ArchonVII keeps in separate repos:

- **Shared agent rules** in a single `AGENTS.MD` that downstream repos point at
  with a one-line `READ ~/Projects/agent-scripts/AGENTS.MD` pointer. ArchonVII
  instead ships a full self-contained `AGENTS.md` per repo (this repo's is the
  cross-tool contract) and propagates it through `repo-template` +
  `archon-setup`, so there is no pointer indirection.
- **Skills** under `skills/<name>/SKILL.md`, a routing layer for Codex/Claude.
  ArchonVII has no skills/ routing layer in this repo.
- **Dependency-light helper scripts** under `scripts/`. These are the subject of
  issue #85 and are reviewed individually below.

Two structural differences matter for any adoption:

1. **Runtime conventions diverge.** `agent-scripts` mixes Bash, Ruby, and
   Bun/`tsx`/`ts-node` TypeScript, plus `uv`-run Python with inline dependency
   blocks. The ArchonVII convention in this repo is zero-dependency Node
   (`scripts/*.mjs`, run by `node`) plus POSIX Bash for git hooks. Anything
   adopted should be reimplemented to that convention, not copied byte-identical.
2. **Source-of-truth boundaries.** Per this repo's `AGENTS.md`,
   `github-workflows` owns reusable workflow bodies and PR/gate helpers.
   Generated-repo agent lifecycle scripts and git hooks are owned by
   `repo-template` and distributed through `archon-setup`. A commit/lifecycle
   helper therefore belongs in `repo-template`, not here, even though this repo
   carries local copies of some `scripts/agent/**` helpers.

## Per-script review

### `committer` (Bash) — relevant

Stages exactly the files passed on the command line and commits them with a
required, non-empty message. Concretely it: rejects an empty message; rejects a
first argument that looks like a file path (message-first guard); rejects `.`
as a path; clears the index (`git restore --staged :/`) before staging only the
listed paths; refuses to commit when nothing was staged; supports staging
deletions; and with `--force` removes a stale `index.lock` and retries.

This maps directly onto an existing, repeatedly stated ArchonVII rule. This
repo's `AGENTS.md` "Commit hygiene" section says: "Stage specific files:
`git add <path> <path>`. Never `git add -A` or `git add .` — that's how `.env`
files get committed" and "One logical unit per commit." Today that rule is
enforced only by instruction plus the checkout-role `.githooks/pre-commit`
guard; there is no helper that makes the safe path the easy path. `committer`
is essentially an executable version of that rule.

Caveats before adoption:

- It runs `git add -A -- "${files[@]}"`. Scoped to explicit pathspecs this is
  safe (the `-A` only applies within the listed paths, which is what lets it
  stage deletions), but the helper's whole value is the guardrails around that
  line, so it must be adopted whole, not paraphrased.
- The `--force` stale-lock removal is a foot-gun if used blindly; it should stay
  opt-in.
- It is Bash. That is fine for a git helper (we already ship Bash hooks), but it
  would need the same care for cross-platform agents that the existing
  `.githooks` scripts get.

Recommendation: worth a follow-up issue, but **filed against `repo-template`**,
not this repo, because it is a generated-repo lifecycle helper. It would then
reach consumers via `archon-setup`. Keep it opt-in alongside the existing
`scripts/agent/*` helpers rather than replacing the checkout-role hook, which
serves a different purpose (branch-role enforcement, not staging discipline).

### `validate-skills` (Ruby) — not applicable

Validates every `skills/*/SKILL.md`: front matter parses as a YAML mapping and
carries non-empty `name`/`description`, with duplicate-name detection.

ArchonVII has no `skills/` routing layer in this repo, so there is nothing to
validate. The closest existing capability is structured-markdown linting via
`scripts/doc-policy-lint.mjs` (status headers, charter budgets, supersession
links), surfaced by the warning-only `doc-policy-lint.yml` workflow. That covers
the analogous need (front-matter/header discipline for durable docs) in
zero-dep Node, without adding a Ruby runtime dependency.

Recommendation: do not adopt. If a skills layer is ever introduced to the OS,
re-implement this validation in Node to match `doc-policy-lint.mjs`, not in Ruby.

### `docs-list.ts` (Bun/`tsx`) — low priority

Walks `docs/`, reads `summary` and `read_when` front matter, and prints an
onboarding summary with "read when" hints, nudging agents to read the relevant
doc before coding.

The intent — give an agent a fast, machine-readable map of the docs — already
exists in the OS in a different form: the managed "Agent Start Map" block in
`AGENTS.md` and the `.agent/check-map.yml` path-to-check map. Those are
curated rather than generated, but they serve the same "start here" purpose.
The front-matter convention also differs: ArchonVII durable docs use prose/YAML
status headers (`status`, `owner`, `scope`, `source of truth`, `last reviewed`)
checked by `doc-policy-lint.mjs`, not `summary`/`read_when`. Adopting this as-is
would introduce a second, conflicting front-matter schema plus a Bun/`tsx`
dependency.

Recommendation: do not adopt as-is. The one transferable idea — generating a
`docs/INDEX.md` from existing headers instead of hand-maintaining the index —
could be a future zero-dep Node enhancement to `doc-policy-lint.mjs`, which
already knows how to parse our headers and already flags a missing
`docs/INDEX.md`. Track separately only if index drift becomes a real problem.

### `trash.ts` (TypeScript) — out of scope

A library that moves paths to the OS trash (`~/.Trash` on macOS, the XDG trash
dir on Linux) instead of `rm`, with collision-safe destination names.

This is a local-developer-machine convenience. It has no role in a CI/reusable-
workflow provider and is OS-specific.

Recommendation: do not adopt.

### `browser-tools.ts` (TypeScript) — out of scope

A standalone Chrome DevTools Protocol CLI (`nav`, `eval`, `screenshot`,
`console`, `network`, …) for driving a browser without an MCP server. Useful for
web-app development, irrelevant to a workflows/governance repo, and pulls in
`commander` plus a TypeScript runtime.

Recommendation: do not adopt.

### `nanobanana` (Python/`uv`) — out of scope

Image editing via the Gemini "Nano Banana" API; requires `GEMINI_API_KEY`,
`google-genai`, and `Pillow`. A personal media utility with no CI/governance
relevance.

Recommendation: do not adopt.

### `shazam-song` (Python/`uv`) — out of scope

Identifies songs from audio files via the Shazam API (`shazamio`). A personal
media utility with no CI/governance relevance.

Recommendation: do not adopt.

## Summary table

| Upstream script | ArchonVII analog | Verdict |
| --- | --- | --- |
| `committer` | `AGENTS.md` commit-hygiene rule + checkout-role `.githooks/pre-commit`; no executable helper | Adopt (in `repo-template`, opt-in) |
| `validate-skills` | `scripts/doc-policy-lint.mjs` (different domain) | Not applicable — no skills layer |
| `docs-list.ts` | `AGENTS.md` Start Map + `.agent/check-map.yml` + `doc-policy-lint.mjs` | Low priority — idea only, not the code |
| `trash.ts` | none needed | Out of scope |
| `browser-tools.ts` | none needed | Out of scope |
| `nanobanana` | none needed | Out of scope |
| `shazam-song` | none needed | Out of scope |

## Net recommendation

Only one upstream script earns follow-up: `committer`, as an opt-in
generated-repo helper owned by `repo-template` and distributed via
`archon-setup`, because it makes the OS's existing "stage explicit files, never
`git add -A`/`.`" rule executable. Everything else is either already covered by
existing OS capabilities in a more convention-consistent form
(`validate-skills`, `docs-list.ts`) or out of scope for a workflows/governance
repo (`trash.ts`, `browser-tools.ts`, `nanobanana`, `shazam-song`). No hooks,
actions, or docs in this repo are good candidates to be replaced by these
scripts.
