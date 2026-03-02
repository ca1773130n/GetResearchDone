/**
 * GRD Frontmatter Operations -- YAML frontmatter parse/reconstruct/splice/validate
 *
 * Extracted from bin/grd-tools.js during Phase 03 modularization.
 * Depends on: lib/utils.ts (safeReadFile, output, error)
 */

'use strict';

import type { FrontmatterObject } from './types';

const { safeReadFile, output, error } = require('./utils');
const fs = require('fs');
const path = require('path');

// ─── Domain Types ─────────────────────────────────────────────────────────────

/**
 * Parsed result from parseMustHavesBlock for artifact entries.
 */
interface MustHavesArtifact {
  path: string;
  provides?: string;
  exports?: string[];
  min_lines?: number;
  contains?: string;
}

/**
 * Parsed result from parseMustHavesBlock for key_links entries.
 */
interface MustHavesKeyLink {
  from: string;
  to: string;
  via: string;
  pattern?: string;
}

/**
 * Schema definition for frontmatter validation.
 */
interface FrontmatterSchemaDefinition {
  required: string[];
}

/**
 * Validation result from cmdFrontmatterValidate.
 */
interface FrontmatterValidationResult {
  valid: boolean;
  missing: string[];
  present: string[];
  schema: string;
}

/**
 * Internal stack frame for YAML frontmatter parsing.
 */
interface ParseStackFrame {
  obj: Record<string, unknown> | unknown[];
  key: string | null;
  indent: number;
}

// ─── Schema Constant ──────────────────────────────────────────────────────────

