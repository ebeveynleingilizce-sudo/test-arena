import {createHash} from 'node:crypto';
const sha=value=>typeof value==='string'&&/^[a-f0-9]{40}$/.test(value);
// The server owns repository/ref/prefix. No caller-provided URL or redirect is used.
export function githubBankSource({repository,token,branch='main',transport=fetch}){
 if(!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_.-]+$/.test(repository)||['.','..'].includes(repository.split('/')[1])||!token||!/^[-A-Za-z0-9_./]+$/.test(branch)||branch.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('SOURCE_CONFIGURATION');
 async function request(path){
  const response=await transport('https://api.github.com/repos/'+repository+path,{redirect:'error',signal:AbortSignal.timeout(30000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'Test-Arena-Question-Sync'}});
  if(!response.ok)throw Error(response.status===401||response.status===403?'SOURCE_AUTHORIZATION':response.status===404?'SOURCE_NOT_FOUND':'SOURCE_UNAVAILABLE');
  const raw=await response.text();if(raw.length>6000000)throw Error('SOURCE_TOO_LARGE');
  try{return JSON.parse(raw);}catch{throw Error('SOURCE_RESPONSE');}
 }
 return {
  repository,
  async head(){
   const repo=await request('');if(repo.private!==true||repo.full_name?.toLowerCase()!==repository.toLowerCase())throw Error('PRIVATE_REPOSITORY_REQUIRED');
   const commit=await request('/commits/'+encodeURIComponent(branch));if(!sha(commit.sha)||!sha(commit.commit?.tree?.sha))throw Error('SOURCE_RESPONSE');
   return {commit:commit.sha,tree:commit.commit.tree.sha};
  },
  async list(tree){
   if(!sha(tree))throw Error('SOURCE_RESPONSE');const result=await request('/git/trees/'+tree+'?recursive=1');
   if(result.truncated||!Array.isArray(result.tree)||result.tree.length>10000)throw Error('SOURCE_TREE_LIMIT');
   const entries=result.tree.filter(e=>typeof e.path==='string'&&e.path.startsWith('questions/'));
   if(entries.some(e=>e.mode==='120000'||e.type==='commit'))throw Error('SOURCE_LINK_FORBIDDEN');
   const files=entries.filter(e=>e.type==='blob'&&/\.json$/i.test(e.path)&&!/(?:^|\/)(?:schema|manifest)\.json$/i.test(e.path));
   if(files.some(e=>!sha(e.sha)||!Number.isSafeInteger(e.size)||e.size<1||e.size>2000000||e.path.length>500||e.path.split('/').some(p=>!p||p==='.'||p==='..')||/[\x00-\x1f\\]/.test(e.path)))throw Error('SOURCE_FILE_LIMIT');
   return files.map(e=>({path:e.path,sha:e.sha,size:e.size})).sort((a,b)=>a.path.localeCompare(b.path));
  },
  async read(file){
   if(!sha(file.sha))throw Error('SOURCE_RESPONSE');const blob=await request('/git/blobs/'+file.sha);
   if(blob.encoding!=='base64'||typeof blob.content!=='string'||blob.size>2000000)throw Error('SOURCE_BLOB_LIMIT');
   const bytes=Buffer.from(blob.content,'base64');
   if(bytes.length>2000000||bytes.length!==blob.size||createHash('sha1').update('blob '+bytes.length+'\0').update(bytes).digest('hex')!==file.sha)throw Error('SOURCE_BLOB_INTEGRITY');
   try{return JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/,''));}catch{throw Error('INVALID_JSON');}
  }
 };
}
