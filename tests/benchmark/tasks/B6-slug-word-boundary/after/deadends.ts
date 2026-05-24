'use strict';
// Detects DEAD-ENDS slug citations. Case-insensitive AND word-boundary:
// matches the slug only when bounded by non-slug chars on both sides.
export function slugCited(text: string, slug: string): boolean {
  const lowerText = text.toLowerCase();
  const slugLower = slug.toLowerCase();
  let from = 0;
  for (;;) {
    const idx = lowerText.indexOf(slugLower, from);
    if (idx === -1) return false;
    const before = idx === 0 ? '' : lowerText[idx - 1];
    const after = idx + slugLower.length >= lowerText.length ? '' : lowerText[idx + slugLower.length];
    const isSlugChar = (c: string): boolean => c !== '' && /[a-z0-9-]/.test(c);
    if (!isSlugChar(before) && !isSlugChar(after)) return true;
    from = idx + 1;
  }
}
