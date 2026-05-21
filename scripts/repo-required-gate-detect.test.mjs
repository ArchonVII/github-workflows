import { describe, expect, test } from 'vitest';

function classifyChangedFiles(names) {
  const docRe = /\.(md|mdx|txt|png|jpg|jpeg|gif|svg|webp|bmp|ico|avif)$/i;
  const codeRe = /\.(c|cc|cpp|cs|go|java|js|jsx|ts|tsx|mjs|cjs|py|rs|rb|php|swift|kt|kts|scala)$/i;
  const packageRe =
    /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|pyproject\.toml|requirements(-dev)?\.txt|uv\.lock|poetry\.lock|Pipfile(\.lock)?|Cargo\.toml|Cargo\.lock|go\.mod|go\.sum)$/;

  const docsOnly =
    names.length > 0 &&
    names.every((name) => docRe.test(name) || name.startsWith('.changelog/') || name.startsWith('docs/'));

  const workflowOrHook = names.some(
    (name) => name.startsWith('.github/workflows/') || name.startsWith('.githooks/'),
  );

  const policy = names.some(
    (name) =>
      name === 'AGENTS.md' ||
      name === 'CLAUDE.md' ||
      name === 'GEMINI.md' ||
      name === '.agent/check-map.yml' ||
      name.startsWith('.agent/schema/') ||
      name.startsWith('.agent/'),
  );

  const packageTouched = names.some((name) => packageRe.test(name));
  const codeTouched = names.some((name) => {
    if (name.startsWith('.github/') || name.startsWith('.githooks/') || name.startsWith('.agent/')) return false;
    if (docRe.test(name) || name.startsWith('.changelog/')) return false;
    return codeRe.test(name) || /^(src|test|tests|lib|bin|scripts)\//.test(name);
  });

  return {
    docsOnly,
    runCi: !docsOnly && (packageTouched || codeTouched),
    runDependencyReview: !docsOnly && packageTouched,
    runWorkflowValidation: !docsOnly && workflowOrHook,
    runPolicyValidation: !docsOnly && policy,
  };
}

describe('repo-required-gate detect classifier', () => {
  test('doc-only PR skips all optional validations', () => {
    const result = classifyChangedFiles(['analysis/findings.md', 'noticed.md']);
    expect(result.docsOnly).toBe(true);
    expect(result.runCi).toBe(false);
    expect(result.runDependencyReview).toBe(false);
    expect(result.runWorkflowValidation).toBe(false);
    expect(result.runPolicyValidation).toBe(false);
  });

  test('doc-only .github/*.md does not trigger policy validation', () => {
    const result = classifyChangedFiles(['.github/noticed.md', 'docs/analysis.md']);
    expect(result.docsOnly).toBe(true);
    expect(result.runPolicyValidation).toBe(false);
  });

  test('workflow edits still route to workflow validation', () => {
    const result = classifyChangedFiles(['.github/workflows/ci.yml']);
    expect(result.docsOnly).toBe(false);
    expect(result.runWorkflowValidation).toBe(true);
    expect(result.runCi).toBe(false);
  });

  test('package changes trigger dependency review + CI', () => {
    const result = classifyChangedFiles(['package-lock.json']);
    expect(result.docsOnly).toBe(false);
    expect(result.runDependencyReview).toBe(true);
    expect(result.runCi).toBe(true);
  });

  test('code changes trigger CI', () => {
    const result = classifyChangedFiles(['src/index.ts']);
    expect(result.docsOnly).toBe(false);
    expect(result.runCi).toBe(true);
  });

  test('.agent/check-map.yml triggers policy validation', () => {
    const result = classifyChangedFiles(['.agent/check-map.yml']);
    expect(result.docsOnly).toBe(false);
    expect(result.runPolicyValidation).toBe(true);
  });
});

