#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// YAML block mapping separators require whitespace or end-of-line after `:`.
// Keep the accepted surface deliberately small instead of approximating YAML
// with a pattern that also accepts `key:value` as a mapping.
const TOP_LEVEL_KEY = /^([A-Za-z_][A-Za-z0-9_.-]*) *:(?: +(.*))?$/;
const MAPPING_KEY = /^([A-Za-z_][A-Za-z0-9_.-]*) *:(?: +(.*))?$/;
const YAML_NON_STRING_SCALAR = /^(?:null|~|true|false)$/i;
const YAML_NUMBER_SCALAR = /^[+-]?(?:[0-9][0-9_]*(?:\.[0-9_]*)?(?:e[+-]?[0-9_]+)?|0b[01_]+|0o[0-7_]+|0x[0-9a-f_]+|\.[0-9_]+(?:e[+-]?[0-9_]+)?|\.(?:inf|nan))$/i;
const YAML_PLAIN_CONTROL = /[\u0000-\u001f\u007f-\u009f]/;
const YAML_PLAIN_FORBIDDEN_LEADING = /^(?:[-?:](?:\s|$)|[\[\]{},#&*!|>'"%@`])/u;

const indentation = (line) => line.match(/^ */)[0].length;
const isIgnoredLine = (line) => {
  const trimmed = line.trim();
  return trimmed === '' || trimmed.startsWith('#');
};

const stripInlineComment = (value) => {
  let quote = null;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (quote === '"') {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === quote) {
        quote = null;
      }
      continue;
    }

    if (quote === "'") {
      if (character === quote) {
        if (value[index + 1] === quote) {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }

    if (character === '"' || character === "'") {
      quote = character;
      continue;
    }

    if (character === '#' && (index === 0 || /\s/.test(value[index - 1]))) {
      return { value: value.slice(0, index).trim(), unterminatedQuote: false };
    }
  }

  return { value: value.trim(), unterminatedQuote: quote !== null };
};

const parseQuotedString = (value, quote, location, fieldName, errors) => {
  let decoded = '';
  for (let index = 1; index < value.length; index += 1) {
    const character = value[index];
    if (/[\u0000-\u001f\u007f]/.test(character)) {
      errors.push(`${location} ${fieldName} contains a control character.`);
      return null;
    }

    if (quote === "'" && character === "'" && value[index + 1] === "'") {
      decoded += "'";
      index += 1;
      continue;
    }

    if (quote === '"' && character === '\\') {
      const escaped = value[index + 1];
      if (escaped !== '"' && escaped !== '\\') {
        errors.push(`${location} ${fieldName} uses an unsupported quoted escape.`);
        return null;
      }
      decoded += escaped;
      index += 1;
      continue;
    }

    if (character === quote) {
      if (index !== value.length - 1) {
        errors.push(`${location} has a malformed quoted ${fieldName}.`);
        return null;
      }
      if (decoded.trim() === '') {
        errors.push(`${location} must have a non-empty ${fieldName}.`);
        return null;
      }
      return decoded;
    }
    decoded += character;
  }

  errors.push(`${location} has a malformed quoted ${fieldName}.`);
  return null;
};

const parseStringScalar = (rawValue, location, fieldName, errors) => {
  const stripped = stripInlineComment(rawValue);
  if (stripped.unterminatedQuote) {
    errors.push(`${location} has an unterminated quoted ${fieldName}.`);
    return null;
  }

  const value = stripped.value;
  if (value === '') {
    errors.push(`${location} must have a non-empty ${fieldName}.`);
    return null;
  }

  if (value.startsWith("'") || value.startsWith('"')) {
    return parseQuotedString(value, value[0], location, fieldName, errors);
  }

  if (YAML_PLAIN_CONTROL.test(value)) {
    errors.push(`${location} ${fieldName} contains a control character.`);
    return null;
  }
  if (YAML_NON_STRING_SCALAR.test(value) || YAML_NUMBER_SCALAR.test(value)) {
    errors.push(`${location} ${fieldName} must be a string; quote YAML boolean and numeric values.`);
    return null;
  }
  if (YAML_PLAIN_FORBIDDEN_LEADING.test(value) || /:(?:\s|$)/.test(value)) {
    errors.push(`${location} ${fieldName} uses unsupported plain YAML syntax; quote the string.`);
    return null;
  }

  return value;
};

const parseMappingPair = (text, location, errors) => {
  const match = text.match(MAPPING_KEY);
  if (!match) {
    errors.push(`${location} must be a YAML mapping field.`);
    return null;
  }
  return { key: match[1], rawValue: match[2] ?? '' };
};

const addField = (fields, pair, location, errors) => {
  if (!pair) return;
  if (fields.has(pair.key)) {
    errors.push(`${location} has duplicate ${pair.key} fields.`);
    return;
  }
  fields.set(pair.key, pair.rawValue);
};

const blockLines = (section) => section.body.filter(({ raw }) => !isIgnoredLine(raw));

const validateSingularGate = (section, errors) => {
  const inline = stripInlineComment(section.rawValue);
  if (inline.unterminatedQuote || inline.value !== '') {
    errors.push(`required_gate at line ${section.line} must be a block mapping.`);
    return [];
  }

  const content = blockLines(section);
  if (content.length === 0) {
    errors.push(`required_gate at line ${section.line} must not be empty.`);
    return [];
  }

  const directIndent = Math.min(...content.map(({ raw }) => indentation(raw)));
  const fields = new Map();
  for (const line of content) {
    if (indentation(line.raw) !== directIndent) {
      errors.push(`required_gate line ${line.line} has unexpected nested indentation.`);
      continue;
    }
    addField(
      fields,
      parseMappingPair(line.raw.slice(directIndent), `required_gate line ${line.line}`, errors),
      `required_gate at line ${section.line}`,
      errors,
    );
  }

  if (!fields.has('check_name')) {
    errors.push(`required_gate at line ${section.line} requires a direct check_name field.`);
    return [];
  }

  const parsedFields = new Map();
  for (const [fieldName, rawValue] of fields) {
    const value = parseStringScalar(
      rawValue,
      `required_gate at line ${section.line}`,
      fieldName,
      errors,
    );
    if (value !== null) parsedFields.set(fieldName, value);
  }
  const name = parsedFields.get('check_name') ?? null;
  return name === null ? [] : [name];
};

const parsePluralEntry = (entry, listIndent, errors) => {
  const location = `required_gates entry at line ${entry.line}`;
  const fields = new Map();
  const inline = stripInlineComment(entry.inline);

  if (inline.unterminatedQuote) {
    errors.push(`${location} has an unterminated quote.`);
  } else if (inline.value !== '') {
    addField(fields, parseMappingPair(inline.value, location, errors), location, errors);
  }

  let directIndent = entry.inline.trim() === '' || entry.inline.trim().startsWith('#')
    ? null
    : listIndent + 1 + entry.separator.length;
  for (const line of entry.body) {
    if (isIgnoredLine(line.raw)) continue;
    directIndent ??= indentation(line.raw);
    if (indentation(line.raw) !== directIndent) {
      errors.push(`${location}, line ${line.line} has unexpected nested indentation.`);
      continue;
    }
    addField(
      fields,
      parseMappingPair(line.raw.slice(directIndent), `${location}, line ${line.line}`, errors),
      location,
      errors,
    );
  }

  if (fields.size === 0) {
    errors.push(`${location} must not be empty and must be a mapping.`);
    return null;
  }
  if (!fields.has('check_name')) {
    errors.push(`${location} requires a direct check_name field.`);
    return null;
  }

  const parsedFields = new Map();
  for (const [fieldName, rawValue] of fields) {
    const value = parseStringScalar(rawValue, location, fieldName, errors);
    if (value !== null) parsedFields.set(fieldName, value);
  }
  return parsedFields.get('check_name') ?? null;
};

const validatePluralGates = (section, errors) => {
  const inline = stripInlineComment(section.rawValue);
  if (inline.unterminatedQuote) {
    errors.push(`required_gates at line ${section.line} has an unterminated quote.`);
    return [];
  }
  if (inline.value === '[]') {
    errors.push(`required_gates at line ${section.line} must contain at least one entry; the list is empty.`);
    return [];
  }
  if (inline.value !== '') {
    errors.push(`required_gates at line ${section.line} must be a block list.`);
    return [];
  }

  const content = blockLines(section);
  if (content.length === 0) {
    errors.push(`required_gates at line ${section.line} must contain at least one entry; the list is empty.`);
    return [];
  }

  const listIndent = Math.min(...content.map(({ raw }) => indentation(raw)));
  const entries = [];
  let current = null;

  for (const line of content) {
    const indent = indentation(line.raw);
    if (indent === listIndent) {
      const match = line.raw.slice(listIndent).match(/^-([ ]*)(.*)$/);
      if (!match) {
        errors.push(`required_gates line ${line.line} must start a list entry with '-'.`);
        current = null;
        continue;
      }
      if (match[1] === '' && match[2] !== '') {
        errors.push(`required_gates line ${line.line} requires whitespace after '-'.`);
        current = null;
        continue;
      }
      current = { line: line.line, separator: match[1], inline: match[2], body: [] };
      entries.push(current);
      continue;
    }

    if (!current) {
      errors.push(`required_gates line ${line.line} appears before a valid list entry.`);
      continue;
    }
    current.body.push(line);
  }

  if (entries.length === 0) {
    errors.push(`required_gates at line ${section.line} must contain at least one list entry.`);
    return [];
  }

  const names = [];
  const seenNames = new Set();
  for (const entry of entries) {
    const name = parsePluralEntry(entry, listIndent, errors);
    if (name === null) continue;
    if (seenNames.has(name)) {
      errors.push(`required_gates has duplicate check_name ${JSON.stringify(name)}.`);
      continue;
    }
    seenNames.add(name);
    names.push(name);
  }
  return names;
};

export const validateCheckMap = (source) => {
  const errors = [];
  if (typeof source !== 'string') {
    return {
      ok: false,
      errors: ['check map contents must be a string.'],
      version: null,
      requiredCheckNames: [],
    };
  }

  const lines = source.replace(/^\uFEFF/, '').split(/\r?\n/).map((raw, index) => ({
    raw,
    line: index + 1,
  }));

  for (const line of lines) {
    if (line.raw.includes('\t')) {
      errors.push(`line ${line.line} contains a tab; check-map indentation must use spaces.`);
    }
  }

  const sections = new Map();
  let current = null;
  for (const line of lines) {
    if (isIgnoredLine(line.raw)) continue;

    if (indentation(line.raw) === 0) {
      const match = line.raw.match(TOP_LEVEL_KEY);
      if (!match) {
        errors.push(`line ${line.line} is not a valid top-level declaration.`);
        current = null;
        continue;
      }

      const section = { key: match[1], rawValue: match[2] ?? '', line: line.line, body: [] };
      if (sections.has(section.key)) {
        errors.push(`duplicate top-level ${section.key} declaration at line ${line.line}.`);
      } else {
        sections.set(section.key, section);
      }
      current = section;
      continue;
    }

    if (!current) {
      errors.push(`line ${line.line} is indented without a top-level declaration.`);
      continue;
    }
    current.body.push(line);
  }

  let version = null;
  const versionSection = sections.get('version');
  if (!versionSection) {
    errors.push('check map requires a top-level version declaration.');
  } else {
    const parsed = stripInlineComment(versionSection.rawValue);
    if (parsed.unterminatedQuote || !/^\d+$/.test(parsed.value)) {
      errors.push(`version at line ${versionSection.line} must be a non-negative integer.`);
    } else if (blockLines(versionSection).length > 0) {
      errors.push(`version at line ${versionSection.line} must be a scalar integer.`);
    } else {
      version = Number(parsed.value);
    }
  }

  const singular = sections.get('required_gate');
  const plural = sections.get('required_gates');
  let requiredCheckNames = [];
  if (singular && plural) {
    errors.push('check map cannot declare both required_gate and required_gates.');
  } else if (plural) {
    requiredCheckNames = validatePluralGates(plural, errors);
  } else if (singular) {
    requiredCheckNames = validateSingularGate(singular, errors);
  } else {
    errors.push('check map requires a top-level required_gate or required_gates declaration.');
  }

  return {
    ok: errors.length === 0,
    errors,
    version,
    requiredCheckNames,
  };
};

const runCli = () => {
  const checkMapPath = resolve(process.argv[2] || '.agent/check-map.yml');
  let source;
  try {
    source = readFileSync(checkMapPath, 'utf8');
  } catch (error) {
    console.error(`check-map validation failed: could not read ${checkMapPath}: ${error.message}`);
    process.exitCode = 1;
    return;
  }

  const result = validateCheckMap(source);
  if (!result.ok) {
    console.error(`check-map validation failed for ${checkMapPath}:`);
    for (const error of result.errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(
    `check-map validation passed: version ${result.version}; required checks: ${result.requiredCheckNames.join(', ')}`,
  );
};

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) runCli();
