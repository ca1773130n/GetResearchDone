/** GRD Commands/SlugTimestamp -- Slug generation and timestamp formatting utilities */

'use strict';

const { output, error }: {
  output: (result: unknown, raw: boolean, rawValue?: unknown) => never;
  error: (message: string) => never;
} = require('../utils');

// ─── Slug Generation ─────────────────────────────────────────────────────────

/**
 * CLI command: Generate a kebab-case slug from input text.
 * @param text - Input text to convert to slug
 * @param raw - Output raw slug string instead of JSON
 */
function cmdGenerateSlug(text: string, raw: boolean): void {
  if (!text) {
    error(
      'text required for slug generation. Usage: generate-slug <text>. Provide a text string, e.g.: generate-slug "my phase name"'
    );
    return;
  }

  let slug: string = text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  if (slug.length > 60) {
    slug = slug.slice(0, 60).replace(/-+$/, '');
  }

  const result = { slug };
  output(result, raw, slug);
}

// ─── Timestamp Formatting ────────────────────────────────────────────────────

/**
 * CLI command: Output the current timestamp in the specified format.
 * @param format - Timestamp format: 'date' (YYYY-MM-DD), 'filename' (ISO without colons), or 'full' (ISO)
 * @param raw - Output raw timestamp string instead of JSON
 */
function cmdCurrentTimestamp(format: string, raw: boolean): void {
  const now = new Date();
  let result: string;

  switch (format) {
    case 'date':
      result = now.toISOString().split('T')[0];
      break;
    case 'filename':
      result = now.toISOString().replace(/:/g, '-').replace(/\..+/, '');
      break;
    case 'full':
    default:
      result = now.toISOString();
      break;
  }

  output({ timestamp: result }, raw, result);
}

// ─── Exports ─────────────────────────────────────────────────────────────────

module.exports = {
  cmdGenerateSlug,
  cmdCurrentTimestamp,
};
