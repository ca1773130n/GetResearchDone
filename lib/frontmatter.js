/**
 * GRD Frontmatter Operations — YAML frontmatter parse/reconstruct/splice/validate
 *
 * Extracted from bin/grd-tools.js during Phase 03 modularization.
 * Depends on: lib/utils.js (safeReadFile, output, error)
 */

'use strict';

const { safeReadFile, output, error } = require('./utils');
const fs = require('fs');
const path = require('path');

// ─── Core Frontmatter Functions ─────────────────────────────────────────────

/**
 * Parse YAML frontmatter from markdown content into a JavaScript object.
 * @param {string} content - Markdown content with optional YAML frontmatter between --- delimiters
 * @returns {Object} Parsed frontmatter as a plain object, or empty object if no frontmatter found
 */
function extractFrontmatter(content) {
  const frontmatter = {};
  const match = content.match(/^---\n([\s\S]+?)\n---/);
  if (!match) return frontmatter;

  const yaml = match[1];
  const lines = yaml.split('\n');

  // Stack to track nested objects: [{obj, key, indent}]
  // obj = object to write to, key = current key collecting array items, indent = indentation level
  let stack = [{ obj: frontmatter, key: null, indent: -1 }];

  for (const line of lines) {
    // Skip empty lines
    if (line.trim() === '') continue;

    // Calculate indentation (number of leading spaces)
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;

    // Pop stack back to appropriate level
    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1];

    // Check for key: value pattern
    const keyMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(.*)/);
    if (keyMatch) {
      const key = keyMatch[2];
      const value = keyMatch[3].trim();

      if (value === '' || value === '[') {
        // Key with no value or opening bracket — could be nested object or array
        // We'll determine based on next lines, for now create placeholder
        current.obj[key] = value === '[' ? [] : {};
        current.key = null;
        // Push new context for potential nested content
        stack.push({ obj: current.obj[key], key: null, indent });
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array: key: [a, b, c]
        current.obj[key] = value
          .slice(1, -1)
          .split(',')
          .map((s) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        current.key = null;
      } else {
        // Simple key: value
        current.obj[key] = value.replace(/^["']|["']$/g, '');
        current.key = null;
      }
    } else if (line.trim().startsWith('- ')) {
      // Array item
      const itemValue = line
        .trim()
        .slice(2)
        .replace(/^["']|["']$/g, '');

      // If current context is an empty object, convert to array
      if (
        typeof current.obj === 'object' &&
        !Array.isArray(current.obj) &&
        Object.keys(current.obj).length === 0
      ) {
        // Find the key in parent that points to this object and convert it
        const parent = stack.length > 1 ? stack[stack.length - 2] : null;
        if (parent) {
          for (const k of Object.keys(parent.obj)) {
            if (parent.obj[k] === current.obj) {
              parent.obj[k] = [itemValue];
              current.obj = parent.obj[k];
              break;
            }
          }
        }
      } else if (Array.isArray(current.obj)) {
        current.obj.push(itemValue);
      }
    }
  }

  return frontmatter;
}

/**
 * Serialize a JavaScript object back to a YAML frontmatter string (without --- delimiters).
 * @param {Object} obj - Object to serialize into YAML-like frontmatter format
 * @returns {string} YAML-formatted string with proper indentation for nested values
 */
function reconstructFrontmatter(obj) {
  const lines = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else if (
        value.every((v) => typeof v === 'string') &&
        value.length <= 3 &&
        value.join(', ').length < 60
      ) {
        lines.push(`${key}: [${value.join(', ')}]`);
      } else {
        lines.push(`${key}:`);
        for (const item of value) {
          lines.push(
            `  - ${typeof item === 'string' && (item.includes(':') || item.includes('#')) ? `"${item}"` : item}`
          );
        }
      }
    } else if (typeof value === 'object') {
      lines.push(`${key}:`);
      for (const [subkey, subval] of Object.entries(value)) {
        if (subval === null || subval === undefined) continue;
        if (Array.isArray(subval)) {
          if (subval.length === 0) {
            lines.push(`  ${subkey}: []`);
          } else if (
            subval.every((v) => typeof v === 'string') &&
            subval.length <= 3 &&
            subval.join(', ').length < 60
          ) {
            lines.push(`  ${subkey}: [${subval.join(', ')}]`);
          } else {
            lines.push(`  ${subkey}:`);
            for (const item of subval) {
              lines.push(
                `    - ${typeof item === 'string' && (item.includes(':') || item.includes('#')) ? `"${item}"` : item}`
              );
            }
          }
        } else if (typeof subval === 'object') {
          lines.push(`  ${subkey}:`);
          for (const [subsubkey, subsubval] of Object.entries(subval)) {
            if (subsubval === null || subsubval === undefined) continue;
            if (Array.isArray(subsubval)) {
              if (subsubval.length === 0) {
                lines.push(`    ${subsubkey}: []`);
              } else {
                lines.push(`    ${subsubkey}:`);
                for (const item of subsubval) {
                  lines.push(`      - ${item}`);
                }
              }
            } else {
              lines.push(`    ${subsubkey}: ${subsubval}`);
            }
          }
        } else {
          const sv = String(subval);
          lines.push(`  ${subkey}: ${sv.includes(':') || sv.includes('#') ? `"${sv}"` : sv}`);
        }
      }
    } else {
      const sv = String(value);
      if (sv.includes(':') || sv.includes('#') || sv.startsWith('[') || sv.startsWith('{')) {
        lines.push(`${key}: "${sv}"`);
      } else {
        lines.push(`${key}: ${sv}`);
      }
    }
  }
  return lines.join('\n');
}

/**
 * Replace or prepend frontmatter in markdown content with new object data.
 * @param {string} content - Original markdown content
 * @param {Object} newObj - New frontmatter object to serialize and splice in
 * @returns {string} Updated markdown content with replaced frontmatter
 */
function spliceFrontmatter(content, newObj) {
  const yamlStr = reconstructFrontmatter(newObj);
  const match = content.match(/^---\n[\s\S]+?\n---/);
  if (match) {
    return `---\n${yamlStr}\n---` + content.slice(match[0].length);
  }
  return `---\n${yamlStr}\n---\n\n` + content;
}

/**
 * Parse a specific block from must_haves in raw frontmatter YAML.
 * Handles 3-level nesting: must_haves > artifacts/key_links > [{path, provides, ...}].
 * @param {string} content - Full markdown content with frontmatter
 * @param {string} blockName - Block name within must_haves (e.g., 'truths', 'artifacts', 'key_links')
 * @returns {Array<Object|string>} Array of parsed items from the block, or empty array if not found
 */
function parseMustHavesBlock(content, blockName) {
  // Extract a specific block from must_haves in raw frontmatter YAML
  // Handles 3-level nesting: must_haves > artifacts/key_links > [{path, provides, ...}]
  const fmMatch = content.match(/^---\n([\s\S]+?)\n---/);
  if (!fmMatch) return [];

  const yaml = fmMatch[1];
  // Find the block (e.g., "truths:", "artifacts:", "key_links:")
  const blockPattern = new RegExp(`^\\s{4}${blockName}:\\s*$`, 'm');
  const blockStart = yaml.search(blockPattern);
  if (blockStart === -1) return [];

  const afterBlock = yaml.slice(blockStart);
  const blockLines = afterBlock.split('\n').slice(1); // skip the header line

  const items = [];
  let current = null;

  for (const line of blockLines) {
    // Stop at same or lower indent level (non-continuation)
    if (line.trim() === '') continue;
    const indent = line.match(/^(\s*)/)[1].length;
    if (indent <= 4 && line.trim() !== '') break; // back to must_haves level or higher

    if (line.match(/^\s{6}-\s+/)) {
      // New list item at 6-space indent
      if (current) items.push(current);
      current = {};
      // Check if it's a simple string item
      const simpleMatch = line.match(/^\s{6}-\s+"?([^"]+)"?\s*$/);
      if (simpleMatch && !line.includes(':')) {
        current = simpleMatch[1];
      } else {
        // Key-value on same line as dash: "- path: value"
        const kvMatch = line.match(/^\s{6}-\s+(\w+):\s*"?([^"]*)"?\s*$/);
        if (kvMatch) {
          current = {};
          current[kvMatch[1]] = kvMatch[2];
        }
      }
    } else if (current && typeof current === 'object') {
      // Continuation key-value at 8+ space indent
      const kvMatch = line.match(/^\s{8,}(\w+):\s*"?([^"]*)"?\s*$/);
      if (kvMatch) {
        const val = kvMatch[2];
        // Try to parse as number
        current[kvMatch[1]] = /^\d+$/.test(val) ? parseInt(val, 10) : val;
      }
      // Array items under a key
      const arrMatch = line.match(/^\s{10,}-\s+"?([^"]+)"?\s*$/);
      if (arrMatch) {
        // Find the last key added and convert to array
        const keys = Object.keys(current);
        const lastKey = keys[keys.length - 1];
        if (lastKey && !Array.isArray(current[lastKey])) {
          current[lastKey] = current[lastKey] ? [current[lastKey]] : [];
        }
        if (lastKey) current[lastKey].push(arrMatch[1]);
      }
    }
  }
  if (current) items.push(current);

  return items;
}

