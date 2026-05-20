// Pure ES-module parser for F2 + F10 verification evidence blocks.
//
// Contract (per ArchonVII/github-workflows#10 / #12 amendment 2026-05-19):
//   Each checked verification item `- [x] <claim>` must be followed by exactly
//   one fenced block labelled ```evidence ... ``` with flat YAML-style keys:
//     command:   string (required)
//     location:  ci | local | manual (required)
//     result:    string (required)
//     timestamp: ISO-8601 string (required)
//     check:     string (optional; for ci rows when command name != check-run name)
//
// This module is intentionally pure: it accepts already-fetched PR data via
// its function signature and performs no network or SDK calls. SDK access
// happens in the workflow caller (actions/github-script) which then passes
// results into parseEvidence().
//
// No external dependencies — uses only Node stdlib. The evidence block is
// small and flat, so a hand-rolled key:value parser is sufficient and avoids
// pulling in a YAML dependency.

// Allow-list of plausible executable tokens for `location: local` commands.
// Whole-word, case-insensitive matching. Source: amendment 2026-05-19, B4.
const LOCAL_TOKENS = [
  'npm', 'pnpm', 'yarn', 'pytest', 'uv', 'python', 'node', 'gh', 'git',
  'npx', 'actionlint', 'tsc', 'eslint', 'ruff', 'cargo', 'go', 'make',
  'bash', 'pwsh', 'deno', 'vitest',
  // Shell utility tokens — added 2026-05-20 per PR #19 review patch 1.
  // Guards against dogfood regression where a `grep` evidence row would
  // hard-fail under enforce mode.
  'grep', 'awk', 'sed', 'jq',
];

const VALID_LOCATIONS = new Set(['ci', 'local', 'manual']);

// 5-minute clock-skew tolerance in milliseconds. Source: amendment C2/C3.
const SKEW_MS = 5 * 60 * 1000;

/**
 * Parse the PR body and validate every checked verification claim.
 *
 * @param {string} prBody
 * @param {object} ctx
 * @param {string} ctx.headCommitTime - ISO timestamp of PR head commit.
 * @param {string} ctx.now            - ISO timestamp injected for determinism.
 * @param {Array<{name:string, completed_at:string, conclusion:string}>} ctx.checkRuns
 * @returns {{ok: boolean, warnings: string[], errors: string[]}}
 */
export function parseEvidence(prBody, { headCommitTime, now, checkRuns }) {
  const warnings = [];
  const errors = [];

  const headMs = Date.parse(headCommitTime);
  const nowMs = Date.parse(now);

  const lines = (prBody || '').split(/\r?\n/);

  // Walk lines, collecting `- [x] ...` and `- [ ] ...` items and the
  // (optional) immediately-following ```evidence``` block.
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(/^\s*-\s+\[([ xX])\]\s+(.*)$/);
    if (!m) continue;

    const checked = m[1].toLowerCase() === 'x';
    const claim = m[2].trim();

    // Look ahead for an `evidence` fenced block, skipping blank lines.
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j++;

    const fenceOpen = j < lines.length
      ? lines[j].match(/^\s*```\s*evidence\s*$/i)
      : null;

    if (!checked) {
      if (fenceOpen) {
        warnings.push(`Unchecked item has an evidence block (ignored): "${claim}"`);
      } else {
        warnings.push(`Unchecked verification item (no evidence required): "${claim}"`);
      }
      continue;
    }

    if (!fenceOpen) {
      errors.push(`Checked item "${claim}" is missing a fenced \`\`\`evidence\`\`\` block.`);
      continue;
    }

    // Find the closing fence.
    let k = j + 1;
    while (k < lines.length && !/^\s*```\s*$/.test(lines[k])) k++;
    if (k >= lines.length) {
      errors.push(`Checked item "${claim}" has an unterminated evidence block.`);
      continue;
    }

    const blockLines = lines.slice(j + 1, k);

    // Detect a second evidence block under the same item (illegal).
    let n = k + 1;
    while (n < lines.length && lines[n].trim() === '') n++;
    if (n < lines.length && /^\s*```\s*evidence\s*$/i.test(lines[n])) {
      errors.push(`Checked item "${claim}" has more than one evidence block.`);
      // Skip ahead past the second block to avoid double-reporting.
      let p = n + 1;
      while (p < lines.length && !/^\s*```\s*$/.test(lines[p])) p++;
      i = p;
      continue;
    }

    const parsed = parseFlatYaml(blockLines);
    if (parsed.error) {
      errors.push(`Evidence block for "${claim}" is malformed: ${parsed.error}`);
      i = k;
      continue;
    }

    validateEvidence(claim, parsed.data, { headMs, nowMs, checkRuns }, errors, warnings);
    i = k;
  }

  return { ok: errors.length === 0, warnings, errors };
}

// Hand-rolled flat YAML parser for the evidence block.
// Accepts: `key: value` per line. Quoted values (single/double) are unquoted.
// Comments (`# ...`) and blank lines are ignored. Indentation is ignored.
// Anything else is a syntax error.
function parseFlatYaml(blockLines) {
  const data = {};
  for (const raw of blockLines) {
    const line = raw.replace(/\s+$/, '');
    if (line.trim() === '') continue;
    if (/^\s*#/.test(line)) continue;
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_-]*)\s*:\s*(.*)$/);
    if (!m) {
      return { error: `unparseable line: ${JSON.stringify(line)}` };
    }
    let value = m[2].trim();
    // Strip a trailing comment if not inside quotes.
    if (value.startsWith('"') || value.startsWith("'")) {
      const q = value[0];
      const end = value.indexOf(q, 1);
      if (end === -1) {
        return { error: `unterminated string for key "${m[1]}"` };
      }
      value = value.slice(1, end);
    }
    if (value === '') {
      return { error: `empty value for key "${m[1]}"` };
    }
    data[m[1]] = value;
  }
  return { data };
}

