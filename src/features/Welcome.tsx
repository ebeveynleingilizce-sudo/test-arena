import { InstallApp } from '../ui/InstallApp';
import { Navigate, Link } from 'react-router-dom';
import { useSession } from '../app/Session';
import { useArena } from '../app/useArena';
import { rankArena, arenaPosition } from '../domain/arena';
import { StudentLayout } from '../ui/StudentLayout';
import { Star } from '../ui/components';
import { RivalMessage, xpNumber } from './Arena';
export function Welcome() {
  const { role, student } = useSession(), arena = useArena();
  if (role !== 'student' || !student) return <Navigate to="/ogrenci-giris" replace/>;
  const rows = arena.rows && arena.period ? rankArena(arena.rows, 'overall', arena.period.weekKey) : [];
  const position = arenaPosition(rows, student.studentId);
  return <StudentLayout><section className="student-greeting"><span className="student-avatar" aria-hidden="true">{student.firstName.slice(0, 1)}</span><div><span className="eyebrow">ARENA'YA HOŞ GELDİN</span><h1>Merhaba, {student.firstName}.</h1><p><span>{student.className}</span> · {student.gradeLevel}. Sınıf</p></div></section><div className="home-columns"><section className="home-progress"><div className="academic-total"><Star/><div><span>Toplam akademik XP</span><strong aria-label="Toplam XP">{position ? `${xpNumber(position.own.academicXP)} XP` : 'XP yükleniyor…'}</strong></div><div className="xp-steps" aria-hidden="true"><i/><i/><i/><i/></div></div>{arena.error ? <p role="alert" className="form-error">{arena.error}</p> : <div className="home-rank"><div><span>Genel sınıf sıran</span><strong aria-label="Sınıf sıran">{position ? `#${position.own.rank}` : '…'}</strong></div><div className="rank-summit" aria-hidden="true"><Star/><i/><i/><i/></div></div>}<RivalMessage position={position}/><Link to="/ogrenci/arena" className="home-arena-link">Sınıf Arena’nı gör →</Link></section><section className="home-action"><span className="eyebrow">BİLGİNLE YÜKSEL</span><h2>Bir doğru. <br/>Bir adım yukarı.</h2><p>Yeni bir soru çöz, öğrendiklerini pekiştir.<br/>İlk doğru cevabın +1 akademik XP.</p><Link to="/ogrenci/coz" className="button primary">Soru Çöz →</Link><InstallApp/><div className="home-path" aria-hidden="true"><i/><i/><i/><Star/></div></section></div></StudentLayout>;
}
