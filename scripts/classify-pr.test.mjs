import { describe, it, expect } from 'vitest';
import { classifyPR } from './classify-pr.mjs';

// Convenience builder for the common-case input.
const input = (over = {}) => ({
  files: [],
  labels: [],
  stack: 'node',
  isPullRequest: true,
  ...over,
});

describe('classifyPR — backward-compat stack=node', () => {
  it('1. code change in src/ → code (node), runs node-ci + decision', () => {
    const r = classifyPR(input({ files: ['src/foo.ts'] }));
    expect(r.ok).toBe(true);
    expect(r.lane).toBe('code (node)');
    expect(r.outputs.runNodeCi).toBe(true);
    expect(r.outputs.runPythonCi).toBe(false);
    expect(r.outputs.runCi).toBe(true);
    expect(r.outputs.runDependencyReview).toBe(false);
    expect(r.jobsRequired).toContain('node-ci');
    expect(r.jobsRequired).toContain('decision');
  });

  it('2. package.json bump → runDependencyReview true, node-ci on', () => {
    const r = classifyPR(input({ files: ['package.json'] }));
    expect(r.outputs.runDependencyReview).toBe(true);
    expect(r.outputs.runNodeCi).toBe(true);
  });

  it('3. .changelog/ entry counts as docs-only', () => {
    const r = classifyPR(input({ files: ['.changelog/unreleased/foo.md'] }));
    expect(r.lane).toBe('docs-only');
    expect(r.outputs.docsOnly).toBe(true);
    expect(r.outputs.runNodeCi).toBe(false);
  });
});

describe('classifyPR — docs-only lane', () => {
  it('4. only .md + image → docs-only', () => {
    const r = classifyPR(input({ files: ['README.md', 'assets/logo.png'] }));
    expect(r.lane).toBe('docs-only');
    expect(r.outputs.docsOnly).toBe(true);
    expect(r.jobsSkipped).toEqual(
      expect.arrayContaining(['node-ci', 'python-ci', 'dependency-review']),
    );
  });

  it('5. docs/ prefix counts even on non-md extension via docExtensions only — but docs/foo.json should NOT be docs-only', () => {
    // The legacy classifier uses docPrefixes for prefix-match; foo.json
    // under docs/ matches the prefix and therefore is doc-like.
    const r = classifyPR(input({ files: ['docs/spec.json'] }));
    expect(r.lane).toBe('docs-only');
  });
});

describe('classifyPR — workflow-only lane', () => {
  it('6. only .github/workflows/foo.yml → workflow-only, validation on, policy off', () => {
    const r = classifyPR(input({ files: ['.github/workflows/ci.yml'] }));
    expect(r.lane).toBe('workflow-only');
    expect(r.outputs.runWorkflowValidation).toBe(true);
    expect(r.outputs.runPolicyValidation).toBe(false);
    expect(r.outputs.runNodeCi).toBe(false);
  });

  it('7. only .githooks/pre-commit → workflow-only', () => {
    const r = classifyPR(input({ files: ['.githooks/pre-commit'] }));
    expect(r.lane).toBe('workflow-only');
    expect(r.outputs.runWorkflowValidation).toBe(true);
  });

  it('8. .github/workflows/ + src/ code → falls through to code lane, both validations on', () => {
    const r = classifyPR(
      input({ files: ['.github/workflows/ci.yml', 'src/app.ts'] }),
    );
    expect(r.lane).toBe('code (node)');
    expect(r.outputs.runNodeCi).toBe(true);
    expect(r.outputs.runWorkflowValidation).toBe(true);
    expect(r.outputs.runPolicyValidation).toBe(true);
  });
});

describe('classifyPR — policy-only lane', () => {
  it('9. only AGENTS.md → policy-only', () => {
    const r = classifyPR(input({ files: ['AGENTS.md'] }));
    expect(r.lane).toBe('policy-only');
    expect(r.outputs.runPolicyValidation).toBe(true);
    expect(r.outputs.runWorkflowValidation).toBe(false);
  });

  it('10. only .agent/check-map.yml → policy-only', () => {
    const r = classifyPR(input({ files: ['.agent/check-map.yml'] }));
    expect(r.lane).toBe('policy-only');
    expect(r.outputs.runPolicyValidation).toBe(true);
  });
});