// ─── Frontmatter Command Functions ──────────────────────────────────────────

/**
 * CLI command: Get frontmatter field(s) from a markdown file.
 * @param {string} cwd - Project working directory
 * @param {string} filePath - Path to the markdown file
 * @param {string|null} field - Specific field to extract, or null for all fields
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdFrontmatterGet(cwd, filePath, field, raw) {
  if (!filePath) {
    error('file path required');
  }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) {
    output({ error: 'File not found', path: filePath }, raw);
    return;
  }
  const fm = extractFrontmatter(content);
  if (field) {
    const value = fm[field];
    if (value === undefined) {
      output({ error: 'Field not found', field }, raw);
      return;
    }
    output({ [field]: value }, raw, JSON.stringify(value));
  } else {
    output(fm, raw, `${Object.keys(fm).length} fields: ${Object.keys(fm).join(', ')}`);
  }
}

/**
 * CLI command: Set a frontmatter field in a markdown file.
 * @param {string} cwd - Project working directory
 * @param {string} filePath - Path to the markdown file
 * @param {string} field - Field name to set
 * @param {string} value - Value to set (JSON-parsed if valid JSON, otherwise stored as string)
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdFrontmatterSet(cwd, filePath, field, value, raw) {
  if (!filePath || !field || value === undefined) {
    error('file, field, and value required. Usage: frontmatter set <file> <field> <value>');
  }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  if (!fs.existsSync(fullPath)) {
    output({ error: 'File not found', path: filePath }, raw);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);
  let parsedValue;
  try {
    parsedValue = JSON.parse(value);
  } catch {
    parsedValue = value;
  }
  fm[field] = parsedValue;
  const newContent = spliceFrontmatter(content, fm);
  fs.writeFileSync(fullPath, newContent, 'utf-8');
  output({ updated: true, field, value: parsedValue }, raw, 'true');
}

/**
 * CLI command: Merge JSON data into existing frontmatter of a markdown file.
 * @param {string} cwd - Project working directory
 * @param {string} filePath - Path to the markdown file
 * @param {string} data - JSON string of key-value pairs to merge into frontmatter
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs result to stdout and exits
 */
