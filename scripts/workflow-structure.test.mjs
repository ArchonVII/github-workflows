import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const readWorkflow = (name) => readFileSync(`.github/workflows/${name}.yml`, 'utf8');

describe('node-ci workflow package-manager setup', () => {
  it('detects the lockfile before setup-node configures dependency caching', () => {
    const body = readWorkflow('node-ci');

    expect(body).toContain('default: "auto"');
    expect(body).toContain('cache: ${{ steps.pm.outputs.cache }}');
    expect(body).toContain('cache-dependency-path: ${{ steps.pm.outputs.cache-dependency-path }}');

    const detectIndex = body.indexOf('- name: Detect package manager');
    const setupPnpmIndex = body.indexOf('- name: Set up pnpm');
    const setupNodeIndex = body.indexOf('- uses: actions/setup-node@v4');

    expect(detectIndex).toBeGreaterThan(-1);
    expect(setupPnpmIndex).toBeGreaterThan(detectIndex);
    expect(setupNodeIndex).toBeGreaterThan(setupPnpmIndex);
  });

  it('installs pnpm before setup-node enables pnpm caching', () => {
    const body = readWorkflow('node-ci');

    expect(body).toContain('uses: pnpm/action-setup@v4');
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
});
