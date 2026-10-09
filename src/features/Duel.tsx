import {QuestionReport} from './QuestionReport';
import {useEffect,useState,useRef} from 'react';
import {Link,Navigate} from 'react-router-dom';
import {useSession} from '../app/Session';
import {useDuelLobby} from '../app/DuelLobby';
import {useArena} from '../app/useArena';
import {call,db} from '../data/firebase';
import {duelStart,duelEnd,duelScore,invite,respond,publishAnswer,watchAnswers,type Duel as Game,type DuelAnswer} from '../data/duel.mjs';
import type {Catalog,Quiz,AnswerResult} from '../domain/quiz';
import {StudentLayout} from '../ui/StudentLayout';
import {MathVisual} from '../ui/MathVisual';
import '../ui/duel.css';
type Pack={templateId:string;name:string;grade:number;subject:string};
export function Duel(){
 const {student,role}=useSession(),lobby=useDuelLobby(),arena=useArena();
 const [packs,setPacks]=useState<Pack[]>([]),[selected,setSelected]=useState(''),[chosen,setChosen]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 useEffect(()=>{let alive=true;if(student)void call<Catalog>('quizCatalog',{}).then(c=>{const out:Pack[]=[];for(const g of c.curricula||[])for(const s of g.subjects)for(const u of s.units)for(const p of s.navigationModel==='theme-test'?u.packs:u.topics.flatMap(t=>t.packs))if(p.count===10&&p.templateId)out.push({templateId:p.templateId,name:`${u.displayName} · ${p.name}`,grade:g.grade,subject:s.name});if(alive){setPacks(out);setSelected(out[0]?.templateId||'');}}).catch(()=>{if(alive)setError('Soru paketleri yüklenemedi.');});return()=>{alive=false;};},[student?.gradeLevel,student?.studentId]);
 useEffect(()=>{const d=lobby.duels.find(d=>d.acceptedAt&&d.status==='active'&&duelEnd(d)>lobby.now);if(d)setChosen(d.id);},[lobby.duels,lobby.now]);
 if(role!=='student'||!student)return <Navigate to="/ogrenci-giris" replace/>;
 const name=(s:string)=>arena.rows?.find(r=>r.studentId===s)?.displayName||'Sınıf arkadaşın';
 const active=lobby.duels.find(d=>d.acceptedAt&&d.status==='active'&&duelEnd(d)>lobby.now),game=lobby.duels.find(d=>d.id===(active?.id||chosen));
 const pending=lobby.duels.filter(d=>d.createdAt&&d.status==='pending'&&d.createdAt.toMillis()+60000>lobby.now);
 const history=lobby.duels.filter(d=>d.acceptedAt&&duelEnd(d)<=lobby.now).sort((a,b)=>b.acceptedAt!.toMillis()-a.acceptedAt!.toMillis());
 const occupied=(s:string)=>(lobby.busyDuels||lobby.duels).some(d=>d.participants.includes(s)&&(d.status==='pending'&&d.createdAt&&d.createdAt.toMillis()+60000>lobby.now||d.status==='active'&&d.acceptedAt&&duelEnd(d)>lobby.now));
 async function act(work:()=>Promise<unknown>){setBusy(true);setError('');try{await work();}catch(e){setError((e as {code?:string}).code?'İşlem tamamlanamadı. Davet süresi veya bağlantını kontrol et.':(e as Error).message);}finally{setBusy(false);}}
 return <StudentLayout><section className="duel-shell"><header className="duel-heading"><span className="eyebrow">SINIF ARENA · CANLI 1’E 1</span><h1>Düello</h1><p>{student.className} · Aynı sorular. Aynı süre. Bilginle yarış.</p><Link to="/ogrenci/arena">← Arena</Link></header>{(error||lobby.error)&&<p className="form-error" role="alert">{error||lobby.error}</p>}
 {game?.acceptedAt?<Match key={game.id} game={game} rival={name(game.from===student.studentId?game.to:game.from)}/>:<>
 <div className="duel-intro"><strong>10 soru · Her soruya 30 saniye</strong><p>Doğru cevap 1000 puan; hızın en fazla 300 ek puan getirir. XP: ilk kez doğru çözülen soru başına +1.</p></div>
 {pending.map(d=><div className="duel-invite" key={d.id}><p><strong>{name(d.from===student.studentId?d.to:d.from)}</strong>{d.to===student.studentId?' seni düelloya davet ediyor.':' yanıtı bekleniyor.'}<small>{Math.max(0,Math.ceil((d.createdAt.toMillis()+60000-lobby.now)/1000))} saniye kaldı</small></p>{d.to===student.studentId&&<div><button className="button primary" disabled={busy} onClick={()=>void act(()=>respond(db,student,d.id,true))}>Kabul et</button><button className="button outline" disabled={busy} onClick={()=>void act(()=>respond(db,student,d.id,false))}>Reddet</button></div>}</div>)}
 <label className="duel-pack">Yarışılacak test<select value={selected} onChange={e=>setSelected(e.target.value)} disabled={busy||occupied(student.studentId)}>{packs.map(p=><option key={p.templateId} value={p.templateId}>{p.grade}. Sınıf · {p.subject} · {p.name}</option>)}</select></label>{!packs.length&&<p>10 soruluk uygun bir test paketi bulunamadı.</p>}
 <h2>Çevrimiçi rakipler</h2><p className="duel-muted">Rakibin de uygulamayı açık tutmalı. İki öğrencinin erişebildiği kademe kullanılır.</p><ul className="duel-rivals">{lobby.presence.filter(p=>p.studentId!==student.studentId&&p.at&&p.at.toMillis()+75000>lobby.now).map(p=><li key={p.studentId}><span className="arena-avatar" aria-hidden="true">{name(p.studentId).slice(0,1)}</span><span><strong>{name(p.studentId)}</strong><small>{arena.rows?.find(r=>r.studentId===p.studentId)?.academicXP||0} XP · {occupied(p.studentId)?'Meşgul':'Çevrimiçi'}</small></span><button className="button primary" disabled={busy||!selected||occupied(p.studentId)||occupied(student.studentId)} onClick={()=>void act(()=>invite(db,student,p.studentId,selected))}>Davet et</button></li>)}</ul>{!lobby.presence.some(p=>p.studentId!==student.studentId&&p.at&&p.at.toMillis()+75000>lobby.now)&&<p role="status">Şu anda çevrimiçi sınıf arkadaşın yok.</p>}
 {history.length>0&&<><h2>Düello geçmişi</h2><ul className="duel-history">{history.slice(0,20).map(d=><li key={d.id}><span>{name(d.from===student.studentId?d.to:d.from)}<small>{d.acceptedAt!.toDate().toLocaleString('tr-TR')}</small></span><button className="button outline" onClick={()=>setChosen(d.id)}>Sonucu gör</button></li>)}</ul></>}
 </>}{game?.acceptedAt&&duelEnd(game)<=lobby.now&&<button className="button outline" onClick={()=>setChosen('')}>Rakip listesine dön</button>}</section></StudentLayout>;
}
function Match({game,rival}:{game:Game;rival:string}){
 const {student}=useSession(),{now}=useDuelLobby(),[quiz,setQuiz]=useState<Quiz>(),[answers,setAnswers]=useState<DuelAnswer[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[retry,setRetry]=useState(0),[picked,setPicked]=useState('');
 const working=useRef(false),start=duelStart(game),end=duelEnd(game),index=Math.max(0,Math.min(9,Math.floor((now-start)/30000))),finished=now>=end;
 useEffect(()=>{if(!student)return;return watchAnswers(db,student,game.id,setAnswers,()=>setError('Rakibin yanıtları yüklenemedi.'));},[game.id,student?.studentId]);
 useEffect(()=>{let alive=true;void call<Quiz>('startDuelTest',{duelId:game.id}).then(q=>{if(alive)setQuiz(q);}).catch(()=>{if(alive)setError('Düello soruları yüklenemedi. Yeniden dene.');});return()=>{alive=false;};},[game.id,retry]);
 useEffect(()=>setPicked(''),[index]);
 // Recover a committed quiz result if the connection failed before its public
 // race receipt was written. Missed rounds are blanked by the existing quiz flow.
 useEffect(()=>{
  if(!quiz||!student||working.current)return;
  const missing=quiz.questions.map((q,i)=>({q,i})).filter(({q,i})=>i<(finished?10:index)&&!quiz.answeredQuestionIds.includes(q.questionId));
  const receipts=quiz.questions.map((q,i)=>({q,i})).filter(({q,i})=>quiz.answeredQuestionIds.includes(q.questionId)&&!answers.some(a=>a.studentId===student.studentId&&a.index===i));
  if(!missing.length&&!receipts.length&&!finished)return;
  working.current=true;let alive=true;
  void(async()=>{try{
   for(const {i} of receipts)await publishAnswer(db,student,game,i).catch(()=>{});
   let updated=quiz;for(const {q} of missing){const r=await call<AnswerResult>('submitAnswer',{testSessionId:quiz.testSessionId,questionId:q.questionId,selectedChoiceId:''});updated=r.test;}
   if(finished)updated=await call<Quiz>('finishTest',{testSessionId:quiz.testSessionId});
   if(alive&&JSON.stringify(updated)!==JSON.stringify(quiz))setQuiz(updated);
  }catch{if(alive)setError('Yanıtlar eşitlenemedi. Yeniden dene.');}finally{working.current=false;}})();return()=>{alive=false;};
 },[index,finished,quiz,retry]);
 if(!student)return null;
 const own=duelScore(game,answers,student.studentId),other=duelScore(game,answers,game.from===student.studentId?game.to:game.from),q=quiz?.questions[index],answered=q&&quiz?.answeredQuestionIds.includes(q.questionId);
 async function submit(){if(!q||!quiz||working.current)return;working.current=true;setBusy(true);setError('');try{const r=await call<AnswerResult>('submitAnswer',{testSessionId:quiz.testSessionId,questionId:q.questionId,selectedChoiceId:picked});await publishAnswer(db,student!,game,index);setQuiz(r.test);}catch{setError('Yanıt kaydedilemedi. Yeniden dene.');setRetry(r=>r+1);}finally{working.current=false;setBusy(false);}}
 return <section className="duel-match"><div className="duel-scoreboard"><div><span>{student.firstName} · SEN</span><strong>{own.toLocaleString('tr-TR')}</strong></div><b>VS</b><div><span>{rival}</span><strong>{other.toLocaleString('tr-TR')}</strong></div></div>
 {finished?<div className="duel-result"><span className="eyebrow">DÜELLO TAMAMLANDI</span><h2>{own===other?'Berabere!':own>other?'Kazandın!':'Rakibin kazandı'}</h2><p>Sen {own} · Rakibin {other} yarışma puanı</p><strong>+{quiz?.earnedXP??0} XP</strong><p>{quiz?.correctCount??0} doğru · {quiz?.wrongCount??0} yanlış · {quiz?.blankCount??0} boş</p><p>Yanıt verilmeyen ve bağlantı koptuğunda kaçırılan sorular 0 yarışma puanı getirir. Sonuçlar eşitlenirken puan güncellenebilir.</p></div>:now<start?<div className="duel-countdown" role="status"><h2>Rakibin hazır!</h2><strong>{Math.ceil((start-now)/1000)}</strong><p>Düello başlıyor. Her soru için 30 saniyen var.</p></div>:q?<><QuestionReport key={q.questionId} questionId={q.questionId} testSessionId={quiz?.testSessionId}/><div className="duel-round"><strong>Soru {index+1} / 10</strong><span role="timer">{Math.max(0,Math.ceil((start+(index+1)*30000-now)/1000))} sn</span></div><progress value={index} max={10}/>{q.content&&<p className="duel-question-content">{q.content}</p>}{q.visual&&q.visualPlacement==='above'&&<MathVisual visual={q.visual}/>}<h2 className="question-text">{q.questionText}</h2>{q.visual&&q.visualPlacement!=='above'&&<MathVisual visual={q.visual}/>}<div className="answer-choices">{q.choices.map((c,i)=><button key={c.choiceId} disabled={busy||answered} aria-pressed={picked===c.choiceId} onClick={()=>setPicked(c.choiceId)}><span>{'ABCDEF'[i]}</span>{c.visual&&<MathVisual visual={c.visual}/>}<strong>{c.text}</strong></button>)}</div>{answered?<p role="status">Cevabın kilitlendi. Sonraki soru aynı anda açılacak.</p>:<button className="button primary" disabled={busy||!picked} onClick={()=>void submit()}>{busy?'Kaydediliyor…':'Cevabı gönder'}</button>}<p className="duel-muted">Doğru cevap yarışma ekranında gösterilmez.</p></>:<p role="status">Sorular hazırlanıyor…</p>}
 {error&&<div role="alert"><p className="form-error">{error}</p><button className="button outline" disabled={busy} onClick={()=>{setError('');setRetry(r=>r+1);}}>Yeniden dene</button></div>}</section>;
}

