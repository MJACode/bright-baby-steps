// WHO Child Growth Standards (2006) — LMS parameters for ages 0–24 months.
// Source: https://www.who.int/tools/child-growth-standards/standards
//
// Each table entry is { ageMonths, L, M, S }. Values for non-integer ages
// are linearly interpolated between adjacent monthly entries.
//
// Compute z-score with the LMS method:
//   z = ((x / M)^L - 1) / (L * S)   when L != 0
//   z = ln(x / M) / S               when L == 0
// Then percentile = standard-normal CDF(z) * 100.

type LMS = { age: number; L: number; M: number; S: number };

// ── Boys: Weight-for-age (kg), 0–24 months ────────────────────────────────────
const BOYS_WEIGHT: LMS[] = [
  { age: 0, L: 0.3487, M: 3.3464, S: 0.14602 },
  { age: 1, L: 0.2297, M: 4.4709, S: 0.13395 },
  { age: 2, L: 0.197, M: 5.5675, S: 0.12385 },
  { age: 3, L: 0.1738, M: 6.3762, S: 0.11727 },
  { age: 4, L: 0.1553, M: 7.0023, S: 0.11316 },
  { age: 5, L: 0.1395, M: 7.5105, S: 0.11080 },
  { age: 6, L: 0.1257, M: 7.934, S: 0.10958 },
  { age: 7, L: 0.1134, M: 8.297, S: 0.10902 },
  { age: 8, L: 0.1021, M: 8.6151, S: 0.10882 },
  { age: 9, L: 0.0917, M: 8.9014, S: 0.10881 },
  { age: 10, L: 0.082, M: 9.1649, S: 0.10891 },
  { age: 11, L: 0.073, M: 9.4122, S: 0.10906 },
  { age: 12, L: 0.0644, M: 9.6479, S: 0.10925 },
  { age: 13, L: 0.0563, M: 9.8749, S: 0.10949 },
  { age: 14, L: 0.0487, M: 10.0953, S: 0.10976 },
  { age: 15, L: 0.0413, M: 10.3108, S: 0.11007 },
  { age: 16, L: 0.0343, M: 10.5228, S: 0.11041 },
  { age: 17, L: 0.0275, M: 10.7319, S: 0.11079 },
  { age: 18, L: 0.0211, M: 10.9385, S: 0.11119 },
  { age: 19, L: 0.0148, M: 11.143, S: 0.11164 },
  { age: 20, L: 0.0087, M: 11.3462, S: 0.1121 },
  { age: 21, L: 0.0029, M: 11.5486, S: 0.11261 },
  { age: 22, L: -0.0028, M: 11.7504, S: 0.11314 },
  { age: 23, L: -0.0083, M: 11.9514, S: 0.11369 },
  { age: 24, L: -0.0137, M: 12.1515, S: 0.11426 },
];

// ── Girls: Weight-for-age (kg), 0–24 months ───────────────────────────────────
const GIRLS_WEIGHT: LMS[] = [
  { age: 0, L: 0.3809, M: 3.2322, S: 0.14171 },
  { age: 1, L: 0.1714, M: 4.1873, S: 0.13724 },
  { age: 2, L: 0.0962, M: 5.1282, S: 0.13 },
  { age: 3, L: 0.0402, M: 5.8458, S: 0.12619 },
  { age: 4, L: -0.005, M: 6.4237, S: 0.12402 },
  { age: 5, L: -0.043, M: 6.8985, S: 0.12274 },
  { age: 6, L: -0.0756, M: 7.297, S: 0.12204 },
  { age: 7, L: -0.1039, M: 7.6422, S: 0.12178 },
  { age: 8, L: -0.1288, M: 7.9487, S: 0.12181 },
  { age: 9, L: -0.1507, M: 8.2254, S: 0.12199 },
  { age: 10, L: -0.17, M: 8.48, S: 0.12223 },
  { age: 11, L: -0.1872, M: 8.7192, S: 0.12247 },
  { age: 12, L: -0.2024, M: 8.9481, S: 0.12268 },
  { age: 13, L: -0.2158, M: 9.1699, S: 0.12283 },
  { age: 14, L: -0.2278, M: 9.387, S: 0.12294 },
  { age: 15, L: -0.2384, M: 9.6008, S: 0.12299 },
  { age: 16, L: -0.2478, M: 9.8124, S: 0.12303 },
  { age: 17, L: -0.2562, M: 10.0226, S: 0.12306 },
  { age: 18, L: -0.2637, M: 10.2315, S: 0.12309 },
  { age: 19, L: -0.2703, M: 10.4393, S: 0.12315 },
  { age: 20, L: -0.2762, M: 10.6464, S: 0.12323 },
  { age: 21, L: -0.2815, M: 10.8534, S: 0.12335 },
  { age: 22, L: -0.2862, M: 11.0608, S: 0.1235 },
  { age: 23, L: -0.2903, M: 11.2688, S: 0.12369 },
  { age: 24, L: -0.2941, M: 11.4775, S: 0.12390 },
];

