export interface ArenaRow { studentId: string; classId: string; displayName: string; academicXP: number; weeklyAcademicXP: number; weekKey: string }
export interface ArenaPeriod { weekKey: string; startsAt: number; endsAt: number; serverNow: number; classId: string; className: string }
export type ArenaMode = 'weekly' | 'overall';
export interface RankedRow extends ArenaRow { score: number; rank: number }

export function rankArena(rows: ArenaRow[], mode: ArenaMode, weekKey: string): RankedRow[] {
  const sorted = rows.map(row => ({ ...row, rank: 0,
    score: mode === 'overall' ? row.academicXP : row.weekKey === weekKey ? row.weeklyAcademicXP : 0 }))
    .sort((a, b) => b.score - a.score || (a.studentId < b.studentId ? -1 : a.studentId > b.studentId ? 1 : 0));
  let rank = 0;
  return sorted.map((row, index) => { if (!index || row.score !== sorted[index - 1].score) rank = index + 1; return { ...row, rank }; });
}

export function arenaPosition(rows: RankedRow[], studentId: string) {
  const own = rows.find(row => row.studentId === studentId);
  if (!own) return null;
  const higher = rows.filter(row => row.score > own.score);
  if (!higher.length) return { own, target: null, neededXP: 0, targetTieCount: 0 };
  const target = higher[higher.length - 1];
  const peers = higher.filter(row => row.score === target.score);
  return { own, target: peers[0], neededXP: target.score - own.score + 1, targetTieCount: peers.length };
}
