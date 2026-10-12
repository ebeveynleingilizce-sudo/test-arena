export const reportTimeoutMs=30000;
export function reportTimeoutError(){return Object.assign(Error('Performans raporu zamanında yüklenemedi. Bağlantını kontrol edip yeniden dene.'),{code:'report-timeout'});}
export function abortableReport(signal,work){
 if(!signal)return Promise.resolve().then(work);
 if(signal.aborted)return Promise.reject(signal.reason);
 return new Promise((resolve,reject)=>{
  const abort=()=>reject(signal.reason);signal.addEventListener('abort',abort,{once:true});
  Promise.resolve().then(()=>{signal.throwIfAborted();return work();}).then(resolve,reject).finally(()=>signal.removeEventListener('abort',abort));
 });
}
export function timedReport(work,timeoutMs=reportTimeoutMs,parentSignal){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(reportTimeoutError()),timeoutMs);
 const abort=()=>controller.abort(parentSignal.reason);parentSignal?.addEventListener('abort',abort,{once:true});if(parentSignal?.aborted)abort();
 return abortableReport(controller.signal,()=>work(controller.signal)).finally(()=>{clearTimeout(timer);parentSignal?.removeEventListener('abort',abort);});
}
// A single queue is shared by all students and tests in this report. Firestore
// cannot cancel requests already sent; cancellation stops queued/future reads.
export function reportReadQueue(signal,concurrency=6){
 let active=0,failure;const queue=[];
 const drain=()=>{
  if(failure||signal?.aborted){for(const job of queue.splice(0))job.reject(failure||signal.reason);return;}
  while(active<concurrency&&queue.length){const job=queue.shift();active++;
   Promise.resolve().then(()=>{signal?.throwIfAborted();if(failure)throw failure;return job.work();}).then(job.resolve,e=>{failure=e;job.reject(e);}).finally(()=>{active--;drain();});
  }
 };
 signal?.addEventListener('abort',drain,{once:true});
 return {read:work=>new Promise((resolve,reject)=>{queue.push({work,resolve,reject});drain();}),dispose:()=>signal?.removeEventListener('abort',drain)};
}
