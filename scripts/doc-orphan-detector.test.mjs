import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The reusable doc-orphan-detector runs its logic inline in a github-script
// block (a reusable workflow executes in the CALLER's checkout, so it cannot
// import a repo module). These tests read the workflow file and exercise the
// ACTUAL shipped bytes — the classify-block is extracted and run directly, so a
// drift in the inline classifier is caught here rather than in production.
const wf = readFileSync('.github/workflows/doc-orphan-detector.yml', 'utf8');

function loadInlineClassifier(body) {
  const start = body.indexOf('// classify-block:start');
  const end = body.indexOf('// classify-block:end');
  if (start === -1 || end === -1) throw new Error('classify-block markers not found');
  const src = body.slice(start, end);
  // eslint-disable-next-line no-new-func
  return new Function(`${src}\nreturn isSweepableDoc;`)();
}

describe('doc-orphan-detector — structural invariants', () => {
  it('is a reusable workflow with least-privilege permissions', () => {
    expect(wf).toMatch(/on:\s*\n\s*workflow_call:/);
    expect(wf).toContain('contents: read');
    expect(wf).toContain('issues: write');
    // never elevate beyond reading the tree + writing issues
    expect(wf).not.toContain('contents: write');
    expect(wf).not.toContain('pull-requests: write');
  });

  it('declares the three documented inputs with their defaults', () => {
    for (const name of ['stale-hours', 'base-label', 'default-branch']) {
      expect(wf).toContain(`${name}:`);
    }
    expect(wf).toContain('default: 12');
    expect(wf).toContain('default: "doc-orphan"');
    expect(wf).toContain('default: "main"');
  });

  it('is detection-only: never mutates the tree/refs and never reads file contents (§4.7)', () => {
    // git is only ever invoked with read-only subcommands
    expect(wf).not.toMatch(/git\(\[\s*['"](add|commit|push|show|cat-file|checkout|reset|apply)['"]/);
    // no content-reading GitHub API surface — paths only
    expect(wf).not.toContain('getContent');
    expect(wf).not.toContain('createOrUpdateFileContents');
    expect(wf).not.toContain('readFileSync');
    // never closes/deletes issues — it only opens/updates tracking issues
    expect(wf).not.toMatch(/issues\.(delete|update)\b.*state/);
  });

  it('sources the 12h threshold and diffs three-dot against the default branch', () => {
    expect(wf).toContain('owner decision 2026-06-02');
    expect(wf).toMatch(/\$\{baseRef\}\.\.\.\$\{branch\.remoteRef\}/);
  });
});

describe('doc-orphan-detector — §4.1 classification (the shipped inline logic)', () => {
  const isSweepableDoc = loadInlineClassifier(wf);

  // Sweepable: allow-list docs/changelog/html-artifacts + images outside excluded roots
  const sweepable = [
    'docs/archon/ROADMAP.md',
    'docs/notes.md',
    '.changelog/unreleased/x.md',
    '.html-artifacts/report.html',
    'assets/logo.png',
    'docs/diagram.svg',
  ];

  // Not sweepable: review carve-outs, hard-excludes, governance, manifests,
  // images under excluded roots (exclude wins), and Docusaurus code/config.
  const excluded = [
    'docs/process/x.md',
    'docs/architecture/y.md',
    'src/index.ts',
    'src/logo.png', // image under a hard-excluded root → exclude wins
    '.github/banner.svg', // image under .github → exclude wins
    'scripts/tool.mjs',
    'README.md',
    'AGENTS.md',
    'CLAUDE.md',
    'GEMINI.md',
    'package.json',
    'sub/package-lock.json',
    'docs/docusaurus.config.ts',
    'docs/src/page.tsx',
    'docs/static/img/x.png',
    'Process/x.md', // not under docs/ → not allow-listed at all
  ];

  for (const p of sweepable) {
    it(`sweeps ${p}`, () => expect(isSweepableDoc(p)).toBe(true));
  }
  for (const p of excluded) {
    it(`excludes ${p}`, () => expect(isSweepableDoc(p)).toBe(false));
  }

  it('matches case-insensitively with exclude winning ties (NTFS, §4.1 D10)', () => {
    expect(isSweepableDoc('DOCS/Process/Z.MD')).toBe(false);
    expect(isSweepableDoc('Docs/Notes.MD')).toBe(true);
    expect(isSweepableDoc('SRC/Logo.PNG')).toBe(false);
  });
});
