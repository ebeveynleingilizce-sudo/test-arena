import type {Firestore,Timestamp} from 'firebase/firestore';
import type {Student} from '../domain/models';
export interface Duel {id:string;participants:string[];from:string;to:string;templateId:string;status:'pending'|'active'|'declined'|'expired'|'completed';createdAt:Timestamp;acceptedAt:Timestamp|null}
export interface DuelAnswer {studentId:string;index:number;isCorrect:boolean;submittedAt:Timestamp}
export interface Presence {studentId:string;at:Timestamp}
export const roundSeconds:number;
export function duelStart(d:Duel):number;
export function duelEnd(d:Duel):number;
export function duelScore(d:Duel,a:DuelAnswer[],s:string):number;
export function watchLobby(db:Firestore,p:Student,next:(s:{presence:Presence[];duels:Duel[];busyDuels:Duel[]})=>void,error:(e:unknown)=>void):()=>void;
export function watchAnswers(db:Firestore,p:Student,id:string,next:(a:DuelAnswer[])=>void,error:(e:unknown)=>void):()=>void;
export function heartbeat(db:Firestore,p:Student):Promise<void>;
export function closeExpired(db:Firestore,p:Student,duels:Duel[],now:number):Promise<void>;
export function invite(db:Firestore,p:Student,to:string,templateId:string):Promise<string>;
export function respond(db:Firestore,p:Student,id:string,accept:boolean):Promise<void>;
export function publishAnswer(db:Firestore,p:Student,d:Duel,index:number):Promise<void>;
