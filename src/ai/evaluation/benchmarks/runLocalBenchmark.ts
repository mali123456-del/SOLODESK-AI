import { chunkTextDeterministic } from '../../rag/chunking';
import { buildDocumentChunks } from '../../rag/indexing';
import { retrieveRelevantChunks } from '../../rag/retrieval';
import { SAMPLE_RAG_EVAL_CASES } from '../test-cases/sampleCases';

export interface BenchmarkCaseOutcome {
  id: string;
  passed: boolean;
  topMatchedTitle: string | null;
  topScore: number;
  latencyMs: number;
}

export interface LocalBenchmarkSummary {
  totalCases: number;
  passedCases: number;
  passRatePercent: number;
  totalDurationMs: number;
  outcomes: BenchmarkCaseOutcome[];
}

export function runLocalRagBenchmark(): LocalBenchmarkSummary {
  const sampleDocs = [
    {
      id: 'eval_doc_1',
      title: 'Freelancer Retainer & Payment Terms Guide',
      body: 'Standard invoicing uses Net-14 payment terms after milestone delivery. New projects require a 40% kickoff deposit before work begins.',
    },
    {
      id: 'eval_doc_2',
      title: 'Scope Change & Revision Policy',
      body: 'Each milestone includes two rounds of structured revisions. Requests outside the signed scope are billed as a change request at the agreed hourly rate.',
    },
  ];

  const allChunks = sampleDocs.flatMap((doc) =>
    buildDocumentChunks(doc.id, doc.title, chunkTextDeterministic(doc.body))
  );

  const startedAt = performance.now();
  const outcomes: BenchmarkCaseOutcome[] = SAMPLE_RAG_EVAL_CASES.map((tc) => {
    const t0 = performance.now();
    const hits = retrieveRelevantChunks(tc.query, allChunks, 2);
    const t1 = performance.now();
    const top = hits[0];
    const matchedTitle = top?.chunk.documentTitle ?? null;
    const passed = matchedTitle === tc.expectedDocumentTitle && (top?.score ?? 0) > 0;
    return {
      id: tc.id,
      passed,
      topMatchedTitle: matchedTitle,
      topScore: top ? Number(top.score.toFixed(2)) : 0,
      latencyMs: Number((t1 - t0).toFixed(3)),
    };
  });

  const totalDurationMs = Number((performance.now() - startedAt).toFixed(3));
  const passedCases = outcomes.filter((o) => o.passed).length;

  return {
    totalCases: outcomes.length,
    passedCases,
    passRatePercent: outcomes.length > 0 ? Math.round((passedCases / outcomes.length) * 100) : 0,
    totalDurationMs,
    outcomes,
  };
}
