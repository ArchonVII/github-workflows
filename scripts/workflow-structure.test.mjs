import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readWorkflow = (name) => readFileSync(`.github/workflows/${name}.yml`, 'utf8');
const readExample = (name) => readFileSync(`examples/${name}.yml`, 'utf8');

const workflowJobBlock = (body, job) => {
  const marker = `  ${job}:`;
  const jobIndex = body.indexOf(marker);
  if (jobIndex === -1) return '';

  const rest = body.slice(jobIndex + marker.length);
  const nextJob = rest.search(/\r?\n  [a-zA-Z0-9_-]+:\r?\n/);
  return body.slice(jobIndex, nextJob === -1 ? body.length : jobIndex + marker.length + nextJob);
};

describe('node-ci workflow package-manager setup', () => {
  it('detects the lockfile before setup-node configures dependency caching', () => {
    const body = readWorkflow('node-ci');

    expect(body).toContain('default: "auto"');
    expect(body).toContain('cache: ${{ steps.pm.outputs.cache }}');
    expect(body).toContain('cache-dependency-path: ${{ steps.pm.outputs.cache-dependency-path }}');

    const detectIndex = body.indexOf('- name: Detect package manager');
    const setupPnpmIndex = body.indexOf('- name: Set up pnpm');
    const setupNodeIndex = body.search(/- uses: actions\/setup-node@v\d+/);

    expect(detectIndex).toBeGreaterThan(-1);
    expect(setupPnpmIndex).toBeGreaterThan(detectIndex);
    expect(setupNodeIndex).toBeGreaterThan(setupPnpmIndex);
  });

  it('installs pnpm before setup-node enables pnpm caching', () => {
    const body = readWorkflow('node-ci');

    expect(body).toMatch(/uses: pnpm\/action-setup@v\d+/);
    expect(body).toContain("if: steps.pm.outputs.manager == 'pnpm'");
    expect(body).toContain('version: ${{ inputs.pnpm-version }}');
    expect(body).toContain('run_install: false');
  });
});

describe('repo-required-gate workflow node delegation', () => {
  it('passes pnpm-version through and does not hardcode npm cache in snapshot validation', () => {
    const body = readWorkflow('repo-required-gate');

    expect(body).toContain('pnpm-version: ${{ inputs.pnpm-version }}');
    expect(body).not.toContain('cache: "npm"');
  });

  it('decouples the language and validation lanes from the PR contract', () => {
    const body = readWorkflow('repo-required-gate');

    // A failing PR body must NEVER skip real CI: every lane depends on `detect`
    // alone and is never gated on contract success. Coupling them skipped all
    // CI on a body failure and surfaced a misleading "node ci ... skipped" from
    // the decision job (ArchonVII/archon#200). Contract enforcement lives in
    // the decision job, asserted in the next test.
    for (const job of [
      'workflow-validation',
      'policy-validation',
      'dependency-review',
      'node-ci',
      'python-ci',
      'go-ci',
      'snapshot-validation',
    ]) {
      const block = workflowJobBlock(body, job);

      expect(block, `${job} job exists`).not.toBe('');
      expect(block, `${job} does not wait for pr-contract`).not.toContain('pr-contract');
      expect(block, `${job} is not gated on contract success`).not.toContain(
        "needs.pr-contract.result == 'success'",
      );
    }
  });

  it('still enforces the PR contract in the decision job after decoupling', () => {
    const body = readWorkflow('repo-required-gate');
    const decision = workflowJobBlock(body, 'decision');

    // Decoupling the lanes must not drop contract enforcement — the decision
    // job stays the single aggregator that requires the contract.
    expect(decision, 'decision waits for pr-contract').toContain('- pr-contract');
    expect(decision).toContain("CONTRACT_RESULT: ${{ needs.pr-contract.result }}");
    expect(decision).toContain('require_success "pr contract" "$CONTRACT_RESULT"');
  });

  it('honors optional validation inputs in the decision job', () => {
    const body = readWorkflow('repo-required-gate');
    const block = workflowJobBlock(body, 'decision');

    expect(block).toContain(
      "RUN_DEPENDENCY_REVIEW: ${{ inputs.run-dependency-review && needs.detect.outputs.run-dependency-review == 'true' }}",
    );
    expect(block).toContain(
      "RUN_WORKFLOW_VALIDATION: ${{ inputs.run-workflow-validation && needs.detect.outputs.run-workflow-validation == 'true' }}",
    );
    expect(block).toContain(
      "RUN_POLICY_VALIDATION: ${{ inputs.run-policy-validation && needs.detect.outputs.run-policy-validation == 'true' }}",
    );
  });

  it('declares the doc-only inputs passed to the shared PR contract validator', () => {
    const body = readWorkflow('repo-required-gate');

    expect(body).toContain('doc-only-extensions:');
    expect(body).toContain('doc-only-path-prefixes:');
    expect(body).toContain('DOC_EXT_LIST: ${{ inputs.doc-only-extensions }}');
    expect(body).toContain('DOC_PREFIXES: ${{ inputs.doc-only-path-prefixes }}');
  });
});

