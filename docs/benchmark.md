# Evaluation protocol

Freeze the prompt, thresholds, and fixture before evaluating held-out cases. Each case starts from a clean commit and includes a reference PNG plus protected baselines. Neither SIGHTLINE nor the comparison agent receives the expected patch.

1. **Local card gap:** Wrong gap on one Dashboard card group; a global token edit would needlessly affect Settings.
2. **Shared typography:** Wrong shared heading token on all routes; a global fix is appropriate.
3. **Mobile navigation wrap:** A desktop-only change does not fix mobile; the protected viewport must prevent accepting a partial repair.

Record for every attempt: model and version, prompt, reference and captured screenshots, patch, target difference before/after, protected pixel and geometry changes, build/typecheck/interaction results, interventions, elapsed time, tokens, and estimated API cost. Preserve unsuccessful attempts. Compare against an ordinary coding-agent workflow with the same screenshots, source, model family, time limit, and independent verification commands. Report individual outcomes before calculating any aggregate.

The `smoke` command verifies only the regression gate. The integration test uses a mocked model response. Neither measures live model repair quality. Live model results remain to be collected after credentials are available.
