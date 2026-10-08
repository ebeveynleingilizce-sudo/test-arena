import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {GeminiProvider,DEFAULT_GEMINI_MODEL} from '../../functions/lib/question-engine/providers/gemini.js';
import {geminiDryRunProfiles} from '../../functions/lib/question-engine/providers/gemini-profiles.js';
import {profileContexts} from '../../functions/lib/question-engine/school-life.js';
import {responseSchema} from '../../functions/lib/question-engine/providers/gemini-contract.js';

const canonical=JSON.parse(readFileSync('data/mufredat/2-sinif.json'));
const navigation=JSON.parse(readFileSync('data/mufredat/2-sinif-ui-v2.json'));
// Only a fake transport/key. Capture the serialized FINAL request, not a
// separately reconstructed request builder. Nothing is sent to Google.
async function capture(profile){
 const contexts=profileContexts(canonical,navigation,profile);let captured;
 const provider=new GeminiProvider(profile,{model:DEFAULT_GEMINI_MODEL,contexts,getApiKey:()=> 'mock-diagnostic-only',fetch:async(url,init)=>{
  captured={url,body:JSON.parse(init.body)};
  return new Response('{}');
 }});
 await assert.rejects(provider.generateQuestions(contexts[0],{count:5}),/EMPTY_OR_MULTIPLE_RESPONSE/);
 assert.ok(captured);return captured;
}
// Documented responseJsonSchema keywords; string lengths are present in the
// established working profiles too, but are not in the REST documented subset.
const documented=new Set(['$id','$defs','$ref','$anchor','type','format','title','description','enum','items','prefixItems','minItems','maxItems','minimum','maximum','anyOf','oneOf','properties','additionalProperties','required','propertyOrdering']);
function inspect(schema,path='$',result={nodes:0,depth:0,unions:0,optional:[],undocumented:[]},depth=0){
 assert.ok(schema&&typeof schema==='object'&&!Array.isArray(schema),path);
 result.nodes++;result.depth=Math.max(result.depth,depth);
 for(const key of Object.keys(schema))if(!documented.has(key))result.undocumented.push(key);
 if(schema.enum){assert.ok(schema.enum.length,path);for(const value of schema.enum)assert.equal(typeof value,schema.type==='integer'?'number':'string',path);}
 if(schema.type==='object'){
  assert.equal(schema.additionalProperties,false,path);
  for(const key of schema.required??[])assert.ok(key in schema.properties,path+'.required');
  for(const [key,value] of Object.entries(schema.properties)){
   if(!(schema.required??[]).includes(key))result.optional.push(path+'.'+key);
   inspect(value,path+'.'+key,result,depth+1);
  }
 }
 if(schema.items)inspect(schema.items,path+'[]',result,depth+1);
 for(const key of ['anyOf','oneOf'])if(schema[key]){result.unions++;for(const branch of schema[key])inspect(branch,path+'.'+key,result,depth+1);}
 return result;
}
test('compare actual final requests: identical endpoint/config/system; schema differences only in profile data',async()=>{
 const requests=await Promise.all(geminiDryRunProfiles.map(capture));
 const baseline=requests[0];
 for(const [i,request] of requests.entries()){
  assert.equal(request.url,baseline.url);assert.deepEqual(request.body.systemInstruction,baseline.body.systemInstruction);
  const {responseJsonSchema,...config}=request.body.generationConfig;
  const {responseJsonSchema:_,...baselineConfig}=baseline.body.generationConfig;
  assert.deepEqual(config,baselineConfig);assert.equal('responseSchema' in request.body.generationConfig,false);
  assert.equal(request.body.contents.length,1);assert.equal(request.body.contents[0].role,'user');
  assert.equal(Object.keys(request.body.contents[0].parts[0]).join(','),'text');
  const result=inspect(responseJsonSchema);
  assert.equal(result.unions,0);
  assert.deepEqual([...new Set(result.undocumented)].sort(),geminiDryRunProfiles[i].gradePolicy.language==='en'?[]:['maxLength','minLength']);
  // Safe structural metadata only: never output request text, headers or keys.
  console.log(JSON.stringify({profile:geminiDryRunProfiles[i].id,schemaBytes:Buffer.byteLength(JSON.stringify(responseJsonSchema)),nodes:result.nodes,depth:result.depth,unions:result.unions,optional:result.optional,undocumentedKeywords:[...new Set(result.undocumented)]}));
 }
});
test('English wire schema is invariant across text/visual families and synthetic later-grade configuration',async()=>{
 const school=geminiDryRunProfiles.find(p=>p.id==='english-school-life');
 const text=await capture({...school,variants:undefined,visual:'none'}),final=await capture(school);
 const schema=final.body.generationConfig.responseJsonSchema;
 assert.deepEqual(text.body.generationConfig.responseJsonSchema,schema);
 const contexts=profileContexts(canonical,navigation,school);
 // Synthetic config only: no new curriculum scope is activated or generated.
 const later={...school,variants:undefined,scope:{grade:12,subjectId:'ingilizce',unitId:'synthetic-test'},family:'SYNTHETIC_TEST_FAMILY',visual:'none'};
 assert.deepEqual(responseSchema({...contexts[0],grade:12},later,5),schema);
 assert.equal(inspect(schema).undocumented.length,0);
 const prompt=JSON.parse(final.body.contents[0].parts[0].text);
 assert.equal(prompt.scopeBindings.length,3);assert.equal(prompt.visualDescriptors.length,7);
 assert.ok(prompt.visualDescriptors.every(d=>typeof d.visualAlt==='string'));
 assert.match(prompt.languagePolicy,/English/);assert.match(prompt.languagePolicy,/Turkish/);
});
test('Google field violations and fixed reason codes survive safely; secret text/paths never do',async()=>{
 const profile=geminiDryRunProfiles.find(p=>p.id==='english-school-life');
 const contexts=profileContexts(canonical,navigation,profile);
 const field='generation_config.response_json_schema.properties.questions.items.properties.visual.properties.speech.type';
 for(const [message,reason] of [['Schema has too many states','SCHEMA_COMPLEXITY'],['Unknown name maxLength','UNSUPPORTED_SCHEMA_KEYWORD'],['Invalid schema type','INVALID_SCHEMA_TYPE']]){
  const provider=new GeminiProvider(profile,{contexts,getApiKey:()=> 'mock-diagnostic-only',fetch:async()=>new Response(JSON.stringify({error:{
   status:'INVALID_ARGUMENT',message:message+' private-request-secret',details:[{'@type':'type.googleapis.com/google.rpc.BadRequest',fieldViolations:[
    {field,description:'private-request-secret'},{field:'generation_config.private_request_secret',description:'private-request-secret'}]}]
  }}),{status:400})});
  await assert.rejects(provider.generateQuestions(contexts[0],{count:5}),error=>{
   assert.equal(error.details.reason,reason);assert.deepEqual(error.details.requestFields,[field]);
   assert.equal(JSON.stringify(error).includes('private'),false);return true;
  });
  assert.equal(JSON.stringify(provider.lastRun).includes('private'),false);
 }
});
