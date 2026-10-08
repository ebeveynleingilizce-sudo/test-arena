import {schoolVisualAlt} from '../../functions/visuals/school-life.mjs';
export const schoolVisuals=[
  {kind:'school-dialogue',asset:'two-pupils',speech:'How are you?',alt:schoolVisualAlt['two-pupils']},
  ...['classroom','library','garden'].map(asset=>({kind:'school-place',asset,alt:schoolVisualAlt[asset]})),
  ...['teacher','pupil','headmaster'].map(asset=>({kind:'school-person',asset,alt:schoolVisualAlt[asset]}))
];
