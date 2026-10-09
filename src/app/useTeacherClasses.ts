import {useEffect,useState} from 'react';
import {collection,doc,onSnapshot,query,where,type Unsubscribe} from 'firebase/firestore';
import {db} from '../data/firebase';
import {errorMessage} from '../ui/components';
import type {ArenaClass,Student} from '../domain/models';
export function useTeacherClasses(uid?:string){
 const [state,setState]=useState({classes:[] as ArenaClass[],students:[] as Student[],codes:{} as Record<string,string>,error:''});
 useEffect(()=>{
  setState({classes:[],students:[],codes:{},error:''});if(!uid)return;
  type Group={cls?:ArenaClass;students:Student[];codes:Record<string,string>;stops:Unsubscribe[];codeStops:Map<string,Unsubscribe>;error:string};
  let live=true,indexError='',ownedError='';
  const groups=new Map<string,Group>(),owned=new Map<string,{storageUid:string;classId:string}>(),links=new Map<string,{storageUid:string;classId:string}>();
  const emit=()=>{if(live)setState({classes:[...groups.values()].flatMap(g=>g.cls?[g.cls]:[]),students:[...groups.values()].flatMap(g=>g.students),codes:Object.assign({},...[...groups.values()].map(g=>g.codes)),error:ownedError||indexError||[...groups.values()].find(g=>g.error)?.error||''});};
  const clear=(key:string)=>{const g=groups.get(key);if(g){g.stops.forEach(s=>s());g.codeStops.forEach(s=>s());groups.delete(key);}};
  const sync=()=>{
   const refs=new Map([...links,...owned]);for(const key of groups.keys())if(!refs.has(key))clear(key);
   for(const [key,{storageUid,classId}]of refs){if(groups.has(key))continue;
    const g:Group={students:[],codes:{},stops:[],codeStops:new Map(),error:''};groups.set(key,g);
    const current=()=>live&&groups.get(key)===g;
    g.stops.push(onSnapshot(doc(db,'teachers',storageUid,'classes',classId),{includeMetadataChanges:true},s=>{
     if(!current()||s.metadata.fromCache)return;
     if(!s.exists()){clear(key);emit();return;}g.cls={...s.data(),classId,storageUid} as ArenaClass;emit();
    },e=>{if(!current())return;clear(key);if(e.code!=='permission-denied')indexError=errorMessage(e);emit();}));
    g.stops.push(onSnapshot(query(collection(db,'teachers',storageUid,'students'),where('classId','==',classId),where('status','==','active')),{includeMetadataChanges:true},s=>{
     if(!current()||s.metadata.fromCache)return;g.error='';g.students=s.docs.map(d=>d.data() as Student);const students=new Set(s.docs.map(d=>d.id));
     for(const [studentId,stopCode]of g.codeStops)if(!students.has(studentId)){stopCode();g.codeStops.delete(studentId);delete g.codes[storageUid+'~'+studentId];}
     for(const d of s.docs)if(!g.codeStops.has(d.id)){const codeKey=storageUid+'~'+d.id;g.codeStops.set(d.id,onSnapshot(doc(db,'teachers',storageUid,'studentCodes',d.id),{includeMetadataChanges:true},v=>{if(!current()||v.metadata.fromCache)return;g.codes[codeKey]=v.data()?.code||'';emit();},e=>{if(!current())return;delete g.codes[codeKey];g.error='Kısa kodlar yüklenemedi. '+errorMessage(e);emit();}));}emit();
    },e=>{
     if(!current())return;g.students=[];g.codes={};g.codeStops.forEach(s=>s());g.codeStops.clear();
     // A child query error must not erase the independently authorized class.
     g.error='Sınıf öğrencileri yüklenemedi. '+errorMessage(e);emit();
    }));
   }emit();
  };
  const stopOwned=onSnapshot(collection(db,'teachers',uid,'classes'),{includeMetadataChanges:true},snap=>{
   if(!live||snap.metadata.fromCache)return;ownedError='';owned.clear();for(const d of snap.docs)owned.set(uid+'~'+d.id,{storageUid:uid,classId:d.id});sync();
  },e=>{if(!live)return;ownedError='Oluşturduğun sınıflar yüklenemedi. '+errorMessage(e);emit();});
  const stopLinks=onSnapshot(collection(db,'teacherClassAccess',uid,'classes'),{includeMetadataChanges:true},snap=>{
   if(!live||snap.metadata.fromCache)return;indexError='';links.clear();for(const d of snap.docs){const v=d.data();if(typeof v.storageUid==='string'&&typeof v.classId==='string')links.set(v.storageUid+'~'+v.classId,{storageUid:v.storageUid,classId:v.classId});}sync();
  },e=>{if(!live)return;indexError='Paylaşılan sınıflar yüklenemedi. '+errorMessage(e);emit();});
  return()=>{live=false;stopOwned();stopLinks();for(const key of groups.keys())clear(key);};
 },[uid]);return state;
}
