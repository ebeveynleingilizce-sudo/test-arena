import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createGame,answerGame,nextTurn,prepareQuestions} from '../src/domain/classroom.mjs';
const qs=Array.from({length:12},(_,i)=>({questionId:String(i),correctOptionId:'A'}));
const players=[{id:'a',name:'Ali'},{id:'b',name:'Ece'}],settings={seconds:0,correctPoints:3,wrongPoints:-1};
test('scores exactly once, alternates turns and completes equal rounds',()=>{let g=createGame(qs,players,settings);g=answerGame(g,'A');assert.equal(g.players[0].score,3);assert.equal(answerGame(g,'B'),g);g=nextTurn(g);assert.equal(g.queue[g.turn],'b');g=nextTurn(answerGame(g,'B'));assert.equal(g.round,2);assert.equal(g.players[1].score,-1);while(g.status==='active')g=nextTurn(answerGame(g,''));assert.equal(g.players[0].answered,6);assert.equal(g.players[1].answered,6);});
test('roster changes enter next round, removed current player finishes round, restore keeps score',()=>{let g=createGame(qs,players,settings);g.players[0].active=false;g.players.push({id:'c',name:'Can',active:true,score:0,correct:0,answered:0});g=nextTurn(answerGame(g,'A'));assert.deepEqual(g.queue,['a','b']);g=nextTurn(answerGame(g,'A'));assert.deepEqual(g.queue,['b','c']);g.players[0].active=true;g=nextTurn(answerGame(g,'A'));g=nextTurn(answerGame(g,'A'));assert.deepEqual(g.queue,['a','b','c']);assert.equal(g.players[0].score,3);});
test('does not start a partial round or repeat questions',()=>{let g=createGame(qs.slice(0,3),players,settings);g=nextTurn(answerGame(g,'A'));g=nextTurn(answerGame(g,'A'));assert.equal(g.status,'completed');assert.equal(prepareQuestions([...qs,...qs],true).length,12);});
test('rejects pool smaller than players',()=>assert.throws(()=>createGame(qs.slice(0,1),players,settings)));
