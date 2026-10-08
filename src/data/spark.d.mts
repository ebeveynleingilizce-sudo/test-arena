import type {Auth,User} from 'firebase/auth';
import type {Firestore} from 'firebase/firestore';
import type {FirebaseApp} from 'firebase/app';
export interface SparkContext {auth:Auth;db:Firestore;app:FirebaseApp;emulator:boolean;testPorts?:{auth:number;firestore:number}}
export function ensureTeacher(db:Firestore,user:User):Promise<void>;
export function codeCredentials(value:string):{code:string;email:string;password:string};
export function sparkCall(name:string,data:unknown,ctx:SparkContext):Promise<any>;
