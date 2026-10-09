export interface BehaviorSnapshot {visibleMs:number;hiddenMs:number;exitCount:number;questionMs:number[];questionChanges:number[]}
export function validBehavior(v:unknown):boolean;
export function createBehaviorCollector(now?:()=>number,initiallyHidden?:boolean):{question(i:number|null):void;visibility(hidden:boolean):void;change(i:number,previous:string,next:string):void;stop():void;snapshot():BehaviorSnapshot};
export function behaviorReport(quiz:any,template:any,streams:any[],submissions:any[]):any;
export const MAX_BEHAVIOR_MS:number;
export function compareTestHistory(history:any[]):any[];
