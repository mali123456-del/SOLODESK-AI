# SOLODESK AI — Evaluation & Benchmarks

This folder contains lightweight, reproducible evaluation utilities for the local RAG pipeline and AI draft quality checks:

- `test-cases/sampleCases.ts`: Deterministic retrieval expectations.
- `benchmarks/runLocalBenchmark.ts`: Measures real retrieval accuracy and runtime latency on sample chunks without external API calls.
- `evaluation.ts`: Draft completeness and leftover-placeholder checks.
