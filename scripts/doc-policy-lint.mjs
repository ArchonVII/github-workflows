#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DEFAULT_BUDGETS = {
  'README.md': 150,
  'AGENTS.md': 300,
  'CLAUDE.md': 25,
  'GEMINI.md': 25,
  'VISION.md': 120,
};

const STATUS_HEADER_FIELDS = [
  'status',
  'owner',
  'scope',
  'source of truth',
  'last reviewed',
  'supersedes',
  'superseded by',
];

const PLACEHOLDER_RE = /\b(?:TODO|TBD|N\/A)\b/i;
const STALE_TERM_RE = /\b(?:not deployed|next|remaining|deferred|blocked|pending)\b|(?:#\d+\b)|\b(?:issue|migration)\s+#?\d+\b/i;

const normalizePath = (value) =>
  String(value || '')
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\/+/, '');

const countLines = (body) => {
  const text = String(body || '').replace(/\r?\n$/, '');
  return text === '' ? 0 : text.split(/\r?\n/).length;
};

const keyName = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/-/g, ' ')
    .trim();

const walkFiles = (root, dir = '') => {
  const fullDir = path.join(root, dir);
  if (!existsSync(fullDir)) return [];

  const files = [];
  for (const entry of readdirSync(fullDir, { withFileTypes: true })) {
    if (entry.name === '.git' || entry.name === 'node_modules' || entry.name === '__github-workflows__') continue;
    const rel = normalizePath(path.join(dir, entry.name));
    if (entry.isDirectory()) {
      files.push(...walkFiles(root, rel));
    } else if (entry.isFile()) {
      files.push(rel);
    }
  }
  return files;
};

const readText = (repoRoot, relPath) => readFileSync(path.join(repoRoot, relPath), 'utf8');

const parseDocHeader = (body) => {
  const fields = new Map();
  const lines = String(body || '').split(/\r?\n/);

  if (lines[0] === '---') {
    for (let i = 1; i < Math.min(lines.length, 80); i += 1) {
      if (lines[i] === '---') break;
      const match = lines[i].match(/^([A-Za-z][A-Za-z -]+):\s*(.*)$/);
      if (match) fields.set(keyName(match[1]), match[2].trim());
    }
  }

  for (const line of lines.slice(0, 40)) {
    const quoteBold = line.match(/^>\s*\*\*([^*]+):\*\*\s*(.*)$/);
    if (quoteBold) {
      fields.set(keyName(quoteBold[1]), quoteBold[2].trim());
      continue;
    }

    const plain = line.match(/^(?:>\s*)?([A-Za-z][A-Za-z -]+):\s*(.*)$/);
    if (plain) fields.set(keyName(plain[1]), plain[2].trim());
  }

  return {
    fields,
    status: fields.get('status') || '',
    sourceOfTruth: fields.get('source of truth') || '',
    supersedes: fields.get('supersedes') || '',
    supersededBy: fields.get('superseded by') || '',
  };
};

const isMarkdown = (relPath) => /\.md$/i.test(relPath);

const isStatusHeaderExempt = (relPath) => {
  const p = normalizePath(relPath).toLowerCase();
  return (
    /^docs\/adrs?\//.test(p)
    || /^docs\/(?:.*\/)?plans\//.test(p)
    || /\/fragments?\//.test(p)
    || /\/fragment[-\w]*\.md$/.test(p)
  );
};

const isDocsLanding = (relPath) => {
  const p = normalizePath(relPath).toLowerCase();
  return p === 'docs/index.md' || /\/(?:readme|index)\.md$/.test(p);
};

const isDurableDoc = (relPath) =>
  isMarkdown(relPath) && normalizePath(relPath).toLowerCase().startsWith('docs/');

const hasStatusHeader = (header) =>
  STATUS_HEADER_FIELDS.every((field) => header.fields.has(field));

const isActiveDoc = (header) => /^active\b/i.test(header.status.trim());

const isCurrentTruthRegister = (header) => /^yes\b/i.test(header.sourceOfTruth.trim());

const relativePosix = (from, to) => {
  const rel = path.posix.relative(path.posix.dirname(normalizePath(from)), normalizePath(to));
  return rel || path.posix.basename(normalizePath(to));
};

const indexMentions = (indexBody, indexPath, targetPath) => {
  const normalizedBody = String(indexBody || '').replace(/\\/g, '/');
  const target = normalizePath(targetPath);
  const rel = relativePosix(indexPath, target);
  return normalizedBody.includes(target) || normalizedBody.includes(rel);
};

const isNoneValue = (value) => /^(|none|no|n\/a|na|-|--|not applicable)$/i.test(String(value || '').trim());

