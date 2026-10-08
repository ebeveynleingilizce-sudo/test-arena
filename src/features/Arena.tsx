import { useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useSession } from '../app/Session';
import { useArena } from '../app/useArena';
import { rankArena, arenaPosition, type ArenaMode, type RankedRow } from '../domain/arena';
import { StudentLayout } from '../ui/StudentLayout';
import { Star } from '../ui/components';
import { ArenaScene } from '../ui/ArenaScene';

export const xpNumber = (xp: number) => xp.toLocaleString('tr-TR');
export function RivalMessage({ position }: { position: ReturnType<typeof arenaPosition> }) {
  if (!position) return null;
  return <p className="rival-message"><Star/>{position.target ? <span><strong>{position.target.displayName}</strong> adlı öğrenciyi geçmene <b>{position.neededXP} XP</b> kaldı.<progress aria-label="Üst rakibi geçme hedefi" value={position.own.score} max={position.target.score + 1}/>{position.targetTieCount > 1 && <small>Bu puanda {position.targetTieCount} öğrenci aynı sırayı paylaşıyor.</small>}</span> : <span><strong>Zirvedesin!</strong> Bilginle yükselmeye devam et.</span>}</p>;
}
function ArenaLine({ row, own }: { row: RankedRow; own: boolean }) {
  return <li className={'arena-row ' + (own ? 'arena-own' : '')} data-student-id={row.studentId} aria-label={own ? 'Senin Arena satırın' : undefined}><span className={'arena-rank rank-' + row.rank}>#{row.rank}</span><span className="arena-avatar" aria-hidden="true">{row.displayName.slice(0, 1)}</span><span className="arena-name">{row.displayName}{own && <small>SEN</small>}</span><strong>{xpNumber(row.score)} <small>XP</small></strong></li>;
}
export function Arena() {
  const { role, student } = useSession(), arena = useArena();
  const [mode, setMode] = useState<ArenaMode>('weekly');
  if (role !== 'student' || !student) return <Navigate to="/ogrenci-giris" replace/>;
  const ready = arena.period && arena.rows, rows = ready ? rankArena(arena.rows!, mode, arena.period!.weekKey) : [], position = arenaPosition(rows, student.studentId);
  return <StudentLayout><section className="arena-heading"><div className="arena-heading-star"><Star/></div><div><span className="eyebrow">SINIF ARENA</span><h1>{student.className}</h1><p>{student.gradeLevel}. Sınıf · {ready ? rows.length : '…'} öğrenci</p></div><ArenaScene/><div className="arena-rise" aria-hidden="true"><i/><i/><i/></div></section><section className="arena-board"><div className="arena-standings"><Link to="/ogrenci/duello" className="button primary arena-duel-entry">Düello · Canlı 1’e 1 →</Link><div className="arena-tabs" role="tablist" aria-label="Arena dönemi"><button role="tab" aria-selected={mode === 'weekly'} onClick={() => setMode('weekly')}>Bu Hafta</button><button role="tab" aria-selected={mode === 'overall'} onClick={() => setMode('overall')}>Genel</button></div><div className="arena-period-label">{mode === 'weekly' ? 'Bu haftanın akademik XP’si' : 'Tüm zamanların akademik XP’si'}<small>{mode === 'weekly' && arena.period?.weekKey}</small></div>{arena.error ? <p role="alert" className="form-error">{arena.error}</p> : !ready ? <p role="status">Arena hazırlanıyor…</p> : <><ol className="arena-list" aria-label="Sınıf sıralaması">{rows.map(row => <ArenaLine key={row.studentId} row={row} own={row.studentId === student.studentId}/>)}</ol></>}</div>{ready && !arena.error && <aside className="arena-goal"><span className="arena-goal-label eyebrow">SIRADAKİ HEDEFİN</span><RivalMessage position={position}/><Link to="/ogrenci/coz" className="button primary arena-cta">Soru Çöz →</Link></aside>}</section></StudentLayout>;
}

