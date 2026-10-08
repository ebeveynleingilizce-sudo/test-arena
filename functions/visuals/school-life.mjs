// Shared, closed local visual vocabulary. No URLs, free drawings or model-selected labels.
export const schoolPlaces = Object.freeze(['classroom','library','garden']);
export const schoolPeople = Object.freeze(['teacher','pupil','headmaster']);
export const schoolVisualAlt = Object.freeze({
  classroom:'Rows of desks face a board in a room.',
  library:'Shelves of books and a reading table in a room.',
  garden:'Trees, flowers and a bench outdoors.',
  teacher:'An adult points at a board beside desks.',
  pupil:'A child carries a school bag and a book.',
  headmaster:'An adult works in the school office behind a desk.',
  'two-pupils':'Two pupils are talking. The second reply is missing.'
});
export const schoolDialogueStemValid = value => typeof value==='string' && value.trim().length>0 && value.trim().length<=100 &&
  !/\b(?:read|choose|complete|look|select|fill|circle|tick|underline|dialogue|reply|answer)\b|[-\u2010-\u2015_:\r\n\u2026]|\.(?:\s*\.)+|^\s*[ABC][).]\s/i.test(value);
