---
description: Build, lint, and deploy the current branch in one go.
allowed-tools: Bash
---

Run the full ship pipeline for the current branch. Stop and report at the first failure — do not push or deploy past a red step.

Steps, in order:

1. **Lint:** `pnpm lint` (or `npm run lint` if pnpm is not available).
2. **Type check:** `pnpm tsc --noEmit` (or `npm run typecheck`).
3. **Test:** `pnpm test --run` (or `npm test -- --run`). Skip with a note if no test script exists.
4. **Build:** `pnpm build` (or `npm run build`).
5. **Confirm git state:** `git status` — if dirty, surface the changes and ask whether to commit before deploying.
6. **Push:** `git push -u origin "$(git rev-parse --abbrev-ref HEAD)"`.
7. **Deploy:** if a Vercel project is linked, the push will trigger a preview deploy automatically — surface the preview URL once GitHub reports it.

When done, return a one-line summary: which steps ran, which were skipped, and a link to the preview deploy if available.
