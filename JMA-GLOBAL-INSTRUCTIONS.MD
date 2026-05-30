# JMA Global Instructions Scratchpad

Purpose: collect personal global instructions that should apply across AI agents,
CLIs, repositories, worktrees, and review workflows.

Status: scratchpad. Ideas here can be rough, but decisions should be preserved
and tightened over time.

## Review Friction Reduction

Core rule: whenever an agent presents something for review, asks a question, or
claims work is done, the response must include the concrete handles needed to
inspect it immediately.

Depending on context, include one or more of:

- Full server address, including protocol, host, and port.
  Example: `http://localhost:3000`
- Full file directory address for any local artifact or edited file.
  Example: `C:\GitHub\_worktrees\repo-name-issue-123\docs\plan.md`
- Branch and worktree identity when work happened outside the default checkout.
  Example: branch `agent/codex/123-example`, worktree `C:\GitHub\_worktrees\repo-example`
- Exact command used for verification, plus the result.
  Example: `npm test` passed.
- Clear statement when something was not run, not verified, or needs user review.

The goal is to remove ambiguity between:

- A file in the default checkout.
- A file in an agent worktree.
- A generated artifact.
- A local server that is running now.
- A plan or doc that only exists inside chat.

## Completion Responses

When saying work is done, include:

- What changed.
- Where it changed, using full local paths when relevant.
- How it was verified.
- What is running now, if anything, with the full server URL.
- Any known limits, skipped checks, or follow-up decisions.

Avoid vague completion language without inspection handles.

## Questions To JMA

When asking JMA a question, include the minimum context needed to answer without
searching:

- The file, folder, branch, worktree, server, PR, or issue being discussed.
- The exact decision needed.
- The recommended default when one exists.
- The consequence of choosing the default.

Questions should be concise and direct.

## Markdown Plan Viewer

Need a low-friction way to view markdown files presented by agents without
opening a browser or Notepad.

Desired behavior:

- Borderless windowed popup.
- Renders markdown cleanly.
- Shows only the plan or document content by default.
- Opens from a full local file path supplied by the agent.
- Later supports lightweight editing.
- Should not depend on manually hunting for the file in a worktree.

Open design questions:

- Should this be a small local app, CLI command, VS Code task, PowerShell helper,
  or tray-style utility?
- Should it watch the markdown file for live updates?
- Should edit mode write directly to the source file or create proposed edits?
- Should agents be required to invoke it automatically, or only provide the
  command/address for JMA to open it?

## Decision Log

- 2026-05-30: Create a repo-visible global instruction scratchpad named
  `JMA-GLOBAL-INSTRUCTIONS.MD` in the `github-workflows` repo.
- 2026-05-30: First topic is reducing friction between agent output and JMA
  review by requiring concrete inspection handles.
- 2026-05-30: Track this repo-facing doc change through
  `ArchonVII/github-workflows#30` on branch
  `agent/codex/30-global-instructions-scratchpad`.
