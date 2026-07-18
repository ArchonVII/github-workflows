import { existsSync, readFileSync } from 'node:fs';
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
      'docs-gate',
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

describe('repo-required-gate check-map policy validation (#116)', () => {
  it('validates the consumer map with the caller-aligned provider helper', () => {
    const body = readWorkflow('repo-required-gate');
    const block = workflowJobBlock(body, 'policy-validation');

    expect(block).toContain('uses: actions/checkout@v7');
    expect(block).toContain('repository: ArchonVII/github-workflows');
    expect(block).toContain('ref: ${{ inputs.workflow-library-ref }}');
    expect(block).toContain('path: __github-workflows__');
    expect(block).toContain(
      'node __github-workflows__/scripts/validate-check-map.mjs .agent/check-map.yml',
    );
    expect(block.indexOf('name: Check out consumer repository')).toBeLessThan(
      block.indexOf('name: Check out github-workflows for check-map validator'),
    );
    expect(block).not.toContain("grep -Eq '^required_gate:'");
    expect(block).not.toContain('check_name: repo-required-gate / decision');
  });
});

describe('repo-required-gate docs-gate lane (#104)', () => {
  it('declares the opt-in docs-system input defaulting to false', () => {
    const body = readWorkflow('repo-required-gate');

    const start = body.indexOf('      docs-system:');
    const end = body.indexOf('      workflow-library-ref:');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);

    const inputBlock = body.slice(start, end);
    expect(inputBlock).toContain('type: boolean');
    expect(inputBlock).toContain('default: false');
  });

  it('runs the docs gate only for opted-in consumers on pull_request events', () => {
    const body = readWorkflow('repo-required-gate');
    const block = workflowJobBlock(body, 'docs-gate');

    expect(block, 'docs-gate job exists').not.toBe('');
    // Conditioned on the INPUT directly (not a detect output) so a caller
    // whose workflow-library-ref lags this workflow body can never silently
    // no-op the gate via a missing classifier output.
    expect(block).toContain(
      "if: always() && inputs.docs-system && github.event_name == 'pull_request' && needs.detect.outputs.ok == 'true'",
    );
    // health.mjs --changed-from needs the merge base with the PR base branch;
    // the default depth-1 checkout cannot reach it.
    expect(block).toContain('fetch-depth: 0');
    expect(block).toContain('npm run docs:render -- --check');
    expect(block).toContain(
      'node scripts/doc-health/health.mjs --repo . --changed-from',
    );
  });

  it('emits the run-docs-gate detect output from the classifier', () => {
    const body = readWorkflow('repo-required-gate');

    expect(body).toContain('run-docs-gate: ${{ steps.detect.outputs.run-docs-gate }}');
    expect(body).toContain('DOCS_SYSTEM: ${{ inputs.docs-system }}');
    // The env -> classifyPR hand-off is the one wire the env/output assertions
    // above cannot see: without it, classifyPR gets docsSystem=undefined and
    // run-docs-gate is silently 'false', so the lane summary reports docs-gate
    // as skipped while decision (which reads inputs.docs-system directly)
    // still requires it.
    expect(body).toContain("docsSystem: process.env.DOCS_SYSTEM === 'true',");
    expect(body).toContain(
      "core.setOutput('run-docs-gate', String(result.outputs.runDocsGate));",
    );
  });

  it('aggregates the docs gate in decision with skipped != failed for non-opted consumers', () => {
    const body = readWorkflow('repo-required-gate');
    const decision = workflowJobBlock(body, 'decision');

    expect(decision, 'decision waits for docs-gate').toContain('- docs-gate');
    expect(decision).toContain('DOCS_GATE_RESULT: ${{ needs.docs-gate.result }}');
    expect(decision).toContain('RUN_DOCS_GATE: ${{ inputs.docs-system }}');
    expect(decision).toContain('require_success "docs gate" "$DOCS_GATE_RESULT"');
    // PR-only guard mirrors pr-contract: the docs-gate job itself skips on
    // push/merge_group even for opted-in consumers, so requiring it without
    // the event guard would fail every non-PR run of an opted-in consumer.
    expect(decision).toContain(
      'if [ "$RUN_DOCS_GATE" = "true" ] && [ "$EVENT_NAME" = "pull_request" ]; then',
    );
  });

  it('documents the docs-system opt-in in the example caller', () => {
    const body = readExample('repo-required-gate');

    expect(body).toContain('# docs-system: true');
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

  it('defaults to a green-by-default Node gate with dependency review opt-in', () => {
    const body = readExample('repo-required-gate');
    const jobBlock = workflowJobBlock(body, 'repo-required-gate');

    // The ArchonVII baseline always ships package.json + scripts/**, so a fresh
    // onboarded repo's first PR fails the gate when the scaffold defaults to
    // stack: minimal (the classifier rejects minimal once code/package files are
    // touched) — default to node instead (archon-setup#280). node-ci runs
    // scripts via `npm run --if-present`, so a repo without lint/test scripts is
    // still green.
    expect(jobBlock).toContain('stack: node');
    expect(jobBlock).not.toContain('\n      stack: minimal');

    // Dependency review requires GitHub Dependency Graph / Advanced Security,
    // which a freshly created repo does not have enabled — onboarding assumes
    // nothing GitHub-side, so the lane is off by default (archon-setup#281).
    expect(jobBlock).toContain('run-dependency-review: false');
  });
});

describe('anomaly-triage caller permission contract', () => {
  it('grants the reusable workflow the least write permissions it requires', () => {
    const body = readExample('anomaly-triage');

    // Reusable workflows cannot elevate the caller token. Without this block,
    // read-default consumers fail at workflow startup before jobs exist (#106).
    const permissionsStart = body.indexOf('permissions:');
    const jobsStart = body.indexOf('jobs:');
    expect(permissionsStart).toBeGreaterThan(-1);
    expect(permissionsStart).toBeLessThan(jobsStart);
    expect(body.slice(permissionsStart, jobsStart).replaceAll('\r\n', '\n').trim()).toBe(
      ['permissions:', '  contents: read', '  pull-requests: write', '  issues: write'].join('\n'),
    );
  });
});

describe('anomaly-triage metadata parser contract', () => {
  it('accepts the documented and legacy bold-field colon placement', () => {
    const body = readWorkflow('anomaly-triage');
    const parserLine = body
      .split(/\r?\n/)
      .find((line) => line.includes('const m = /^-'));
    const regexSource = parserLine?.match(/const m = \/(.+)\/\.exec\(line\);/)?.[1];

    expect(regexSource).toBeTruthy();
    const metadataLine = new RegExp(regexSource);

    const documentedFields = Object.fromEntries(
      [
        '- **Severity:** high',
        '- **File:** src/example.mjs',
        '- **Related to PR:** yes',
        '- **Downstream repo:** ArchonVII/example',
      ].map((line) => metadataLine.exec(line)?.slice(1)),
    );

    expect(documentedFields).toEqual({
      Severity: 'high',
      File: 'src/example.mjs',
      'Related to PR': 'yes',
      'Downstream repo': 'ArchonVII/example',
    });
    expect(metadataLine.exec('- **Related to PR**: yes')?.slice(1)).toEqual([
      'Related to PR',
      'yes',
    ]);
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

  it('no longer ships the retired fragment caller example stubs (#104)', () => {
    // Guidance cleanup only: the reusable workflow BODIES stay (existing
    // consumers still call them); only the examples/ stubs are retired so
    // new-workflow guidance stops pointing agents at fragment callers.
    expect(existsSync('examples/changelog-fragment.yml')).toBe(false);
    expect(existsSync('examples/repo-update-log-fragment.yml')).toBe(false);
    expect(existsSync('.github/workflows/changelog-fragment.yml')).toBe(true);
    expect(existsSync('.github/workflows/repo-update-log-fragment.yml')).toBe(true);
  });
});