const extractLinkTargets = (value) => {
  if (isNoneValue(value)) return [];

  const targets = [];
  const text = String(value || '');
  for (const match of text.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)) {
    targets.push(match[1]);
  }

  const withoutMarkdownLinks = text.replace(/\[[^\]]+\]\([^)]+\)/g, ' ');
  for (const part of withoutMarkdownLinks.split(/[,;]/)) {
    const cleaned = part
      .trim()
      .replace(/^see\s+/i, '')
      .replace(/^`|`$/g, '')
      .replace(/^<|>$/g, '')
      .replace(/^["']|["']$/g, '');
    if (cleaned) targets.push(cleaned);
  }

  return targets;
};

const localTargetExists = (repoRoot, fromPath, rawTarget) => {
  const target = String(rawTarget || '').trim();
  if (!target || /^(https?:|mailto:)/i.test(target) || /^#\d+$/.test(target)) return true;

  const withoutAnchor = target.split('#')[0];
  if (!withoutAnchor) return true;

  const normalized = normalizePath(withoutAnchor);
  const candidates = [];
  if (withoutAnchor.startsWith('/')) {
    candidates.push(path.join(repoRoot, normalized));
  } else if (normalized.startsWith('docs/') || normalized.startsWith('.')) {
    candidates.push(path.join(repoRoot, normalized));
  } else {
    candidates.push(path.join(repoRoot, path.posix.dirname(normalizePath(fromPath)), normalized));
  }

  return candidates.some((candidate) => existsSync(candidate));
};

const lineFind = (body, pattern) => {
  const lines = String(body || '').split(/\r?\n/);
  for (let i = 0; i < lines.length; i += 1) {
    if (pattern.test(lines[i])) return { line: i + 1, text: lines[i] };
  }
  return null;
};

const allLineMatches = (body, pattern) => {
  const matches = [];
  const lines = String(body || '').split(/\r?\n/);
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (!inFence && pattern.test(line)) {
      matches.push({ line: i + 1, text: line.trim() });
    }
  }
  return matches;
};

const pushFinding = (findings, finding, maxFindings) => {
  if (findings.length < maxFindings) {
    findings.push({
      severity: 'warning',
      ...finding,
      path: normalizePath(finding.path),
    });
  }
};

const nearbyRootFor = (registerPath) => {
  const p = normalizePath(registerPath);
  if (!p.includes('/')) return '';
  return path.posix.dirname(p);
};

const isNearby = (registerPath, docPath) => {
  const root = nearbyRootFor(registerPath);
  if (!root) return true;
  return normalizePath(docPath).startsWith(`${root}/`);
};

export function lintDocPolicy(options = {}) {
  const repoRoot = path.resolve(options.repoRoot || process.cwd());
  const maxFindings = Number.isFinite(Number(options.maxFindings))
    ? Math.max(1, Number(options.maxFindings))
    : 200;
  const budgets = {
    ...DEFAULT_BUDGETS,
    ...(options.budgets || {}),
  };
  const findings = [];

  const files = walkFiles(repoRoot).filter(isMarkdown).sort();
  const docsFiles = files.filter(isDurableDoc);
  const headers = new Map();
  const bodies = new Map();

  for (const relPath of files) {
    const body = readText(repoRoot, relPath);
    bodies.set(relPath, body);
    headers.set(relPath, parseDocHeader(body));
  }

  for (const [relPath, limit] of Object.entries(budgets)) {
    const full = path.join(repoRoot, relPath);
    if (!existsSync(full)) continue;
    const lineCount = countLines(readText(repoRoot, relPath));
    if (lineCount > limit) {
      pushFinding(findings, {
        code: 'charter_budget',
        title: 'Charter budget exceeded',
        path: relPath,
        line: 1,
        message: `${relPath} has ${lineCount} lines; charter budget is ${limit}.`,
      }, maxFindings);
    }
  }

  for (const relPath of docsFiles) {
    if (isStatusHeaderExempt(relPath)) continue;
    const header = headers.get(relPath);
    if (!hasStatusHeader(header)) {
      const missing = STATUS_HEADER_FIELDS.filter((field) => !header.fields.has(field));
      pushFinding(findings, {
        code: 'missing_status_header',
        title: 'Missing document status header',
        path: relPath,
        line: 1,
        message: `${relPath} is a durable docs/** markdown file missing status header field(s): ${missing.join(', ')}.`,
      }, maxFindings);
    }
  }

  for (const relPath of files) {
    const header = headers.get(relPath);
    for (const [field, value] of [
      ['supersedes', header.supersedes],
      ['superseded_by', header.supersededBy],
    ]) {
      for (const target of extractLinkTargets(value)) {
        if (!localTargetExists(repoRoot, relPath, target)) {
          pushFinding(findings, {
            code: `dangling_${field}`,
            title: 'Dangling supersession link',
            path: relPath,
            line: lineFind(bodies.get(relPath), new RegExp(field.replace('_', '[- ]'), 'i'))?.line || 1,
            message: `${relPath} has ${field.replace('_', ' ')} target \`${target}\`, but that local path does not exist.`,
          }, maxFindings);
        }
      }
    }
  }

  for (const relPath of files) {
    const header = headers.get(relPath);
    if (!isActiveDoc(header)) continue;
    for (const match of allLineMatches(bodies.get(relPath), PLACEHOLDER_RE)) {
      pushFinding(findings, {
        code: 'active_placeholder',
        title: 'Placeholder token in active doc',
        path: relPath,
        line: match.line,
        message: `${relPath} is active and still contains placeholder token text: ${match.text}`,
      }, maxFindings);
    }
  }

  const docsIndex = 'docs/INDEX.md';
  const indexableDocs = docsFiles.filter((relPath) => !isDocsLanding(relPath));
  if (indexableDocs.length > 0) {
    if (existsSync(path.join(repoRoot, docsIndex))) {
      const indexBody = readText(repoRoot, docsIndex);
      for (const relPath of indexableDocs) {
        if (!indexMentions(indexBody, docsIndex, relPath)) {
          pushFinding(findings, {
            code: 'index_coherence',
            title: 'Durable doc absent from docs/INDEX.md',
            path: relPath,
            line: 1,
            message: `${relPath} is a durable docs/** file but is not linked from docs/INDEX.md.`,
          }, maxFindings);
        }
      }
    } else {
      pushFinding(findings, {
        code: 'index_coherence',
        title: 'docs/INDEX.md missing',
        path: docsIndex,
        line: 1,
        message: `docs/INDEX.md is missing while ${indexableDocs.length} durable docs/** file(s) exist.`,
      }, maxFindings);
    }
  }

  for (const adrDir of ['docs/adr', 'docs/adrs']) {
    const adrDocs = docsFiles.filter((relPath) => {
      const p = relPath.toLowerCase();
      return p.startsWith(`${adrDir}/`) && !/\/(?:readme|index)\.md$/i.test(p);
    });
    if (adrDocs.length === 0) continue;

    const indexPath = [`${adrDir}/README.md`, `${adrDir}/INDEX.md`, `${adrDir}/index.md`]
      .find((candidate) => existsSync(path.join(repoRoot, candidate)));
    if (!indexPath) {
      pushFinding(findings, {
        code: 'index_coherence',
        title: 'ADR index missing',
        path: adrDir,
        line: 1,
        message: `${adrDir} contains ADR documents but no README.md or INDEX.md landing index.`,
      }, maxFindings);
      continue;
    }

    const indexBody = readText(repoRoot, indexPath);
    for (const relPath of adrDocs) {
      if (!indexMentions(indexBody, indexPath, relPath)) {
        pushFinding(findings, {
          code: 'index_coherence',
          title: 'ADR absent from ADR index',
          path: relPath,
          line: 1,
          message: `${relPath} is not linked from ${indexPath}.`,
        }, maxFindings);
      }
    }
  }

  const changedFiles = (options.changedFiles || []).map(normalizePath).filter(Boolean);
  const changedRegisters = changedFiles
    .filter((relPath) => headers.has(relPath))
    .filter((relPath) => isCurrentTruthRegister(headers.get(relPath)));

  if (changedRegisters.length > 0) {
    const activeDocs = files
      .filter((relPath) => isActiveDoc(headers.get(relPath)))
      .filter((relPath) => !changedRegisters.includes(relPath));

    for (const registerPath of changedRegisters) {
      for (const relPath of activeDocs.filter((candidate) => isNearby(registerPath, candidate))) {
        for (const match of allLineMatches(bodies.get(relPath), STALE_TERM_RE)) {
          pushFinding(findings, {
            code: 'stale_active_doc_term',
            title: 'Stale active-doc term near changed current truth',
            path: relPath,
            line: match.line,
            message: `${registerPath} changed as Source of truth: yes; nearby active doc ${relPath} still carries stale-looking term text: ${match.text}`,
          }, maxFindings);
        }
      }
    }
  }

  if (findings.length >= maxFindings) {
    findings.push({
      severity: 'warning',
      code: 'max_findings',
      title: 'Maximum warning count reached',
      path: '.',
      line: 1,
      message: `doc-policy-lint stopped after ${maxFindings} warning(s).`,
    });
  }

  return {
    ok: true,
    findings,
    summary: formatMarkdownSummary(findings),
  };
}

export function formatMarkdownSummary(findings) {
  const lines = [
    '### Doc Policy Lint (warning-only)',
    '',
    'This reusable workflow reports document-policy findings as warnings only. It does not fail the job for lint findings.',
    '',
  ];

  if (findings.length === 0) {
    lines.push('No document-policy warnings found.');
    return `${lines.join('\n')}\n`;
  }

  lines.push(`Found ${findings.length} warning(s):`, '');
  for (const finding of findings) {
    lines.push(`- **${finding.code}** ${finding.path}:${finding.line || 1} - ${finding.message}`);
  }
  return `${lines.join('\n')}\n`;
}

const parseArgs = (argv) => {
  const args = {
    changedFiles: [],
    budgets: {},
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      return argv[i];
    };

    if (arg === '--repo') args.repoRoot = next();
    else if (arg === '--changed-file') args.changedFiles.push(next());
    else if (arg === '--changed-files') args.changedFilesFile = next();
    else if (arg === '--summary') args.summaryPath = next();
    else if (arg === '--github-annotations') args.githubAnnotations = true;
    else if (arg === '--max-warnings') args.maxFindings = Number(next());
    else if (arg === '--readme-max-lines') args.budgets['README.md'] = Number(next());
    else if (arg === '--agents-max-lines') args.budgets['AGENTS.md'] = Number(next());
    else if (arg === '--tool-stub-max-lines') {
      const value = Number(next());
      args.budgets['CLAUDE.md'] = value;
      args.budgets['GEMINI.md'] = value;
    } else if (arg === '--vision-max-lines') args.budgets['VISION.md'] = Number(next());
    else if (arg === '--help') args.help = true;
  }

  return args;
};

