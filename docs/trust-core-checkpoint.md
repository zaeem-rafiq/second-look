# HAC-67, HAC-68, HAC-69 local verification checkpoint

Objective: implement authenticated family access, truthful reply state, and the fixed trust evaluation. No HAC-70–78 work, cloud changes, deployment, email sends, pushes or publication.

Original checkout: main at 0aa0be11be7da6215b9dc320456654149e563312. Untracked owner skill/configuration files left untouched. Integration: codex/agh-trust-core. Isolated agents: codex/hac-67 (/private/tmp/agh-hac67), codex/hac-68 (/private/tmp/agh-hac68), codex/hac-69 (/private/tmp/agh-hac69).

Impact: browser sign-in → Convex identity → family membership → board/note/handled. Reply action → stable saved draft → validated registered recipient → provider acceptance → stored reply state → board. Forward parser/extraction → official source checks → verdict → bounded reply → evaluation gates.

Ownership: auth agent establishes cases/schema/App contract; reply agent develops separately and integrates after auth; evaluation agent owns evals and reports production gaps before changes. Coordinator owns integration, production fixes required by evaluation, independent combined review and final browser evidence.

Baseline 2026-09-20: npm test (130 tests), npm run typecheck, npm run build, and env -u OPENAI_API_KEY -u FIRECRAWL_API_KEY EVAL_ONLINE=0 node --import tsx evals/run.ts all exit 0. Nine existing fixtures passed seven gates; online evidence and model execution were not established by this baseline.

Verification sequence: focused lane tests → local commits → integrate auth then reply then evals → full required checks → local synthetic authenticated browser/API flows → independent combined review → fix and rerun affected checks → save exact results and update only the three Linear issues. Keep failed eval labels fixed and publication blocked when any gate fails. Recovery is local task-branch commits; original checkout preserved.