// ── Boys: Length-for-age (cm), 0–24 months ────────────────────────────────────
const BOYS_LENGTH: LMS[] = [
  { age: 0, L: 1, M: 49.8842, S: 0.03795 },
  { age: 1, L: 1, M: 54.7244, S: 0.03557 },
  { age: 2, L: 1, M: 58.4249, S: 0.03424 },
  { age: 3, L: 1, M: 61.4292, S: 0.03328 },
  { age: 4, L: 1, M: 63.886, S: 0.03257 },
  { age: 5, L: 1, M: 65.9026, S: 0.03204 },
  { age: 6, L: 1, M: 67.6236, S: 0.03165 },
  { age: 7, L: 1, M: 69.1645, S: 0.03139 },
  { age: 8, L: 1, M: 70.5994, S: 0.03124 },
  { age: 9, L: 1, M: 71.9687, S: 0.03117 },
  { age: 10, L: 1, M: 73.2812, S: 0.03118 },
  { age: 11, L: 1, M: 74.5388, S: 0.03125 },
  { age: 12, L: 1, M: 75.7488, S: 0.03137 },
  { age: 13, L: 1, M: 76.9186, S: 0.03154 },
  { age: 14, L: 1, M: 78.0497, S: 0.03174 },
  { age: 15, L: 1, M: 79.1458, S: 0.03197 },
  { age: 16, L: 1, M: 80.2113, S: 0.03222 },
  { age: 17, L: 1, M: 81.2487, S: 0.0325 },
  { age: 18, L: 1, M: 82.2587, S: 0.03279 },
  { age: 19, L: 1, M: 83.2418, S: 0.0331 },
  { age: 20, L: 1, M: 84.1996, S: 0.03342 },
  { age: 21, L: 1, M: 85.1348, S: 0.03376 },
  { age: 22, L: 1, M: 86.048, S: 0.03411 },
  { age: 23, L: 1, M: 86.941, S: 0.03447 },
  { age: 24, L: 1, M: 87.8161, S: 0.03484 },
];

// ── Girls: Length-for-age (cm), 0–24 months ───────────────────────────────────
const GIRLS_LENGTH: LMS[] = [
  { age: 0, L: 1, M: 49.1477, S: 0.0379 },
  { age: 1, L: 1, M: 53.6872, S: 0.0364 },
  { age: 2, L: 1, M: 57.0673, S: 0.03568 },
  { age: 3, L: 1, M: 59.8029, S: 0.03520 },
  { age: 4, L: 1, M: 62.0899, S: 0.03486 },
  { age: 5, L: 1, M: 64.0301, S: 0.0346 },
  { age: 6, L: 1, M: 65.7311, S: 0.0344 },
  { age: 7, L: 1, M: 67.2873, S: 0.03424 },
  { age: 8, L: 1, M: 68.7498, S: 0.03413 },
  { age: 9, L: 1, M: 70.1435, S: 0.03405 },
  { age: 10, L: 1, M: 71.4818, S: 0.03399 },
  { age: 11, L: 1, M: 72.771, S: 0.03395 },
  { age: 12, L: 1, M: 74.015, S: 0.03394 },
  { age: 13, L: 1, M: 75.2176, S: 0.03394 },
  { age: 14, L: 1, M: 76.3817, S: 0.03396 },
  { age: 15, L: 1, M: 77.5099, S: 0.03399 },
  { age: 16, L: 1, M: 78.6055, S: 0.03404 },
  { age: 17, L: 1, M: 79.671, S: 0.0341 },
  { age: 18, L: 1, M: 80.7079, S: 0.03417 },
  { age: 19, L: 1, M: 81.7182, S: 0.03425 },
  { age: 20, L: 1, M: 82.7036, S: 0.03435 },
  { age: 21, L: 1, M: 83.6654, S: 0.03445 },
  { age: 22, L: 1, M: 84.604, S: 0.03457 },
  { age: 23, L: 1, M: 85.5202, S: 0.03469 },
  { age: 24, L: 1, M: 86.4153, S: 0.03483 },
];

