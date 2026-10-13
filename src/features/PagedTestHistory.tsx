import {useEffect,useState} from 'react';
import {call} from '../data/firebase';
import {errorMessage} from '../ui/components';
import {TestBehaviorHistory} from './TestBehaviorHistory';
import type {BehaviorHistory} from '../domain/analytics';
type Cursor={at:number;id:string};
type Page={history:BehaviorHistory[];cursor:Cursor|null};
export function PagedTestHistory({studentId,storageUid,onLoaded}:{studentId:string;storageUid?:string;onLoaded?:(history:BehaviorHistory[],complete:boolean)=>void}){
 const [pages,setPages]=useState<Page[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 useEffect(()=>{let alive=true;setPages([]);setBusy(true);setError('');void call<Page>('teacherTestHistory',{studentId,storageUid}).then(p=>{if(alive)setPages([p]);}).catch(e=>{if(alive)setError(errorMessage(e));}).finally(()=>{if(alive)setBusy(false);});return()=>{alive=false;};},[studentId,storageUid,retry]);
 async function more(){const cursor=pages.at(-1)?.cursor;if(!cursor||busy)return;setBusy(true);setError('');try{const p=await call<Page>('teacherTestHistory',{studentId,storageUid,cursor});setPages(v=>[...v,p]);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 const history=pages.flatMap(p=>p.history);
 useEffect(()=>{if(pages.length)onLoaded?.(pages.flatMap(p=>p.history),!pages.at(-1)?.cursor);},[pages,onLoaded]);
 return <><TestBehaviorHistory history={history}/>{busy&&<p role="status">Test geçmişi yükleniyor…</p>}{error&&<p role="alert">{error}</p>}{!pages.length&&error&&<button className="button secondary" onClick={()=>setRetry(v=>v+1)}>Yeniden dene</button>}{pages.at(-1)?.cursor&&<button className="button secondary" disabled={busy} onClick={()=>void more()}>Daha eski testleri yükle</button>}</>;
}
