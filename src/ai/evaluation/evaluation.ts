import { runLocalRagBenchmark } from './benchmarks/runLocalBenchmark';

export { runLocalRagBenchmark };
export type { BenchmarkCaseOutcome, LocalBenchmarkSummary } from './benchmarks/runLocalBenchmark';

export function evaluateDraftQuality(text: string): {
  wordCount: number;
  hasPlaceholdersRemaining: boolean;
  warnings: string[];
} {
  const trimmed = text.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const hasPlaceholdersRemaining = /\[[A-Z0-9_\s-]{2,}\]|\{\{[^}]+\}\}/.test(trimmed);
  const warnings: string[] = [];
  if (wordCount < 10) warnings.push('Draft is very short; consider adding more project context.');
  if (hasPlaceholdersRemaining) {
    warnings.push('Contains bracketed placeholders that should be reviewed before sending.');
  }
  return {
    wordCount,
    hasPlaceholdersRemaining,
    warnings,
  };
}
