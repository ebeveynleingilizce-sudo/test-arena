import {createContext,useContext,useEffect,useState,useRef,type ReactNode} from 'react';
import {Link,useLocation} from 'react-router-dom';
import {useSession} from './Session';
import {call,db} from '../data/firebase';
import {heartbeat,closeExpired,watchLobby,watchRivals,duelEnd,type Duel,type Presence} from '../data/duel.mjs';
const Context=createContext({duels:[] as Duel[],busyDuels:[] as Duel[],presence:[] as Presence[],now:Date.now(),error:''});
export const useDuelLobby=()=>useContext(Context);
export function DuelLobby({children}:{children:ReactNode}){
 const showRivals=useLocation().pathname.replace(/\/$/,'')==='/ogrenci/duello';
 const {student}=useSession(),[state,setState]=useState({duels:[] as Duel[],busyDuels:[] as Duel[],presence:[] as Presence[]}),[now,setNow]=useState(Date.now()),[offset,setOffset]=useState(0),[error,setError]=useState('');
 const active=state.duels.find(d=>d.participants.includes(student?.studentId||'')&&d.status==='active'&&d.acceptedAt&&duelEnd(d)>now);
 const rivalId=showRivals&&active?active.participants.find(id=>id!==student?.studentId):undefined;
 const matchHeartbeat=useRef(false);matchHeartbeat.current=!!rivalId;
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()+offset),500);return()=>clearInterval(timer);},[offset]);
 useEffect(()=>{
  setState({duels:[],busyDuels:[],presence:[]});setError('');if(!student)return;
  let alive=true;const fail=()=>{if(alive)setError('Düello bağlantısı kesildi. Yeniden bağlanılıyor…');};
  const ping=()=>{if(document.visibilityState==='visible'&&!matchHeartbeat.current)void heartbeat(db,student).catch(fail);};ping();
  const timer=setInterval(ping,25000);document.addEventListener('visibilitychange',ping);
  void call<{serverNow:number}>('prepareArena',{}).then(r=>{if(alive)setOffset(r.serverNow-Date.now());}).catch(fail);
  const stop=watchLobby(db,student,s=>{if(alive){setState(previous=>({...previous,duels:s.duels}));setError('');}},fail,{includeRivals:false});
  return()=>{alive=false;stop();clearInterval(timer);document.removeEventListener('visibilitychange',ping);};
 },[student?.teacherUid,student?.studentId,student?.classId,student?.credentialVersion]);
 useEffect(()=>{
  setState(previous=>({...previous,presence:[],busyDuels:[]}));if(!student||!showRivals)return;
  let alive=true;
  const stop=watchRivals(db,student,s=>{if(alive){setState(previous=>({...previous,...s}));setError('');}},()=>{if(alive)setError('Rakip listesi yüklenemedi. Bağlantını kontrol et.');},{presenceStudentId:rivalId,includeBusy:!rivalId});
  return()=>{alive=false;stop();};
 },[showRivals,rivalId,student?.teacherUid,student?.studentId,student?.classId,student?.credentialVersion]);
 useEffect(()=>{if(student&&state.duels.some(d=>d.status==='pending'&&d.createdAt&&d.createdAt.toMillis()+60000<=now||d.status==='active'&&d.acceptedAt&&(duelEnd(d)<=now||state.presence.some(p=>p.studentId!==student.studentId&&d.participants.includes(p.studentId)&&p.at.toMillis()+15000<=now))))void closeExpired(db,student,state.duels,now,state.presence).catch(()=>{});},[student?.studentId,state.duels,state.presence,Math.floor(now/3000)]);
 const incoming=state.duels.find(d=>d.to===student?.studentId&&d.status==='pending'&&d.createdAt&&d.createdAt.toMillis()+60000>now);
 return <Context.Provider value={{...state,now,error}}>{incoming&&<Link className="duel-notice" to="/ogrenci/duello">Sınıfından bir düello daveti var · Gör →</Link>}{children}</Context.Provider>;
}