// ── Boys: Head Circumference-for-age (cm), 0–24 months ────────────────────────
const BOYS_HC: LMS[] = [
  { age: 0, L: 1, M: 34.4618, S: 0.03686 },
  { age: 1, L: 1, M: 37.2759, S: 0.0345 },
  { age: 2, L: 1, M: 39.1285, S: 0.03296 },
  { age: 3, L: 1, M: 40.5135, S: 0.03174 },
  { age: 4, L: 1, M: 41.6317, S: 0.03078 },
  { age: 5, L: 1, M: 42.5576, S: 0.03003 },
  { age: 6, L: 1, M: 43.3306, S: 0.02944 },
  { age: 7, L: 1, M: 43.9803, S: 0.029 },
  { age: 8, L: 1, M: 44.5301, S: 0.02868 },
  { age: 9, L: 1, M: 44.9998, S: 0.02844 },
  { age: 10, L: 1, M: 45.4051, S: 0.02828 },
  { age: 11, L: 1, M: 45.7573, S: 0.02817 },
  { age: 12, L: 1, M: 46.0661, S: 0.02811 },
  { age: 13, L: 1, M: 46.3395, S: 0.02807 },
  { age: 14, L: 1, M: 46.5844, S: 0.02807 },
  { age: 15, L: 1, M: 46.806, S: 0.02808 },
  { age: 16, L: 1, M: 47.0088, S: 0.02811 },
  { age: 17, L: 1, M: 47.1962, S: 0.02815 },
  { age: 18, L: 1, M: 47.3711, S: 0.0282 },
  { age: 19, L: 1, M: 47.5357, S: 0.02826 },
  { age: 20, L: 1, M: 47.6919, S: 0.02832 },
  { age: 21, L: 1, M: 47.8408, S: 0.02839 },
  { age: 22, L: 1, M: 47.9833, S: 0.02845 },
  { age: 23, L: 1, M: 48.12, S: 0.02852 },
  { age: 24, L: 1, M: 48.2515, S: 0.02858 },
];

// ── Girls: Head Circumference-for-age (cm), 0–24 months ───────────────────────
const GIRLS_HC: LMS[] = [
  { age: 0, L: 1, M: 33.8787, S: 0.03496 },
  { age: 1, L: 1, M: 36.5463, S: 0.03297 },
  { age: 2, L: 1, M: 38.2521, S: 0.03168 },
  { age: 3, L: 1, M: 39.5328, S: 0.03061 },
  { age: 4, L: 1, M: 40.5817, S: 0.02976 },
  { age: 5, L: 1, M: 41.4590, S: 0.02906 },
  { age: 6, L: 1, M: 42.1995, S: 0.02850 },
  { age: 7, L: 1, M: 42.8290, S: 0.02804 },
  { age: 8, L: 1, M: 43.3671, S: 0.02768 },
  { age: 9, L: 1, M: 43.8300, S: 0.02740 },
  { age: 10, L: 1, M: 44.2319, S: 0.02717 },
  { age: 11, L: 1, M: 44.5844, S: 0.02700 },
  { age: 12, L: 1, M: 44.8965, S: 0.02686 },
  { age: 13, L: 1, M: 45.1752, S: 0.02676 },
  { age: 14, L: 1, M: 45.4265, S: 0.02668 },
  { age: 15, L: 1, M: 45.6551, S: 0.02662 },
  { age: 16, L: 1, M: 45.865, S: 0.02658 },
  { age: 17, L: 1, M: 46.0598, S: 0.02656 },
  { age: 18, L: 1, M: 46.2424, S: 0.02655 },
  { age: 19, L: 1, M: 46.4152, S: 0.02655 },
  { age: 20, L: 1, M: 46.58, S: 0.02656 },
  { age: 21, L: 1, M: 46.7384, S: 0.02658 },
  { age: 22, L: 1, M: 46.8913, S: 0.0266 },
  { age: 23, L: 1, M: 47.0391, S: 0.02663 },
  { age: 24, L: 1, M: 47.1822, S: 0.02666 },
];

// ── Unit conversions ──────────────────────────────────────────────────────────

export const OZ_PER_KG = 35.27396195;
export const CM_PER_IN = 2.54;

export function ozToKg(oz: number): number {
  return oz / OZ_PER_KG;
}

export function cmToIn(cm: number): number {
  return cm / CM_PER_IN;
}

export function inToCm(inches: number): number {
  return inches * CM_PER_IN;
}

// ── Math helpers ──────────────────────────────────────────────────────────────

