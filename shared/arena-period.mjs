// Pure calendar calculation; usable by the browser and trusted local importer.
export function arenaPeriod(now=new Date()) {
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const n=type=>Number(parts.find(p=>p.type===type).value);
  const day=new Date(Date.UTC(n('year'),n('month')-1,n('day')));
  const monday=new Date(day.getTime()-((day.getUTCDay()+6)%7)*86400000);
  const thursday=new Date(monday.getTime()+3*86400000),year=thursday.getUTCFullYear();
  const week=Math.ceil(((thursday.getTime()-Date.UTC(year,0,1))/86400000+1)/7);
  const midnight=date=>{
    let instant=date;
    const f=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Istanbul',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
    for(let i=0;i<3;i++){
      const p=f.formatToParts(new Date(instant)),v=t=>Number(p.find(x=>x.type===t).value);
      instant+=date-Date.UTC(v('year'),v('month')-1,v('day'),v('hour'),v('minute'),v('second'));
    }return instant;
  };
  return {weekKey:`${year}-W${String(week).padStart(2,'0')}`,startsAt:midnight(monday.getTime()),endsAt:midnight(monday.getTime()+7*86400000)};
}
