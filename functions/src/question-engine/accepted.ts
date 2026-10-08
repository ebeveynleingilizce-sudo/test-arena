import type { CandidateQuestion, CurriculumContext, ValidationResult } from './contracts.js';

interface AcceptedSnapshot {
  candidate:CandidateQuestion;context:CurriculumContext;capability:string;
  pedagogyVersion?:'english-pedagogy@1';
  providerFamily:string;verificationMethod:'deterministic'|'independent_ai';
}
// Process-local server receipt, not a serialized flag supplied by a generator.
// Only pipeline success paths mint receipts; JSON/cloned ACCEPTs have none.
const receipts=new WeakMap<object,AcceptedSnapshot>();
export function recordAccepted(result:ValidationResult,snapshot:AcceptedSnapshot) {
  if(result.decision==='ACCEPT') receipts.set(result,structuredClone(snapshot));
}
export function acceptedSnapshot(result:ValidationResult):AcceptedSnapshot|null {
  const snapshot=receipts.get(result);
  return snapshot&&result.decision==='ACCEPT'?structuredClone(snapshot):null;
}
