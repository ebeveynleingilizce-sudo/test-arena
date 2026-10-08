// Human-approved evaluation-only examples. Never imported by seed/publication.
// D category/meta examples deliberately test incompatible candidate content;
// they do not establish new curriculum mappings or production families.
export const englishPedagogyGolden=[
 ['01','DUMMY_P','What is this?',['a classroom','a library','a garden'],'a','classroom','PASS'],
 ['02','DUMMY_K','Who is this?',['a teacher','a pupil','a headmaster'],'a','teacher','PASS'],
 ['03','D','How are you?',["I'm fine, thanks!",'Goodbye!','My name is Anna.'],'a',null,'PASS'],
 ['04','D','What is your name?',['My name is Anna.','Goodbye!',"I'm fine, thanks!"],'a',null,'PASS'],
 ['05','D','Nice to meet you!',['Nice to meet you, too!','Goodbye!','My name is Anna.'],'a',null,'PASS'],
 ['06','D','Which one is a greeting?',['Hello!','Pencil','Monday'],'a',null,'FAIL'],
 ['07','D','Which one is a day of the week?',['Monday','Teacher','Blue'],'a',null,'FAIL'],
 ['08','D','Which one of the following expressions is used when meeting someone for the first time?',['Nice to meet you!','Goodbye!','Sorry!'],'a',null,'FAIL'],
 ['09','D','Choose the best expression when meeting someone.',['Nice to meet you!','Goodbye!','Sorry!'],'a',null,'FAIL'],
 ['10','D','Which sentence is appropriate when you meet someone for the first time?',['Nice to meet you!','Goodbye!','Sorry!'],'a',null,'FAIL'],
 ['11','D','Hangisi haftanın bir günüdür?',['Monday','Teacher','Blue'],'a',null,'REVIEW'],
 ['12','D','İlk kez tanışırken hangisini söyleriz?',['Nice to meet you!','Goodbye!','Sorry!'],'a',null,'REVIEW'],
 ['13','D','Hangisi haftanın bir günüdür?',['Monday','Tuesday','Friday'],'a',null,'FAIL'],
 ['14','DUMMY_P','What is this?',['a garden','a library','a classroom'],'b','library','PASS'],
 ['15','D','What is your name?',['My name is Anna.','Banana','Blue'],'a',null,'FAIL'],
 ['16','D','How are you?',["I'm fine, thanks!",'Goodbye!','My name is Anna.'],'a','two-pupils','PASS'],
 ['17','DUMMY_P','What is this?',['a classroom','a library','a garden'],'a','classroom','FAIL','answer-alt'],
 ['18','DUMMY_P','What is this?',['a classroom','a library','a garden'],'b','classroom','FAIL'],
 ['19','D','How you are?',["I'm fine, thanks!",'Goodbye!','My name is Anna.'],'a',null,'FAIL'],
 ['20','D','And you?',["I'm fine, thanks!",'My name is Anna.','Nice to meet you, too!'],'a',null,'REVIEW']
].map(([id,tag,stem,options,answer,asset,expected,mutation])=>Object.freeze({id,grade:2,
 family:tag==='D'?'SCHOOL_LIFE_DIALOGUE':tag==='DUMMY_P'?'SCHOOL_LIFE_PLACE':'SCHOOL_LIFE_PERSON',
 stem,options:Object.freeze(options),answer,asset,expected,mutation}));
Object.freeze(englishPedagogyGolden);
