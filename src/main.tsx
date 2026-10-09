import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { SessionProvider, useSession } from './app/Session';
import { RoleSelection, StudentLogin, TeacherLogin } from './features/Login';
import { ClassroomArena } from './features/ClassroomArena';
import { Teacher } from './features/Teacher';
import { Welcome } from './features/Welcome';
import { QuizSelection, QuizSession } from './features/Quiz';
import { Arena } from './features/Arena';
import { Duel } from './features/Duel';
import { DuelLobby } from './app/DuelLobby';
import { StudentProfile } from './features/StudentProfile';
import '@fontsource/manrope/latin-ext-400.css';
import '@fontsource/manrope/latin-ext-500.css';
import '@fontsource/manrope/latin-ext-600.css';
import '@fontsource/manrope/latin-ext-700.css';
import '@fontsource/manrope/latin-ext-800.css';
import '@fontsource/manrope/latin-400.css';
import '@fontsource/manrope/latin-500.css';
import '@fontsource/manrope/latin-600.css';
import '@fontsource/manrope/latin-700.css';
import '@fontsource/manrope/latin-800.css';
import './ui/styles.css';
import './ui/polish.css';
import './ui/desktop.css';
import './ui/teacher-analytics.css';
import './ui/pwa.css';
import './ui/teacher-viewport.css';
import { PwaUpdates } from './ui/PwaUpdates';
function App() {
  const { role, loading } = useSession();
  if (loading) return <main className="loading" role="status">Test Arena hazırlanıyor…</main>;
  return <Routes><Route path="/" element={role ? <Navigate to={role === 'teacher' ? '/ogretmen' : '/ogrenci'} replace/> : <RoleSelection/>}/><Route path="/ogretmen-giris" element={<TeacherLogin/>}/><Route path="/ogrenci-giris" element={<StudentLogin/>}/><Route path="/ogretmen/sinif-arenasi" element={<ClassroomArena/>}/><Route path="/ogretmen" element={<Teacher view="home"/>}/><Route path="/ogretmen/soru-bankasi" element={<Teacher view="bank"/>}/><Route path="/ogretmen/soru-hatalari" element={<Teacher view="reports"/>}/><Route path="/ogretmen/siniflar" element={<Teacher view="classes"/>}/><Route path="/ogretmen/siniflar/:classId" element={<Teacher view="students"/>}/><Route path="/ogretmen/ogrenciler" element={<Teacher view="analytics"/>}/><Route path="/ogretmen/ogrenciler/:studentId" element={<Teacher view="detail"/>}/><Route path="/ogrenci" element={<Welcome/>}/><Route path="/ogrenci/arena" element={<Arena/>}/><Route path="/ogrenci/duello" element={<Duel/>}/><Route path="/ogrenci/profil" element={<StudentProfile/>}/><Route path="/ogrenci/coz" element={<QuizSelection/>}/><Route path="/ogrenci/coz/:testId" element={<QuizSession/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes>;
}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><BrowserRouter basename={import.meta.env.BASE_URL}><SessionProvider><DuelLobby><App/><PwaUpdates/></DuelLobby></SessionProvider></BrowserRouter></React.StrictMode>);

