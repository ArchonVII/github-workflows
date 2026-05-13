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

const LABELS = [
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

  // Workflow / release
  { name: 'no-changelog', color: 'EDEDED', description: 'Skip the CHANGELOG fragment requirement' },
  { name: 'anomaly', color: 'B60205', description: 'Auto-promoted from .anomalies/ file on merge' },
  { name: 'ignore-for-release', color: 'EDEDED', description: 'Exclude from auto-generated release notes' },
  { name: 'auto-merge', color: '0E8A16', description: 'Eligible for auto-merge once CI is green' },

  // PRD / breakdown (from the `open` skill)
  { name: 'prd', color: '5319E7', description: 'Parent PRD issue — broken into tracer-bullet sub-issues' },
  { name: 'tracer-bullet', color: 'BFD4F2', description: 'Thin vertical slice cutting through all layers' },
  { name: 'needs-triage', color: 'FEF2C0', description: 'Not yet triaged into a bucket' },
];

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

  3. Reusable workflows you want from ArchonVII/github-workflows
     (copy from the examples/ directory of that repo).

  4. Required status checks — set these in repo Settings → Branches
     once you know which workflows you've added (e.g. \`ci-success\`,
     \`policy\`, \`actionlint\`).

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
