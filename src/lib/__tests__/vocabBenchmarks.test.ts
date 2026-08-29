import { getVocabBenchmark, benchmarkAgeLabel, VOCAB_BENCHMARKS } from "@/lib/vocabBenchmarks";

describe("getVocabBenchmark", () => {
  it("returns the first band below the youngest benchmark age", () => {
    expect(getVocabBenchmark(0).months).toBe(6);
    expect(getVocabBenchmark(5).months).toBe(6);
  });

  it("picks the highest band the age has reached, not the nearest", () => {
    expect(getVocabBenchmark(18).label).toBe("10–20 words typical");
    expect(getVocabBenchmark(20).label).toBe("10–20 words typical");
    expect(getVocabBenchmark(21).label).toBe("20–50 words typical");
  });

  it("holds at the last band past the end of the table", () => {
    const last = VOCAB_BENCHMARKS[VOCAB_BENCHMARKS.length - 1];
    expect(getVocabBenchmark(48)).toBe(last);
  });
});

describe("benchmarkAgeLabel", () => {
  it("names the actual age inside the table", () => {
    expect(benchmarkAgeLabel(18)).toBe("18 months");
    expect(benchmarkAgeLabel(36)).toBe("36 months");
  });

  // Past 36mo the table has no band, so quoting the child's real age would
  // assert the 36-month norm as a 48-month one.
  it("clamps to '36+ months' past the end of the table", () => {
    expect(benchmarkAgeLabel(37)).toBe("36+ months");
    expect(benchmarkAgeLabel(48)).toBe("36+ months");
  });
});
