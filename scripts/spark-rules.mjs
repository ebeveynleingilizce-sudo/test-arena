import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {sharedTeacherRules} from './shared-teacher-rules.mjs';
const quiz=readFileSync(new URL('../prototypes/spark/quiz.rules',import.meta.url),'utf8');
let rules=quiz.replace("request.auth.uid == t\n      &&", "request.auth.uid == t && !exists(/databases/$(database)/documents/studentBindings/$(t))\n      &&");
rules=rules.replace("test.status == 'active' && q in pack.questionIds","test.status == 'active' && pack.active == true && q in pack.questionIds");
rules=rules.replace("&& template(request.resource.data.templateId).questionIds.size() == 10","&& template(request.resource.data.templateId).active == true && template(request.resource.data.templateId).questionIds.size() == 10");
rules=rules.replace("get(/databases/$(database)/documents/questions/$(q)).data.choiceIds","template(session(t,s,id).templateId).choiceIdsByQuestionId[q]");
rules=rules.replace("&& session(t,s,request.resource.data.testSessionId).status == 'completed'","&& session(t,s,request.resource.data.testSessionId).status == 'completed' && template(session(t,s,request.resource.data.testSessionId).templateId).active == true");
rules=rules.replace("&& getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)/quizzes/$(id)).data.resolved == session(t,s,id).resolved + 1;",
 "&& getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)/quizzes/$(id)).data.resolved == session(t,s,id).resolved + 1\n            && getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)/learning/summary).data.lastResultSessionId == id\n            && getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)/learning/summary).data.lastResultQuestionId == q\n            && getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)/learning/summary).data.answeredCount == get(/databases/$(database)/documents/teachers/$(t)/students/$(s)/learning/summary).data.answeredCount + (request.resource.data.skipped ? 0 : 1);");
