import {GradeSelect} from './components';
import type {ArenaClass} from '../domain/models';
export const classGrades=(cls?:ArenaClass)=>cls?.classMode==='mixed'?cls.gradeLevels||[]:Array.from({length:11},(_,i)=>i+2);
export const classGradeLabel=(cls?:{classMode?:string;gradeLevels?:number[];defaultGradeLevel?:number})=>cls?.classMode==='mixed'?`Karma Sınıf · ${cls.gradeLevels?.join(', ')}. sınıflar`:`${cls?.defaultGradeLevel ?? 6}. Sınıf`;
export function ClassGrades({mode,grades,defaultGrade,onMode,onGrades,onDefault}:{mode:'single'|'mixed';grades:number[];defaultGrade:number;onMode:(v:'single'|'mixed')=>void;onGrades:(v:number[])=>void;onDefault:(v:number)=>void}){
 return <><label>Sınıf türü<select value={mode} onChange={e=>onMode(e.target.value as 'single'|'mixed')}><option value="single">Tek Sınıf</option><option value="mixed">Karma Sınıf</option></select></label>{mode==='single'?<GradeSelect name="defaultGradeLevel" label="Varsayılan kademe" value={defaultGrade} onChange={onDefault}/>:<fieldset className="mixed-grade-options"><legend>Sınıf seviyeleri</legend><p className="field-hint">En az iki kademe seç.</p><div>{Array.from({length:12},(_,i)=>i+1).map(g=><label key={g}><input type="checkbox" checked={grades.includes(g)} onChange={e=>onGrades(e.target.checked?[...grades,g].sort((a,b)=>a-b):grades.filter(v=>v!==g))}/>{g}. Sınıf</label>)}</div></fieldset>}</>;
}
