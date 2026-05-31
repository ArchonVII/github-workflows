import { describe, expect, it } from 'vitest';
import { validatePrContract } from './pr-contract.mjs';

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

  it('requires exact heading order for non-doc PRs', () => {
    const body = validBody.replace(
      '### Verification Notes',
      '### Notes From Verification',
    );

    const result = validatePrContract(input({ body }));

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
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
        'unchecked_required_box',
        'missing_issue_link',
      ]),
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
