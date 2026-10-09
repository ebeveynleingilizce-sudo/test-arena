import {readFileSync} from 'node:fs';
// Keep quiz/student authorization intact. Replace only the old teacher-owned
// read/write branches with class-scoped, audited teacher authorization.
export function sharedTeacherRules(source){
 const stack=[],tokens=/match\s+(\/[^\s]+)\s*\{|allow\s+([^:]+):\s*if[\s\S]*?;|[{}]/g;
 let out='',end=0,m;
 while((m=tokens.exec(source))){out+=source.slice(end,m.index);let value=m[0];
  if(m[1])stack.push(m[1]);else if(value==='{')stack.push(null);else if(value==='}')stack.pop();
  else{const path=stack.filter(Boolean).join(''),write=/create|update|delete|write/.test(m[2]);
   if(write&&/\bteacher\(/.test(value))value=`allow ${m[2]}: if false;`;
   else if(!write){
    if(path.includes('/teachers/{t}/classes/{c}'))value=value.replaceAll('teacher(t)','classReader(t,c)');
    else if(path.includes('/teachers/{t}/students/{s}'))value=value.replaceAll('teacher(t)',m[2].trim()==='list'?'classReader(t,resource.data.classId)':'studentReader(t,s)');
    else if(path.includes('/teachers/{t}/studentCodes/{s}'))value=value.replaceAll('teacher(t)','studentReader(t,s)');
    else if(path.includes('/codeTickets/{code}')||path.includes('/enrollmentProofs/{uid}'))value=value.replaceAll('teacher(resource.data.teacherUid)','studentReader(resource.data.teacherUid,resource.data.studentId)');
   }
  }out+=value;end=tokens.lastIndex;
 }
 out+=source.slice(end);
 // Manual adjustments must never change the academic earning ledger.
 out=out.replace('request.resource.data.academicXP == request.resource.data.totalXP','request.resource.data.academicXP == resource.data.get(\'academicXP\',resource.data.totalXP) + 1');
 out=out.replaceAll('request.resource.data.academicXP == getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)/learning/summary).data.totalXP','request.resource.data.academicXP == getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)/learning/summary).data.academicXP');
 out=out.replace("p.status == 'active' && b.version == p.credentialVersion","p.status == 'active' && b.version == p.credentialVersion && classActive(t,p.classId)");
 const fragment=readFileSync(new URL('../prototypes/spark/shared-teachers.rules.fragment',import.meta.url),'utf8');
 return out.replace('    match /{document=**}',()=>fragment+'\n    match /{document=**}');
}
