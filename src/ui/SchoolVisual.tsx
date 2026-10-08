import type {SchoolVisualDescriptor} from '../../functions/visuals/contract.mjs';
import {MathematicalVisual} from './math/MathematicalVisual';
import './school-visual.css';

// All marks are authored locally; the descriptor can only select a preset.
export function SchoolVisual({visual:v}:{visual:SchoolVisualDescriptor}) {
  if(v.kind==='school-dialogue')return <div className="school-dialogue" aria-label={v.alt}>
    <MathematicalVisual visual={{kind:'character',avatar:'ada',name:'',speech:v.speech,alt:'First pupil speaks'}}/>
    <MathematicalVisual visual={{kind:'character',avatar:'efe',name:'',speech:'?',alt:'Second pupil replies'}}/>
  </div>;
  const person=v.kind==='school-person';
  return <svg className="school-picture" viewBox="0 0 300 190" role="img" aria-label={v.alt} data-school-asset={v.asset}>
    <title>{v.alt}</title><g stroke="#14243c" strokeWidth="2" strokeLinejoin="round">
    <rect x="4" y="4" width="292" height="182" rx="14" fill="#fff8eb"/>
    {v.asset==='classroom'&&<><rect x="62" y="23" width="175" height="64" rx="4" fill="#233e45"/><path d="M80 65h80m-80-14h112" stroke="#fff8eb"/>{[0,1,2,3].map(i=><g key={i} transform={`translate(${30+i%2*143},${109+Math.floor(i/2)*42})`}><rect width="100" height="12" rx="3" fill="#d8aa62"/><path d="M8 12v17m84-17v17"/><rect x="28" y="21" width="42" height="12" rx="3" fill="#f7c577"/></g>)}</>}
    {v.asset==='library'&&<>{[20,177].map(x=><g key={x}><rect x={x} y="23" width="102" height="116" fill="#d8aa62"/>{[0,1,2].map(row=><g key={row}>{[0,1,2,3,4].map(col=><rect key={col} x={x+8+col*17} y={30+row*35} width="12" height="26" rx="2" fill={col%2?'#eaa544':'#b4c5cc'}/>)}<path d={`M${x} ${62+row*35}h102`}/></g>)}</g>)}<path d="M90 158h120m-112 0v22m104-22v22" strokeWidth="6"/><path d="M124 143q14-6 26 0 12-6 26 0v14q-14-5-26 0-12-5-26 0Z" fill="#fffaf1"/><path d="M150 143v14"/></>}
    {v.asset==='garden'&&<><path d="M6 153q75-40 150 0 90-40 138-6v37H6Z" fill="#cbd2a2"/>{[56,247].map(x=><g key={x}><path d={`M${x} 69v83`} strokeWidth="9" stroke="#986942"/><circle cx={x} cy="59" r="33" fill="#94ae7b"/></g>)}<path d="M113 134h80m-78-15h77m-72 18v26m66-26v26" stroke="#a17543" strokeWidth="8"/>{[32,99,211,271].map(x=><g key={x}><path d={`M${x} 171v-13`} stroke="#789759"/><circle cx={x} cy="155" r="6" fill="#f3b655"/></g>)}</>}
    {person&&<>
      {v.asset==='teacher'&&<><rect x="12" y="19" width="120" height="88" fill="#233e45"/><path d="M30 42h71m-71 18h57" stroke="#fff8eb"/><path d="M33 143h72m-64 0v24m56-24v24" strokeWidth="6"/></>}
      {v.asset==='headmaster'&&<><rect x="72" y="13" width="156" height="25" rx="4" fill="#f6dfac"/><text x="150" y="30" textAnchor="middle" fill="#14243c" stroke="none" fontSize="12">SCHOOL OFFICE</text><rect x="48" y="132" width="203" height="42" rx="4" fill="#d8aa62"/><rect x="62" y="112" width="35" height="23" fill="#fffaf1"/><path d="M200 109h28l10 23h-40Z" fill="#b4c5cc"/></>}
      {v.asset==='pupil'&&<><rect x="178" y="94" width="46" height="57" rx="14" fill="#eaa544"/><path d="M184 99q-12-15-21 0" fill="none"/></>}
      <path d="M119 171q-4-73 40-75 39 6 37 75" fill={v.asset==='pupil'?'#eaa544':'#b4c5cc'}/>
      <circle cx="157" cy="69" r="29" fill="#efcda6"/><path d="M128 65q-3-40 34-27 25 0 24 32l-18-19-34 8Z" fill="#14243c"/>
      <circle cx="147" cy="70" r="2" fill="#14243c"/><circle cx="168" cy="70" r="2" fill="#14243c"/><path d="M148 82q9 7 17 0" fill="none"/>
      {v.asset==='teacher'&&<path d="M127 108L97 88 80 66" fill="none" stroke="#efcda6" strokeWidth="10"/>}
      {v.asset==='pupil'&&<><rect x="109" y="122" width="48" height="35" rx="3" fill="#fffaf1"/><path d="M113 127h40m-40 7h29"/></>}
      {v.asset==='headmaster'&&<><path d="M143 95l14 11 13-11-5 22h-15Z" fill="#fffaf1"/><path d="M157 106l-5 17 6 7 5-7Z" fill="#bd7e26"/><path d="M68 140h47" stroke="#14243c" strokeWidth="4"/></>}
    </>}
    </g>
  </svg>;
}
