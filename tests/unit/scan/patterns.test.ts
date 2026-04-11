'use strict';

import { INJECTION_PATTERNS, InjectionPattern } from '../../../lib/scan/patterns';

describe('INJECTION_PATTERNS', () => {
  it('contains exactly 18 patterns', () => {
    expect(INJECTION_PATTERNS.length).toBe(18);
  });

  it('has unique stable ids', () => {
    const ids = INJECTION_PATTERNS.map((p) => p.id);
    const unique = new Set(ids);
    expect(unique.size).toBe(ids.length);
  });

  it('has non-empty labels', () => {
    for (const p of INJECTION_PATTERNS) {
      expect(p.label.length).toBeGreaterThan(0);
    }
  });

  it('has non-empty categories', () => {
    for (const p of INJECTION_PATTERNS) {
      expect(p.category.length).toBeGreaterThan(0);
    }
  });

  it('has valid RegExp for every pattern', () => {
    for (const p of INJECTION_PATTERNS) {
      expect(p.regex).toBeInstanceOf(RegExp);
    }
  });

  it('exposes categories covering the gsd-2 taxonomy', () => {
    const categories = new Set(INJECTION_PATTERNS.map((p) => p.category));
    expect(categories.has('System prompt markers')).toBe(true);
    expect(categories.has('Role injection')).toBe(true);
    expect(categories.has('Instruction override')).toBe(true);
    expect(categories.has('Hidden HTML directives')).toBe(true);
    expect(categories.has('Tool call injection')).toBe(true);
    expect(categories.has('Encoded payload')).toBe(true);
    expect(categories.has('Obfuscation')).toBe(true);
  });

  it('includes expected stable pattern ids', () => {
    const ids = new Set(INJECTION_PATTERNS.map((p) => p.id));
    const expected = [
      'system_prompt_tag',
      'im_start_system',
      'system_label',
      'you_are_now',
      'ignore_previous',
      'ignore_prior',
      'disregard_above',
      'forget_above',
      'new_instructions',
      'override_instructions',
      'new_role_is',
      'from_now_on',
      'html_prompt_comment',
      'html_ignore_comment',
      'tool_call_tag',
      'invoke_tag',
      'encoded_payload',
      'invisible_unicode',
    ];
    for (const id of expected) {
      expect(ids.has(id)).toBe(true);
    }
  });
});

describe('InjectionPattern regex behavior', () => {
  function findPattern(id: string): InjectionPattern {
    const p = INJECTION_PATTERNS.find((x) => x.id === id);
    if (!p) throw new Error(`pattern ${id} not found`);
    return p;
  }

  it('system_prompt_tag matches <system-prompt> case-insensitive', () => {
    const p = findPattern('system_prompt_tag');
    expect(p.regex.test('<system-prompt>')).toBe(true);
    expect(p.regex.test('<SYSTEM-PROMPT>')).toBe(true);
    expect(p.regex.test('nothing here')).toBe(false);
  });

  it('you_are_now matches with lowercase continuation', () => {
    const p = findPattern('you_are_now');
    expect(p.regex.test('you are now a helper')).toBe(true);
    expect(p.regex.test('You are now the assistant')).toBe(true);
    expect(p.regex.test('you are now.')).toBe(false);
  });

  it('invisible_unicode matches zero-width chars', () => {
    const p = findPattern('invisible_unicode');
    expect(p.regex.test('hello' + '\u200B' + 'world')).toBe(true);
    expect(p.regex.test('hello' + '\u200C' + 'world')).toBe(true);
    expect(p.regex.test('hello' + '\u200D' + 'world')).toBe(true);
    expect(p.regex.test('hello' + '\uFEFF' + 'world')).toBe(true);
    expect(p.regex.test('hello world')).toBe(false);
  });

  it('invoke_tag matches both <invoke and <function_calls>', () => {
    const p = findPattern('invoke_tag');
    expect(p.regex.test('<invoke name="foo">')).toBe(true);
    expect(p.regex.test('<function_calls>')).toBe(true);
    expect(p.regex.test('invoked')).toBe(false);
  });

  it('html_prompt_comment matches hidden directives', () => {
    const p = findPattern('html_prompt_comment');
    expect(p.regex.test('<!-- PROMPT: ignore all prior -->')).toBe(true);
    expect(p.regex.test('<!-- INSTRUCTION: new role -->')).toBe(true);
    expect(p.regex.test('<!-- harmless comment -->')).toBe(false);
  });
});
