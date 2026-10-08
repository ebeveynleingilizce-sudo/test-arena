export function shuffle(items, random = Math.random) {
 const result = [...items]; for(let i=result.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[result[i],result[j]]=[result[j],result[i]];} return result;
}
export function prepareQuestions(questions, balanced = false) {
 const unique = [...new Map(questions.map(q=>[q.questionId,q])).values()];
 if(!balanced)return shuffle(unique);
 const groups=['easy','medium','hard'].map(level=>shuffle(unique.filter(q=>q.difficulty===level)));
 groups.push(shuffle(unique.filter(q=>!['easy','medium','hard'].includes(q.difficulty))));
 const result=[];while(groups.some(g=>g.length))for(const g of groups)if(g.length)result.push(g.pop());return result;
}
export function createGame(questions, players, settings) {
 if(!players.length || questions.length<players.length)throw Error('Her oyuncu için en az bir soru gerekli.');
 return {version:1,questions,players:players.map(p=>({...p,score:0,correct:0,answered:0,active:true})),settings,index:0,round:1,queue:players.map(p=>p.id),turn:0,feedback:null,status:'active',deadline:settings.seconds?Date.now()+settings.seconds*1000:null};
}
export function answerGame(game, choiceId) {
 if(game.feedback || game.status!=='active')return game;
 const question=game.questions[game.index],correct=choiceId===question.correctOptionId;
 return {...game,players:game.players.map(p=>p.id===game.queue[game.turn]?{...p,score:p.score+(correct?game.settings.correctPoints:game.settings.wrongPoints),correct:p.correct+Number(correct),answered:p.answered+1}:p),feedback:{correct,choiceId},deadline:null};
}
export function nextTurn(game) {
 if(!game.feedback)return game;
 const index=game.index+1,turn=game.turn+1;
 if(turn<game.queue.length)return {...game,index,turn,feedback:null,deadline:game.settings.seconds?Date.now()+game.settings.seconds*1000:null};
 const queue=game.players.filter(p=>p.active).map(p=>p.id);
 if(!queue.length || game.questions.length-index<queue.length)return {...game,status:'completed',deadline:null};
 return {...game,index,turn:0,queue,round:game.round+1,feedback:null,deadline:game.settings.seconds?Date.now()+game.settings.seconds*1000:null};
}
export function rankedPlayers(game){return [...game.players].sort((a,b)=>b.score-a.score||b.correct-a.correct);}
