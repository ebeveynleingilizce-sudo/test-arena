import {useEffect,useState} from 'react';
import {collection,doc,onSnapshot,query,where,type Unsubscribe} from 'firebase/firestore';
import {db} from '../data/firebase';
import {errorMessage} from '../ui/components';
import type {ArenaClass,Student} from '../domain/models';
import {readStudentCodePages} from '../data/student-code-pages.mjs';
import {measuredListener} from '../data/read-measurement.mjs';

export function useTeacherClasses(uid?:string,scope:{classId?:string;storageUid?:string;codes?:boolean}={}){
 const [metadata,setMetadata]=useState({classes:[] as ArenaClass[],error:''});
 const [roster,setRoster]=useState({key:'',students:[] as Student[],codes:{} as Record<string,string>,error:'',loading:false});
 useEffect(()=>{
  setMetadata({classes:[],error:''});if(!uid)return;
  let alive=true,ownedError='',linksError='';
  const owned=new Map<string,ArenaClass>(),links=new Map<string,{storageUid:string;classId:string}>(),shared=new Map<string,{cls?:ArenaClass;stop:Unsubscribe}>();
  const emit=()=>{if(alive)setMetadata({classes:[...owned.values(),...[...shared.values()].flatMap(g=>g.cls?[g.cls]:[])],error:ownedError||linksError});};
  const sync=()=>{
   for(const [key,g]of shared)if(!links.has(key)||owned.has(key)){g.stop();shared.delete(key);}
   for(const [key,v]of links)if(!owned.has(key)&&!shared.has(key)){
    const group:{cls?:ArenaClass;stop:Unsubscribe}={stop:()=>{}};shared.set(key,group);
    group.stop=onSnapshot(doc(db,'teachers',v.storageUid,'classes',v.classId),{includeMetadataChanges:true},s=>{
     if(!alive||shared.get(key)!==group||s.metadata.fromCache)return;
     group.cls=s.exists()?{...s.data(),classId:v.classId,storageUid:v.storageUid} as ArenaClass:undefined;emit();
    },e=>{if(!alive||shared.get(key)!==group)return;group.cls=undefined;if(e.code!=='permission-denied')linksError=errorMessage(e);emit();});
   }emit();
  };
  const stopOwned=onSnapshot(collection(db,'teachers',uid,'classes'),{includeMetadataChanges:true},s=>{
   if(!alive||s.metadata.fromCache)return;ownedError='';owned.clear();for(const d of s.docs)owned.set(uid+'~'+d.id,{...d.data(),classId:d.id,storageUid:uid} as ArenaClass);sync();
  },e=>{if(alive){ownedError=errorMessage(e);emit();}});
  const stopLinks=onSnapshot(collection(db,'teacherClassAccess',uid,'classes'),{includeMetadataChanges:true},s=>{
   if(!alive||s.metadata.fromCache)return;linksError='';links.clear();for(const d of s.docs){const v=d.data();if(typeof v.storageUid==='string'&&typeof v.classId==='string')links.set(v.storageUid+'~'+v.classId,v as {storageUid:string;classId:string});}sync();
  },e=>{if(alive){linksError=errorMessage(e);emit();}});
  return()=>{alive=false;stopOwned();stopLinks();shared.forEach(g=>g.stop());};
 },[uid]);
 const cls=metadata.classes.find(c=>c.classId===scope.classId&&(!scope.storageUid||c.storageUid===scope.storageUid));
 const storageUid=cls?.storageUid,classId=cls?.classId;
 const key=uid&&storageUid&&classId?`${uid}:${storageUid}:${classId}:${!!scope.codes}`:'';
 useEffect(()=>{
  setRoster({key,students:[],codes:{},error:'',loading:!!key});if(!key||!storageUid||!classId)return;
  let alive=true,revision=0;const versions=new Map<string,number>(),codes:Record<string,string>={};
  const stop=measuredListener(db,`teachers/${storageUid}/students:${classId}`,observe=>onSnapshot(query(collection(db,'teachers',storageUid,'students'),where('classId','==',classId),where('status','==','active')),{includeMetadataChanges:true},s=>{
   observe(s);
   // Code queries must follow the committed profile version, never the local
   // optimistic profile event emitted before a code-rotation batch commits.
   if(!alive||s.metadata.fromCache||s.metadata.hasPendingWrites)return;const ids=new Set(s.docs.map(d=>d.id));
   const run=++revision;
   for(const id of versions.keys())if(!ids.has(id)){versions.delete(id);delete codes[storageUid+'~'+id];}
   const changed=scope.codes?s.docs.filter(d=>versions.get(d.id)!==d.data().credentialVersion).map(d=>d.id):[];
   for(const id of changed)delete codes[storageUid+'~'+id];
   setRoster({key,students:s.docs.map(d=>d.data() as Student),codes:{...codes},error:'',loading:false});
   if(changed.length)void readStudentCodePages(db,storageUid,changed,()=>alive&&run===revision).then(values=>{
    if(!alive||run!==revision)return;
    Object.assign(codes,values);for(const d of s.docs)if(values[storageUid+'~'+d.id])versions.set(d.id,d.data().credentialVersion);
    setRoster(previous=>previous.key===key?{...previous,codes:{...codes}}:previous);
   }).catch(e=>{if(alive&&run===revision){versions.clear();for(const id of Object.keys(codes))delete codes[id];setRoster(previous=>({...previous,codes:{},error:'Kısa kodlar yüklenemedi. '+errorMessage(e)}));}});
  },e=>{if(alive){revision++;versions.clear();setRoster({key,students:[],codes:{},loading:false,error:'Sınıf öğrencileri yüklenemedi. '+errorMessage(e)});}}));
  return()=>{alive=false;revision++;stop();};
 },[key,storageUid,classId]);
 const current=roster.key===key?roster:{students:[],codes:{} as Record<string,string>,error:'',loading:!!key};
 return {classes:metadata.classes,students:current.students,codes:current.codes,error:metadata.error||current.error,studentsLoading:!!scope.classId&&(!cls||current.loading)};
}
