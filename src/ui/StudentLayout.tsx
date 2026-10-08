import type { ReactNode } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Brand } from './components';
import './arena.css';

function NavIcon({ kind }: { kind: string }) {
  const paths: Record<string, string> = { Ana: 'M3 10 12 3l9 7v11h-6v-7H9v7H3Z', Çöz: 'M4 4h12v16H4ZM13 11l7-7 2 2-7 7-3 1Z', Arena: 'M7 3h10v6a5 5 0 0 1-10 0ZM7 5H3v3a4 4 0 0 0 4 4M17 5h4v3a4 4 0 0 1-4 4M12 14v6M7 21h10', Profil: 'M20 21v-2a7 7 0 0 0-14 0v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8' };
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={paths[kind]}/></svg>;
}
export function StudentLayout({ children }: { children: ReactNode }) {
  return <main className="student-shell"><header className="student-top"><Brand/><Link to="/ogrenci/profil" aria-label="Profilim" className="profile-shortcut"><NavIcon kind="Profil"/></Link></header><div className="student-main">{children}</div><nav className="student-nav" aria-label="Öğrenci navigasyonu"><div className="nav-brand"><Brand/></div>{[['Ana', '/ogrenci'], ['Çöz', '/ogrenci/coz'], ['Arena', '/ogrenci/arena'], ['Profil', '/ogrenci/profil']].map(([label, url]) => <NavLink key={url} to={url} end={label === 'Ana'}><NavIcon kind={label}/><span>{label}</span></NavLink>)}</nav></main>;
}
