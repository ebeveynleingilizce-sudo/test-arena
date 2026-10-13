export function behaviorCheckpoints<T>(snapshot:()=>T,save:(value:T)=>Promise<void>,options?:{interval?:number;every?:number}):{flush:()=>Promise<void>;checkpoint:()=>Promise<void>};
