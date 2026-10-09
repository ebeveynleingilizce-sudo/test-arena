import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classGradeConfig,studentGrade,contentGrades} from '../shared/class-grades.mjs';
test('mixed levels include 1–12 and reject duplicate, fractional and insufficient choices',()=>{
 assert.deepEqual(classGradeConfig({classMode:'mixed',gradeLevels:[6,3,1,12]}),{classMode:'mixed',gradeLevels:[1,3,6,12],defaultGradeLevel:1});
 for(const grades of [[],[3],[3,3],[0,3],[13,3],[3.5,4],['3',4]])assert.throws(()=>classGradeConfig({classMode:'mixed',gradeLevels:grades}));
});
test('legacy defaults and independent student grade remain compatible',()=>{
 assert.equal(studentGrade({defaultGradeLevel:6},3),3);assert.equal(studentGrade(classGradeConfig({defaultGradeLevel:6}),3),3);
 assert.deepEqual(contentGrades(6,{}),[5,6]);assert.deepEqual(contentGrades(2,{}),[2]);assert.throws(()=>classGradeConfig({defaultGradeLevel:1}));
});
test('mixed assignment and content use only the individual grade',()=>{
 const cls=classGradeConfig({classMode:'mixed',gradeLevels:[1,3,4,5,6]});
 for(const g of cls.gradeLevels){assert.equal(studentGrade(cls,g),g);assert.deepEqual(contentGrades(g,cls),[g]);}
 assert.throws(()=>studentGrade(cls,2));assert.throws(()=>studentGrade(cls,7));
});
