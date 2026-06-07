// Pure ES-module classifier for repo-required-gate.yml lane routing.
//
// Contract (issue #8 / Iridescent-Church plan 2026-05-20):
//   Given the changed-file list for a PR (or non-PR event), labels, and the
//   caller-declared stack + path inputs, decide which lane fires and which
//   downstream jobs should run.
//
// Lanes (one is chosen, by priority):
//   1. forced-full (label: <forceFullCiLabel>)  — user override, runs everything
//   2. snapshot-refresh                         — every file matches snapshotPaths
//   3. docs-only                                — every file matches doc filter
//   4. workflow-only                            — only .github/workflows or .githooks
//   5. policy-only                              — only AGENTS.md / .agent/**
//   6. code (node)                              — stack=node + code/pkg touched
//   7. code (python)                            — stack=python + code/pkg touched
//   8. code (go)                                — stack=go + code/pkg touched
//   9. code (polyglot: <langs>)                 — polyglot + matched language
//                                                 paths (node / python / go, in
//                                                 that order, joined with `+`)
//  10. pass-through                             — no files / non-PR with minimal stack
//
// This module is intentionally pure: it accepts already-fetched PR data via
// its function signature and performs no network or SDK calls. SDK access
// happens in the workflow caller (actions/github-script) which then passes
// the results into classifyPR().
//
// Path matching for nodePaths / pythonPaths / snapshotPaths / docPrefixes:
//   - One pattern per line. Blanks and `#` comments ignored.
//   - Trailing `/**` or `/`  → prefix match (e.g. `server/**` matches
//     `server/foo.ts` and `server/sub/bar.ts`).
//   - No wildcards            → exact-file match (e.g. `package.json`).
//   - Other glob features (mid-path `*`, negation) are intentionally NOT
//     supported to avoid a minimatch dependency; reach for those only if a
//     real consumer needs them.

const DEFAULT_DOC_EXTENSIONS =
  'md|mdx|txt|png|jpg|jpeg|gif|svg|webp|bmp|ico|avif';

const DEFAULT_DOC_PREFIXES = ['.changelog/', 'docs/'];

const DEFAULT_CODE_EXTENSIONS =
  /\.(c|cc|cpp|cs|go|java|js|jsx|ts|tsx|mjs|cjs|py|rs|rb|php|swift|kt|kts|scala)$/i;

const DEFAULT_PACKAGE_RE =
  /(^|\/)(package\.json|package-lock\.json|pnpm-lock\.yaml|yarn\.lock|pyproject\.toml|requirements(-dev)?\.txt|uv\.lock|poetry\.lock|Pipfile(\.lock)?|Cargo\.toml|Cargo\.lock|go\.mod|go\.sum)$/;

const VALID_STACKS = new Set(['node', 'python', 'go', 'minimal', 'polyglot']);

/**
 * @typedef {Object} ClassifyInput
 * @property {string[]} files               PR changed-file paths. Empty array for non-PR events.
 * @property {string[]} [labels]            PR label names (case-insensitive comparison).
 * @property {string}   stack               'node' | 'python' | 'minimal' | 'polyglot'.
 * @property {string}   [nodePaths]         Newline-separated patterns; required when stack='polyglot' (unless pythonPaths set).
 * @property {string}   [pythonPaths]       Newline-separated patterns; required when stack='polyglot' (unless nodePaths set).
 * @property {string}   [snapshotPaths]     Newline-separated patterns. Empty disables the snapshot-refresh lane.
 * @property {string}   [snapshotTestCommand] Non-empty when consumer wants the snapshot-validation job to actually run a test.
 * @property {string}   [forceFullCiLabel]  Label that forces full CI (default 'ci:full').
 * @property {string}   [docExtensions]     Pipe-separated extensions (no dots).
 * @property {string}   [docPrefixes]       Newline-separated prefixes (e.g. 'docs/', '.changelog/').
 * @property {boolean}  [isPullRequest]     False for push events; classifier widens routing accordingly.
 */

