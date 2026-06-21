const DEFAULT_FRAGMENT_DIR = 'docs/repo-update-log/';
const DEFAULT_DOC_EXTENSIONS = 'md|txt|png|jpg|jpeg|gif|svg|webp|bmp|ico|avif';
const DEFAULT_DOC_PREFIXES = ['.changelog/'];
const DEFAULT_PROTECTED_PATHS = [
  '.agent/',
  '.github/',
  '.githooks/',
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'ARCHITECTURE.md',
  'CHANGELOG.md',
  'DESIGN.md',
  'README.md',
  'TODO.md',
  'VISION.md',
  'llms.txt',
  'docs/CANON.md',
  'docs/INDEX.md',
  'docs/LIBRARIAN.md',
  'docs/project-status.md',
  'docs/repo-update-log/README.md',
  'docs/agent-process/',
  'docs/decisions/',
];
const DEFAULT_DOC_ONLY_SKIP_PATTERN = [
  '\\b(repo[- ]?update[- ]?log|update[- ]?log|ledger)\\b[\\s\\S]{0,160}',
  '\\b(not required|not needed|skipped|skip|omitted|doc[- ]only typo)\\b',
  '|',
  '\\bdoc[- ]only typo\\b[\\s\\S]{0,160}',
  '\\b(repo[- ]?update[- ]?log|update[- ]?log|ledger)\\b',
].join('');

function normalizePath(path) {
  return String(path || '').replace(/\\/g, '/').replace(/^\.\//, '');
}

function normalizeDir(path) {
  const normalized = normalizePath(path || DEFAULT_FRAGMENT_DIR);
  return normalized.endsWith('/') ? normalized : `${normalized}/`;
}

function splitList(value, fallback = []) {
  if (Array.isArray(value)) return value.map(normalizePath).filter(Boolean);
  const text = String(value || '').trim();
  if (!text) return fallback;
  return text.split(/\r?\n/).map((item) => normalizePath(item.trim())).filter(Boolean);
}

function makeDocExtensionRe(value) {
  const source = String(value || DEFAULT_DOC_EXTENSIONS).trim() || DEFAULT_DOC_EXTENSIONS;
  return new RegExp(`\\.(${source})$`, 'i');
}

function fileName(file) {
  return normalizePath(typeof file === 'string' ? file : file?.filename || file?.path || '');
}

function fileStatus(file) {
  return String(typeof file === 'string' ? 'modified' : file?.status || 'modified').toLowerCase();
}

function matchesPathList(path, entries) {
  return entries.some((entry) => {
    if (!entry) return false;
    if (entry.endsWith('/**')) return path.startsWith(entry.slice(0, -2));
    if (entry.endsWith('/')) return path.startsWith(entry);
    return path === entry;
  });
}

function error(code, message, path = 'files') {
  return { code, message, path };
}

export function evaluateRepoUpdateLogFragment(input = {}, options = {}) {
  const fragmentDir = normalizeDir(options.fragmentDir || input.fragmentDir || DEFAULT_FRAGMENT_DIR);
  const files = (input.files || []).map((file) => ({
    filename: fileName(file),
    status: fileStatus(file),
  })).filter((file) => file.filename);
  const body = String(input.body || '');
  const docExtRe = makeDocExtensionRe(options.docOnlyExtensions || input.docOnlyExtensions);
  const docPrefixes = splitList(
    options.docOnlyPathPrefixes || input.docOnlyPathPrefixes,
    DEFAULT_DOC_PREFIXES,
  );
  const protectedPaths = splitList(
    options.protectedPaths || input.protectedPaths,
    DEFAULT_PROTECTED_PATHS,
  );
  const docOnlySkipRe = new RegExp(
    options.docOnlySkipPattern || input.docOnlySkipPattern || DEFAULT_DOC_ONLY_SKIP_PATTERN,
    'i',
  );

  const isFragment = (file) => (
    file.filename.startsWith(fragmentDir)
    && file.filename.endsWith('.md')
    && ['added', 'renamed'].includes(file.status)
  );
  const addedFragment = files.some(isFragment);
  const ledgerOnly = files.length > 0 && files.every(isFragment);
  const protectedFiles = files.filter((file) => matchesPathList(file.filename, protectedPaths));
  const docOnly = files.length > 0 && files.every((file) => (
    docExtRe.test(file.filename) || matchesPathList(file.filename, docPrefixes)
  ));
  const docOnlySkipRecorded = docOnlySkipRe.test(body);
  const requiresFragment = !docOnly || protectedFiles.length > 0;

  const facts = {
    fragmentDir,
    fileCount: files.length,
    addedFragment,
    ledgerOnly,
    docOnly,
    docOnlySkipRecorded,
    protectedFiles: protectedFiles.map((file) => file.filename),
    docOnlyExempted: false,
  };

  if (files.length === 0) {
    return {
      ok: false,
      errors: [error('no_changed_files', 'No PR files were available to evaluate.')],
      facts,
    };
  }

  if (ledgerOnly) {
    return { ok: true, errors: [], facts };
  }

  if (addedFragment) {
    return { ok: true, errors: [], facts };
  }

  if (!requiresFragment) {
    if (docOnlySkipRecorded) {
      return {
        ok: true,
        errors: [],
        facts: { ...facts, docOnlyExempted: true },
      };
    }

    return {
      ok: false,
      errors: [
        error(
          'missing_doc_only_skip_reason',
          'Doc-only PRs without a repo-update-log fragment must state why the fragment is not required in the PR body.',
          'body',
        ),
      ],
      facts,
    };
  }

  return {
    ok: false,
    errors: [
      error(
        'missing_repo_update_log_fragment',
        `This PR requires an added ${fragmentDir}*.md fragment.`,
      ),
    ],
    facts,
  };
}

export function formatRepoUpdateLogFragmentResult(result) {
  if (result?.ok) {
    const reason = result.facts?.ledgerOnly
      ? 'ledger-only/backfill PR'
      : result.facts?.docOnlyExempted
        ? 'doc-only skip reason recorded'
        : `found an added ${result.facts?.fragmentDir || DEFAULT_FRAGMENT_DIR}*.md fragment`;
    return `Repo update log fragment check passed: ${reason}.`;
  }

  const lines = ['Repo update log fragment check failed.', '', 'Required fixes:'];
  for (const item of result?.errors || []) {
    lines.push(`- [${item.code}] ${item.message}`);
  }
  lines.push('');
  lines.push(`Add one ${result?.facts?.fragmentDir || DEFAULT_FRAGMENT_DIR}*.md fragment for code/config/behavior/protected-doc/workflow/policy changes.`);
  lines.push('For an unprotected doc-only typo fix, record why the fragment is not required in the PR body.');
  return lines.join('\n');
}
