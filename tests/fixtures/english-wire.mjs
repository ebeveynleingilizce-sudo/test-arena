// Mock Gemini wire DTO only; never a production question bank or publisher.
export function englishWire(q,index=0){
 return {scopeKey:`scope-${index}`,family:q.family,question:q.question,difficulty:q.difficulty,
  options:q.options,correctOptionId:q.correctOptionId,explanation:q.explanation,
  visualType:q.visual?.kind??'none',visualId:q.visual?.asset??'',visualAlt:q.visual?.alt??'',visualSpeech:q.visual?.speech??''};
}
