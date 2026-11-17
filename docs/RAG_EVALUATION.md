# SOLODESK AI — Dynamic Local RAG Evaluation

**Evaluation Runner:** `runExtendedRagBenchmark(k = 3)` in `src/ai/evaluation/benchmarks/runLocalBenchmark.ts`  
**Test Suite:** `EXTENDED_RAG_EVAL_CASES` (`14` cases across `11` synthetic corpus docs) in `src/ai/evaluation/test-cases/sampleCases.ts`

## 1. Latest Verified Execution Output (2026-11-17)
Measured dynamically by executing `runExtendedRagBenchmark()` in-process and in `KnowledgeHubView` + `tests/unit/phase14-backend-ai-rag.test.tsx`:
- **Cases Passed:** `14 / 14` (`100%`)
- **Recall@3:** `1.000` (`100%`)
- **Precision@3:** `0.647` (`64.7%` — reflects top-3 chunk return count against single-document ground truth per positive case)
- **Citation Accuracy:** `1.000` (`100%` top-1 source document match across all `11` positive + injection cases)
- **Unsupported False Positives:** `0 / 3` negative cases (`0%` unsupported answer rate across `out_of_scope`, `missing_source`, and `conflicting_source`)
- **Duplicate Retrieval Rate:** `0%` (`0` duplicate chunk IDs)
- **Total Evaluation Duration / Avg Latency:** `~3.25 ms` total (`0.232 ms` average per query)
- **Corpus Index Footprint:** `6,492 bytes` (`11` chunks across `11` synthetic benchmark docs)

## 2. Retrieval Hardening Applied
- Multi-word noise floor in `src/ai/rag/retrieval.ts`: queries containing `5+` tokenized keywords require at least `2` matching terms (or an exact substring/title phrase match) before scoring a candidate chunk, preventing single generic tokens like `"policy"` from triggering false-positive answers on unsupported queries.
