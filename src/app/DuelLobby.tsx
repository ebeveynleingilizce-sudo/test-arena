import {createContext,useContext,useEffect,useState,type ReactNode} from 'react';
import {Link} from 'react-router-dom';
import {useSession} from './Session';
import {call,db} from '../data/firebase';
import {heartbeat,closeExpired,watchLobby,type Duel,type Presence} from '../data/duel.mjs';
const Context=createContext({duels:[] as Duel[],busyDuels:[] as Duel[],presence:[] as Presence[],now:Date.now(),error:''});
export const useDuelLobby=()=>useContext(Context);
export function DuelLobby({children}:{children:ReactNode}){
 const {student}=useSession(),[state,setState]=useState({duels:[] as Duel[],busyDuels:[] as Duel[],presence:[] as Presence[]}),[now,setNow]=useState(Date.now()),[offset,setOffset]=useState(0),[error,setError]=useState('');
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()+offset),500);return()=>clearInterval(timer);},[offset]);
 useEffect(()=>{
  setState({duels:[],busyDuels:[],presence:[]});setError('');if(!student)return;
  let alive=true;const fail=()=>{if(alive)setError('Düello bağlantısı kesildi. Yeniden bağlanılıyor…');};
  const ping=()=>{if(document.visibilityState==='visible')void heartbeat(db,student).catch(fail);};ping();
  const timer=setInterval(ping,25000);document.addEventListener('visibilitychange',ping);
  void call<{serverNow:number}>('prepareArena',{}).then(r=>{if(alive)setOffset(r.serverNow-Date.now());}).catch(fail);
  const stop=watchLobby(db,student,s=>{setState(s);setError('');},fail);
  return()=>{alive=false;stop();clearInterval(timer);document.removeEventListener('visibilitychange',ping);};
 },[student?.studentId,student?.classId,student?.credentialVersion]);
 useEffect(()=>{if(student&&state.duels.some(d=>d.status==='pending'&&d.createdAt&&d.createdAt.toMillis()+60000<=now||d.status==='active'&&d.acceptedAt&&d.acceptedAt.toMillis()+310000<=now))void closeExpired(db,student,state.duels,now).catch(()=>{});},[student?.studentId,state.duels,Math.floor(now/5000)]);
 const incoming=state.duels.find(d=>d.to===student?.studentId&&d.status==='pending'&&d.createdAt&&d.createdAt.toMillis()+60000>now);
 return <Context.Provider value={{...state,now,error}}>{incoming&&<Link className="duel-notice" to="/ogrenci/duello">Sınıfından bir düello daveti var · Gör →</Link>}{children}</Context.Provider>;
}
