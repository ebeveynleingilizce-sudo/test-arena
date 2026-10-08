export function parseRefillArgs(argv) {
  const [id,...flags]=argv,seen=new Set();let maxBatches;
  for(let i=0;i<flags.length;i++) {
    const flag=flags[i];
    if(!['--plan','--dry-run','--publish','--gemini','--max-batches'].includes(flag)||seen.has(flag))throw new Error('INVALID_REFILL_FLAGS');
    seen.add(flag);
    if(flag==='--max-batches') {
      const value=flags[++i];
      if(!/^[1-9]\d*$/.test(value??'')||!Number.isSafeInteger(Number(value)))throw new Error('INVALID_RUN_MAX_BATCHES');
      maxBatches=Number(value);
    }
  }
  if(!id||seen.has('--plan')&&(seen.has('--dry-run')||seen.has('--publish'))||seen.has('--dry-run')&&seen.has('--publish'))throw new Error('INVALID_REFILL_FLAGS');
  const mode=seen.has('--publish')?'publish':seen.has('--dry-run')?'dry-run':'plan';
  if(mode!=='plan'&&!seen.has('--gemini'))throw new Error('EXPLICIT_GEMINI_REQUIRED');
  return {id,mode,maxBatches};
}
