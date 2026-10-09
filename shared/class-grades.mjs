export function classGradeConfig(data) {
  const classMode=data.classMode??'single',defaultGradeLevel=Number(data.defaultGradeLevel);
  if(!['single','mixed'].includes(classMode))throw Error('Geçersiz sınıf türü.');
  const gradeLevels=classMode==='mixed'?data.gradeLevels:[defaultGradeLevel];
  if(!Array.isArray(gradeLevels)||gradeLevels.length>12||gradeLevels.length<(classMode==='mixed'?2:1)||new Set(gradeLevels).size!==gradeLevels.length||gradeLevels.some(g=>!Number.isInteger(g)||g<(classMode==='mixed'?1:2)||g>12))throw Error('Karma sınıf için 1–12 arasından en az iki kademe seç.');
  const sorted=[...gradeLevels].sort((a,b)=>a-b);
  return {classMode,gradeLevels:sorted,defaultGradeLevel:classMode==='mixed'?sorted[0]:defaultGradeLevel};
}
export function studentGrade(cls,value) {
  const grade=Number(value??cls.defaultGradeLevel);
  if(!Number.isInteger(grade)||grade<1||grade>12||(cls.classMode!=='mixed'&&grade<2)||cls.classMode==='mixed'&&!(cls.gradeLevels||[]).includes(grade))throw Error('Öğrencinin kademesi grubun seçili kademeleri arasında olmalı.');
  return grade;
}
export function contentGrades(grade,cls) {return cls?.classMode==='mixed'||grade<=2?[grade]:[grade-1,grade];}
