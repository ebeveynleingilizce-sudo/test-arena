import { useEffect, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { onSnapshot, doc } from 'firebase/firestore';
import { signOut } from 'firebase/auth';
import { auth, db } from '../data/firebase';
import { useSession } from '../app/Session';
import { useArena } from '../app/useArena';
import { rankArena, arenaPosition } from '../domain/arena';
import { StudentLayout } from '../ui/StudentLayout';
import { xpNumber } from './Arena';
export function StudentProfile() {
  const { role, student } = useSession(), arena = useArena(), navigate = useNavigate();
  const [summary, setSummary] = useState<{ answeredCount: number; correctCount: number }>(), [error, setError] = useState(false);
  useEffect(() => { setSummary(undefined); setError(false); if (!student) return; return onSnapshot(doc(db, 'teachers', student.teacherUid, 'students', student.studentId, 'learning', 'summary'), { includeMetadataChanges: true }, s => { if (!s.metadata.fromCache) setSummary({ answeredCount: s.data()?.answeredCount || 0, correctCount: s.data()?.correctCount || 0 }); }, () => setError(true)); }, [student?.studentId, student?.teacherUid]);
  if (role !== 'student' || !student) return <Navigate to="/ogrenci-giris" replace/>;
  const position = arena.rows && arena.period ? arenaPosition(rankArena(arena.rows, 'overall', arena.period.weekKey), student.studentId) : null;
  return <StudentLayout><section className="student-profile"><span className="eyebrow">PROFİLİM</span><div className="student-greeting"><span className="student-avatar">{student.firstName.slice(0, 1)}</span><div><h1>{student.firstName} {student.lastName}</h1><p>{student.className} · {student.gradeLevel}. Sınıf</p></div></div><div className="profile-xp">{position ? xpNumber(position.own.academicXP) : '…'} <span>Akademik XP</span></div><dl className="profile-stats"><div><dt>Genel sınıf sırası</dt><dd>{position ? `#${position.own.rank}` : '…'}</dd></div><div><dt>Çözülen soru</dt><dd>{summary?.answeredCount ?? '…'}</dd></div><div><dt>Başarı</dt><dd>{summary ? `%${summary.answeredCount ? Math.round(summary.correctCount / summary.answeredCount * 100) : 0}` : '…'}</dd></div></dl>{(error || arena.error) && <p role="alert" className="form-error">Profil bilgileri yüklenemedi.</p>}<button className="button outline" onClick={() => void signOut(auth).then(() => navigate('/')).catch(() => setError(true))}>Çıkış yap</button></section></StudentLayout>;
}
