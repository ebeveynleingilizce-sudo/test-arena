# Spark emulator feasibility prototype

Latest full-quiz experiment and short-code comparison (8 October 2026):
[REPORT.md](./REPORT.md). Full quiz Rules are in `quiz.rules`, separate from the
earlier core experiment below. Do not combine their allow rules or deploy them.

This is an isolated security experiment, not a replacement for the running app.
No production deployment, billing configuration, Functions calls, Gemini calls,
main-project writes, question-bank changes or importer changes are performed.

Disposable project: `demo-test-arena-spark-prototype`; Auth: `127.0.0.1:9199`;
Firestore: `127.0.0.1:8180`. Do not deploy these experimental Rules.
The existing `demo-test-arena` project on 9099/8080 is not cleared or seeded.
Fixtures reuse the existing `prepareQuestionBank` importer normalization on two
existing grade-2 questions. Copies exist only in the disposable emulator.

## Run

From the repository root, with Java 21+ already on PATH:

```powershell
.\node_modules\.bin\firebase.cmd emulators:exec --config prototypes/spark/firebase.json --project demo-test-arena-spark-prototype --only auth,firestore "node --test --test-concurrency=1 prototypes/spark/security.test.mjs"
```

The test refuses any other project or emulator host. Only Auth and Firestore run.
They stop automatically when the test completes. No test export is imported into
the main development environment.

## Actual security model tested

- Teacher/password Authentication uses the real Auth emulator. Teacher role is
  provisioned by the trusted test setup, not self-assigned by a browser.
- Students enter only a six-character code. An internal email alias and the code
  as the Auth password allow native password sign-in without a global readable
  code index or custom tokens. This is an alternative login model, not proof that
  the current custom-token authentication works without a server.
- Auth UID -> teacher/student/version binding is provisioned only by the trusted
  setup. A student cannot forge a binding or become a teacher. Canonical profile
  status/version is checked on every protected request; revocation blocks reads.
- Teacher-owned class/profile writes are authorized in Rules, with grade distinct
  from class name. Other teachers and students cannot write them.
- Normalized public questions have no answers/explanations. Private answers are
  unreadable/unwritable by all browser accounts, including teachers. Bank writes
  are trusted administrative writes, not client-side admin-button authorization.
- The student commits a valid choice as an immutable submission. Result Rules
  use `get()`, not `getAfter()`, so even a batch containing submission and result
  cannot probe the answer before a committed submission exists.
- The client proposes a result boolean; Rules independently compare with the
  private key. Denial is never treated as a successful wrong-answer result.
- A successful result allows an immutable per-question XP award plus exactly
  one summary increment, atomically. Partial writes, extra fields, wrong answers,
  repeated awards and two awards sharing one increment are denied.
- Concurrent legitimate awards initially exposed a client race: Rules rejected
  the losing commit. The prototype client now returns zero only after reading a
  real persisted award. Rules were not relaxed to handle this race.

## Cloud Functions dependency inventory

| Existing operation | Spark alternative / remaining boundary |
|---|---|
| Teacher Auth | Already native Authentication; no Functions needed for sign-in. Teacher registration/role provisioning needs a defined trusted policy. |
| `createClass` | Direct owner-scoped Firestore write validated by Rules; tested. |
| `createStudent` | Profile/grade write can use Rules; tested. Automatic Auth-account creation and immutable UID binding were done by trusted test setup, not a browser teacher workflow. |
| `bulkCreateStudents` | Profile batches can use Rules; maximum Rules access-call counts must be respected. Auth provisioning remains administrative; bulk workflow not implemented/tested here. |
| `updateStudent` | Owner-scoped class/grade changes can use Rules; tested. Atomic class-member/leaderboard maintenance remains migration work. |
| `rotateStudentCode` | Rules version revocation tested. Auth credential replacement, code uniqueness/tombstones and binding provisioning require trusted administration in the tested model. |
| `removeStudent` | Rules-denied access after status/version change tested. Auth-account disable/delete and complete membership cleanup remain administrative work. |
| `studentLogin` | Code -> internal Auth alias tested without Functions. Current HMAC index/custom-token/IP limiter cannot be reproduced by Firestore Rules. |
| `quizCatalog` | Grade/status-filtered public-question query tested. Existing curriculum/count/navigation assembly could run client-side; full catalog migration not done. |
| `startTest` | Owner/grade-checked test documents could use Rules. Current server selection, answer-key snapshots and question-order/session state are not migrated/proven here. |
| `getTestSession` | Owner-scoped reads can use Rules. Full current session DTO/feedback behavior not implemented in this prototype. |
| `submitAnswer` | Immutable submission -> Rules-verified result -> atomic first-correct award demonstrated. Current full session summaries, feedback, analytics and weekly aggregates are not yet migrated. |
| `prepareArena` | Display ranking from authorized immutable awards can be computed client-side. Current class leaderboard read model, weekly rotation and legacy migrations remain work, not tested here. |
| `teacherAnalytics` | Teacher-authorized attempt/result reads can support client aggregation. Current stored aggregates/history migrations are not replaced/tested. |
| `syncQuestionBank` | Existing JSON normalization/public-private split is reused unchanged. Existing endpoint and folder-sync script are explicitly emulator-only. A live import must run in a trusted administrative environment, with IAM credentials kept out of browser code; not deployed or implemented here. |

