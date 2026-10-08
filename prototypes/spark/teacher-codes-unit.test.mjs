import {test} from 'node:test';
import assert from 'node:assert/strict';
import {makeStudentCode,createStudentProfile,issueCode} from './teacher-codes.mjs';
test('code generation uses six supported characters',()=>{
  for(let i=0;i<20;i++)assert.match(makeStudentCode(),/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
});
test('prototype identity transport refuses actual production project before any SDK write',async()=>{
  const db={app:{options:{projectId:'live-project'}}};
  await assert.rejects(createStudentProfile(db,'t','s','c',2),/Isolated prototype only/);
  await assert.rejects(issueCode(db,{},db,'t','s','R7M4Q9'),/Isolated prototype only/);
});
