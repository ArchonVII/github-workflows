import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validatePrContract, validatePrTemplate, formatPrContractResult, formatPrTemplateResult } from './pr-contract.mjs';

const scriptPath = fileURLToPath(new URL('./pr-contract.mjs', import.meta.url));

const validBody = [
  '## Summary',
  '',
  '- Add strict PR contract validation before ready-for-review.',
  '',
  '## Verification',
  '',
  '- [x] npm test',
  '',
  '```evidence',
  'command: npm test',
  'location: local',
  'result: passed',
  'timestamp: 2026-05-31T20:00:00Z',
  '```',
  '',
  '### Verification Notes',
  '',
  'Validated the reusable workflow tests locally with `npm test`; no warnings were emitted.',
  '',
  '## Docs / Changelog',
  '',
  '- [x] README and reusable workflow examples updated for the new contract.',
  '',
  'Closes #36',
].join('\n');

const input = (overrides = {}) => ({
  title: 'feat(policy): enforce PR contract before ready',
  body: validBody,
  branch: 'agent/codex/36-pr-contract-gate',
  files: ['scripts/pr-contract.mjs', '.github/workflows/repo-required-gate.yml'],
  ...overrides,
});

describe('validatePrContract', () => {
  it('accepts a complete non-doc PR contract', () => {
    const result = validatePrContract(input());

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.facts.docsOnly).toBe(false);
  });

  it('rejects malformed PR titles before promotion', () => {
    const result = validatePrContract(input({ title: 'Add opt-in canvas window layout' }));

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'invalid_title', path: 'title' }),
    );
  });

  it('still fails a renamed section heading — via the substance check, with a heading advisory (#99)', () => {
    const body = validBody.replace(
      '### Verification Notes',
      '### Notes From Verification',
    );

    const result = validatePrContract(input({ body }));

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'empty_verification_notes', path: 'body' }),
    );
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'missing_heading', path: 'body' }),
    );
  });

  it('passes out-of-order sections with a heading advisory when all substance is present (#99)', () => {
    const body = [
      '## Verification',
      '',
      '- [x] npm test',
      '',
      '```evidence',
      'command: npm test',
      'location: local',
      'result: passed',
      'timestamp: 2026-05-31T20:00:00Z',
      '```',
      '',
      '### Verification Notes',
      '',
      'Validated the reusable workflow tests locally with `npm test`; no warnings were emitted.',
      '',
      '## Summary',
      '',
      '- Add strict PR contract validation before ready-for-review.',
      '',
      '## Docs / Changelog',
      '',
      '- README and reusable workflow examples updated for the new contract.',
      '',
      'Closes #36',
    ].join('\n');

    const result = validatePrContract(input({ body }));

    expect(result.ok).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'missing_heading', path: 'body' }),
    );
  });

  it('rejects placeholder scaffolds even when they contain checked boxes', () => {
    const body = [
      '<!-- AUTO-INJECTED policy stub for bot-authored PR. Replace freely. -->',
      '',
      '## Summary',
      '',
      'TODO: Fill in summary.',
      '',
      '## Verification',
      '',
      '- [x] Automated CI checks green on this PR',
      '- [ ] TODO: Run required verification and replace this line.',
      '',
      '### Verification Notes',
      '',
      '_Auto-injected for bot-authored PR. CI-green is the verification surface._',
      '',
      '## Docs / Changelog',
      '',
      'TODO: Closes #___',
    ].join('\n');

    const result = validatePrContract(input({ body }));

    expect(result.ok).toBe(false);
    expect(result.errors.map((error) => error.code)).toEqual(
      expect.arrayContaining([
        'placeholder_text',
        'generic_verification',
        'missing_issue_link',
      ]),
    );
    // Unchecked boxes are advisory since #99 — they count as items but warn.
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'unchecked_verification_item' }),
    );
  });

  it('allows docs-only PRs to skip body ceremony while keeping title and branch checks', () => {
    const result = validatePrContract(input({
      body: 'Small README cleanup.',
      files: ['README.md', '.changelog/unreleased/36-pr-contract.md'],
      title: 'docs(readme): clarify PR contract',
      branch: 'docs/36-pr-contract',
    }));

    expect(result.ok).toBe(true);
    expect(result.facts.docsOnly).toBe(true);
  });
});

const canonicalTemplate = [
  '## Summary',
  '',
  'TODO: What changed and why?',
  '',
  '## Verification',
  '',
  '- [ ] TODO',
  '',
  '### Verification Notes',
  '',
  'TODO: Summarize verification.',
  '',
  '## Docs / Changelog',
  '',
  'TODO: changelog fragment or no-changelog label.',
  '',
  '## Linked Issue',
  '',
  'Closes #',
].join('\n');

// The pre-strict template that caused ArchonVII/hudson-bend#43: `## Changelog`
// in the wrong position, no `## Docs / Changelog`.
const staleTemplate = [
  '## Summary',
  '',
  '## Linked Issue',
  '',
  'Closes #',
  '',
  '## Scope',
  '',
  '## Changelog',
  '',
  '## Verification',
  '',
  '### Verification Notes',
  '',
  '## Risks',
].join('\n');

