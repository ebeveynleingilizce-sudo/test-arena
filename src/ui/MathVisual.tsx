import type {QuestionVisual} from '../../functions/visuals/contract.mjs';
import {GeometryGraphic} from './GeometryGraphic';
import {MathematicalVisual} from './math/MathematicalVisual';
import './math/math.css';
export function MathVisual({visual}:{visual:QuestionVisual}){return visual.kind==='geometry'?<GeometryGraphic visual={visual}/>:<MathematicalVisual visual={visual}/>;}
