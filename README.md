# SIGHTLINE

SIGHTLINE repairs a visual mismatch in a trusted React app, then checks other routes and viewports before offering the CSS diff. It is new work for the Meta Global AI Developer Hackathon 2026. The included Northstar fixture, reference screenshot, server, UI, and tests were created for this repository.

## Run locally

Requires Node 24+, Git, and Playwright Chromium. The demo fixture uses React, TypeScript, and Vite.

```powershell
npm ci
npx playwright install chromium
$env:MODEL_API_KEY = '<your Meta Model API key>'
npm run start -w @sightline/server
```

In another terminal:

```powershell
npm run web
```

Open `http://127.0.0.1:4178`. Select the Northstar project and run repair. The initial Dashboard design reference is included; the UI accepts a replacement 1440×900 PNG. The server binds to `127.0.0.1:4177` and keeps keys in its process environment.

For the single-command fixture experiment, run `npm run run -w @sightline/server` after setting the key. It captures the reference and both routes, asks Muse for CSS, applies the candidate in a Git worktree, and prints the persisted verdict and diff location.

To use the Baseten hackathon endpoint instead, set `BASETEN_API_KEY` and `SIGHTLINE_PROVIDER=baseten`. The default Baseten ID is `meta-models/muse-spark-open-1026`, as specified in the participant email. The exact ID, image input, and schema output still require a live credentialed probe in this environment.

## Configure another app

Copy `projects.example.json` outside version control, replace its absolute paths and route details, then set `SIGHTLINE_PROJECTS_FILE` to that JSON path before starting the server. The target and each protected route need an existing `data-sightline` landmark in the rendered DOM. Reference PNG dimensions must match the target viewport. CSS paths are relative to the app root and must already be tracked by Git. Configure an install command and a functional check command that returns a nonzero exit code on failure; `{port}` resolves to the running app port. The app must have a clean Git checkout. The candidate runs in a detached Git worktree; the source checkout is only edited after **Accept verified patch**.

**Trust boundary:** SIGHTLINE executes the configured app and install/build scripts on the host. Use it only with repositories you trust. Worktrees isolate tracked edits, not code execution.

## Verification

```powershell
npm run typecheck --workspaces
npm run build --workspaces
npm test
npm run smoke -w @sightline/server
```

`npm test` mocks **only the model API** to exercise the full worktree, browser, patch, rejection, and retry loop. Its run record is marked `origin: test`; it is not evidence of a real Muse decision. `npm run smoke` supplies known CSS proposals to verify that the independent gate rejects a shared-token regression and accepts a scoped correction. A real Muse run requires a key and must be evaluated separately.

Run evidence is saved under ignored `runs/<id>/`: screenshots, JSON event log and metrics, plus each candidate's unified diff. A rejected candidate is retained in the report but its worktree is removed. The UI never applies a candidate without an explicit click. The project is intended to be published as a **public repository** for submission; verify the accepted participant rules and identify these new contributions in the submission and demo.

## Current limits

- CSS declaration edits only; no JSX or Tailwind rewriting.
- One target desktop reference and a configured protected route/viewport matrix.
- Fixed local Chromium environment and deterministic app data are required for reliable pixel comparisons.
- The target must improve its configured crop's changed-pixel ratio by 15%; protected views may change at most 1% of pixels and 4 CSS pixels of landmark geometry. These thresholds were calibrated on the fixture, not arbitrary apps.
- Model cost is estimated from returned token usage and capped before additional calls at $2/run. External provider billing is authoritative.
