const DEFAULT_PROTECTED_PATTERNS = [
  '.github/**',
  '.githooks/**',
  '.agent/**',
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'yarn.lock',
  'src/**',
  'scripts/**',
];

/**
 * Evaluate ArchonVII role-separation policy for a PR.
 *
 * This helper is intentionally pure. The workflow gathers PR files, commits,
 * reviews, labels, and body text via the GitHub API, then passes normalized
 * values here for deterministic validation.
 *
 * @param {object} input
 * @param {string} input.prAuthor
 * @param {string} input.headRef
 * @param {string[]} input.files
 * @param {string[]} input.commitAuthors
 * @param {string[]} input.approvedReviewAuthors
 * @param {string[]} input.labels
 * @param {string} input.body
 * @param {boolean} input.enforceRoleSeparation
 * @param {string|string[]} [input.protectedPathPatterns]
 * @returns {{
 *   ok: boolean,
 *   warnings: string[],
 *   errors: string[],
 *   protectedPaths: string[],
 *   selfAuthored: boolean,
 *   agentManaged: boolean,
 *   independentApproval: boolean,
 *   releaseAdmiralMarker: string,
 *   dependabotExempt: boolean,
 *   ownerMaintenancePrExempt: false,
 * }}
 */
export function evaluateRolePolicy(input) {
  const {
    prAuthor = '',
    headRef = '',
    files = [],
    commitAuthors = [],
    approvedReviewAuthors = [],
    labels = [],
    body = '',
    enforceRoleSeparation = false,
    protectedPathPatterns = DEFAULT_PROTECTED_PATTERNS,
  } = input || {};

  const warnings = [];
  const errors = [];
  const authorKey = normalizeActor(prAuthor);
  const commitAuthorKeys = new Set((commitAuthors || []).map(normalizeActor).filter(Boolean));
  const protectedPatterns = parsePatterns(protectedPathPatterns);
  const protectedPaths = (files || []).filter((file) =>
    protectedPatterns.some((pattern) => matchPattern(file, pattern)),
  );

  const dependabotExempt = isDependabot(prAuthor, headRef);
  if (dependabotExempt) {
    return {
      ok: true,
      warnings,
      errors,
      protectedPaths,
      selfAuthored: false,
      agentManaged: false,
      independentApproval: false,
      releaseAdmiralMarker: '',
      dependabotExempt: true,
      ownerMaintenancePrExempt: false,
    };
  }

  const selfAuthored = Boolean(authorKey && commitAuthorKeys.has(authorKey));
  const agentManaged = isAgentManaged({ headRef, labels, body });
  const independentApproval = hasIndependentApproval({
    approvedReviewAuthors,
    prAuthor,
    commitAuthors,
  });
  const releaseAdmiralMarker = findReleaseAdmiralMarker(body);
  const markerIndependent = Boolean(
    releaseAdmiralMarker &&
      isIndependentActor(releaseAdmiralMarker, [prAuthor, ...commitAuthors]),
  );

  if (selfAuthored) {
    warnings.push(
      `Role separation: PR author "${prAuthor}" also authored commits. This is a same account signal; default policy warns but does not fail.`,
    );
  }

  if (/owner maintenance lane/i.test(body || '')) {
    warnings.push(
      'Owner Maintenance Lane is direct-commit-only; PRs receive no owner-maintenance exemption in pr-policy.',
    );
  }

  if (
    enforceRoleSeparation &&
    agentManaged &&
    protectedPaths.length > 0 &&
    !independentApproval &&
    !markerIndependent
  ) {
    errors.push(
      `Agent-managed PR touches protected path(s) (${protectedPaths.join(', ')}) and needs independent Release-Admiral approval or a non-author Release-Admiral marker.`,
    );
  }

  return {
    ok: errors.length === 0,
    warnings,
    errors,
    protectedPaths,
    selfAuthored,
    agentManaged,
    independentApproval,
    releaseAdmiralMarker,
    dependabotExempt: false,
    ownerMaintenancePrExempt: false,
  };
}

function isDependabot(prAuthor, headRef) {
  const author = normalizeActor(prAuthor);
  return author === 'dependabot[bot]' || String(headRef || '').startsWith('dependabot/');
}

function isAgentManaged({ headRef, labels, body }) {
  const labelText = (labels || []).join(' ');
  return (
    String(headRef || '').startsWith('agent/') ||
    /\bagent[- ]managed\b/i.test(labelText) ||
    /\bProject-Lieutenant\b/i.test(body || '') ||
    /\bLIEUTENANT_HANDOFF\b/i.test(body || '')
  );
}

function hasIndependentApproval({ approvedReviewAuthors, prAuthor, commitAuthors }) {
  return (approvedReviewAuthors || []).some((reviewer) =>
    isIndependentActor(reviewer, [prAuthor, ...(commitAuthors || [])]),
  );
}

function isIndependentActor(actor, blockedActors) {
  const actorKey = normalizeActor(actor);
  if (!actorKey) return false;
  const blocked = new Set((blockedActors || []).map(normalizeActor).filter(Boolean));
  return !blocked.has(actorKey);
}

function findReleaseAdmiralMarker(body) {
  const match = String(body || '').match(/Release[- ]Admiral\s*:\s*(@?[A-Za-z0-9_.-]+)/i);
  return match ? match[1] : '';
}

function normalizeActor(actor) {
  return String(actor || '').trim().replace(/^@/, '').toLowerCase();
}

function parsePatterns(raw) {
  if (Array.isArray(raw)) return raw.map(String).map((s) => s.trim()).filter(Boolean);
  if (!raw) return DEFAULT_PROTECTED_PATTERNS;
  return String(raw)
    .split(/\r?\n/)
    .map((s) => s.replace(/#.*$/, '').trim())
    .filter(Boolean);
}

function matchPattern(path, pattern) {
  if (!pattern) return false;
  if (pattern.endsWith('/**')) {
    const prefix = pattern.slice(0, -2);
    return path === prefix.slice(0, -1) || path.startsWith(prefix);
  }
  if (pattern.endsWith('/')) return path.startsWith(pattern);
  return path === pattern;
}
