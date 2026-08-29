// Typical expressive-vocabulary ranges by age, used to give a logged word count
// some context. Shared by the in-app Speech Insights panel and the Word Journal
// section of the pediatrician report so the parent and the pediatrician are
// reading the same benchmark.
export interface VocabBenchmark {
  months: number;
  min: number;
  max: number;
  label: string;
}

export const VOCAB_BENCHMARKS: VocabBenchmark[] = [
  { months: 6, min: 0, max: 0, label: "Pre-verbal babbling expected" },
  { months: 9, min: 0, max: 1, label: "May say first word (mama/dada)" },
  { months: 12, min: 1, max: 3, label: "1–3 words typical" },
  { months: 15, min: 3, max: 10, label: "3–10 words typical" },
  { months: 18, min: 10, max: 20, label: "10–20 words typical" },
  { months: 21, min: 20, max: 50, label: "20–50 words typical" },
  { months: 24, min: 50, max: 200, label: "50+ words, 2-word combos" },
  { months: 30, min: 200, max: 450, label: "200+ words, short sentences" },
  { months: 36, min: 450, max: 1000, label: "450+ words, conversational" },
];

export function getVocabBenchmark(ageMonths: number): VocabBenchmark {
  let best = VOCAB_BENCHMARKS[0];
  for (const b of VOCAB_BENCHMARKS) {
    if (ageMonths >= b.months) best = b;
    else break;
  }
  return best;
}
