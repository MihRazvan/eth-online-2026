# Railway project cost observations

This monitor is read-only. It observes only usufruct project `cb65063e-ebf1-452c-b077-5e3da03041e2` in workspace `70d2345d-495a-4927-ba4e-bd94189adab5`, using an existing Railway CLI login. It does not load application secrets, change billing, provision resources, send notifications or stop the keeper. Run from the repository with installed dependencies:

```sh
node scripts/deploy/monitor-project-cost.mjs .scratch/operations/cost-sample.json
```

Run at least hourly during the initial deployment and daily thereafter; use a single caller and retain the sample file. A local scheduled invocation is useful only while that machine and its authenticated session remain available. No scheduler or notification channel is installed by this script.

The output includes current project resource dollars, a trailing-rate 30-day projection and an end-of-period projection. It warns at actual usage $24, or actual/projected usage $30. Exit codes: `0` below threshold at the observed rate; `2` warning; `3` projection unavailable; `1` check failure. Route warnings/failures through an independently configured operator monitor. None of these codes stops or modifies services.

The first observation, samples less than one hour or more than 48 hours apart, billing corrections, billing-period rollover and unchanged usage all yield an unavailable projection. Billing data can lag; a zero reading is not evidence of zero running costs. Rate projections assume unchanged future usage and are not a guarantee. The script compares gross project usage, without allocating workspace subscription credits, unrelated projects or taxes. Verify bucket billing and any costs absent from the project response separately; Alchemy, Graph and Vercel are outside this check.

Railway's supported raw project observation is:

```sh
pnpm exec railway usage projects --project cb65063e-ebf1-452c-b077-5e3da03041e2 --workspace 70d2345d-495a-4927-ba4e-bd94189adab5 --period current --json
```

The CLI also supports `railway usage limit status` and a soft-only alert. Native alerts are **workspace-wide**, not isolated-project forecasts. A workspace admin may configure this separately after reviewing its effect on the whole workspace:

```sh
pnpm exec railway usage limit set --target workspace --soft 24 --workspace 70d2345d-495a-4927-ba4e-bd94189adab5
```

That command changes the account's email alert; it has not been executed as part of this read-only investigation. A soft alert leaves resources running. Do not add `--hard`: Railway's compute hard limit takes all workspace workloads offline, including time-sensitive checkpoint preservation. If costs approach the budget, pause new sale activation through the reviewed release controls, investigate consumption and retain operation for existing obligations; do not use this monitor to disable settlement.

Verified against Railway CLI help and API schema on 13 September 2026. The selected workspace returned plan `HOBBY`; this does not imply any changes to the subscription. The initial isolated project sample returned zero usage and no service usage rows, before meaningful hosted runtime observations.

References: [project usage and supported CLI](https://docs.railway.com/projects/project-usage), [soft alerts versus workload-stopping hard limits](https://docs.railway.com/pricing/cost-control), [subscription and resource usage](https://docs.railway.com/pricing/plans). API `estimatedUsage` returns per-measurement estimates; this helper deliberately uses actual dollar observations rather than assuming those physical-unit values are dollars.
