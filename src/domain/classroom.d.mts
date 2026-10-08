import type {Question} from './quiz';
export interface ArenaQuestion extends Question {correctOptionId:string;explanation?:string;difficulty?:string}
export interface Player {id:string;name:string;score:number;correct:number;answered:number;active:boolean}
export interface Settings {seconds:number;correctPoints:number;wrongPoints:number}
export interface Game {version:number;questions:ArenaQuestion[];players:Player[];settings:Settings;index:number;round:number;queue:string[];turn:number;feedback:{correct:boolean;choiceId:string}|null;status:'active'|'completed';deadline:number|null}
export function prepareQuestions(questions:ArenaQuestion[],balanced?:boolean):ArenaQuestion[];
export function createGame(questions:ArenaQuestion[],players:{id:string;name:string}[],settings:Settings):Game;
export function answerGame(game:Game,choiceId:string):Game;
export function nextTurn(game:Game):Game;
export function rankedPlayers(game:Game):Player[];
export function shuffle<T>(items:T[],random?:()=>number):T[];
