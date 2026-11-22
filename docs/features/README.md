# Feature work folders

Each feature gets one folder, created by `/analyze-requirement` and `/plan-feature`:

```
docs/features/<FR-ids>-<slug>/      e.g. FR-018-021-submission-validation/
  spec.md     acceptance criteria per FR, conflicts, out-of-scope   (architect)
  plan.md     API contract, data changes, tasks [backend]/[flutter]/[qa], dependencies (architect)
  review.md   code + security review findings and their resolution  (reviewers)
```

These files are the hand-off between agents: each agent reads them instead of re-reading the
whole conversation, which keeps sessions short and lets a teammate continue someone else's work.
Keep each file short (spec ≤ 1 page, plan ≤ 2 pages).
