'use strict';

export function _extractRoadmapGoal(roadmap: string, phaseNum: string): string {
  const re = new RegExp(`^##\\s*Phase\\s+${phaseNum}\\s*:\\s*(.+)$`, 'mi');
  const m = roadmap.match(re);
  return m ? m[1].trim() : '';
}
