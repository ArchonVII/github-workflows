// gate-labels.mjs — audit that every GitHub label a reusable workflow applies or
// gates on is present in the canonical seed set (labels.mjs).
//
// Why: workflows declare their label dependency through `*-label` / `*-labels`
// inputs (e.g. repo-required-gate's `force-full-ci-label: ci:full`,
// changelog-fragment's `opt-out-label: no-changelog`). If such a label is never
// seeded, `gh ... --label X` and label-gated jobs fail on that repo. The audit
// FAILS on a referenced-but-unseeded label; it only REPORTS unreferenced seed
// labels (many are valid manual/triage labels with no gate that parses them).
// Source: forensic analysis of session 019eccc1 (F1) + owner refinement 4.

// Inputs whose name ends in -label(s) but whose value is NOT a label name.
const IGNORE_INPUTS = new Set(['sync-labels']); // labeler on/off toggle, not a label

const LABEL_INPUT_RE = /^(\s*)([a-z0-9][a-z0-9-]*-labels?):\s*$/i;
const DEFAULT_RE = /^\s*default:\s*(.+?)\s*$/;

/**
 * Extract label names declared as defaults of `*-label` / `*-labels` workflow
 * inputs. Singular inputs yield one name; plural inputs are comma-split.
 * Skips the ignore set, booleans, empty defaults, and `${{ }}` expressions.
 *
 * @param {string} workflowText Raw YAML of a workflow file.
 * @returns {string[]} referenced label names (may contain duplicates)
 */
export function extractLabelInputDefaults(workflowText) {
  const lines = String(workflowText || '').split(/\r?\n/);
  const found = [];

  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(LABEL_INPUT_RE);
    if (!m) continue;
    const [, indent, inputName] = m;
    if (IGNORE_INPUTS.has(inputName)) continue;
    const plural = inputName.endsWith('-labels');

    for (let j = i + 1; j < lines.length; j++) {
      const line = lines[j];
      if (line.trim() === '') continue;
      const lineIndent = (line.match(/^(\s*)/)[1] || '').length;
      if (lineIndent <= indent.length) break; // left this input's block

      const d = line.match(DEFAULT_RE);
      if (!d) continue;
      const val = d[1].replace(/^["']|["']$/g, '').trim();
      if (!val || val === 'true' || val === 'false' || val.startsWith('${{')) break;
      const names = plural ? val.split(',').map((s) => s.trim()).filter(Boolean) : [val];
      found.push(...names);
      break;
    }
  }

  return found;
}

/**
 * Compare the set of gate-referenced labels against the seed set.
 *
 * @param {Iterable<string>} referenced Labels referenced by gates.
 * @param {Iterable<string>} seed Seeded label names.
 * @returns {{missing: string[], unreferenced: string[]}}
 *   missing      = referenced but NOT seeded (a real gap — fail).
 *   unreferenced = seeded but not gate-referenced (informational only).
 */
export function auditGateLabels(referenced, seed) {
  const seedSet = seed instanceof Set ? seed : new Set(seed);
  const refSet = referenced instanceof Set ? referenced : new Set(referenced);
  const missing = [...refSet].filter((name) => !seedSet.has(name)).sort();
  const unreferenced = [...seedSet].filter((name) => !refSet.has(name)).sort();
  return { missing, unreferenced };
}
