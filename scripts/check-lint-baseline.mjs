// Lint ratchet: fails when ESLint reports more errors or warnings than the
// recorded baseline in .eslint-baseline.json. The repo carries pre-existing
// lint debt, so a plain `eslint .` can't gate CI yet — this stops it growing.
//
//   node scripts/check-lint-baseline.mjs           check against the baseline
//   node scripts/check-lint-baseline.mjs --update  lower the baseline after a cleanup
import { readFileSync, writeFileSync } from "node:fs";
import { ESLint } from "eslint";

const BASELINE_PATH = new URL("../.eslint-baseline.json", import.meta.url);

const results = await new ESLint().lintFiles(["."]);
const current = results.reduce(
  (acc, r) => ({ errors: acc.errors + r.errorCount, warnings: acc.warnings + r.warningCount }),
  { errors: 0, warnings: 0 },
);

if (process.argv.includes("--update")) {
  writeFileSync(BASELINE_PATH, JSON.stringify(current, null, 2) + "\n");
  console.log(`Baseline updated: ${current.errors} errors, ${current.warnings} warnings.`);
  process.exit(0);
}

const baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
console.log(
  `ESLint: ${current.errors} errors (baseline ${baseline.errors}), ` +
    `${current.warnings} warnings (baseline ${baseline.warnings}).`,
);

if (current.errors > baseline.errors || current.warnings > baseline.warnings) {
  const formatter = await new ESLint().loadFormatter("stylish");
  console.log(await formatter.format(results));
  console.error(
    "Lint problems went up. Fix the new problems listed above (run `npm run lint` locally), " +
      "rather than raising the baseline.",
  );
  process.exit(1);
}

// Fail on a drop too, so the lower baseline is committed in the same PR. Otherwise the
// headroom a cleanup frees would silently absorb new problems later.
if (current.errors < baseline.errors || current.warnings < baseline.warnings) {
  console.error(
    "Lint problems went down — nice. Run `npm run lint:baseline -- --update` and commit " +
      ".eslint-baseline.json so the new, lower count is locked in.",
  );
  process.exit(1);
}