const escapeCommandValue = (value) =>
  String(value || '')
    .replace(/%/g, '%25')
    .replace(/\r/g, '%0D')
    .replace(/\n/g, '%0A');

const escapeCommandProperty = (value) =>
  escapeCommandValue(value)
    .replace(/:/g, '%3A')
    .replace(/,/g, '%2C');

const printGitHubWarning = (finding) => {
  const props = [
    `file=${escapeCommandProperty(finding.path)}`,
    `line=${escapeCommandProperty(finding.line || 1)}`,
    `title=${escapeCommandProperty(finding.title || finding.code)}`,
  ].join(',');
  process.stdout.write(`::warning ${props}::${escapeCommandValue(finding.message)}\n`);
};

const printHelp = () => {
  process.stdout.write(`Usage: node scripts/doc-policy-lint.mjs --repo <path> [options]\n\n`);
  process.stdout.write(`Options:\n`);
  process.stdout.write(`  --changed-file <path>       Add one changed file path for 8.2 stale-term detection.\n`);
  process.stdout.write(`  --changed-files <path>      Read newline-delimited changed file paths.\n`);
  process.stdout.write(`  --github-annotations        Print GitHub ::warning annotations.\n`);
  process.stdout.write(`  --summary <path>            Write a markdown summary file.\n`);
  process.stdout.write(`  --max-warnings <n>          Cap warning output (default: 200).\n`);
};