function cmdFrontmatterMerge(cwd, filePath, data, raw) {
  if (!filePath || !data) {
    error('file and data required');
  }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  if (!fs.existsSync(fullPath)) {
    output({ error: 'File not found', path: filePath }, raw);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf-8');
  const fm = extractFrontmatter(content);
  let mergeData;
  try {
    mergeData = JSON.parse(data);
  } catch {
    error('Invalid JSON for --data');
    return;
  }
  Object.assign(fm, mergeData);
  const newContent = spliceFrontmatter(content, fm);
  fs.writeFileSync(fullPath, newContent, 'utf-8');
  output({ merged: true, fields: Object.keys(mergeData) }, raw, 'true');
}

const FRONTMATTER_SCHEMAS = {
  plan: {
    required: [
      'phase',
      'plan',
      'type',
      'wave',
      'depends_on',
      'files_modified',
      'autonomous',
      'must_haves',
    ],
  },
  summary: { required: ['phase', 'plan', 'subsystem', 'tags', 'duration', 'completed'] },
  verification: { required: ['phase', 'verified', 'status', 'score'] },
};

/**
 * CLI command: Validate frontmatter against a named schema.
 * @param {string} cwd - Project working directory
 * @param {string} filePath - Path to the markdown file to validate
 * @param {string} schemaName - Schema name ('plan', 'summary', or 'verification')
 * @param {boolean} raw - Output raw text instead of JSON
 * @returns {void} Outputs validation result to stdout and exits
 */
function cmdFrontmatterValidate(cwd, filePath, schemaName, raw) {
  if (!filePath || !schemaName) {
    error('file and schema required');
  }
  const schema = FRONTMATTER_SCHEMAS[schemaName];
  if (!schema) {
    error(
      `Unknown schema: ${schemaName}. Available: ${Object.keys(FRONTMATTER_SCHEMAS).join(', ')}`
    );
  }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  const content = safeReadFile(fullPath);
  if (!content) {
    output({ error: 'File not found', path: filePath }, raw);
    return;
  }
  const fm = extractFrontmatter(content);
  const missing = schema.required.filter((f) => fm[f] === undefined);
  const present = schema.required.filter((f) => fm[f] !== undefined);
  output(
    { valid: missing.length === 0, missing, present, schema: schemaName },
    raw,
    missing.length === 0 ? 'valid' : 'invalid'
  );
}

// ─── Phase Roadmap Metadata ───────────────────────────────────────────────────

/**
 * Extract metadata fields from the ROADMAP.md section for a specific phase.
 * @param {string} cwd - Project working directory
 * @param {string} phaseNum - Phase number (e.g., '1', '01', '2.1')
 * @returns {Object} Metadata object with fields like verification_level, eval_targets
 */
function getPhaseRoadmapMetadata(cwd, phaseNum) {
  const fs = require('fs');
  const path = require('path');

  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  let roadmapContent;
  try {
    roadmapContent = fs.readFileSync(roadmapPath, 'utf-8');
  } catch {
    return {};
  }

  // Find the phase section
  const phaseEscaped = String(phaseNum).replace(/\./g, '\\.');
  const phaseSectionPattern = new RegExp(
    `#{2,3}\\s*Phase\\s+${phaseEscaped}[\\s\\S]*?(?=\\n#{2,3}\\s|$)`,
    'i'
  );
  const sectionMatch = roadmapContent.match(phaseSectionPattern);
  if (!sectionMatch) return {};

  const section = sectionMatch[0];
  const metadata = {};

  // Extract verification_level
  const verificationMatch = section.match(/\*\*Verification level:\*\*\s*(.+)/i);
  if (verificationMatch) {
    metadata.verification_level = verificationMatch[1].trim();
  }

  // Extract eval_targets
  const evalTargetsMatch = section.match(/\*\*Eval targets:\*\*\s*(.+)/i);
  if (evalTargetsMatch) {
    metadata.eval_targets = evalTargetsMatch[1].trim();
  }

  return metadata;
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  // Core functions
  extractFrontmatter,
  reconstructFrontmatter,
  spliceFrontmatter,
  parseMustHavesBlock,
  // Command functions
  cmdFrontmatterGet,
  cmdFrontmatterSet,
  cmdFrontmatterMerge,
  cmdFrontmatterValidate,
  // Constants
  FRONTMATTER_SCHEMAS,
  // Roadmap metadata
  getPhaseRoadmapMetadata,
};