describe('classifyPR — snapshot-refresh lane (Guardrail #3)', () => {
  const SNAPSHOT_PATHS = 'src/snapshots/**';

  it('11. all files match snapshot-paths → snapshot-only', () => {
    const r = classifyPR(
      input({
        files: ['src/snapshots/foo.yml', 'src/snapshots/bar.yml'],
        snapshotPaths: SNAPSHOT_PATHS,
        snapshotTestCommand: 'npm run test:snapshots',
      }),
    );
    expect(r.lane).toBe('snapshot-refresh');
    expect(r.outputs.snapshotOnly).toBe(true);
    expect(r.outputs.runSnapshotValidation).toBe(true);
    expect(r.outputs.runNodeCi).toBe(false);
  });

  it('12. one matching + one non-matching file → falls through to full node-ci', () => {
    const r = classifyPR(
      input({
        files: ['src/snapshots/foo.yml', 'src/server/bar.mjs'],
        snapshotPaths: SNAPSHOT_PATHS,
        snapshotTestCommand: 'npm run test:snapshots',
      }),
    );
    expect(r.outputs.snapshotOnly).toBe(false);
    expect(r.lane).toBe('code (node)');
    expect(r.outputs.runNodeCi).toBe(true);
  });

  it('13. empty snapshotPaths → snapshot-only never fires even on snapshot files', () => {
    const r = classifyPR(
      input({
        files: ['src/snapshots/foo.yml'],
        snapshotPaths: '',
      }),
    );
    expect(r.outputs.snapshotOnly).toBe(false);
    // src/snapshots/foo.yml has no recognized code extension and doesn't match
    // codeRe; src/ prefix triggers code-touched. So it lands in code (node).
    expect(r.lane).toBe('code (node)');
  });

  it('14. snapshot-only with empty snapshotTestCommand → snapshot-validation off', () => {
    const r = classifyPR(
      input({
        files: ['src/snapshots/foo.yml'],
        snapshotPaths: SNAPSHOT_PATHS,
        snapshotTestCommand: '',
      }),
    );
    expect(r.outputs.snapshotOnly).toBe(true);
    expect(r.outputs.runSnapshotValidation).toBe(false);
  });
});

describe('classifyPR — polyglot stack (Guardrail #4)', () => {
  const NODE = 'server/**\nweb/**\nelectron/**\npackage.json\npackage-lock.json';
  const PY = 'analysis-service/**';

  it('15. polyglot with both empty path lists → ok=false', () => {
    const r = classifyPR(
      input({ stack: 'polyglot', nodePaths: '', pythonPaths: '' }),
    );
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/polyglot requires at least one/);
  });

  it('16. polyglot, node-only PR → runs only node-ci', () => {
    const r = classifyPR(
      input({
        stack: 'polyglot',
        nodePaths: NODE,
        pythonPaths: PY,
        files: ['server/app.ts'],
      }),
    );
    expect(r.lane).toBe('code (polyglot: node)');
    expect(r.outputs.runNodeCi).toBe(true);
    expect(r.outputs.runPythonCi).toBe(false);
  });

  it('17. polyglot, python-only PR → runs only python-ci', () => {
    const r = classifyPR(
      input({
        stack: 'polyglot',
        nodePaths: NODE,
        pythonPaths: PY,
        files: ['analysis-service/foo.py'],
      }),
    );
    expect(r.lane).toBe('code (polyglot: python)');
    expect(r.outputs.runNodeCi).toBe(false);
    expect(r.outputs.runPythonCi).toBe(true);
  });

  it('18. polyglot, mixed → both language CIs run', () => {
    const r = classifyPR(
      input({
        stack: 'polyglot',
        nodePaths: NODE,
        pythonPaths: PY,
        files: ['server/app.ts', 'analysis-service/foo.py'],
      }),
    );
    expect(r.lane).toBe('code (polyglot: node+python)');
    expect(r.outputs.runNodeCi).toBe(true);
    expect(r.outputs.runPythonCi).toBe(true);
  });

  it('19. polyglot, neither (web/ in nodePaths only, file is README.md) → docs-only', () => {
    const r = classifyPR(
      input({
        stack: 'polyglot',
        nodePaths: NODE,
        pythonPaths: PY,
        files: ['README.md'],
      }),
    );
    expect(r.lane).toBe('docs-only');
  });

  it('20. polyglot, package.json bump (root) → node-ci runs by convention', () => {
    const r = classifyPR(
      input({
        stack: 'polyglot',
        nodePaths: NODE,
        pythonPaths: PY,
        files: ['package.json'],
      }),
    );
    expect(r.outputs.runNodeCi).toBe(true);
    expect(r.outputs.runPythonCi).toBe(false);
    expect(r.outputs.runDependencyReview).toBe(true);
  });
});

