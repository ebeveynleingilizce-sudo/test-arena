import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createBehaviorCollector,validBehavior,behaviorReport,compareTestHistory,MAX_BEHAVIOR_MS} from '../src/domain/quiz-behavior.mjs';
test('visible question time, hidden interval, revisits and actual selection changes are separate',()=>{
 let now=0;const c=createBehaviorCollector(()=>now);c.question(0);now=1200;c.change(0,'','a');c.change(0,'a','a');c.change(0,'a','b');c.visibility(true);now=5200;c.visibility(true);c.visibility(false);now=5700;c.question(1);now=6700;c.question(0);now=7000;c.question(null);now=8000;
 const s=c.snapshot();assert.equal(s.visibleMs,4000);assert.equal(s.hiddenMs,4000);assert.equal(s.exitCount,1);assert.equal(s.questionMs[0],2000);assert.equal(s.questionMs[1],1000);assert.equal(s.questionChanges[0],1);assert(validBehavior(s));
});
test('collector is bounded; invalid telemetry fails closed',()=>{
 let now=0;const c=createBehaviorCollector(()=>now);c.question(0);now=MAX_BEHAVIOR_MS*2;const s=c.snapshot();assert.equal(s.visibleMs,MAX_BEHAVIOR_MS);assert(validBehavior(s));
 for(const v of [{...s,visibleMs:-1},{...s,hiddenMs:1},{...s,exitCount:1.5},{...s,questionMs:[1]},{...s,questionChanges:Array(10).fill('x')}])assert.equal(validBehavior(v),false);
});

test('completed quiz excludes result-screen time, exits and selection changes',()=>{
 let now=0;const c=createBehaviorCollector(()=>now);c.question(0);now=900;c.stop();const final=c.snapshot();now=99900;c.visibility(true);c.change(0,'a','b');c.question(1);c.stop();assert.deepEqual(c.snapshot(),final);assert.equal(final.visibleMs,900);
});
test('server duration is separate from self-report; missing telemetry is not zero behavior',()=>{
 const ts=n=>({toMillis:()=>n}),quiz={startedAt:ts(1000),completedAt:ts(61000)},tpl={questionIds:['q1','q2']};
 const r=behaviorReport(quiz,tpl,[],[{questionId:'q1',submittedAt:ts(5000)}]);assert.equal(r.serverDurationMs,60000);assert.equal(r.reported,false);assert.equal(r.questions[0].visibleMs,null);assert.equal(r.questions[0].submittedAfterStartMs,4000);assert.equal(r.questions[1].submittedAfterStartMs,null);
 const snapshot=createBehaviorCollector(()=>0).snapshot();const old=behaviorReport({...quiz,completedAt:null},tpl,[snapshot,snapshot],[]);assert.equal(old.streamCount,2);assert.equal(old.serverDurationMs,null);
});
test('success change uses three prior comparable completed tests, never another grade/unit',()=>{
 const t={gradeLevel:2,subject:'turkce',unitId:'u1',questionCount:10,status:'completed'};
 const source=[{...t,startedAt:1,correct:5},{...t,startedAt:2,correct:5},{...t,startedAt:3,correct:5},{...t,startedAt:4,correct:10,unitId:'u2'},{...t,startedAt:5,correct:10,gradeLevel:3},{...t,startedAt:6,correct:9},{...t,startedAt:7,correct:0,status:'active'}];
 const r=compareTestHistory(source);assert.equal(r.find(t=>t.startedAt===6).accuracyChange,40);assert.equal(r.find(t=>t.startedAt===2).accuracyChange,null);assert.equal(r[0].accuracyChange,null);assert(!('accuracyChange'in source[0]));
});
