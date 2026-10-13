export function clearArenaRows(db:object):void;
export function saveArenaRows<T>(db:object,key:string,rows:T[]):void;
export function cachedArenaRows<T>(db:object,key:string,load:()=>Promise<T[]>):Promise<T[]>;
