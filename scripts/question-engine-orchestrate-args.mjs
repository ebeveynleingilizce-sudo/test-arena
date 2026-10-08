export function parseOrchestrationArgs(args) {
  const filter={},seen=new Set();
  for(let i=0;i<args.length;i++) {
    const flag=args[i];
    if(!['--plan','--grade','--subject','--unit','--topic'].includes(flag)||seen.has(flag))throw new Error('INVALID_PLAN_FLAGS');
    seen.add(flag);if(flag==='--plan')continue;
    const value=args[++i];if(!value||value.startsWith('--'))throw new Error('MISSING_PLAN_FILTER');
    if(flag==='--grade') {
      if(!/^(?:[2-9]|1[0-2])$/.test(value))throw new Error('INVALID_GRADE');filter.grade=Number(value);
    }else filter[flag.slice(2)]=value;
  }
  return filter;
}
