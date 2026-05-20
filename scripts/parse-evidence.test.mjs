import { describe, it, expect } from 'vitest';
import { parseEvidence } from './parse-evidence.mjs';

// Fixed times for deterministic tests.
// HEAD commit is at 2026-05-19T12:00:00Z; "now" is 1 hour later.
const HEAD = '2026-05-19T12:00:00Z';
const NOW  = '2026-05-19T13:00:00Z';

// Helper: build a body with one checked item + one fenced evidence block.
function withEvidence(claim, block, opts = {}) {
  const checked = opts.checked === false ? ' ' : 'x';
  return [
    `- [${checked}] ${claim}`,
    '',
    '```evidence',
    ...block,
    '```',
    '',
  ].join('\n');
}

const baseCtx = (over = {}) => ({
  headCommitTime: HEAD,
  now: NOW,
  checkRuns: [],
  ...over,
});

describe('parseEvidence — happy paths', () => {
  it('1. valid local — passes', () => {
    const body = withEvidence('Tests pass', [
      'command: npm test',
      'location: local',
      'result: pass: 19/19',
      'timestamp: 2026-05-19T12:30:00Z',
    ]);
    const r = parseEvidence(body, baseCtx());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('2. valid ci with matching successful check-run — passes', () => {
    const body = withEvidence('CI green', [
      'command: ci-success',
      'location: ci',
      'result: pass',
      'timestamp: 2026-05-19T12:45:00Z',
    ]);
    const r = parseEvidence(body, baseCtx({
      checkRuns: [{ name: 'ci-success', completed_at: '2026-05-19T12:45:00Z', conclusion: 'success' }],
    }));
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('3. valid manual — passes', () => {
    const body = withEvidence('Screenshot reviewed', [
      'command: manual smoke — sidebar resize looks correct',
      'location: manual',
      'result: pass: screenshot attached',
      'timestamp: 2026-05-19T12:30:00Z',
    ]);
    const r = parseEvidence(body, baseCtx());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe('parseEvidence — structural errors', () => {
  it('4. checked item with no fenced block — error', () => {
    const body = '- [x] Tests pass\n\nSome other text.\n';
    const r = parseEvidence(body, baseCtx());
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/missing a fenced/);
  });

  it('5. two fenced blocks under one item — error', () => {
    const body = [
      '- [x] Tests pass',
      '',
      '```evidence',
      'command: npm test',
      'location: local',
      'result: pass',
      'timestamp: 2026-05-19T12:30:00Z',
      '```',
      '',
      '```evidence',
      'command: npm run lint',
      'location: local',
      'result: pass',
      'timestamp: 2026-05-19T12:31:00Z',
      '```',
      '',
    ].join('\n');
    const r = parseEvidence(body, baseCtx());
    expect(r.ok).toBe(false);
    expect(r.errors.some((e) => /more than one evidence block/.test(e))).toBe(true);
  });

  it('6. malformed YAML (missing colon) — error', () => {
    const body = withEvidence('Tests pass', [
      'command npm test',
      'location: local',
      'result: pass',
      'timestamp: 2026-05-19T12:30:00Z',
    ]);
    const r = parseEvidence(body, baseCtx());
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/malformed|unparseable/);
  });

  it('7. unknown location value — error', () => {
    const body = withEvidence('Tests pass', [
      'command: npm test',
      'location: cloud',
      'result: pass',
      'timestamp: 2026-05-19T12:30:00Z',
    ]);
    const r = parseEvidence(body, baseCtx());
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/unknown location/);
  });
});

describe('parseEvidence — command validation', () => {
  it('8. local with command "ran tests" (no token) — error', () => {
    const body = withEvidence('Tests pass', [
      'command: ran tests',
      'location: local',
      'result: pass',
      'timestamp: 2026-05-19T12:30:00Z',
    ]);
    const r = parseEvidence(body, baseCtx());
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/no recognised executable token/);
  });

  it('9. ci with command not in checkRuns — error', () => {
    const body = withEvidence('CI green', [
      'command: nonexistent-check',
      'location: ci',
      'result: pass',
      'timestamp: 2026-05-19T12:45:00Z',
    ]);
    const r = parseEvidence(body, baseCtx({ checkRuns: [] }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/not a check-run/);
  });

  it('10. ci with check-run conclusion failure — error', () => {
    const body = withEvidence('CI green', [
      'command: ci-success',
      'location: ci',
      'result: pass',
      'timestamp: 2026-05-19T12:45:00Z',
    ]);
    const r = parseEvidence(body, baseCtx({
      checkRuns: [{ name: 'ci-success', completed_at: '2026-05-19T12:45:00Z', conclusion: 'failure' }],
    }));
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/conclusion "failure"/);
  });
});

describe('parseEvidence — timestamp validation', () => {
  it('11. future timestamp (> now + 5min) — error', () => {
    const body = withEvidence('Tests pass', [
      'command: npm test',
      'location: local',
      'result: pass',
      // NOW is 13:00:00Z; +1h is well beyond +5min.
      'timestamp: 2026-05-19T14:00:00Z',
    ]);
    const r = parseEvidence(body, baseCtx());
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/future timestamp/);
  });

  it('12. pre-head timestamp (local) — error', () => {
    const body = withEvidence('Tests pass', [
      'command: npm test',
      'location: local',
      'result: pass',
      // HEAD is 12:00Z; an hour earlier is way before head - 5min.
      'timestamp: 2026-05-19T11:00:00Z',
    ]);
    const r = parseEvidence(body, baseCtx());
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/predates PR head/);
  });

  it('13. ci prose timestamp drifts >5min from completed_at — warning, ok:true', () => {
    const body = withEvidence('CI green', [
      'command: ci-success',
      'location: ci',
      'result: pass',
      // 20 min before check-run completed_at; drift warning.
      'timestamp: 2026-05-19T12:25:00Z',
    ]);
    const r = parseEvidence(body, baseCtx({
      checkRuns: [{ name: 'ci-success', completed_at: '2026-05-19T12:45:00Z', conclusion: 'success' }],
    }));
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => /drifts >5min/.test(w))).toBe(true);
  });

  it('14. unchecked box with no evidence — warning, ok:true', () => {
    const body = '- [ ] Tests pass\n';
    const r = parseEvidence(body, baseCtx());
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
    expect(r.warnings.some((w) => /Unchecked/.test(w))).toBe(true);
  });

  it('16. local with grep command — passes (regression: PR #19 dogfood)', () => {
    // Source: PR #19 review patch 1 (2026-05-20). Guards against the dogfood
    // regression where `grep -nE "ERROR" build.log` would hard-fail under
    // enforce mode because `grep` wasn't in LOCAL_TOKENS.
    const body = withEvidence('Log scanned for errors', [
      'command: grep -nE "ERROR" build.log',
      'location: local',
      'result: pass: 0 matches',
      'timestamp: 2026-05-19T12:30:00Z',
    ]);
    const r = parseEvidence(body, baseCtx());
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
  });

  it('15. invalid ISO timestamp — error', () => {
    const body = withEvidence('Tests pass', [
      'command: npm test',
      'location: local',
      'result: pass',
      'timestamp: not-a-date',
    ]);
    const r = parseEvidence(body, baseCtx());
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/invalid ISO-8601/);
  });
});
