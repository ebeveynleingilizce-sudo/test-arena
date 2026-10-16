import {useEffect, useRef, useState} from 'react';
import {useLocation} from 'react-router-dom';
import {doc, updateDoc} from 'firebase/firestore';
import {useSession} from '../app/Session';
import {db} from '../data/firebase';
import type {Student} from '../domain/models';
import {verifiedSeason2Reset} from '../domain/season2-reset-scope';
import {Star} from './components';
import './season2-welcome.css';

export function Season2Welcome() {
  const {role, student, loading} = useSession();
  const {pathname} = useLocation();
  if (loading || role !== 'student' || !student || pathname !== '/ogrenci') return null;
  return <Season2Dialog key={`${student.teacherUid}:${student.studentId}`} student={student}/>;
}

export function Season2Dialog({student, save = (p: Student) => updateDoc(doc(db, 'teachers', p.teacherUid, 'students', p.studentId), {season2WelcomeSeen:true})}: {student:Student; save?:(student:Student)=>Promise<void>}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const inFlight = useRef(false);
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState('');
  const [resetConfirmed, setResetConfirmed] = useState<boolean>();
  useEffect(() => {
    let alive = true;
    void verifiedSeason2Reset(student.teacherUid, student.studentId).then(value => {if (alive) setResetConfirmed(value);});
    return () => {alive = false;};
  }, [student.teacherUid, student.studentId]);
  // Keep the dialog open while the SDK emits an optimistic profile snapshot.
  const visible = !dismissed && (student.season2WelcomeSeen !== true || busy) && resetConfirmed !== undefined;
  useEffect(() => {
    const element = dialog.current;
    if (!visible || !element) return;
    const previousFocus = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    element.showModal();
    element.querySelector<HTMLButtonElement>('.season2-join')?.focus();
    return () => {element.close();document.body.style.overflow = previousOverflow;previousFocus?.focus();};
  }, [visible]);
  async function dismiss() {
    if (inFlight.current) return;
    inFlight.current = true;setBusy(true);setError('');
    try {await save(student);setDismissed(true);}
    catch {setError('Duyuru kaydedilemedi. Bağlantını kontrol edip tekrar dene.');}
    finally {inFlight.current = false;setBusy(false);}
  }
  if (!visible) return null;
  return <dialog ref={dialog} className="season2-dialog" aria-labelledby="season2-title" aria-describedby="season2-description" aria-busy={busy} onCancel={event => {event.preventDefault();void dismiss();}}>
    <button className="season2-close" aria-label="Duyuruyu kapat" disabled={busy} onClick={() => void dismiss()}>×</button>
    <div className="season2-emblem" aria-hidden="true"><Star/><span>02</span></div>
    <p className="season2-eyebrow">YENİ SEZON · YENİ ZİRVE</p>
    <h2 id="season2-title">🏆 TEST ARENA –<br/><strong>2. SEZON BAŞLADI!</strong></h2>
    <div id="season2-description">
      <p className="season2-intro">Yeni sezon, yeni mücadele!</p>
      <ul>
        <li><span aria-hidden="true">⚡</span><span>{resetConfirmed ? 'XP puanları ve soru çözüm geçmişi sıfırlandı.' : 'Yeni sorular çöz, XP kazan ve sezona güçlü başla.'}</span></li>
        <li><span aria-hidden="true">🏅</span><span>{resetConfirmed ? 'Herkes eşit şartlarda yeniden yarışıyor!' : 'Yeni sezonda rekabet yeniden başlıyor!'}</span></li>
        <li><span aria-hidden="true">🔥</span><span>Soruları çöz, XP kazan, rakiplerini geride bırak!</span></li>
      </ul>
    </div>
    <p className="season2-challenge">ARENANIN 1 NUMARASI SEN OL!</p>
    {error && <p className="season2-error" role="alert">{error}</p>}
    <button className="button primary season2-join" disabled={busy} onClick={() => void dismiss()} autoFocus>{busy ? 'Kaydediliyor…' : '🚀 ARENAYA KATIL!'}</button>
  </dialog>;
}
