'use strict';
// Detects DEAD-ENDS slug citations in a candidate plan. BUG: case-sensitive
// substring match. "Elo-Rated-Plan-Tournament" evades; a slug embedded in a
// longer token false-positives.
export function slugCited(text: string, slug: string): boolean {
  return text.includes(slug);
}