const FRONTMATTER_SCHEMAS: Record<string, FrontmatterSchemaDefinition> = {
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

// ─── Core Frontmatter Functions ─────────────────────────────────────────────

/**
 * Parse a raw YAML value string into a typed JavaScript value.
 * Strips surrounding quotes and returns the cleaned string.
 */
function parseYamlValue(rawValue: string): string {
  return rawValue.replace(/^["']|["']$/g, '');
}

/**
 * Parse YAML frontmatter from markdown content into a JavaScript object.
 * @param content - Markdown content with optional YAML frontmatter between --- delimiters
 * @returns Parsed frontmatter as a FrontmatterObject, or empty object if no frontmatter found
 */
function extractFrontmatter(content: string): FrontmatterObject {
  const frontmatter: FrontmatterObject = {};
  const match = content.match(/^---\n([\s\S]+?)\n---/);
  if (!match) return frontmatter;

  const yaml = match[1];
  const lines = yaml.split('\n');

  // Stack to track nested objects: [{obj, key, indent}]
  // obj = object to write to, key = current key collecting array items, indent = indentation level
  const stack: ParseStackFrame[] = [{ obj: frontmatter, key: null, indent: -1 }];

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
    const currentObj = current.obj as Record<string, unknown>;

    // Check for key: value pattern
    const keyMatch = line.match(/^(\s*)([a-zA-Z0-9_-]+):\s*(.*)/);
    if (keyMatch) {
      const key = keyMatch[2];
      const value = keyMatch[3].trim();

      if (value === '' || value === '[') {
        // Key with no value or opening bracket -- could be nested object or array
        // We'll determine based on next lines, for now create placeholder
        currentObj[key] = value === '[' ? [] : {};
        current.key = null;
        // Push new context for potential nested content
        stack.push({ obj: currentObj[key] as Record<string, unknown>, key: null, indent });
      } else if (value.startsWith('[') && value.endsWith(']')) {
        // Inline array: key: [a, b, c]
        currentObj[key] = value
          .slice(1, -1)
          .split(',')
          .map((s: string) => s.trim().replace(/^["']|["']$/g, ''))
          .filter(Boolean);
        current.key = null;
      } else {
        // Simple key: value
        currentObj[key] = parseYamlValue(value);
        current.key = null;
      }
    } else if (line.trim().startsWith('- ')) {
      // Array item
      const itemValue = parseYamlValue(line.trim().slice(2));

      // If current context is an empty object, convert to array
      if (
        typeof current.obj === 'object' &&
        !Array.isArray(current.obj) &&
        Object.keys(current.obj as Record<string, unknown>).length === 0
      ) {
        // Find the key in parent that points to this object and convert it
        const parent = stack.length > 1 ? stack[stack.length - 2] : null;
        if (parent) {
          const parentObj = parent.obj as Record<string, unknown>;
          for (const k of Object.keys(parentObj)) {
            if (parentObj[k] === current.obj) {
              parentObj[k] = [itemValue];
              current.obj = parentObj[k] as unknown[];
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
 * @param obj - Object to serialize into YAML-like frontmatter format
 * @returns YAML-formatted string with proper indentation for nested values
 */
function reconstructFrontmatter(obj: FrontmatterObject): string {
  const lines: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (Array.isArray(value)) {
      if (value.length === 0) {
        lines.push(`${key}: []`);
      } else if (
        value.every((v: unknown) => typeof v === 'string') &&
        value.length <= 3 &&
        (value as string[]).join(', ').length < 60
      ) {
        lines.push(`${key}: [${(value as string[]).join(', ')}]`);
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
      const valueObj = value as Record<string, unknown>;
      for (const [subkey, subval] of Object.entries(valueObj)) {
        if (subval === null || subval === undefined) continue;
        if (Array.isArray(subval)) {
          if (subval.length === 0) {
            lines.push(`  ${subkey}: []`);
          } else if (
            subval.every((v: unknown) => typeof v === 'string') &&
            subval.length <= 3 &&
            (subval as string[]).join(', ').length < 60
          ) {
            lines.push(`  ${subkey}: [${(subval as string[]).join(', ')}]`);
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
          const subvalObj = subval as Record<string, unknown>;
          for (const [subsubkey, subsubval] of Object.entries(subvalObj)) {
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
 * @param content - Original markdown content
 * @param newObj - New frontmatter object to serialize and splice in
 * @returns Updated markdown content with replaced frontmatter
 */
function spliceFrontmatter(content: string, newObj: FrontmatterObject): string {
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
 * @param content - Full markdown content with frontmatter
 * @param blockName - Block name within must_haves (e.g., 'truths', 'artifacts', 'key_links')
 * @returns Array of parsed items from the block, or empty array if not found
 */
function parseMustHavesBlock(
  content: string,
  blockName: string
): Array<string | MustHavesArtifact | MustHavesKeyLink> {
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

  const items: Array<string | Record<string, unknown>> = [];
  let current: Record<string, unknown> | string | null = null;

  for (const line of blockLines) {
    // Stop at same or lower indent level (non-continuation)
    if (line.trim() === '') continue;
    const indentMatch = line.match(/^(\s*)/);
    const indent = indentMatch ? indentMatch[1].length : 0;
    if (indent <= 4 && line.trim() !== '') break; // back to must_haves level or higher

    if (line.match(/^\s{6}-\s+/)) {
      // New list item at 6-space indent
      if (current !== null) items.push(current);
      current = {};
      // Check if it's a simple string item
      const simpleMatch = line.match(/^\s{6}-\s+"?([^"]+)"?\s*$/);
      if (simpleMatch && !line.includes(':')) {
        current = simpleMatch[1];
      } else {
        // Key-value on same line as dash: "- path: value"
        const kvMatch = line.match(/^\s{6}-\s+(\w+):\s*"?([^"]*)"?\s*$/);
        if (kvMatch) {
          current = {} as Record<string, unknown>;
          current[kvMatch[1]] = kvMatch[2];
        }
      }
    } else if (current !== null && typeof current === 'object') {
      // Continuation key-value at 8+ space indent
      const kvMatch = line.match(/^\s{8,}(\w+):\s*"?([^"]*)"?\s*$/);
      if (kvMatch) {
        const val = kvMatch[2];
        // Try to parse as number
        (current as Record<string, unknown>)[kvMatch[1]] = /^\d+$/.test(val)
          ? parseInt(val, 10)
          : val;
      }
      // Array items under a key
      const arrMatch = line.match(/^\s{10,}-\s+"?([^"]+)"?\s*$/);
      if (arrMatch) {
        // Find the last key added and convert to array
        const keys = Object.keys(current as Record<string, unknown>);
        const lastKey = keys[keys.length - 1];
        if (lastKey && !Array.isArray((current as Record<string, unknown>)[lastKey])) {
          const existing = (current as Record<string, unknown>)[lastKey];
          (current as Record<string, unknown>)[lastKey] = existing ? [existing] : [];
        }
        if (lastKey)
          ((current as Record<string, unknown>)[lastKey] as unknown[]).push(arrMatch[1]);
      }
    }
  }
  if (current !== null) items.push(current);

  return items as Array<string | MustHavesArtifact | MustHavesKeyLink>;
}

// ─── Frontmatter Command Functions ──────────────────────────────────────────

/**
 * CLI command: Get frontmatter field(s) from a markdown file.
 * @param cwd - Project working directory
 * @param filePath - Path to the markdown file
 * @param field - Specific field to extract, or null for all fields
 * @param raw - Output raw text instead of JSON
 */
function cmdFrontmatterGet(cwd: string, filePath: string, field: string | null, raw: boolean): void {
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
 * @param cwd - Project working directory
 * @param filePath - Path to the markdown file
 * @param field - Field name to set
 * @param value - Value to set (JSON-parsed if valid JSON, otherwise stored as string)
 * @param raw - Output raw text instead of JSON
 */
function cmdFrontmatterSet(cwd: string, filePath: string, field: string, value: string, raw: boolean): void {
  if (!filePath || !field || value === undefined) {
    error('file, field, and value required. Usage: frontmatter set <file> <field> <value>');
  }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  if (!fs.existsSync(fullPath)) {
    output({ error: 'File not found', path: filePath }, raw);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf-8') as string;
  const fm = extractFrontmatter(content);
  let parsedValue: unknown;
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
 * @param cwd - Project working directory
 * @param filePath - Path to the markdown file
 * @param data - JSON string of key-value pairs to merge into frontmatter
 * @param raw - Output raw text instead of JSON
 */
function cmdFrontmatterMerge(cwd: string, filePath: string, data: string, raw: boolean): void {
  if (!filePath || !data) {
    error('file and data required');
  }
  const fullPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, filePath);
  if (!fs.existsSync(fullPath)) {
    output({ error: 'File not found', path: filePath }, raw);
    return;
  }
  const content = fs.readFileSync(fullPath, 'utf-8') as string;
  const fm = extractFrontmatter(content);
  let mergeData: Record<string, unknown>;
  try {
    mergeData = JSON.parse(data) as Record<string, unknown>;
  } catch {
    error('Invalid JSON for --data');
    return;
  }
  Object.assign(fm, mergeData);
  const newContent = spliceFrontmatter(content, fm);
  fs.writeFileSync(fullPath, newContent, 'utf-8');
  output({ merged: true, fields: Object.keys(mergeData) }, raw, 'true');
}

/**
 * CLI command: Validate frontmatter against a named schema.
 * @param cwd - Project working directory
 * @param filePath - Path to the markdown file to validate
 * @param schemaName - Schema name ('plan', 'summary', or 'verification')
 * @param raw - Output raw text instead of JSON
 */
function cmdFrontmatterValidate(cwd: string, filePath: string, schemaName: string, raw: boolean): void {
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
  const missing = schema.required.filter((f: string) => fm[f] === undefined);
  const present = schema.required.filter((f: string) => fm[f] !== undefined);
  const result: FrontmatterValidationResult = {
    valid: missing.length === 0,
    missing,
    present,
    schema: schemaName,
  };
  output(
    result,
    raw,
    missing.length === 0 ? 'valid' : 'invalid'
  );
}

// ─── Phase Roadmap Metadata ───────────────────────────────────────────────────

/**
 * Extract metadata fields from the ROADMAP.md section for a specific phase.
 * @param cwd - Project working directory
 * @param phaseNum - Phase number (e.g., '1', '01', '2.1')
 * @returns Metadata object with fields like verification_level, eval_targets
 */
function getPhaseRoadmapMetadata(cwd: string, phaseNum: string): Record<string, string> {
  const roadmapPath = path.join(cwd, '.planning', 'ROADMAP.md');
  let roadmapContent: string;
  try {
    roadmapContent = fs.readFileSync(roadmapPath, 'utf-8') as string;
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
  const metadata: Record<string, string> = {};

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