/**
 * @typedef {Object} ClassifyOutput
 * @property {boolean}        ok                       false when there is a fatal config error.
 * @property {string[]}       errors                   Fatal config errors (workflow should fail-fast on these).
 * @property {string}         lane                     Lane label for UI summary and core.notice.
 * @property {Object}         outputs                  Boolean flags matching the workflow's `needs.detect.outputs.*`.
 * @property {boolean}        outputs.docsOnly
 * @property {boolean}        outputs.runCi            Legacy aggregate; true if any language CI runs.
 * @property {boolean}        outputs.runNodeCi
 * @property {boolean}        outputs.runPythonCi
 * @property {boolean}        outputs.runGoCi
 * @property {boolean}        outputs.runDependencyReview
 * @property {boolean}        outputs.runWorkflowValidation
 * @property {boolean}        outputs.runPolicyValidation
 * @property {boolean}        outputs.snapshotOnly
 * @property {boolean}        outputs.runSnapshotValidation
 * @property {boolean}        outputs.forcedFull
 * @property {string[]}       jobsRequired             Job ids required for this lane.
 * @property {string[]}       jobsSkipped              Job ids deliberately skipped.
 * @property {string}         filesSummary             First 30 paths joined with `\n` for the step summary.
 */

/**
 * @param {ClassifyInput} input
 * @returns {ClassifyOutput}
 */
