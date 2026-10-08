// Archived AI tools are detached from the prepared question bank.
// Exit before credentials, network calls or publication can be used.
export function stopAIGeneration() {
  console.error('AI_GENERATION_DISABLED: Test Arena hazır soru dosyalarını kullanır. Gemini generation/verifier/refill/publication komutları devre dışıdır.');
  process.exit(1);
}
