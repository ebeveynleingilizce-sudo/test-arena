import type {Firestore,QuerySnapshot,DocumentSnapshot} from 'firebase/firestore';
export function recordReadMeasurement(db:Firestore,event:Record<string,unknown>):void;
export function measuredRead<T>(db:Firestore,work:()=>Promise<T>):Promise<T>;
export function measuredListener(db:Firestore,path:string,subscribe:(observe:(snapshot:QuerySnapshot|DocumentSnapshot)=>void)=>()=>void):()=>void;
export function beginReadMeasurement(db:Firestore):{snapshot:()=>{calls:number;returnedDocuments:number;cacheHits:number;listenerOpens:number;listenerCloses:number;snapshots:number;changedDocuments:number;events:any[]};stop:()=>void};