export function classifyPR(input) {
  const {
    files = [],
    labels = [],
    stack,
    nodePaths = '',
    pythonPaths = '',
    goPaths = '',
    snapshotPaths = '',
    snapshotTestCommand = '',
    forceFullCiLabel = 'ci:full',
    docExtensions = DEFAULT_DOC_EXTENSIONS,
    docPrefixes = DEFAULT_DOC_PREFIXES.join('\n'),
    isPullRequest = true,
  } = input;

  const errors = [];

  if (!VALID_STACKS.has(stack)) {
    errors.push(
      `Unknown stack "${stack}"; expected one of ${[...VALID_STACKS].join(', ')}.`,
    );
    return failedResult(errors);
  }

  const nodePatterns = parsePatterns(nodePaths);
  const pythonPatterns = parsePatterns(pythonPaths);
  const goPatterns = parsePatterns(goPaths);
  const snapshotPatterns = parsePatterns(snapshotPaths);
  const docPrefixList = parsePatterns(docPrefixes);

  // Guardrail #4: polyglot callers MUST declare at least one path list.
  // (If they declared only nodePaths we still infer python paths as empty —
  // that's a valid "all node, no python" polyglot.)
  if (
    stack === 'polyglot' &&
    nodePatterns.length === 0 &&
    pythonPatterns.length === 0 &&
    goPatterns.length === 0
  ) {
    errors.push(
      'stack=polyglot requires at least one of node-paths, python-paths, or go-paths to be set; all were empty.',
    );
    return failedResult(errors);
  }

  const docExtRe = new RegExp(`\\.(${docExtensions})$`, 'i');
  const isDocFile = (p) =>
    docExtRe.test(p) || docPrefixList.some((pre) => matchPattern(p, pre));

  const labelNames = (labels || []).map((l) => String(l).toLowerCase());
  const forcedFull = labelNames.includes(
    String(forceFullCiLabel || '').toLowerCase(),
  );

  // -------- non-PR (push) events: run everything within the stack ----------
  if (!isPullRequest) {
    const outputs = {
      docsOnly: false,
      runCi: stack !== 'minimal',
      runNodeCi: stack === 'node' || (stack === 'polyglot' && nodePatterns.length > 0),
      runPythonCi: stack === 'python' || (stack === 'polyglot' && pythonPatterns.length > 0),
      runGoCi: stack === 'go' || (stack === 'polyglot' && goPatterns.length > 0),
      runDependencyReview: false, // dep-review only meaningful on PR diff
      runWorkflowValidation: true,
      runPolicyValidation: true,
      snapshotOnly: false,
      runSnapshotValidation: false,
      forcedFull: false,
    };
    return {
      ok: true,
      errors,
      lane: 'push-event (broad validation)',
      outputs,
      jobsRequired: requiredJobs(outputs, false),
      jobsSkipped: skippedJobs(outputs, false),
      filesSummary: '',
    };
  }

  // -------- PR events --------------------------------------------------------
  const names = files.slice();

  // Policy files share the `.md` extension with docs but route to the
  // policy lane, not docs-only.
  const isPolicyFile = (name) =>
    name === 'AGENTS.md' ||
    name === 'CLAUDE.md' ||
    name === 'GEMINI.md' ||
    name === '.agent/check-map.yml' ||
    name.startsWith('.agent/schema/') ||
    name.startsWith('.github/');

  // Classify file footprint.
  const docsOnly =
    names.length > 0 &&
    names.every((name) => isDocFile(name) && !isPolicyFile(name));

  const workflowOrHook = names.some(
    (name) =>
      name.startsWith('.github/workflows/') || name.startsWith('.githooks/'),
  );

  const onlyWorkflowOrHook =
    names.length > 0 &&
    names.every(
      (name) =>
        name.startsWith('.github/workflows/') ||
        name.startsWith('.githooks/'),
    );

  const policy = names.some(isPolicyFile);

  const onlyPolicyNonWorkflow =
    names.length > 0 &&
    names.every(
      (name) =>
        (name === 'AGENTS.md' ||
          name === 'CLAUDE.md' ||
          name === 'GEMINI.md' ||
          name.startsWith('.agent/')) &&
        !name.startsWith('.github/workflows/') &&
        !name.startsWith('.githooks/'),
    );

  const packageTouched = names.some((name) => DEFAULT_PACKAGE_RE.test(name));

  const codeTouched = names.some((name) => {
    if (
      name.startsWith('.github/') ||
      name.startsWith('.githooks/') ||
      name.startsWith('.agent/')
    )
      return false;
    if (isDocFile(name)) return false;
    return (
      DEFAULT_CODE_EXTENSIONS.test(name) ||
      /^(src|test|tests|lib|bin|scripts)\//.test(name)
    );
  });

  // Snapshot-only — Guardrail #3: EVERY file must match snapshot-paths.
  const snapshotOnly =
    snapshotPatterns.length > 0 &&
    names.length > 0 &&
    names.every((name) =>
      snapshotPatterns.some((pat) => matchPattern(name, pat)),
    );

  // Per-language touch (polyglot stack uses this; other stacks derive
  // run-node-ci / run-python-ci from the legacy aggregate).
  const nodeTouched =
    nodePatterns.length > 0 &&
    names.some((name) =>
      nodePatterns.some((pat) => matchPattern(name, pat)),
    );
  const pythonTouched =
    pythonPatterns.length > 0 &&
    names.some((name) =>
      pythonPatterns.some((pat) => matchPattern(name, pat)),
    );
  const goTouched =
    goPatterns.length > 0 &&
    names.some((name) =>
      goPatterns.some((pat) => matchPattern(name, pat)),
    );

  // -------- forced-full override -------------------------------------------
  if (forcedFull) {
    const outputs = {
      docsOnly: false,
      runCi: stack !== 'minimal',
      runNodeCi:
        stack === 'node' ||
        (stack === 'polyglot' && nodePatterns.length > 0),
      runPythonCi:
        stack === 'python' ||
        (stack === 'polyglot' && pythonPatterns.length > 0),
      runGoCi:
        stack === 'go' ||
        (stack === 'polyglot' && goPatterns.length > 0),
      runDependencyReview: true,
      runWorkflowValidation: true,
      runPolicyValidation: true,
      snapshotOnly: false,
      runSnapshotValidation: false,
      forcedFull: true,
    };
    return {
      ok: true,
      errors,
      lane: `forced-full (label: ${forceFullCiLabel})`,
      outputs,
      jobsRequired: requiredJobs(outputs, true),
      jobsSkipped: skippedJobs(outputs, true),
      filesSummary: filesSummaryOf(names),
    };
  }

  // -------- snapshot-refresh -----------------------------------------------
  if (snapshotOnly) {
    const outputs = {
      docsOnly: false,
      runCi: false,
      runNodeCi: false,
      runPythonCi: false,
      runGoCi: false,
      runDependencyReview: false,
      runWorkflowValidation: false,
      runPolicyValidation: false,
      snapshotOnly: true,
      runSnapshotValidation: snapshotTestCommand.trim().length > 0,
      forcedFull: false,
    };
    return {
      ok: true,
      errors,
      lane: 'snapshot-refresh',
      outputs,
      jobsRequired: requiredJobs(outputs, true),
      jobsSkipped: skippedJobs(outputs, true),
      filesSummary: filesSummaryOf(names),
    };
  }

  // -------- docs-only ------------------------------------------------------
  if (docsOnly) {
    const outputs = {
      docsOnly: true,
      runCi: false,
      runNodeCi: false,
      runPythonCi: false,
      runGoCi: false,
      runDependencyReview: false,
      runWorkflowValidation: false,
      runPolicyValidation: false,
      snapshotOnly: false,
      runSnapshotValidation: false,
      forcedFull: false,
    };
    return {
      ok: true,
      errors,
      lane: 'docs-only',
      outputs,
      jobsRequired: requiredJobs(outputs, true),
      jobsSkipped: skippedJobs(outputs, true),
      filesSummary: filesSummaryOf(names),
    };
  }

  // -------- workflow-only --------------------------------------------------
  if (onlyWorkflowOrHook) {
    const outputs = {
      docsOnly: false,
      runCi: false,
      runNodeCi: false,
      runPythonCi: false,
      runGoCi: false,
      runDependencyReview: false,
      runWorkflowValidation: true,
      runPolicyValidation: false,
      snapshotOnly: false,
      runSnapshotValidation: false,
      forcedFull: false,
    };
    return {
      ok: true,
      errors,
      lane: 'workflow-only',
      outputs,
      jobsRequired: requiredJobs(outputs, true),
      jobsSkipped: skippedJobs(outputs, true),
      filesSummary: filesSummaryOf(names),
    };
  }

  // -------- policy-only ----------------------------------------------------
  if (onlyPolicyNonWorkflow) {
    const outputs = {
      docsOnly: false,
      runCi: false,
      runNodeCi: false,
      runPythonCi: false,
      runGoCi: false,
      runDependencyReview: false,
      runWorkflowValidation: false,
      runPolicyValidation: true,
      snapshotOnly: false,
      runSnapshotValidation: false,
      forcedFull: false,
    };
    return {
      ok: true,
      errors,
      lane: 'policy-only',
      outputs,
      jobsRequired: requiredJobs(outputs, true),
      jobsSkipped: skippedJobs(outputs, true),
      filesSummary: filesSummaryOf(names),
    };
  }

  // -------- code-touched paths ---------------------------------------------
  // Preserves the original invariant: stack=minimal must not see code or
  // package changes. The wizard / template chose the wrong stack if we hit
  // this branch on a minimal repo.
  if (stack === 'minimal' && (codeTouched || packageTouched)) {
    errors.push(
      'stack=minimal but code or package files were touched; convert to stack=node, stack=python, or stack=polyglot.',
    );
    return failedResult(errors);
  }

  // Stack-dependent language-CI fan-out.
  let runNodeCi = false;
  let runPythonCi = false;
  let runGoCi = false;

  if (stack === 'node') {
    runNodeCi = packageTouched || codeTouched;
  } else if (stack === 'python') {
    runPythonCi = packageTouched || codeTouched;
  } else if (stack === 'go') {
    runGoCi = packageTouched || codeTouched;
  } else if (stack === 'polyglot') {
    runNodeCi = nodeTouched;
    runPythonCi = pythonTouched;
    runGoCi = goTouched;
    // Polyglot fallback: if package files were touched but path predicates
    // didn't match (e.g. root package.json + nothing else), run node CI by
    // convention because every npm-workspaces consumer has a root manifest.
    // Consumers that want stricter behavior should put package.json in
    // node-paths explicitly (recommended in plan §1). Go consumers should
    // list go.mod/go.sum in go-paths so module bumps route to go-ci directly.
    if (!runNodeCi && !runPythonCi && !runGoCi && packageTouched) {
      runNodeCi = nodePatterns.length > 0;
      runPythonCi = nodePatterns.length === 0 && pythonPatterns.length > 0;
    }
  }
  // stack=minimal → both stay false (decision job will error if code is
  // touched on a minimal repo; that's intentional).

  const outputs = {
    docsOnly: false,
    runCi: runNodeCi || runPythonCi || runGoCi,
    runNodeCi,
    runPythonCi,
    runGoCi,
    runDependencyReview: packageTouched,
    runWorkflowValidation: workflowOrHook,
    runPolicyValidation: policy,
    snapshotOnly: false,
    runSnapshotValidation: false,
    forcedFull: false,
  };

  return {
    ok: true,
    errors,
    lane: codeLaneLabel(stack, runNodeCi, runPythonCi, runGoCi),
    outputs,
    jobsRequired: requiredJobs(outputs, true),
    jobsSkipped: skippedJobs(outputs, true),
    filesSummary: filesSummaryOf(names),
  };
}

