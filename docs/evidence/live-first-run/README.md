# First live Muse run

This is the unedited outcome of run `400b3ee3-04af-4c63-a164-71f7237a335d`, started October 27, 2026 at 2:10 p.m. Toronto time. It used Baseten `meta-models/muse-spark-open-1026` against the newly built Northstar fixture. The source checkout remained unchanged; the final patch is awaiting review.

| Measure | Result |
|---|---:|
| Calls | 2 |
| Input / output tokens | 10,792 / 993 |
| Model latency | 9.1 s, then 6.6 s |
| Estimated API cost | $0.0177 |
| Full run time | 63.5 s |
| Dashboard target pixel difference | 1.14% before; 0% after either candidate |

1. Muse proposed changing `:root --surface-gap` from `12px` to `24px`. The [shared-token diff](candidate-1.diff) improved Dashboard, but Settings moved **72 CSS px** and changed **0.94%** of pixels. The gate rejected it. Reports changed 0.91% of pixels; Dashboard mobile was unchanged.
2. Muse then proposed changing `.dashboard-grid`'s `gap` from `var(--surface-gap)` to `24px`. The [scoped diff](candidate-2.diff) reduced Dashboard target difference to 0%, with 0 changed pixels and 0 landmark movement in every protected view. Build, typecheck, and configured interactions passed. The verdict was **ready for human review**, not applied.

| View | Baseline | Rejected shared edit | Accepted-for-review scoped edit |
|---|---|---|---|
| Dashboard | [before](dashboard-before.png) | [candidate 1](dashboard-shared.png) | [candidate 2](dashboard-scoped.png) |
| Settings | [before](settings-before.png) | [candidate 1](settings-shared.png) | [candidate 2](settings-scoped.png) |

The pixel thresholds were calibrated on this fixture. This run establishes the live model and regression-recovery path; it is not a held-out accuracy benchmark or evidence of universal visual repair.