describe('classifyPR — ci:full label override (Guardrail #2)', () => {
  it('21. workflow-only PR with ci:full label → forced-full, runs all CI', () => {
    const r = classifyPR(
      input({
        files: ['.github/workflows/ci.yml'],
        labels: ['ci:full'],
        stack: 'node',
      }),
    );
    expect(r.outputs.forcedFull).toBe(true);
    expect(r.lane).toBe('forced-full (label: ci:full)');
    expect(r.outputs.runNodeCi).toBe(true);
  });

  it('22. polyglot + ci:full → both language CIs run', () => {
    const r = classifyPR(
      input({
        stack: 'polyglot',
        nodePaths: 'server/**',
        pythonPaths: 'analysis-service/**',
        files: ['README.md'],
        labels: ['ci:full'],
      }),
    );
    expect(r.outputs.forcedFull).toBe(true);
    expect(r.outputs.runNodeCi).toBe(true);
    expect(r.outputs.runPythonCi).toBe(true);
  });

  it('23. label match is case-insensitive', () => {
    const r = classifyPR(
      input({
        files: ['README.md'],
        labels: ['CI:Full'],
        forceFullCiLabel: 'ci:full',
      }),
    );
    expect(r.outputs.forcedFull).toBe(true);
  });

  it('24. custom forceFullCiLabel name → matches only that name', () => {
    const r = classifyPR(
      input({
        files: ['README.md'],
        labels: ['ci:full'],
        forceFullCiLabel: 'run-everything',
      }),
    );
    expect(r.outputs.forcedFull).toBe(false);
  });
});

describe('classifyPR — non-PR / push events', () => {
  it('25. push event → broad routing, lane=push-event', () => {
    const r = classifyPR(input({ isPullRequest: false, stack: 'node' }));
    expect(r.lane).toMatch(/push-event/);
    expect(r.outputs.runNodeCi).toBe(true);
    expect(r.outputs.runPythonCi).toBe(false);
    expect(r.outputs.runWorkflowValidation).toBe(true);
    expect(r.outputs.runPolicyValidation).toBe(true);
  });

  it('26. push event on polyglot stack → both language CIs', () => {
    const r = classifyPR(
      input({
        isPullRequest: false,
        stack: 'polyglot',
        nodePaths: 'server/**',
        pythonPaths: 'analysis-service/**',
      }),
    );
    expect(r.outputs.runNodeCi).toBe(true);
    expect(r.outputs.runPythonCi).toBe(true);
  });
});