rules=rules.replace("template(request.resource.data.templateId).questionIds.size() == 10","template(request.resource.data.templateId).questionIds.size() >= 1 && template(request.resource.data.templateId).questionIds.size() <= 10");
rules=rules.replace("request.resource.data.resolved <= 10","request.resource.data.resolved <= template(resource.data.templateId).questionIds.size()");
rules=rules.replaceAll("request.resource.data.resolved == 10","request.resource.data.resolved == template(resource.data.templateId).questionIds.size()");
rules=rules.replace("request.resource.data.keys().hasOnly(['totalXP','academicXP','lastAwardQuestionId'])","request.resource.data.diff(resource.data).affectedKeys().hasOnly(['totalXP','academicXP','lastAwardQuestionId'])");
rules=rules.replace("['studentId','classId','academicXP','weeklyAcademicXP','weekKey','lastAwardQuestionId']","['studentId','classId','displayName','academicXP','weeklyAcademicXP','weekKey','lastAwardQuestionId']");
rules=rules.replace("&& request.resource.data.studentId == s && request.resource.data.classId == c","&& request.resource.data.studentId == s && request.resource.data.classId == c\n        && request.resource.data.displayName == get(/databases/$(database)/documents/teachers/$(t)/students/$(s)).data.firstName + ' ' + get(/databases/$(database)/documents/teachers/$(t)/students/$(s)).data.lastName");
let identity=readFileSync(new URL('../prototypes/spark/identity.rules.fragment',import.meta.url),'utf8');
identity=identity.replace("allow get: if teacher(t);","allow read: if teacher(t);");
identity=identity.replace("['className','defaultGradeLevel']","['classId','className','defaultGradeLevel']");
identity=identity.replace("request.resource.data.className is string","request.resource.data.classId == c && request.resource.data.className is string && request.resource.data.className.size() > 0 && request.resource.data.className.size() <= 60");
identity=identity.replace("['teacherUid','studentId','classId','gradeLevel','status','credentialVersion']","['teacherUid','studentId','classId','className','firstName','lastName','gradeLevel','status','credentialVersion']");
identity=identity.replace("&& request.resource.data.gradeLevel >= 2", "&& request.resource.data.firstName is string && request.resource.data.firstName.size() > 0 && request.resource.data.firstName.size() <= 40\n        && request.resource.data.lastName is string && request.resource.data.lastName.size() <= 40\n        && request.resource.data.className == get(/databases/$(database)/documents/teachers/$(t)/classes/$(request.resource.data.classId)).data.className\n        && request.resource.data.gradeLevel >= 2");
identity=identity.replace("&& exists(/databases/$(database)/documents/teachers/$(t)/classes/$(request.resource.data.classId))", "&& exists(/databases/$(database)/documents/teachers/$(t)/classes/$(request.resource.data.classId)) && classAcceptsStudents(t,request.resource.data.classId)");
identity=identity.replace("&& activation(t,s,request.resource.data.authUid,request.resource.data.credentialVersion)", "&& classAcceptsStudents(t,resource.data.classId) && activation(t,s,request.resource.data.authUid,request.resource.data.credentialVersion)");
identity=identity.replace("{'totalXP':0,'academicXP':0,'lastAwardQuestionId':''}","{'totalXP':0,'academicXP':0,'lastAwardQuestionId':'','answeredCount':0,'correctCount':0,'wrongCount':0}");
identity=identity.replace("{'studentId':s,'classId':c,'academicXP':0,'weeklyAcademicXP':0,'weekKey':'','lastAwardQuestionId':''}","{'studentId':s,'classId':c,'displayName':get(/databases/$(database)/documents/teachers/$(t)/students/$(s)).data.firstName + ' ' + get(/databases/$(database)/documents/teachers/$(t)/students/$(s)).data.lastName,'academicXP':0,'weeklyAcademicXP':0,'weekKey':'','lastAwardQuestionId':''}");
const extra=`
    // A short teacher-owned lock closes the enrollment/delete race. Expired locks are retryable.
    function classAcceptsStudents(t,c) {
      let cls = getAfter(/databases/$(database)/documents/teachers/$(t)/classes/$(c));
      return cls.data.get('deletionToken','') == ''
        || cls.data.deletionStartedAt < request.time - duration.value(60,'s');
    }
    match /teachers/{t}/classes/{c} {
      allow update: if teacher(t)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['deletionToken','deletionStartedAt'])
        && request.resource.data.deletionToken is string
        && request.resource.data.deletionStartedAt == request.time;
      allow delete: if teacher(t) && resource.data.get('deletionToken','') != ''
        && resource.data.deletionStartedAt > request.time - duration.value(60,'s');
    }

    match /teachers/{t}/classes/{c}/classMembers/{s} {
      allow read: if teacher(t);
      allow create, update: if teacher(t) && request.resource.data == {'studentId':s}
        && getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)).data.classId == c
        && getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)).data.status == 'active';
      allow delete: if teacher(t) && (getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)).data.classId != c
        || getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)).data.status == 'removed');
    }
    match /teachers/{t}/classes/{c}/leaderboard/{s} {
      allow create, update: if teacher(t)
        && get(/databases/$(database)/documents/teachers/$(t)/students/$(s)).data.classId == c
        && get(/databases/$(database)/documents/teachers/$(t)/students/$(s)).data.status == 'active'
        && request.resource.data.keys().hasOnly(['studentId','classId','displayName','academicXP','weeklyAcademicXP','weekKey','lastAwardQuestionId'])
        && request.resource.data.studentId == s && request.resource.data.classId == c
        && request.resource.data.displayName == get(/databases/$(database)/documents/teachers/$(t)/students/$(s)).data.firstName + ' ' + get(/databases/$(database)/documents/teachers/$(t)/students/$(s)).data.lastName
        && request.resource.data.lastAwardQuestionId == get(/databases/$(database)/documents/teachers/$(t)/students/$(s)/learning/summary).data.lastAwardQuestionId
        && request.resource.data.academicXP == get(/databases/$(database)/documents/teachers/$(t)/students/$(s)/learning/summary).data.totalXP
        && inWeek(request.resource.data.weekKey)
        && request.resource.data.weeklyAcademicXP == (exists(/databases/$(database)/documents/teachers/$(t)/students/$(s)/academicWeeks/$(request.resource.data.weekKey)) ? get(/databases/$(database)/documents/teachers/$(t)/students/$(s)/academicWeeks/$(request.resource.data.weekKey)).data.academicXP : 0);
      allow delete: if teacher(t) && (getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)).data.classId != c
        || getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)).data.status == 'removed');
    }
    match /roles/{uid} {
      allow create: if request.auth != null && request.auth.uid == uid
        && request.resource.data == {'role':'teacher'}
        && request.auth.token.firebase.sign_in_provider in ['password','google.com']
        && !request.auth.token.email.matches('.*@students[.]testarena[.]invalid$')
        && !exists(/databases/$(database)/documents/studentBindings/$(uid));
    }
    match /teachers/{t} { allow read: if teacher(t); }
    match /clockSamples/{uid} {
      allow get: if request.auth != null && request.auth.uid == uid;
      allow create, update: if request.auth != null && request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['at']) && request.resource.data.at == request.time;
    }
    match /sparkCatalog/{g} {
      allow get: if request.auth != null && (teacher(request.auth.uid)
        || (pupil(get(/databases/$(database)/documents/studentBindings/$(request.auth.uid)).data.teacherUid,
                  get(/databases/$(database)/documents/studentBindings/$(request.auth.uid)).data.studentId)
          && gradeAllowed(get(/databases/$(database)/documents/studentBindings/$(request.auth.uid)).data.teacherUid,
                           get(/databases/$(database)/documents/studentBindings/$(request.auth.uid)).data.studentId,int(g))));
    }
    match /teachers/{t}/students/{s} {
      allow list: if teacher(t);
      allow update: if teacher(t)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['classId','className','gradeLevel'])
        && classAcceptsStudents(t,request.resource.data.classId)
        && request.resource.data.gradeLevel >= 2 && request.resource.data.gradeLevel <= 12
        && request.resource.data.className == get(/databases/$(database)/documents/teachers/$(t)/classes/$(request.resource.data.classId)).data.className;
      allow update: if teacher(t)
        && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['status','credentialVersion'])
        && resource.data.status == 'active' && request.resource.data.status == 'removed'
        && request.resource.data.credentialVersion == resource.data.credentialVersion + 1;
      match /answerReceipts/{r} {
        allow read: if teacher(t) || pupil(t,s);
        allow create: if pupil(t,s)
          && request.resource.data.keys().hasOnly(['sessionId','templateId','questionId'])
          && r == request.resource.data.templateId + ':' + request.resource.data.questionId
          && knownQuestion(t,s,request.resource.data.sessionId,request.resource.data.questionId)
          && session(t,s,request.resource.data.sessionId).templateId == request.resource.data.templateId
          && (exists(/databases/$(database)/documents/teachers/$(t)/students/$(s)/quizzes/$(request.resource.data.sessionId)/submissions/$(request.resource.data.questionId))
            || getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)/quizzes/$(request.resource.data.sessionId)/submissions/$(request.resource.data.questionId)).data.submittedAt == request.time);
      }
      match /learning/{id} {
        allow update: if id == 'summary' && pupil(t,s)
          && request.resource.data.diff(resource.data).affectedKeys().hasOnly(['answeredCount','correctCount','wrongCount','lastResultSessionId','lastResultQuestionId'])
          && !exists(/databases/$(database)/documents/teachers/$(t)/students/$(s)/quizzes/$(request.resource.data.lastResultSessionId)/results/$(request.resource.data.lastResultQuestionId))
          && getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)/quizzes/$(request.resource.data.lastResultSessionId)/results/$(request.resource.data.lastResultQuestionId)).data.gradedAt == request.time
          && request.resource.data.answeredCount == resource.data.answeredCount + (getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)/quizzes/$(request.resource.data.lastResultSessionId)/results/$(request.resource.data.lastResultQuestionId)).data.skipped ? 0 : 1)
          && request.resource.data.correctCount == resource.data.correctCount + (getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)/quizzes/$(request.resource.data.lastResultSessionId)/results/$(request.resource.data.lastResultQuestionId)).data.isCorrect ? 1 : 0)
          && request.resource.data.wrongCount == request.resource.data.answeredCount - request.resource.data.correctCount;
      }
      match /analytics/{id} { allow read: if teacher(t); }
      match /analyticsDimensions/{id} { allow read: if teacher(t); }
      match /testSessions/{id} {
        allow read: if teacher(t) || pupil(t,s);
        match /answers/{q} { allow read: if teacher(t) || pupil(t,s); }
      }
    }
    match /teachers/{t}/studentCodes/{s} {
      allow read: if teacher(t);
      allow create, update: if teacher(t)
        && request.resource.data.keys().hasOnly(['code','credentialVersion'])
        && ticket(request.resource.data.code).teacherUid == t && ticket(request.resource.data.code).studentId == s
        && ticket(request.resource.data.code).version == request.resource.data.credentialVersion
        && getAfter(/databases/$(database)/documents/teachers/$(t)/students/$(s)).data.credentialVersion == request.resource.data.credentialVersion;
    }
    function receiptFor(t,s,q,pack) { let rid = pack + ':' + q; return get(/databases/$(database)/documents/teachers/$(t)/students/$(s)/answerReceipts/$(rid)).data; }
    match /privateQuizKeys/{pack}/answers/{q} {
      // Classroom Arena reads keys as a teacher; pupils still require a locked answer.
      allow get: if request.auth != null && teacher(request.auth.uid);
      allow get: if request.auth != null
        && pupil(get(/databases/$(database)/documents/studentBindings/$(request.auth.uid)).data.teacherUid,
                 get(/databases/$(database)/documents/studentBindings/$(request.auth.uid)).data.studentId)
        && receiptFor(get(/databases/$(database)/documents/studentBindings/$(request.auth.uid)).data.teacherUid,
                      get(/databases/$(database)/documents/studentBindings/$(request.auth.uid)).data.studentId,q,pack).templateId == pack;
    }
`;
const duels=readFileSync(new URL('../prototypes/spark/duel.rules.fragment',import.meta.url),'utf8');
const behavior=readFileSync(new URL('../prototypes/spark/behavior.rules.fragment',import.meta.url),'utf8');
rules=rules.replace('    match /{document=**}',()=>identity+'\n'+extra+'\n'+duels+'\n'+behavior+'\n    match /{document=**}');
rules=sharedTeacherRules(rules);
export const sparkRules=rules;
if(process.argv.includes('--write')){
  const archive=new URL('../prototypes/legacy-functions/',import.meta.url);mkdirSync(archive,{recursive:true});
  const saved=new URL('firestore.rules',archive);if(!existsSync(saved))writeFileSync(saved,readFileSync(new URL('../firestore.rules',import.meta.url)));
  writeFileSync(new URL('../firestore.rules',import.meta.url),rules);
}

