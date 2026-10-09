import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
export function Star({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 100 110" aria-hidden="true"><path fill="currentColor" d="M55 2 64 37 98 33 72 58 81 96 49 76 13 110 26 65 2 44 40 40Z"/><path fill="#ffd184" d="m55 2-6 59 49-28-34 4Z"/><path fill="#ffb43d" d="m49 61 32 35-9-38 26-25Z"/><path fill="#d66a00" d="m49 61-36 49 13-45L2 44Z"/></svg>;
}
export function Brand({ large = false }: { large?: boolean }) {
  return <Link to="/" className={'brand ' + (large ? 'brand-large' : '')} aria-label="Test Arena ana sayfa"><Star/><span><b>TEST</b><strong>ARENA</strong></span></Link>;
}
export function Icon({ kind }: { kind: 'group' | 'person' | 'arrow' | 'exit' }) {
  const paths = { group: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M16 3a4 4 0 0 1 0 8M22 21v-2a4 4 0 0 0-3-3.87', person: 'M20 21v-2a7 7 0 0 0-14 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8', arrow: 'M4 12h16M14 6l6 6-6 6', exit: 'M9 5H4v14h5M10 12h11M17 8l4 4-4 4' };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/>{kind === 'group' && <circle cx="9" cy="7" r="4"/>}</svg>;
}
export function GradeSelect({ name = 'gradeLevel', label = 'Kademe', value, onChange, grades = Array.from({length:11},(_,i)=>i+2), disabled = false }: { name?: string; label?: string; value?: number; onChange?: (value: number) => void; grades?: number[]; disabled?:boolean }) {
  return <label>{label}<select aria-label={label} name={name} required disabled={disabled} value={value} onChange={event => onChange?.(Number(event.target.value))} defaultValue={value === undefined ? 6 : undefined}>{grades.map(g => <option key={g} value={g}>{g}. Sınıf</option>)}</select></label>;
}
export function AuthLayout({ children, eyebrow, title, className = '' }: { children: ReactNode; eyebrow: string; title: string; className?: string }) {
  return <main className={'auth-layout' + (className ? ' ' + className : '')}><section className="auth-story"><Brand large/><div><span className="eyebrow">BİLGİNLE YÜKSEL</span><h1>Her büyük başarı<br/>bir adımla başlar.</h1><p>Çöz. XP kazan. Zirveye çık.</p></div><div className="arena-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><Star/><div className="steps"><i/><i/><i/><i/></div></div><small>TEST ARENA · SINIFINLA BİRLİKTE</small></section><section className="auth-content"><Link className="back-link" to="/">← Ana sayfa</Link><div className="auth-form"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2>{children}</div><small className="auth-footer">Bilgiyle yarış. Kendini aş.</small></section></main>;
}
export function errorMessage(error: unknown) {
  const code = (error as { code?: string }).code || '';
  if (code === 'class-not-empty') return 'Sınıfta öğrenci var. Önce öğrencileri başka bir sınıfa taşı veya kaldır.';
  if (code === 'class-delete-busy') return 'Sınıf silme işlemi sürüyor. Bir dakika sonra yeniden dene.';
  if (/invalid-credential|user-not-found|wrong-password/.test(code)) return 'E-posta veya şifre hatalı.';
  if (code.includes('email-already-in-use')) return 'Bu e-posta zaten kayıtlı. Giriş yapmayı dene.';
  if (code.includes('weak-password')) return 'Şifren en az 6 karakter olmalı.';
  if (code === 'resource-exhausted' || code === 'firestore/resource-exhausted') return 'Veritabanı kullanım kotası aşıldı. Sorular şu anda yüklenemiyor; kotanın yenilenmesi gerekiyor.';
  if (code.includes('resource-exhausted')) return 'Çok fazla deneme. Bir dakika sonra yeniden dene.';
  if (code.includes('unauthenticated')) return 'Kod geçersiz veya yenilenmiş. Öğretmeninden güncel kodu iste.';
  if (code.includes('popup-closed-by-user')) return 'Google giriş penceresi kapatıldı.';
  if (code.includes('permission-denied')) return 'Bu işlem için yetkin yok.';
  if (!code && error instanceof Error) return error.message;
  return 'İşlem tamamlanamadı. Bağlantını kontrol edip yeniden dene.';
}
