import { InstallApp } from '../ui/InstallApp';
import { useState, type FormEvent } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, GoogleAuthProvider, signInWithEmailAndPassword, signInWithPopup, signInWithCustomToken } from 'firebase/auth';
import { auth, call, persistenceReady } from '../data/firebase';
import { useSession } from '../app/Session';
import { AuthLayout, Brand, Star, Icon, errorMessage } from '../ui/components';

export function RoleSelection() {
  const { notice } = useSession();
  return <main className="landing"><header><Brand/><span className="landing-label">BİLGİ. CESARET. BAŞARI.</span></header><section className="landing-main"><div className="landing-copy"><span className="eyebrow">SENİN SINIFIN. SENİN ARENAN.</span><h1>Çöz.<br/>XP kazan.<br/><em>Zirveye çık.</em></h1><p>Bilgini güçlendir, sınıfınla birlikte yüksel.<br/>Bir sonraki adım senin.</p>{notice && <p role="status" className="landing-notice">{notice}</p>}<div className="role-actions"><Link to="/ogrenci-giris" className="button primary">Öğrenci Girişi <Icon kind="arrow"/></Link><Link to="/ogretmen-giris" className="button outline">Öğretmen Girişi <Icon kind="person"/></Link></div><InstallApp/><small>Öğrenciler için öğretmeninden aldığın kısa kod yeterli.</small></div><div className="landing-art" aria-hidden="true"><div className="arena-ring"/><div className="arena-ring inner"/><Star className="hero-star"/><span className="art-label">BİLGİNLE<br/><b>YÜKSEL.</b></span><div className="podium"><i/><i/><i/></div><div className="art-spark spark-one">✦</div><div className="art-spark spark-two">✦</div></div></section><footer><span>TEST ARENA</span><span>Her doğru, yeni bir adım.</span></footer></main>;
}
export function TeacherLogin() {
  const { role } = useSession();
  const [signup, setSignup] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  if (role) return <Navigate to={role === 'teacher' ? '/ogretmen' : '/ogrenci'} replace/>;
  async function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const data = new FormData(event.currentTarget);
    setBusy(true); setError('');
    try { await persistenceReady; await (signup ? createUserWithEmailAndPassword : signInWithEmailAndPassword)(auth, String(data.get('email')), String(data.get('password'))); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  async function google() { setBusy(true); setError(''); try { await persistenceReady; await signInWithPopup(auth, new GoogleAuthProvider()); } catch (e) { setError(errorMessage(e)); } finally { setBusy(false); } }
  return <AuthLayout eyebrow="ÖĞRETMENLERE ÖZEL" title={signup ? 'Birlikte yükselin.' : 'Tekrar hoş geldin.'}><p>Sınıflarını yönet, öğrencilerinin yolculuğuna eşlik et.</p><button className="button google" disabled={busy} onClick={google}><b className="google-mark">G</b> Google ile giriş yap</button><div className="separator">veya e-posta ile</div><form onSubmit={login}><label>E-posta<input name="email" type="email" autoComplete="username" placeholder="ad@ornek.com" required/></label><label>Şifre<input name="password" type="password" minLength={6} autoComplete={signup ? 'new-password' : 'current-password'} required placeholder="En az 6 karakter"/></label><p role="alert" className="error-message">{error}</p><button className="button primary" disabled={busy}>{busy ? 'Bağlanıyor…' : signup ? 'Hesap oluştur' : 'Giriş yap'} <Icon kind="arrow"/></button></form><p className="switch-copy">{signup ? 'Zaten hesabın var mı?' : 'Henüz hesabın yok mu?'} <button className="text-button" disabled={busy} onClick={() => { setSignup(!signup); setError(''); }}>{signup ? 'Giriş yap' : 'Hesap oluştur'}</button></p></AuthLayout>;
}
export function StudentLogin() {
  const { role } = useSession();
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [code, setCode] = useState('');
  if (role) return <Navigate to={role === 'student' ? '/ogrenci' : '/ogretmen'} replace/>;
  async function login(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try { await persistenceReady; const result = await call<{ token: string }>('studentLogin', { code }); await signInWithCustomToken(auth, result.token); }
    catch (e) { setError(errorMessage(e)); } finally { setBusy(false); }
  }
  return <AuthLayout eyebrow="ARENA SENİ BEKLİYOR" title="Hazır mısın?"><p>Öğretmeninin verdiği altı karakterli kısa kodla giriş yap.</p><form onSubmit={login}><label>Öğrenci kısa kodu<input className="code-input" name="code" value={code} onChange={e => setCode(e.target.value.toUpperCase())} maxLength={6} minLength={6} autoCapitalize="characters" autoComplete="off" spellCheck={false} placeholder="K7M4Q9" required/></label><p role="alert" className="error-message">{error}</p><button className="button primary" disabled={busy}>{busy ? 'Kod doğrulanıyor…' : 'Giriş yap'} <Icon kind="arrow"/></button></form><p className="code-help">Kodunu bilmiyor musun?<br/>Öğretmeninden kısa kodunu iste.</p></AuthLayout>;
}
