import { describe, expect, it } from 'vitest';
import {
  evaluateRepoUpdateLogFragment,
  formatRepoUpdateLogFragmentResult,
} from './repo-update-log-fragment.mjs';

const input = (overrides = {}) => ({
  files: [{ filename: 'consumer/index.js', status: 'modified' }],
  body: [
    '## Summary',
    '',
    '- Tighten COI extraction.',
    '',
    '## Docs / Changelog',
    '',
    '- Added a changelog fragment.',
  ].join('\n'),
  ...overrides,
});

describe('evaluateRepoUpdateLogFragment', () => {
  it('fails a code PR that does not add a repo-update-log fragment', () => {
    const result = evaluateRepoUpdateLogFragment(input());

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'missing_repo_update_log_fragment' }),
    );
    expect(formatRepoUpdateLogFragmentResult(result)).toContain('docs/repo-update-log/');
  });

  it('passes a code PR that adds a repo-update-log fragment', () => {
    const result = evaluateRepoUpdateLogFragment(input({
      files: [
        { filename: 'consumer/index.js', status: 'modified' },
        { filename: 'docs/repo-update-log/2026-06-20-244-coi-extraction.md', status: 'added' },
      ],
    }));

    expect(result.ok).toBe(true);
    expect(result.facts.addedFragment).toBe(true);
  });

  it('passes a ledger-only backfill PR without requiring a second fragment', () => {
    const result = evaluateRepoUpdateLogFragment(input({
      files: [
        { filename: 'docs/repo-update-log/2026-06-20-244-coi-extraction.md', status: 'added' },
        { filename: 'docs/repo-update-log/2026-06-20-245-field-extraction.md', status: 'added' },
      ],
    }));

    expect(result.ok).toBe(true);
    expect(result.facts.ledgerOnly).toBe(true);
  });

  it('passes an unprotected doc-only PR when the body explains the skipped ledger', () => {
    const result = evaluateRepoUpdateLogFragment(input({
      files: [{ filename: 'docs/notes/operator-copy.md', status: 'modified' }],
      body: 'Repo-update-log not required: doc-only typo fix.',
    }));

    expect(result.ok).toBe(true);
    expect(result.facts.docOnlyExempted).toBe(true);
  });

  it('fails an unprotected doc-only PR when the skip is not recorded in the body', () => {
    const result = evaluateRepoUpdateLogFragment(input({
      files: [{ filename: 'docs/notes/operator-copy.md', status: 'modified' }],
      body: 'Small typo cleanup.',
    }));

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'missing_doc_only_skip_reason' }),
    );
  });

  it('fails a protected doc PR without a fragment even when the body has a doc-only skip note', () => {
    const result = evaluateRepoUpdateLogFragment(input({
      files: [{ filename: 'AGENTS.md', status: 'modified' }],
      body: 'Repo-update-log not required: doc-only typo fix.',
    }));

    expect(result.ok).toBe(false);
    expect(result.errors).toContainEqual(
      expect.objectContaining({ code: 'missing_repo_update_log_fragment' }),
    );
  });

  it('passes a protected doc PR when it adds a repo-update-log fragment', () => {
    const result = evaluateRepoUpdateLogFragment(input({
      files: [
        { filename: 'AGENTS.md', status: 'modified' },
        { filename: 'docs/repo-update-log/2026-06-20-92-policy.md', status: 'renamed' },
      ],
    }));

    expect(result.ok).toBe(true);
  });
});
