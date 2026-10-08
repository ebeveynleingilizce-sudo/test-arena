// Internal bounded, deterministic positions. Question data cannot supply coordinates.
export function scatteredPositions(count) {
  if (!Number.isInteger(count) || count<1 || count>100) throw new Error('Invalid object count');
  const width=320,size=24;
  let height=Math.max(140,Math.ceil(count/7)*40+20);
  for(let attempt=0;attempt<6;attempt++,height+=40) {
    let seed=count*7919+17;
    const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
    const points=[];
    for(let i=0;i<count;i++) {
      let best,score=-1;
      for(let candidate=0;candidate<96;candidate++) {
        const p={x:10+random()*(width-size-20),y:10+random()*(height-size-20)};
        const distance=points.length?Math.min(...points.map(o=>(p.x-o.x)**2+(p.y-o.y)**2)):Infinity;
        if(distance>score){best=p;score=distance;}
      }
      // Separation exceeds the square diagonal, so icons cannot overlap.
      if(score<35**2)break;
      points.push(best);
    }
    if(points.length===count)return {width,height,size,points};
  }
  throw new Error('Could not place bounded objects');
}
