import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LABEL_NAMES } from './labels.mjs';
import { auditGateLabels, extractLabelInputDefaults } from './gate-labels.mjs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const workflowsDir = join(repoRoot, '.github', 'workflows');

function referencedGateLabels() {
  const names = new Set();
  for (const file of readdirSync(workflowsDir)) {
    if (!/\.ya?ml$/.test(file)) continue;
    const text = readFileSync(join(workflowsDir, file), 'utf8');
    for (const name of extractLabelInputDefaults(text)) names.add(name);
  }
  return names;
}

describe('gate-label audit (live workflows vs. seed set)', () => {
  const referenced = referencedGateLabels();

  it('statically collects the labels workflows depend on', () => {
    // Sanity: the scanner finds the labels we know gates apply/gate on.
    for (const name of ['ci:full', 'no-changelog', 'anomaly', 'doc-orphan', 'auto-triaged']) {
      expect(referenced.has(name)).toBe(true);
    }
  });

  it('seeds every gate-referenced label (referenced-but-unseeded is a hard failure)', () => {
    const { missing } = auditGateLabels(referenced, LABEL_NAMES);
    expect(missing).toEqual([]);
  });

  it('treats unreferenced seed labels as informational, not a failure', () => {
    const { unreferenced } = auditGateLabels(referenced, LABEL_NAMES);
    expect(Array.isArray(unreferenced)).toBe(true);
    if (unreferenced.length > 0) {
      // eslint-disable-next-line no-console
      console.info(
        `[gate-label audit] ${unreferenced.length} seed labels are not gate-referenced (informational): ${unreferenced.join(', ')}`,
      );
    }
  });
});

describe('extractLabelInputDefaults', () => {
  it('reads a singular *-label input default', () => {
    const yml = ['inputs:', '  opt-out-label:', '    type: string', '    default: "no-changelog"'].join('\n');
    expect(extractLabelInputDefaults(yml)).toEqual(['no-changelog']);
  });

  it('splits a plural *-labels input default on commas', () => {
    const yml = ['  exempt-pr-labels:', '    default: "pinned,wip,blocked"'].join('\n');
    expect(extractLabelInputDefaults(yml)).toEqual(['pinned', 'wip', 'blocked']);
  });

  it('ignores the sync-labels toggle, booleans, and ${{ }} expressions', () => {
    const yml = [
      '  sync-labels:',
      '    default: false',
      '  some-label:',
      '    default: ${{ inputs.x }}',
    ].join('\n');
    expect(extractLabelInputDefaults(yml)).toEqual([]);
  });

  it('intentionally ignores inline (flow-style) label inputs (block-style only)', () => {
    // Documents the LABEL_INPUT_RE scope: a single-line `key: value` is not scanned.
    // All live workflow label inputs are block-style; revisit if that ever changes.
    expect(extractLabelInputDefaults('  force-full-ci-label: ci:full')).toEqual([]);
  });
});