function codeLaneLabel(stack, runNodeCi, runPythonCi, runGoCi) {
  if (stack === 'polyglot') {
    const langs = [];
    if (runNodeCi) langs.push('node');
    if (runPythonCi) langs.push('python');
    if (runGoCi) langs.push('go');
    return langs.length ? `code (polyglot: ${langs.join('+')})` : 'pass-through';
  }
  if (stack === 'node' && runNodeCi) return 'code (node)';
  if (stack === 'python' && runPythonCi) return 'code (python)';
  if (stack === 'go' && runGoCi) return 'code (go)';
  if (stack === 'minimal') return 'pass-through (minimal)';
  return 'pass-through';
}

function requiredJobs(outputs, runPrContract) {
  const jobs = ['detect'];
  if (runPrContract) jobs.push('pr-contract');
  if (outputs.runWorkflowValidation) jobs.push('workflow-validation');
  if (outputs.runPolicyValidation) jobs.push('policy-validation');
  if (outputs.runDependencyReview) jobs.push('dependency-review');
  if (outputs.runNodeCi) jobs.push('node-ci');
  if (outputs.runPythonCi) jobs.push('python-ci');
  if (outputs.runGoCi) jobs.push('go-ci');
  if (outputs.runSnapshotValidation) jobs.push('snapshot-validation');
  jobs.push('decision');
  return jobs;
}