describe('repo-required-gate caller example', () => {
  it('runs the required gate only for ci:full label changes', () => {
    const body = readExample('repo-required-gate');

    expect(body).toContain(
      'types: [opened, edited, synchronize, reopened, ready_for_review, labeled, unlabeled]',
    );
    expect(body).toContain("github.event.action != 'labeled'");
    expect(body).toContain("github.event.action != 'unlabeled'");
    expect(body).toContain("github.event.label.name == 'ci:full'");

    const jobBlock = workflowJobBlock(body, 'repo-required-gate');
    expect(jobBlock).toContain('if: >-');
    expect(jobBlock).toContain("github.event.label.name == 'ci:full'");

    const concurrencyBlock = body.slice(body.indexOf('concurrency:'), body.indexOf('jobs:'));
    expect(concurrencyBlock).toContain('group: >-');
    expect(concurrencyBlock).toContain("format('label-skip-{0}', github.event.label.name)");
    expect(concurrencyBlock).toContain("'gate'");
    expect(concurrencyBlock).toContain('cancel-in-progress: >-');
    expect(concurrencyBlock).toContain("github.event.label.name == 'ci:full'");
  });
});

describe('pr-policy workflow contract source', () => {
  it('uses the shared PR contract validator instead of inline body regexes', () => {
    const body = readWorkflow('pr-policy');

    expect(body).toContain('__github-workflows__/scripts/pr-contract.mjs');
    expect(body).toContain('validatePrContract');
  });
});

describe('pr-body-autoinject scaffold', () => {
  it('does not inject checked verification that can satisfy the strict contract', () => {
    const body = readWorkflow('pr-body-autoinject');

    expect(body).toContain('TODO: Fill in summary.');
    expect(body).toContain('- [ ] TODO: Run required verification and replace this line.');
    expect(body).not.toContain('- [x] Automated CI checks green on this PR');
  });
});

describe('doc-policy-lint workflow contract', () => {
  it('is warning-only and declares explicit permissions', () => {
    const body = readWorkflow('doc-policy-lint');
    const jobBlock = workflowJobBlock(body, 'doc-policy-lint');

    expect(jobBlock).toContain('permissions:');
    expect(jobBlock).toContain('contents: read');
    expect(jobBlock).not.toContain('core.setFailed');
    expect(jobBlock).not.toContain('exit 1');
    expect(jobBlock).toContain('Doc policy lint is warning-only');
  });

  it('checks out helper scripts from the caller-aligned workflow-library-ref', () => {
    const body = readWorkflow('doc-policy-lint');

    expect(body).toContain('workflow-library-ref:');
    expect(body).toContain('ref: ${{ inputs.workflow-library-ref }}');
    expect(body).toContain('__github-workflows__');
    expect(body).toContain('scripts/doc-policy-lint.mjs');
  });

  it('ships a caller example pinned to the same reusable-workflow and helper refs', () => {
    const body = readExample('doc-policy-lint');

    expect(body).toContain('uses: ArchonVII/github-workflows/.github/workflows/doc-policy-lint.yml@v1');
    expect(body).toContain('workflow-library-ref: v1');
    expect(body).toContain('permissions:');
    expect(body).toContain('contents: read');
  });
});

describe('repo-update-log-fragment workflow contract', () => {
  it('checks out the shared validator from the caller-aligned workflow ref', () => {
    const body = readWorkflow('repo-update-log-fragment');

    expect(body).toContain('workflow-library-ref:');
    expect(body).toContain('ref: ${{ inputs.workflow-library-ref }}');
    expect(body).toContain('__github-workflows__');
    expect(body).toContain('scripts/repo-update-log-fragment.mjs');
    expect(body).toContain('evaluateRepoUpdateLogFragment');
  });

  it('ships a caller example pinned to the reusable workflow and helper refs', () => {
    const body = readExample('repo-update-log-fragment');

    expect(body).toContain('uses: ArchonVII/github-workflows/.github/workflows/repo-update-log-fragment.yml@v1');
    expect(body).toContain('workflow-library-ref: v1');
    expect(body).toContain('types: [opened, synchronize, edited, reopened, ready_for_review]');
  });
});
