import {useState,type FormEvent} from 'react';
import {call} from '../data/firebase';
import {errorMessage} from '../ui/components';
import {reportTypes} from '../../shared/question-bank.mjs';
import '../ui/question-bank.css';
export function QuestionReport({questionId,testSessionId}:{questionId:string;testSessionId?:string}){
 const [open,setOpen]=useState(false),[type,setType]=useState(reportTypes[0]),[description,setDescription]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[sent,setSent]=useState(false);
 async function send(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await call('reportQuestion',{questionId,testSessionId,type,description});setOpen(false);setSent(true);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}}
 return <div className="question-report"><button type="button" className="text-button question-report-button" onClick={()=>{setOpen(true);setError('');}}>⚑ Hata Bildir</button>{sent&&<small role="status">Bildirimin alındı. Soruyu çözmeye devam edebilirsin.</small>}{open&&<div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby={`report-title-${questionId}`}><button type="button" className="modal-close" aria-label="Kapat" disabled={busy} onClick={()=>setOpen(false)}>×</button><h2 id={`report-title-${questionId}`}>Soru hatası bildir</h2><p>Bildirim cevabını veya puanını değiştirmez.</p><form onSubmit={send}><label>Hata türü<select value={type} onChange={e=>setType(e.target.value)}>{reportTypes.map(t=><option key={t}>{t}</option>)}</select></label><label>Ek açıklama (isteğe bağlı)<textarea maxLength={2000} rows={4} value={description} onChange={e=>setDescription(e.target.value)}/></label><button className="button primary" disabled={busy}>{busy?'Gönderiliyor…':'Bildirimi gönder'}</button></form>{error&&<p role="alert" className="error-message">{error}</p>}</section></div>}</div>;
}