function validateEvidence(claim, ev, { headMs, nowMs, checkRuns }, errors, warnings) {
  const requiredKeys = ['command', 'location', 'result', 'timestamp'];
  for (const key of requiredKeys) {
    if (!(key in ev)) {
      errors.push(`Evidence for "${claim}" missing required key: ${key}`);
      return;
    }
  }

  const { command, location, timestamp } = ev;

  if (!VALID_LOCATIONS.has(location)) {
    errors.push(`Evidence for "${claim}" has unknown location "${location}" (allowed: ci, local, manual).`);
    return;
  }

  // Timestamp parse (always required; even ci uses prose timestamp for drift check).
  const tsMs = Date.parse(timestamp);
  if (Number.isNaN(tsMs)) {
    errors.push(`Evidence for "${claim}" has invalid ISO-8601 timestamp: ${JSON.stringify(timestamp)}`);
    return;
  }

  // Future-stamp guard applies to all locations.
  if (tsMs > nowMs + SKEW_MS) {
    errors.push(`Evidence for "${claim}" has a future timestamp (${timestamp}).`);
    return;
  }

  if (location === 'local') {
    if (!hasLocalToken(command)) {
      errors.push(
        `Evidence for "${claim}" has location=local but command "${command}" contains no recognised executable token (${LOCAL_TOKENS.join(', ')}).`,
      );
      return;
    }
    if (tsMs < headMs - SKEW_MS) {
      errors.push(`Evidence for "${claim}" predates PR head commit (timestamp ${timestamp} < head ${new Date(headMs).toISOString()}).`);
      return;
    }
  } else if (location === 'manual') {
    // Manual evidence has no token requirement; still must be post-head.
    if (tsMs < headMs - SKEW_MS) {
      errors.push(`Evidence for "${claim}" predates PR head commit (timestamp ${timestamp} < head ${new Date(headMs).toISOString()}).`);
      return;
    }
  } else if (location === 'ci') {
    const wanted = ev.check || command;
    const run = (checkRuns || []).find((r) => r.name === wanted);
    if (!run) {
      errors.push(`Evidence for "${claim}" references CI check "${wanted}" which is not a check-run on the PR head SHA.`);
      return;
    }
    if (run.conclusion !== 'success') {
      errors.push(`Evidence for "${claim}" references CI check "${wanted}" with conclusion "${run.conclusion}" (expected success).`);
      return;
    }
    // CI authority: ignore prose timestamp for correctness, but warn on drift.
    const completedMs = Date.parse(run.completed_at);
    if (!Number.isNaN(completedMs) && Math.abs(tsMs - completedMs) > SKEW_MS) {
      warnings.push(
        `Evidence for "${claim}" prose timestamp drifts >5min from check-run completed_at (${timestamp} vs ${run.completed_at}).`,
      );
    }
  }
}

function hasLocalToken(command) {
  const lc = command.toLowerCase();
  return LOCAL_TOKENS.some((tok) => {
    // Whole-word match: token is bordered by non-word chars or string ends.
    const re = new RegExp(`(^|[^a-z0-9_])${escapeRegex(tok)}([^a-z0-9_]|$)`);
    return re.test(lc);
  });
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
