"use strict";

/**
 * GRD Scan/Patterns -- Prompt injection pattern definitions.
 *
 * Pattern set adopted from gsd-2 v2.67+ (scripts/docs-prompt-injection-scan.sh
 * and scripts/base64-scan.sh at https://github.com/gsd-build/gsd-2).
 * Reimplemented in TypeScript for GRD; see
 * docs/superpowers/specs/2026-04-11-gsd2-prompt-injection-scan-design.md
 * for the full adoption story.
 */

export interface InjectionPattern {
  readonly id: string;
  readonly label: string;
  readonly category: string;
  readonly regex: RegExp;
}

export const INJECTION_PATTERNS: readonly InjectionPattern[] = [
  // System prompt markers
  {
    id: "system_prompt_tag",
    label: "System prompt tag",
    category: "System prompt markers",
    regex: /<system-prompt>/i,
  },
  {
    id: "im_start_system",
    label: "im_start system",
    category: "System prompt markers",
    regex: /<\|im_start\|>system/i,
  },
  {
    id: "system_label",
    label: "SYSTEM label",
    category: "System prompt markers",
    regex: /\[SYSTEM\]\s*:/i,
  },
  // Role injection
  {
    id: "you_are_now",
    label: "You are now",
    category: "Role injection",
    regex: /you are now [a-z]/i,
  },
  // Instruction override
  {
    id: "ignore_previous",
    label: "Ignore previous",
    category: "Instruction override",
    regex: /ignore (all )?previous instructions/i,
  },
  {
    id: "ignore_prior",
    label: "Ignore prior",
    category: "Instruction override",
    regex: /ignore (all )?prior instructions/i,
  },
  {
    id: "disregard_above",
    label: "Disregard above",
    category: "Instruction override",
    regex: /disregard (all )?(above|previous|prior)/i,
  },
  {
    id: "forget_above",
    label: "Forget above",
    category: "Instruction override",
    regex: /forget (all )?(above|previous|prior) (instructions|context|rules)/i,
  },
  {
    id: "new_instructions",
    label: "New instructions",
    category: "Instruction override",
    regex: /new instructions:/i,
  },
  {
    id: "override_instructions",
    label: "Override instructions",
    category: "Instruction override",
    regex: /override (all )?instructions/i,
  },
  {
    id: "new_role_is",
    label: "Your new role is",
    category: "Instruction override",
    regex: /your new role is/i,
  },
  {
    id: "from_now_on",
    label: "From now on",
    category: "Instruction override",
    regex: /from now on,? (you (are|will|must|should)|act as)/i,
  },
  // Hidden HTML directives
  {
    id: "html_prompt_comment",
    label: "HTML prompt comment",
    category: "Hidden HTML directives",
    regex: /<!--\s*(PROMPT|INSTRUCTION|SYSTEM|OVERRIDE|INJECT)\s*:/,
  },
  {
    id: "html_ignore_comment",
    label: "HTML ignore comment",
    category: "Hidden HTML directives",
    regex: /<!--\s*(ignore|disregard|forget|override)/,
  },
  // Tool call injection
  {
    id: "tool_call_tag",
    label: "Tool call tag",
    category: "Tool call injection",
    regex: /(<tool_call>|<function_call>|<tool_use>)/,
  },
  {
    id: "invoke_tag",
    label: "Invoke tag",
    category: "Tool call injection",
    regex: /(<invoke|<function_calls>)/,
  },
  // Encoded payload
  {
    id: "encoded_payload",
    label: "Encoded payload",
    category: "Encoded payload",
    regex: /(eval|exec|decode)\((base64|atob|btoa)/i,
  },
  // Obfuscation
  {
    id: "invisible_unicode",
    label: "Invisible unicode",
    category: "Obfuscation",
    // eslint-disable-next-line no-misleading-character-class
    regex: /[\u200B\u200C\u200D\uFEFF]/,
  },
] as const;

module.exports = { INJECTION_PATTERNS };