describe('validatePrTemplate', () => {
  it('accepts the canonical template structure (unchecked boxes + placeholders are fine)', () => {
    const result = validatePrTemplate(canonicalTemplate);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('flags a pre-strict template missing `## Docs / Changelog`', () => {
    const result = validatePrTemplate(staleTemplate);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'missing_heading')).toBe(true);
  });

  it('flags a template missing `### Verification Notes`', () => {
    const noNotes = [
      '## Summary',
      '',
      '## Verification',
      '',
      '- [ ] x',
      '',
      '## Docs / Changelog',
      '',
      '## Linked Issue',
    ].join('\n');
    const result = validatePrTemplate(noNotes);
    expect(result.ok).toBe(false);
    expect(result.errors.some((e) => e.code === 'missing_heading')).toBe(true);
  });

  it('formats a failing result with a sync hint', () => {
    const report = formatPrTemplateResult(validatePrTemplate(staleTemplate));
    expect(report).toContain('does NOT conform');
    expect(report).toContain('Sync');
  });

  it('formats a passing result', () => {
    expect(formatPrTemplateResult(validatePrTemplate(canonicalTemplate)))
      .toContain('conforms');
  });
});

// Owner acceptance table from the closeout-contract plan (session 019eccc1 F4/F7).
// The "still fails" cases matter as much as the "now passes" cases: the parser is
// context-aware, not weaker.
describe('context-aware parser (acceptance table)', () => {
  it('passes when visible completed prose uses the word "placeholder"', () => {
    const body = validBody
      .replace(
        '- Add strict PR contract validation before ready-for-review.',
        '- Allow completed PR prose to mention placeholder matching without failing the contract.',
      )
      .replace(
        'Validated the reusable workflow tests locally with `npm test`; no warnings were emitted.',
        'Validated that placeholder wording in visible completed prose is accepted.',
      );
    const result = validatePrContract(input({
      title: 'fix(policy): allow placeholder prose',
      body,
    }));
    expect(result.ok).toBe(true);
  });

  it('passes when the template HTML comment (with the word "placeholder") survives but visible fields are filled', () => {
    const body = [
      '<!--',
      '  Replace every placeholder before marking the PR ready for review.',
      '-->',
      '',
      validBody,
    ].join('\n');
    expect(validatePrContract(input({ body })).ok).toBe(true);
  });

  it('fails when ## Summary still contains a TODO placeholder', () => {
    const body = validBody.replace(
      '- Add strict PR contract validation before ready-for-review.',
      'TODO: Fill in summary.',
    );
    const result = validatePrContract(input({ body }));
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('placeholder_text');
  });

  it('fails when ## Summary is only literal placeholder filler', () => {
    const body = validBody.replace(
      '- Add strict PR contract validation before ready-for-review.',
      'placeholder placeholder placeholder',
    );
    const result = validatePrContract(input({ body }));
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('placeholder_text');
  });

  it('fails when an evidence-block field value is a placeholder (command: TODO)', () => {
    const body = validBody.replace('command: npm test', 'command: TODO');
    const result = validatePrContract(input({ body }));
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('placeholder_text');
  });

  it('fails when an evidence-block field value is literal placeholder filler', () => {
    const body = validBody.replace('command: npm test', 'command: placeholder');
    const result = validatePrContract(input({ body }));
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('placeholder_text');
  });

  it('fails a checked verification claim of "tests passed"', () => {
    const body = validBody.replace('- [x] npm test', '- [x] tests passed');
    const result = validatePrContract(input({ body }));
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('generic_verification');
  });

  it('passes a note that cites a command in inline code', () => {
    const body = validBody.replace(
      'Validated the reusable workflow tests locally with `npm test`; no warnings were emitted.',
      'Direct `npm test` evidence is recorded in the block above; no warnings were emitted.',
    );
    expect(validatePrContract(input({ body })).ok).toBe(true);
  });

  it('passes a note that quotes a "tests passed" diagnostic inside a fenced block', () => {
    const body = validBody.replace(
      'Validated the reusable workflow tests locally with `npm test`; no warnings were emitted.',
      [
        'Close-scan hit a Windows buffer limit; the direct run is cited below and GitHub checks succeeded.',
        '',
        '```',
        'npm test -> 129 tests passed, 0 failed',
        '```',
      ].join('\n'),
    );
    expect(validatePrContract(input({ body })).ok).toBe(true);
  });

  it('passes a note that quotes a "tests passed" diagnostic on a blockquote line', () => {
    const body = validBody.replace(
      'Validated the reusable workflow tests locally with `npm test`; no warnings were emitted.',
      [
        'Close-scan hit a Windows buffer limit; the direct run is cited below and GitHub checks succeeded.',
        '',
        '> npm test -> 129 tests passed, 0 failed',
      ].join('\n'),
    );
    expect(validatePrContract(input({ body })).ok).toBe(true);
  });

  it('fails a Docs / Changelog section that is only "N/A"', () => {
    const body = validBody.replace(
      '- [x] README and reusable workflow examples updated for the new contract.',
      'N/A',
    );
    const result = validatePrContract(input({ body }));
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('placeholder_text');
  });
});

