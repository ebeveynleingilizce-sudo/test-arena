export const reportTimeoutMs:number;
export function timedReport<T>(work:(signal:AbortSignal)=>Promise<T>,timeoutMs?:number,parentSignal?:AbortSignal):Promise<T>;
export function abortableReport<T>(signal:AbortSignal|undefined,work:()=>Promise<T>):Promise<T>;
export function reportReadQueue(signal?:AbortSignal,concurrency?:number):{read:<T>(work:()=>Promise<T>)=>Promise<T>;dispose:()=>void};
