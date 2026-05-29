import { describe, it, expect } from 'vitest';
import { evaluateRolePolicy } from './role-policy.mjs';

const input = (over = {}) => ({
  prAuthor: 'codex',
  headRef: 'agent/codex/26-role-separation-pr-policy',
  files: ['README.md'],
  commitAuthors: ['codex'],
  approvedReviewAuthors: [],
  body: '',
  labels: [],
  enforceRoleSeparation: false,
  ...over,
});

describe('evaluateRolePolicy - soft warning default', () => {
  it('warns but does not fail when the PR author also authored commits', () => {
    const result = evaluateRolePolicy(input());

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings.some((w) => /same account/i.test(w))).toBe(true);
  });

  it('does not create a PR-path owner-maintenance exemption', () => {
    const result = evaluateRolePolicy(input({
      files: ['docs/research/notes.md'],
      body: 'Owner Maintenance Lane',
    }));

    expect(result.ok).toBe(true);
    expect(result.ownerMaintenancePrExempt).toBe(false);
    expect(result.warnings.some((w) => /direct-commit-only/i.test(w))).toBe(true);
  });
});

describe('evaluateRolePolicy - protected hard block', () => {
  it('fails agent-managed protected-path PRs without independent approval or marker', () => {
    const result = evaluateRolePolicy(input({
      enforceRoleSeparation: true,
      files: ['.github/workflows/pr-policy.yml'],
    }));

    expect(result.ok).toBe(false);
    expect(result.protectedPaths).toEqual(['.github/workflows/pr-policy.yml']);
    expect(result.errors.some((e) => /Release-Admiral/i.test(e))).toBe(true);
  });

  it('passes protected-path PRs with an independent approval', () => {
    const result = evaluateRolePolicy(input({
      enforceRoleSeparation: true,
      files: ['scripts/setup-repo.mjs'],
      approvedReviewAuthors: ['release-admiral'],
    }));

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.independentApproval).toBe(true);
  });

  it('passes protected-path PRs with a non-author Release-Admiral marker', () => {
    const result = evaluateRolePolicy(input({
      enforceRoleSeparation: true,
      files: ['AGENTS.md'],
      body: 'Release-Admiral: @noether',
    }));

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.releaseAdmiralMarker).toBe('@noether');
  });

  it('does not hard-fail unprotected docs-only paths', () => {
    const result = evaluateRolePolicy(input({
      enforceRoleSeparation: true,
      files: ['docs/usage.md'],
    }));

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.protectedPaths).toEqual([]);
  });

  it('exempts Dependabot from role-separation warnings and hard blocks', () => {
    const result = evaluateRolePolicy(input({
      prAuthor: 'dependabot[bot]',
      commitAuthors: ['dependabot[bot]'],
      headRef: 'dependabot/npm_and_yarn/vitest-4.2.0',
      enforceRoleSeparation: true,
      files: ['package-lock.json'],
    }));

    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
    expect(result.dependabotExempt).toBe(true);
  });
});