// Substance-only contract (owner decision 2026-07-01, #99): require that a
// verification item exists and is substantive; stop failing on exact format.
describe('substance-only verification items (#99)', () => {
  const bodyWithVerification = (verificationLines) => [
    '## Summary',
    '',
    '- Substance-only verification contract test case.',
    '',
    '## Verification',
    '',
    ...verificationLines,
    '',
    '### Verification Notes',
    '',
    'Ran the listed commands in the lane worktree; output recorded above.',
    '',
    '## Docs / Changelog',
    '',
    '- README updated alongside this change.',
    '',
    'Closes #99',
  ].join('\n');

  it('accepts a plain-bullet verification item with no checkbox and no evidence block', () => {
    const result = validatePrContract(input({
      body: bodyWithVerification(['- Ran `npm test` in the worktree: 159/159 green.']),
    }));
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.facts.verificationItemCount).toBe(1);
  });

  it('accepts `*` bullets as verification items', () => {
    const result = validatePrContract(input({
      body: bodyWithVerification(['* Ran `npm test` in the worktree: 159/159 green.']),
    }));
    expect(result.ok).toBe(true);
  });

  it('warns (not fails) on a checked item without an evidence block', () => {
    const result = validatePrContract(input({
      body: bodyWithVerification(['- [x] Ran `npm test` in the worktree: 159/159 green.']),
    }));
    expect(result.ok).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'missing_evidence_block' }),
    );
  });

  it('warns (not fails) on a substantive unchecked item, which still counts', () => {
    const result = validatePrContract(input({
      body: bodyWithVerification(['- [ ] Re-ran the flaky suite twice; both runs green.']),
    }));
    expect(result.ok).toBe(true);
    expect(result.warnings).toContainEqual(
      expect.objectContaining({ code: 'unchecked_verification_item' }),
    );
    expect(result.facts.verificationItemCount).toBe(1);
  });

  it('fails when the Verification section has no items at all', () => {
    const result = validatePrContract(input({
      body: bodyWithVerification(['Nothing was run.']),
    }));
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('missing_verification_item');
  });

  it('fails a generic plain bullet ("tests pass") just like a generic checked claim', () => {
    const result = validatePrContract(input({
      body: bodyWithVerification(['- tests pass']),
    }));
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('generic_verification');
  });

  it('does not count bullet-like lines inside fenced blocks as items', () => {
    const result = validatePrContract(input({
      body: bodyWithVerification([
        '```',
        '- [x] this is quoted output, not a claim',
        '- neither is this',
        '```',
      ]),
    }));
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('missing_verification_item');
  });

  it('reports advisories in the formatted result on success', () => {
    const result = validatePrContract(input({
      body: bodyWithVerification(['- [x] Ran `npm test` in the worktree: 159/159 green.']),
    }));
    const report = formatPrContractResult(result);
    expect(result.ok).toBe(true);
    expect(report).toContain('Advisories (non-blocking):');
    expect(report).toContain('missing_evidence_block');
  });
});

// The keystone: the same validator runs on a drafted body BEFORE a PR exists.
describe('pr-contract --body-file (pre-publish, no PR)', () => {
  const runBodyFile = (body, extraArgs = []) => {
    try {
      const stdout = execFileSync('node', [scriptPath, '--body-file', '-', '--json', ...extraArgs], {
        input: body,
        encoding: 'utf8',
      });
      return { code: 0, result: JSON.parse(stdout) };
    } catch (err) {
      return { code: err.status ?? 1, result: JSON.parse(err.stdout || '{}') };
    }
  };

  it('validates a complete drafted body from stdin and exits 0', () => {
    const { code, result } = runBodyFile(validBody, [
      '--title', 'feat(policy): enforce PR contract before ready',
      '--branch', 'agent/codex/36-pr-contract-gate',
      '--files-json', JSON.stringify(['scripts/pr-contract.mjs']),
    ]);
    expect(code).toBe(0);
    expect(result.ok).toBe(true);
  });

  it('rejects a drafted body with placeholders and exits 1', () => {
    const { code, result } = runBodyFile(
      validBody.replace('- Add strict PR contract validation before ready-for-review.', 'TODO: fill me'),
      [
        '--title', 'feat(policy): enforce PR contract before ready',
        '--branch', 'agent/codex/36-pr-contract-gate',
        '--files-json', JSON.stringify(['scripts/pr-contract.mjs']),
      ],
    );
    expect(code).toBe(1);
    expect(result.ok).toBe(false);
    expect(result.errors.map((e) => e.code)).toContain('placeholder_text');
  });
});