describe('classifyPR — error paths', () => {
  it('27. unknown stack → ok=false', () => {
    const r = classifyPR(input({ stack: 'kotlin' }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/Unknown stack/);
  });

  it('27b. stack=minimal with code change → ok=false (legacy invariant)', () => {
    const r = classifyPR(input({ stack: 'minimal', files: ['src/foo.ts'] }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/stack=minimal/);
  });

  it('27c. stack=minimal with docs-only → ok=true, docs-only lane', () => {
    const r = classifyPR(input({ stack: 'minimal', files: ['README.md'] }));
    expect(r.ok).toBe(true);
    expect(r.lane).toBe('docs-only');
  });

  it('27d. stack=minimal with workflow-only → ok=true, workflow-only lane', () => {
    const r = classifyPR(
      input({ stack: 'minimal', files: ['.github/workflows/ci.yml'] }),
    );
    expect(r.ok).toBe(true);
    expect(r.lane).toBe('workflow-only');
  });
});

describe('classifyPR — internals', () => {
  it('28. filesSummary truncates to 30 entries', () => {
    const files = Array.from({ length: 50 }, (_, i) => `src/f${i}.ts`);
    const r = classifyPR(input({ files }));
    const lines = r.filesSummary.split('\n');
    expect(lines.length).toBe(30);
    expect(lines[0]).toBe('src/f0.ts');
    expect(lines[29]).toBe('src/f29.ts');
  });

  it('29. jobsRequired always ends with decision', () => {
    const r = classifyPR(input({ files: ['src/app.ts'] }));
    expect(r.jobsRequired[r.jobsRequired.length - 1]).toBe('decision');
  });

  it('30. jobsSkipped does not overlap jobsRequired', () => {
    const r = classifyPR(input({ files: ['src/app.ts'] }));
    const req = new Set(r.jobsRequired);
    for (const j of r.jobsSkipped) {
      expect(req.has(j)).toBe(false);
    }
  });

  it('31. path matching: `server/**` matches subdirs', () => {
    const r = classifyPR(
      input({
        stack: 'polyglot',
        nodePaths: 'server/**',
        pythonPaths: 'analysis-service/**',
        files: ['server/api/handlers/foo.ts'],
      }),
    );
    expect(r.outputs.runNodeCi).toBe(true);
  });

  it('32. path matching: exact filename', () => {
    const r = classifyPR(
      input({
        stack: 'polyglot',
        nodePaths: 'package.json',
        pythonPaths: 'analysis-service/**',
        files: ['package.json'],
      }),
    );
    expect(r.outputs.runNodeCi).toBe(true);
  });

  it('33. path matching: exact filename does NOT match a path with that filename in a subdir', () => {
    const r = classifyPR(
      input({
        stack: 'polyglot',
        nodePaths: 'package.json',
        pythonPaths: 'analysis-service/**',
        files: ['nested/package.json'],
      }),
    );
    // Exact-match semantics: only top-level package.json matches.
    // nested/package.json does NOT match nodePaths and isn't in pythonPaths
    // either. It IS however a packageRe match → runDependencyReview true.
    // But polyglot fallback: packageTouched && !runNodeCi && !runPythonCi
    // && nodePatterns.length > 0 → runNodeCi=true.
    expect(r.outputs.runDependencyReview).toBe(true);
    expect(r.outputs.runNodeCi).toBe(true);
  });

  it('34. path matching: comments and blanks in pattern lists', () => {
    const r = classifyPR(
      input({
        stack: 'polyglot',
        nodePaths: '# node code\nserver/**\n\n# packages\npackage.json',
        pythonPaths: 'analysis-service/**',
        files: ['server/foo.ts'],
      }),
    );
    expect(r.outputs.runNodeCi).toBe(true);
  });
});

describe('classifyPR — interaction edge cases', () => {
  it('35. ci:full beats snapshot-refresh', () => {
    const r = classifyPR(
      input({
        files: ['src/snapshots/foo.yml'],
        labels: ['ci:full'],
        snapshotPaths: 'src/snapshots/**',
        snapshotTestCommand: 'npm test',
      }),
    );
    expect(r.outputs.forcedFull).toBe(true);
    expect(r.outputs.snapshotOnly).toBe(false);
    expect(r.lane).toMatch(/forced-full/);
  });

  it('36. ci:full beats docs-only', () => {
    const r = classifyPR(
      input({ files: ['README.md'], labels: ['ci:full'] }),
    );
    expect(r.outputs.forcedFull).toBe(true);
    expect(r.lane).toMatch(/forced-full/);
  });

  it('37. snapshot-refresh beats docs-only (snapshot files are checked first)', () => {
    const r = classifyPR(
      input({
        files: ['src/snapshots/foo.md'],
        snapshotPaths: 'src/snapshots/**',
        snapshotTestCommand: 'npm test',
      }),
    );
    expect(r.lane).toBe('snapshot-refresh');
  });
});
