'use strict';

function _phaseHeadingRe(phaseNum: string): RegExp {
  // Per-component padding tolerance: Phase 06.1, 6.1, 6.01, 06.01 all match,
  // but Phase 6.10 is distinct from Phase 6.1.
  const parts = phaseNum.split('.').map((p) => `0*${p.replace(/^0+/, '')}`);
  return new RegExp(`^##\\s*Phase\\s+${parts.join('\\.')}\\s*:\\s*(.+)$`, 'mi');
}

export function _extractRoadmapGoal(roadmap: string, phaseNum: string): string {
  const m = roadmap.match(_phaseHeadingRe(phaseNum));
  return m ? m[1].trim() : '';
}