## Boundaries: not a production security certification

1. Six-character-code brute-force resistance, password policies, email enumeration,
   reset behavior, production Auth throttling and App Check are not proven by the
   emulator. No claim that the old custom IP limiter is preserved. Auth code reuse
   and atomic credential/binding rotation must be designed/tested before migration.
   A negative feasibility test actually confirmed that an authenticated student
   can change their native Auth password using the Auth SDK, independently of
   Firestore Rules. The old short code then fails to sign in. Thus this substitute
   does NOT satisfy exclusive teacher control over codes and is not recommended
   as an equivalent replacement for current custom-token short-code login.
2. Students can submit multiple legitimate attempts and eventually learn answers,
   as the current retry/feedback product allows. Rules enforce correctness and one
   award per question; they cannot prove a human solved unaided or stop a valid-code
   holder from automating legitimate correct answers.
3. Result creation and XP award are separate steps. An interrupted client can leave
   a committed ungraded submission or an unawarded correct result. Retrying is safe;
   guaranteed background completion needs a trusted worker. A free hosting offer
   has not been selected or verified, so no always-free server promise is made.
4. Private answers remain private even after grading. This experiment returns the
   validated boolean, not the current correct-answer/explanation feedback DTO.
   Secure post-submission feedback and immutable question revisions/answer-key
   snapshots must be addressed before changing the current quiz engine.
5. The two-document award transaction passes Rules limits in this prototype. Full
   weekly XP, analytics, leaderboard and bulk writes must be checked against the
   10-per-operation / 20-per-batch Rules document-access limits before adoption.
6. Security Rules do not execute trusted Auth Admin operations or HMAC/custom-token
   signing. Trusted admin CLI on an operator's PC does not require Cloud Functions,
   but automatic teacher-facing provisioning requires a separate proven design or
   trusted service. Its provider/cost is not determined by this experiment.

Official references:
- https://firebase.google.com/docs/firestore/security/rules-conditions
- https://firebase.google.com/docs/auth/web/password-auth
- https://firebase.google.com/docs/auth/admin/manage-users
- https://firebase.google.com/docs/auth/admin/create-custom-tokens
- https://firebase.google.com/docs/projects/billing/firebase-pricing-plans

## Results

Prototype security/Auth/import-split tests: **23 passed, 0 failed**. One of these
checks intentionally demonstrates the native-password credential-control gap;
the passing test proves a limitation, not that this login model is fully secure.
Existing targeted tests: **6 passed, 1 failed**. The failed existing
`tests/question-content.test.mjs` test reads the already-absent
`data/soru-bankasi/2-sinif/2-sinif-ingilizce-1-unite-10-soru-demo.json` fixture.
No old demo bank was recreated and no unrelated test was changed to hide this.
`npm.cmd run build`: **passed** (frontend TypeScript/Vite and Functions TypeScript).
Existing local application `/ogretmen`: **HTTP 200** after the prototype.
Main UI and production Rules remain unchanged. The experiment uses its own Rules
file/config and client module; production code does not import it.
# Güncel Spark-only çalışma

Kod oluşturma/yenileme/kurtarma ve gerçek Auth ile tam quiz entegrasyonu için
[SPARK-ONLY-REPORT.md](./SPARK-ONLY-REPORT.md) dosyasına bakın. Bu çalışma mevcut
uygulamaya geçiş değildir; native Auth şifre değiştirme açığı devam eder.

