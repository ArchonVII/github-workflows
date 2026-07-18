import { describe, expect, it } from 'vitest';

import { validateCheckMap } from './validate-check-map.mjs';

const expectValid = (source, expectedNames) => {
  const result = validateCheckMap(source);

  expect(result.errors).toEqual([]);
  expect(result.ok).toBe(true);
  expect(result.requiredCheckNames).toEqual(expectedNames);
};

const expectInvalid = (source, errorPattern) => {
  const result = validateCheckMap(source);

  expect(result.ok).toBe(false);
  expect(result.errors.join('\n')).toMatch(errorPattern);
};

describe('check-map required-gate validation', () => {
  it('accepts a canonical plural list with multiple custom check names', () => {
    expectValid(
      `version: 2 # schema version

required_gates:
  - check_name: "repo-required-gate / decision" # stable gate
    workflow: .github/workflows/repo-required-gate.yml
  - check_name: custom security / decision
    workflow: .github/workflows/security.yml

paths:
  policy:
    requires: [policy-validation]
`,
      ['repo-required-gate / decision', 'custom security / decision'],
    );
  });

  it('keeps the legacy singular mapping compatible', () => {
    expectValid(
      `version: 1
required_gate:
  check_name: 'legacy # decision'
  workflow: .github/workflows/repo-required-gate.yml
`,
      ['legacy # decision'],
    );
  });

  it('accepts quoted names that would otherwise be YAML booleans or numbers', () => {
    expectValid(
      `version: 1
required_gates:
  - check_name: "true"
  - check_name: '123'
`,
      ['true', '123'],
    );
  });

  it('accepts a plural mapping whose item marker is on its own line', () => {
    expectValid(
      `version: 1
required_gates:
  -
    check_name: standalone dash / decision
`,
      ['standalone dash / decision'],
    );
  });

  it.each([
    ['missing', 'required_gate:\n  check_name: gate / decision\n'],
    ['empty', 'version:\nrequired_gate:\n  check_name: gate / decision\n'],
    ['non-integer', 'version: latest\nrequired_gate:\n  check_name: gate / decision\n'],
    ['duplicate', 'version: 1\nversion: 2\nrequired_gate:\n  check_name: gate / decision\n'],
  ])('rejects a %s version declaration', (_label, source) => {
    expectInvalid(source, /version/i);
  });

  it('rejects a missing required-gate declaration', () => {
    expectInvalid('version: 1\npaths: {}\n', /required_gate|required_gates/i);
  });

  it('rejects a version mapping separator without required whitespace', () => {
    expectInvalid(
      `version:1
required_gate:
  check_name: gate / decision
`,
      /top-level|version/i,
    );
  });

  it.each([
    [
      'singular',
      `version: 1
required_gate:
  check_name:gate / decision
`,
    ],
    [
      'plural',
      `version: 1
required_gates:
  - check_name:gate / decision
`,
    ],
  ])('rejects a %s check_name separator without required whitespace', (_shape, source) => {
    expectInvalid(source, /mapping|check_name/i);
  });

  it('rejects ambiguous singular and plural declarations', () => {
    expectInvalid(
      `version: 1
required_gate:
  check_name: legacy / decision
required_gates:
  - check_name: canonical / decision
`,
      /both|required_gate.*required_gates/i,
    );
  });

  it.each([
    ['inline empty list', 'version: 1\nrequired_gates: []\n'],
    ['empty block', 'version: 1\nrequired_gates:\npaths: {}\n'],
  ])('rejects an %s plural declaration', (_label, source) => {
    expectInvalid(source, /required_gates.*empty|at least one/i);
  });

  it.each([
    [
      'entry without check_name',
      `version: 1
required_gates:
  - workflow: .github/workflows/repo-required-gate.yml
`,
    ],
    [
      'entry with an empty check_name',
      `version: 1
required_gates:
  - check_name: " "
`,
    ],
    [
      'empty list item',
      `version: 1
required_gates:
  -
`,
    ],
    [
      'scalar list item',
      `version: 1
required_gates:
  - custom gate / decision
`,
    ],
  ])('rejects a plural %s', (_label, source) => {
    expectInvalid(source, /required_gates|check_name|mapping|empty/i);
  });

  it('does not let a check_name outside the gate declaration mask a malformed entry', () => {
    expectInvalid(
      `version: 1
required_gates:
  - workflow: .github/workflows/repo-required-gate.yml
metadata:
  check_name: valid but unrelated / decision
`,
      /check_name/i,
    );
  });

  it('does not let a nested check_name mask a missing direct entry field', () => {
    expectInvalid(
      `version: 1
required_gates:
  - metadata:
      check_name: nested / decision
`,
      /check_name/i,
    );
  });

  it.each([
    [
      'singular',
      `version: 1
required_gate:
  check_name: gate / decision
    unexpected: nested content
`,
    ],
    [
      'plural',
      `version: 1
required_gates:
  - check_name: gate / decision
      unexpected: nested content
`,
    ],
  ])('rejects unexpected over-indented content in a %s gate block', (_shape, source) => {
    expectInvalid(source, /indent|nested|unexpected/i);
  });

  it('rejects duplicate plural check names after decoding quoted scalars', () => {
    expectInvalid(
      `version: 1
required_gates:
  - check_name: duplicate / decision
  - check_name: "duplicate / decision"
`,
      /duplicate.*check_name/i,
    );
  });

  it.each([
    'true',
    'FALSE',
    '123',
    '-1.5',
    '1.',
    '6.02e23',
    '01',
    '+01',
    '01.5',
    '0b10',
    '0o17',
    '0x2A',
    '.nan',
  ])(
    'rejects the YAML non-string bare scalar %s as a check name',
    (value) => {
      expectInvalid(
        `version: 1
required_gate:
  check_name: ${value}
`,
        /string|check_name/i,
      );
    },
  );

  it.each([
    ['colon followed by whitespace', 'gate: broken'],
    ['terminal colon', 'gate:'],
    ['sequence indicator', '- gate'],
    ['mapping-key indicator', '? gate'],
    ['mapping-value indicator', ': gate'],
    ['flow-sequence close', ']gate'],
    ['flow-mapping close', '}gate'],
    ['flow separator', ',gate'],
    ['directive indicator', '%gate'],
    ['reserved at indicator', '@gate'],
    ['reserved backtick indicator', '`gate'],
    ['control character', 'gate\u0007suffix'],
  ])('rejects unsupported plain YAML syntax: %s', (_label, value) => {
    expectInvalid(
      `version: 1
required_gate:
  check_name: ${value}
`,
      /string|check_name|mapping/i,
    );
  });

  it.each(['"line\\nbreak"', '"unicode \\u0041"']) (
    'rejects unsupported quoted YAML escape syntax in %s',
    (value) => {
      expectInvalid(
        `version: 1
required_gate:
  check_name: ${value}
`,
        /quoted|check_name|string/i,
      );
    },
  );

  it.each(['-check_name: hidden', '-# hidden comment']) (
    'rejects a plural list item without whitespace after the dash: %s',
    (item) => {
      expectInvalid(
        `version: 1
required_gates:
  ${item}
    check_name: visible / decision
`,
        /list|separator|required_gates/i,
      );
    },
  );

  it.each([
    [
      'required_gate',
      `version: 1
required_gate:
  check_name: first / decision
required_gate:
  check_name: second / decision
`,
    ],
    [
      'required_gates',
      `version: 1
required_gates:
  - check_name: first / decision
required_gates:
  - check_name: second / decision
`,
    ],
  ])('rejects duplicate top-level %s declarations', (_key, source) => {
    expectInvalid(source, /duplicate/i);
  });

  it('rejects malformed top-level declarations', () => {
    expectInvalid(
      `version: 1
required_gates
  - check_name: gate / decision
`,
      /top-level|required_gates/i,
    );
  });

  it('rejects tab indentation instead of interpreting a different structure', () => {
    expectInvalid(
      'version: 1\nrequired_gates:\n\t- check_name: gate / decision\n',
      /tab/i,
    );
  });

  it('rejects duplicate check_name fields within one gate entry', () => {
    expectInvalid(
      `version: 1
required_gates:
  - check_name: first / decision
    check_name: second / decision
`,
      /duplicate.*check_name/i,
    );
  });
});