function skippedJobs(outputs, isPullRequest) {
  const all = [
    'workflow-validation',
    'policy-validation',
    'dependency-review',
    'node-ci',
    'python-ci',
    'go-ci',
    'snapshot-validation',
  ];
  const required = new Set(requiredJobs(outputs, isPullRequest));
  return all.filter((j) => !required.has(j));
}

function filesSummaryOf(names) {
  return names.slice(0, 30).join('\n');
}

function failedResult(errors) {
  return {
    ok: false,
    errors,
    lane: 'error',
    outputs: {
      docsOnly: false,
      runCi: false,
      runNodeCi: false,
      runPythonCi: false,
      runGoCi: false,
      runDependencyReview: false,
      runWorkflowValidation: false,
      runPolicyValidation: false,
      snapshotOnly: false,
      runSnapshotValidation: false,
      forcedFull: false,
    },
    jobsRequired: ['detect'],
    jobsSkipped: [],
    filesSummary: '',
  };
}

// Parse a newline-separated pattern list. Strips comments (`#`) and blanks.
function parsePatterns(raw) {
  if (!raw) return [];
  return String(raw)
    .split(/\r?\n/)
    .map((s) => s.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

// Match a single path against a single pattern.
//   `foo/bar/**`  →  prefix match `foo/bar/`
//   `foo/`         →  prefix match `foo/`
//   `foo.json`     →  exact match
function matchPattern(path, pattern) {
  if (!pattern) return false;
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -2); // keep trailing '/'
    return path === prefix.slice(0, -1) || path.startsWith(prefix);
  }
  if (pattern.endsWith('/')) {
    return path.startsWith(pattern);
  }
  return path === pattern;
}
