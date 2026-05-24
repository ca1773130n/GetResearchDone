'use strict';

/** Minimal extract of lib/invariants.ts pre-fix. */

export interface PlanArtifact {
  files_modified: string[];
}

export interface ValidationResult {
  errors: string[];
  warnings: string[];
}

export function validateSemantic(plan: PlanArtifact): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  for (const filePath of plan.files_modified) {
    if (filePath.startsWith('/')) {
      errors.push(`file path must be relative, not absolute: "${filePath}"`);
    }
    if (filePath.includes('..')) {
      errors.push(`file path must not use .. traversal: "${filePath}"`);
    }
    if (!filePath.includes('.')) {
      warnings.push(`file path has no extension: "${filePath}"`);
    }
  }

  return { errors, warnings };
}
