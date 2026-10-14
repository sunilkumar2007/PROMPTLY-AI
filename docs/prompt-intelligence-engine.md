# Prompt Intelligence Engine — first vertical slice

Prompt Creator now structures each request, selects a prompting strategy and relevant Shared Context fields, compiles an editable prompt, and can execute that prompt with Gemini. The user reviews the compiled prompt before execution.

## Flow

1. The client normalizes the brief into a bounded task record: goal, category, task type, target tool, complexity, risk level, constraints, acceptance criteria, output format, assumptions, and missing optional details.
2. Deterministic rules choose a strategy and build a context packet from the saved Shared Context profile. The packet records included source IDs, reasons, excluded fields, and character count. If automatic context use is disabled, no profile content is sent.
3. An authenticated server function validates the task and packet, then calls the existing provider router with the server-side `GEMINI_API_KEY` to compile the prompt.
4. The prompt remains editable. When the user chooses **Run with Gemini**, a second authenticated server function validates the request and executes that prompt through the same provider router.
5. The result is checked for empty/oversized output, requested JSON or Markdown shape, exact required phrases, and simple count criteria such as minimum bullets or headings. Unsupported semantic criteria remain `needs-review`; the UI does not claim that factual correctness was verified.
6. The Library record stores the structured task, selected strategy, context provenance, compiled-prompt checks, compiler latency and token estimate, prompt version snapshots, executions, result text, validation evidence, provider/model, timestamps, and a clearly labelled character-based token estimate. Successful and failed execution attempts are saved in the existing browser-local prompt store.

## Configuration

Set `GEMINI_API_KEY` in the server environment. The key must remain server-side and must not use a `VITE_` prefix. The user must also have a valid Supabase session because the server functions use the existing `requireSupabaseAuth` middleware. No database migration is needed for this slice; prompt records use Prompt Creator's existing local Library storage.

## Validation

Run the unit suite with `npm test`. The focused pure logic tests cover task normalization, strategy selection, context filtering, prompt checks, and output checks. `npm run build` produces the production bundle.

The automated checks are structural heuristics, not proof that a model response is accurate, safe, complete, or production-ready. Token counts are estimates based on characters divided by four; no cost estimate is shown because the app does not have a verified price configuration for the selected provider/model. Provider failures are stored as failed executions with a retry available to the user; there are no automatic retry loops.

## Scope of this milestone

This is the first complete Prompt Creator slice, not the whole Prompt Intelligence Engine. It does not yet persist prompts to Supabase, retrieve project documents or repository files, compare baselines, run generated code, provide a semantic evaluator, support cancellation/rate quotas, or learn from user feedback. Those need separate milestones with their own access-control, retention, cost, and verification design.
