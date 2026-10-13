import {useEffect,useRef,useState} from 'react';
import {getDocsFromServer,limit,onSnapshot,query,startAfter,type DocumentData,type Query,type QueryDocumentSnapshot} from 'firebase/firestore';
import {errorMessage} from '../ui/components';
import {measuredListener,measuredRead,recordReadMeasurement} from '../data/read-measurement.mjs';
import {db} from '../data/firebase';

// Live first page; older pages are read only on demand. The cursor is a full
// snapshot, so equal sort values cannot repeat/skip documents.
export function usePagedCollection(source:Query<DocumentData>|undefined,key:string){
 const generation=useRef(0),cursor=useRef<QueryDocumentSnapshot<DocumentData>|undefined>(undefined),moreBusy=useRef(false),paged=useRef(false);
 const [revision,setRevision]=useState(0),[state,setState]=useState({key:'',rows:[] as ({id:string}&DocumentData)[],busy:false,hasMore:false,error:''});
 useEffect(()=>{
  const run=++generation.current;cursor.current=undefined;moreBusy.current=false;paged.current=false;
  setState({key,rows:[],busy:!!source,hasMore:false,error:''});if(!source)return;
  const stop=measuredListener(db,key,observe=>onSnapshot(query(source,limit(51)),{includeMetadataChanges:true},snapshot=>{
   observe(snapshot);
   if(run!==generation.current||snapshot.metadata.fromCache)return;
   const docs=snapshot.docs.slice(0,50);if(!cursor.current)cursor.current=docs.at(-1);
   setState(previous=>{const rows=new Map(previous.rows.map(row=>[row.id,row]));for(const d of docs)rows.set(d.id,{id:d.id,...d.data()});return {...previous,key,rows:[...rows.values()],busy:moreBusy.current,hasMore:paged.current?previous.hasMore:snapshot.size>50,error:''};});
  },e=>{recordReadMeasurement(db,{type:'listener-error',path:key,code:e.code,message:e.message});if(run===generation.current){cursor.current=undefined;setState({key,rows:[],busy:false,hasMore:false,error:errorMessage(e)});}}));
  return()=>{generation.current++;stop();};
 },[source,key,revision]);
 async function loadMore(){
  if(!source||!cursor.current||moreBusy.current)return;
  const run=generation.current;moreBusy.current=true;setState(s=>({...s,busy:true,error:''}));
  try{const snapshot=await measuredRead(db,()=>getDocsFromServer(query(source,startAfter(cursor.current),limit(51))));if(run!==generation.current)return;
   const docs=snapshot.docs.slice(0,50);cursor.current=docs.at(-1)||cursor.current;paged.current=true;
   setState(previous=>{const rows=new Map(previous.rows.map(row=>[row.id,row]));for(const d of docs)rows.set(d.id,{id:d.id,...d.data()});return {...previous,rows:[...rows.values()],hasMore:snapshot.size>50};});
  }catch(e){if(run===generation.current)setState(s=>({...s,rows:[],hasMore:false,error:errorMessage(e)}));}
  finally{if(run===generation.current){moreBusy.current=false;setState(s=>({...s,busy:false}));}}
 }
 const current=state.key===key?state:{key,rows:[],busy:!!source,hasMore:false,error:''};
 return {...current,loadMore,reload:()=>setRevision(v=>v+1),
  // Older pages are not live. Reflect only a successfully committed edit in
  // this scope, without fetching every historical document again.
  updateRow:(id:string,values:DocumentData)=>setState(s=>s.key===key?{...s,rows:s.rows.map(row=>row.id===id?{...row,...values}:row)}:s)};
}
