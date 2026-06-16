#!/usr/bin/env node
// setup-repo.mjs — apply the standard ArchonVII repo setup to a target repo.
//
// Usage:
//   node scripts/setup-repo.mjs <owner/repo> [--dry-run]
//   node scripts/setup-repo.mjs ArchonVII/new-thing
//   node scripts/setup-repo.mjs ArchonVII/new-thing --dry-run
//
// What it does (idempotent):
//   1. Applies the standard label set (creates missing, updates colors of existing).
//   2. Enables branch protection on the default branch:
//      - require PR before merging
//      - dismiss stale reviews on push
//      - require linear history
//      - disallow force pushes / deletions
//      - require at least 1 approving review (skipped for solo-author repos; see --solo).
//
// What it does NOT do:
//   - Write any files into the repo (CODEOWNERS, dependabot.yml). Those go in
//     via a regular PR — copy from the templates printed at the end.
//   - Add reusable workflow callers — you choose those per repo.
//
// Requires: gh CLI (`gh auth status` must show logged in).

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { LABELS } from './labels.mjs';

const exec = promisify(execFile);

// --- CLI -------------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const positional = args.filter((a) => !a.startsWith('--'));

if (positional.length !== 1 || flag('--help')) {
  console.error('Usage: node scripts/setup-repo.mjs <owner/repo> [--dry-run] [--solo] [--no-protection]');
  process.exit(1);
}

const [target] = positional;
const [owner, repo] = target.split('/');
if (!owner || !repo) {
  console.error(`Expected <owner/repo>, got: ${target}`);
  process.exit(1);
}

const DRY_RUN = flag('--dry-run');
const SOLO = flag('--solo');
const NO_PROTECTION = flag('--no-protection');

// --- Standard label set ----------------------------------------------------

// The canonical label seed set now lives in labels.mjs (imported above) so the
// gate-label audit (gate-labels.test.mjs) can verify it against the labels that
// reusable workflows actually apply/gate on, without importing this CLI script.

// --- gh wrapper ------------------------------------------------------------

async function gh(args, { input } = {}) {
  if (DRY_RUN) {
    console.log(`  [dry-run] gh ${args.join(' ')}${input ? ` <stdin: ${input.length}B>` : ''}`);
    return { stdout: '', stderr: '' };
  }
  try {
    const { stdout, stderr } = await exec('gh', args, { input });
    return { stdout, stderr };
  } catch (err) {
    err.message = `gh ${args.join(' ')}\n  exit ${err.code}\n  ${err.stderr || err.message}`;
    throw err;
  }
}

async function ghJson(args) {
  if (DRY_RUN) {
    console.log(`  [dry-run] gh ${args.join(' ')}`);
    return null;
  }
  const { stdout } = await exec('gh', args);
  return JSON.parse(stdout);
}

// --- Steps -----------------------------------------------------------------

async function checkAuth() {
  try {
    await exec('gh', ['auth', 'status']);
  } catch (err) {
    console.error('gh CLI is not authenticated. Run `gh auth login` first.');
    process.exit(1);
  }
}

async function getDefaultBranch() {
  if (DRY_RUN) return 'main';
  const repoInfo = await ghJson(['api', `repos/${owner}/${repo}`]);
  return repoInfo.default_branch;
}

async function applyLabels() {
  console.log(`\nLabels:`);
  let existing = [];
  if (!DRY_RUN) {
    existing = await ghJson(['api', '--paginate', `repos/${owner}/${repo}/labels`]);
  }
  const byName = new Map(existing.map((l) => [l.name, l]));

  let created = 0;
  let updated = 0;
  let unchanged = 0;

  for (const label of LABELS) {
    const have = byName.get(label.name);
    if (!have) {
      await gh([
        'api', '-X', 'POST', `repos/${owner}/${repo}/labels`,
        '-f', `name=${label.name}`,
        '-f', `color=${label.color}`,
        '-f', `description=${label.description}`,
      ]);
      console.log(`  + ${label.name}`);
      created++;
    } else if (have.color.toUpperCase() !== label.color.toUpperCase() || have.description !== label.description) {
      await gh([
        'api', '-X', 'PATCH', `repos/${owner}/${repo}/labels/${encodeURIComponent(label.name)}`,
        '-f', `color=${label.color}`,
        '-f', `description=${label.description}`,
      ]);
      console.log(`  ~ ${label.name} (color/description updated)`);
      updated++;
    } else {
      unchanged++;
    }
  }
  console.log(`  → ${created} created, ${updated} updated, ${unchanged} unchanged`);
}

async function applyBranchProtection(branch) {
  if (NO_PROTECTION) {
    console.log(`\nBranch protection: skipped (--no-protection)`);
    return;
  }
  console.log(`\nBranch protection on '${branch}':`);

  // Required reviewers: 0 for solo repos (you can't approve your own PR), 1 otherwise.
  const requiredReviewers = SOLO ? 0 : 1;

  const payload = {
    required_status_checks: null, // No required status checks — too repo-specific to hardcode.
    enforce_admins: false, // I want to be able to bypass in true emergencies.
    required_pull_request_reviews: {
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
      required_approving_review_count: requiredReviewers,
    },
    restrictions: null,
    required_linear_history: true,
    allow_force_pushes: false,
    allow_deletions: false,
    required_conversation_resolution: true,
  };

  await gh([
    'api', '-X', 'PUT',
    `repos/${owner}/${repo}/branches/${branch}/protection`,
    '--input', '-',
  ], { input: JSON.stringify(payload) });

  console.log(`  ✓ PR required, ${requiredReviewers} approval${requiredReviewers === 1 ? '' : 's'}, linear history, no force-push, conversations must resolve`);
}

function printFollowUps() {
  console.log(`
─────────────────────────────────────────────────────────────
Repo bootstrap done.

What this script did NOT do (commit these via a regular PR):

  1. .github/CODEOWNERS
     -----------------
     * @${owner}

  2. .github/dependabot.yml
     ---------------------
     version: 2
     updates:
       - package-ecosystem: github-actions
         directory: "/"
         schedule:
           interval: weekly
       # Add per-language ecosystems (npm, pip, cargo, ...) as needed.

  3. Reusable workflows you want from ArchonVII/github-workflows.
     New repos should start with examples/repo-required-gate.yml.

  4. Required status checks — set these in repo Settings → Branches
     after the first PR run reports this exact check:
     \`repo-required-gate / decision\`.

─────────────────────────────────────────────────────────────
`);
}

// --- Main ------------------------------------------------------------------

console.log(`Setting up ${owner}/${repo}${DRY_RUN ? ' (dry-run)' : ''}${SOLO ? ' (solo mode)' : ''}`);

await checkAuth();
const defaultBranch = await getDefaultBranch();
console.log(`Default branch: ${defaultBranch}`);

await applyLabels();
await applyBranchProtection(defaultBranch);

printFollowUps();
