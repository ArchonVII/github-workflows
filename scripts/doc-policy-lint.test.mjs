import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { lintDocPolicy } from './doc-policy-lint.mjs';

const roots = [];

const makeRepo = () => {
  const root = mkdtempSync(join(tmpdir(), 'doc-policy-lint-'));
  roots.push(root);
  return root;
};

const write = (root, path, body) => {
  const target = join(root, path);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, body, 'utf8');
};

const statusHeader = ({
  status = 'active',
  owner = 'agent',
  scope = 'repo-local',
  sourceOfTruth = 'no - see docs/INDEX.md',
  lastReviewed = '2026-06-15',
  supersedes = 'none',
  supersededBy = 'none',
} = {}) => [
  `> **Status:** ${status}`,
  `> **Owner:** ${owner}`,
  `> **Scope:** ${scope}`,
  `> **Source of truth:** ${sourceOfTruth}`,
  `> **Last reviewed:** ${lastReviewed}`,
  `> **Supersedes:** ${supersedes}`,
  `> **Superseded by:** ${supersededBy}`,
  '',
].join('\n');

afterEach(() => {
  while (roots.length > 0) {
    rmSync(roots.pop(), { recursive: true, force: true });
  }
});

describe('lintDocPolicy', () => {
  it('reports no findings for a headered, indexed, budget-compliant repo', () => {
    const repo = makeRepo();

    write(repo, 'README.md', '# Fixture\n');
    write(repo, 'AGENTS.md', '# Agents\n');
    write(repo, 'CLAUDE.md', '# Claude\n');
    write(repo, 'GEMINI.md', '# Gemini\n');
    write(repo, 'VISION.md', `${statusHeader({ sourceOfTruth: 'yes' })}# Vision\n`);
    write(
      repo,
      'docs/INDEX.md',
      `${statusHeader()}# Docs\n\n- [Policy](agent-process/policy.md)\n- [ADR 0001](adr/0001-record.md)\n`,
    );
    write(repo, 'docs/agent-process/policy.md', `${statusHeader()}# Policy\n`);
    write(repo, 'docs/adr/README.md', '# ADRs\n\n- [0001](0001-record.md)\n');
    write(repo, 'docs/adr/0001-record.md', '# 0001 Record\n');

    const result = lintDocPolicy({ repoRoot: repo });

    expect(result.ok).toBe(true);
    expect(result.findings).toEqual([]);
  });

  it('ignores the checked-out helper repository used by the reusable workflow', () => {
    const repo = makeRepo();

    write(repo, 'README.md', '# Fixture\n');
    write(
      repo,
      'docs/INDEX.md',
      `${statusHeader()}# Docs\n\n- [Policy](agent-process/policy.md)\n`,
    );
    write(repo, 'docs/agent-process/policy.md', `${statusHeader()}# Policy\n`);
    write(repo, '__github-workflows__/docs/unindexed.md', '# Provider helper doc\n\nTODO\n');

    const result = lintDocPolicy({ repoRoot: repo });

    expect(result.findings).toEqual([]);
  });

  it('emits warning-only findings for doc-policy violations including the 8.2 signals', () => {
    const repo = makeRepo();

    write(repo, 'README.md', Array.from({ length: 151 }, (_, i) => `line ${i}`).join('\n'));
    write(
      repo,
      'docs/INDEX.md',
      `${statusHeader()}# Docs\n\n- [Register](current-truth.md)\n- [Superseded](superseded.md)\n`,
    );
    write(repo, 'docs/guide.md', '# Guide without status header\n');
    write(repo, 'docs/current-truth.md', `${statusHeader({ sourceOfTruth: 'yes' })}# Current Truth\n`);
    write(repo, 'docs/nearby.md', `${statusHeader()}# Nearby\n\nPending migration #42 remains.\n`);
    write(repo, 'docs/active.md', `${statusHeader()}# Active\n\nTODO: replace this.\n`);
    write(
      repo,
      'docs/superseded.md',
      `${statusHeader({ supersededBy: 'missing-replacement.md' })}# Superseded\n`,
    );

    const result = lintDocPolicy({
      repoRoot: repo,
      changedFiles: ['docs/current-truth.md'],
    });

    expect(result.ok).toBe(true);
    expect(new Set(result.findings.map((finding) => finding.code))).toEqual(new Set([
      'active_placeholder',
      'charter_budget',
      'dangling_superseded_by',
      'index_coherence',
      'missing_status_header',
      'stale_active_doc_term',
    ]));
  });
});

describe('doc-policy-lint CLI integration', () => {
  it('prints warnings and exits zero for warn-path findings', () => {
    const repo = makeRepo();
    const summary = join(repo, 'summary.md');
    const scriptPath = fileURLToPath(new URL('./doc-policy-lint.mjs', import.meta.url));

    write(repo, 'README.md', '# Fixture\n');
    write(repo, 'docs/INDEX.md', `${statusHeader()}# Docs\n`);
    write(repo, 'docs/current-truth.md', `${statusHeader({ sourceOfTruth: 'yes' })}# Current Truth\n`);
    write(repo, 'docs/nearby.md', `${statusHeader()}# Nearby\n\nBlocked by issue #70.\n`);

    const run = spawnSync(process.execPath, [
      scriptPath,
      '--repo',
      repo,
      '--changed-file',
      'docs/current-truth.md',
      '--github-annotations',
      '--summary',
      summary,
    ], { encoding: 'utf8' });

    expect(run.status).toBe(0);
    expect(run.stdout).toContain('::warning');
    expect(readFileSync(summary, 'utf8')).toContain('warning-only');
  });
});