// Abramowitz & Stegun 26.2.17 — standard normal CDF, ~7e-8 accuracy.
function normalCdf(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const d = 0.3989422804 * Math.exp((-z * z) / 2);
  const p =
    d *
    t *
    (0.3193815 +
      t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return z > 0 ? 1 - p : p;
}

function interpolateLMS(table: LMS[], age: number): LMS | null {
  if (age < table[0].age) return null;
  const last = table[table.length - 1];
  if (age > last.age) return null;
  for (let i = 0; i < table.length - 1; i++) {
    const a = table[i];
    const b = table[i + 1];
    if (age >= a.age && age <= b.age) {
      const t = (age - a.age) / (b.age - a.age);
      return {
        age,
        L: a.L + (b.L - a.L) * t,
        M: a.M + (b.M - a.M) * t,
        S: a.S + (b.S - a.S) * t,
      };
    }
  }
  return null;
}

function zScore(value: number, lms: LMS): number {
  const { L, M, S } = lms;
  if (L === 0) return Math.log(value / M) / S;
  return (Math.pow(value / M, L) - 1) / (L * S);
}

// ── Public API ────────────────────────────────────────────────────────────────

export type Sex = "male" | "female";
export type Metric = "weight" | "length" | "head";

const TABLES: Record<Sex, Record<Metric, LMS[]>> = {
  male: { weight: BOYS_WEIGHT, length: BOYS_LENGTH, head: BOYS_HC },
  female: { weight: GIRLS_WEIGHT, length: GIRLS_LENGTH, head: GIRLS_HC },
};

/**
 * Age in months between two ISO date strings (or Date objects).
 * Returns a fractional value (one decimal worth of resolution is fine for LMS).
 */
export function ageMonths(birthDate: string | Date, asOf: string | Date): number {
  const b = typeof birthDate === "string" ? new Date(birthDate) : birthDate;
  const a = typeof asOf === "string" ? new Date(asOf) : asOf;
  const days = (a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24);
  return days / 30.4375;
}

/**
 * Compute the WHO percentile (0–100) for a given measurement.
 * Returns null when:
 *   - Sex is missing or "other"
 *   - Age is outside the 0–24 month range
 *   - Value is non-positive
 */
export function computePercentile(
  metric: Metric,
  valueMetric: number, // kg for weight, cm for length / head
  sex: string | null | undefined,
  ageInMonths: number,
): number | null {
  if (!sex || (sex !== "male" && sex !== "female")) return null;
  if (!Number.isFinite(valueMetric) || valueMetric <= 0) return null;
  if (!Number.isFinite(ageInMonths) || ageInMonths < 0) return null;
  const lms = interpolateLMS(TABLES[sex as Sex][metric], ageInMonths);
  if (!lms) return null;
  const z = zScore(valueMetric, lms);
  return normalCdf(z) * 100;
}

/**
 * Convenience: weight percentile from oz.
 */
export function weightPercentile(
  weightOz: number,
  sex: string | null | undefined,
  ageInMonths: number,
): number | null {
  return computePercentile("weight", ozToKg(weightOz), sex, ageInMonths);
}

/**
 * Convenience: length percentile from cm.
 */
export function lengthPercentile(
  lengthCm: number,
  sex: string | null | undefined,
  ageInMonths: number,
): number | null {
  return computePercentile("length", lengthCm, sex, ageInMonths);
}

/**
 * Convenience: head circumference percentile from cm.
 */
export function headPercentile(
  hcCm: number,
  sex: string | null | undefined,
  ageInMonths: number,
): number | null {
  return computePercentile("head", hcCm, sex, ageInMonths);
}

/**
 * Format a percentile (0–100) as an ordinal like "75th", "1st", "22nd".
 * Returns "—" for null.
 */
export function formatPercentile(p: number | null): string {
  if (p == null) return "—";
  const rounded = Math.round(p);
  // Round-to-zero floor: WHO charts conventionally show 1st as the lowest.
  const clamped = Math.max(1, Math.min(99, rounded));
  const mod100 = clamped % 100;
  const mod10 = clamped % 10;
  let suffix = "th";
  if (mod100 < 11 || mod100 > 13) {
    if (mod10 === 1) suffix = "st";
    else if (mod10 === 2) suffix = "nd";
    else if (mod10 === 3) suffix = "rd";
  }
  return `${clamped}${suffix}`;
}

/**
 * Corrected age for premature babies: use the due date as the "birth" point.
 * Pediatricians use corrected age up to 24 months. Returns months as a float.
 */
export function correctedAgeMonths(
  dateOfBirth: string,
  dueDate: string | null,
  isPremature: boolean | null,
  asOf: string | Date,
): number {
  const useDue = isPremature && dueDate;
  return ageMonths(useDue ? dueDate : dateOfBirth, asOf);
}