const main = () => {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    printHelp();
    return;
  }

  if (args.changedFilesFile && existsSync(args.changedFilesFile)) {
    const changed = readFileSync(args.changedFilesFile, 'utf8')
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
    args.changedFiles.push(...changed);
  }

  try {
    const result = lintDocPolicy({
      repoRoot: args.repoRoot || process.cwd(),
      changedFiles: args.changedFiles,
      budgets: args.budgets,
      maxFindings: args.maxFindings,
    });

    if (args.githubAnnotations) {
      for (const finding of result.findings) printGitHubWarning(finding);
    } else {
      process.stdout.write(result.summary);
    }

    if (args.summaryPath) {
      mkdirSync(path.dirname(args.summaryPath), { recursive: true });
      writeFileSync(args.summaryPath, result.summary, 'utf8');
    }
  } catch (err) {
    const message = `doc-policy-lint skipped after an internal error: ${err && err.message ? err.message : err}`;
    if (args.githubAnnotations) {
      printGitHubWarning({
        path: '.',
        line: 1,
        title: 'Doc policy lint skipped',
        message,
      });
    } else {
      process.stdout.write(`${message}\n`);
    }
    if (args.summaryPath) {
      mkdirSync(path.dirname(args.summaryPath), { recursive: true });
      writeFileSync(args.summaryPath, `### Doc Policy Lint (warning-only)\n\n${message}\n`, 'utf8');
    }
  }
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
