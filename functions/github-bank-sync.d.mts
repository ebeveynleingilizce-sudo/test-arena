import type {Firestore} from 'firebase-admin/firestore';
export function authorizeBankSync(db:Firestore,auth:any,getUser?:(uid:string)=>Promise<any>):Promise<string>;
export function syncGithubBank(options:{db:Firestore;source:any;actorUid:string;maxFiles?:number;now?:()=>number;hooks?:any}):Promise<any>;
