export function classGradeConfig(data: {classMode?: string; defaultGradeLevel?: unknown; gradeLevels?: number[]}): {classMode:'single'|'mixed';defaultGradeLevel:number;gradeLevels:number[]};
export function studentGrade(cls: {classMode?:string;defaultGradeLevel:number;gradeLevels?:number[]},value?:unknown):number;
export function contentGrades(grade:number,cls?:{classMode?:string}):number[];
