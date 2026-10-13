import type {Firestore} from 'firebase/firestore';
export function readStudentCodePages(db:Firestore,storageUid:string,ids:string[],alive?:()=>boolean):Promise<Record<string,string>>;
