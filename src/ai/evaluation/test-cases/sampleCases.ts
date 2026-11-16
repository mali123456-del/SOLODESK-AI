export interface RagEvalCase {
  id: string;
  query: string;
  expectedDocumentTitle: string;
  expectedKeywords: string[];
}

export const SAMPLE_RAG_EVAL_CASES: RagEvalCase[] = [
  {
    id: 'retainer-payment-terms',
    query: 'What are our standard payment terms and late fee policy?',
    expectedDocumentTitle: 'Freelancer Retainer & Payment Terms Guide',
    expectedKeywords: ['net-14', 'deposit', 'payment'],
  },
  {
    id: 'scope-change-clause',
    query: 'How should out of scope revisions be billed?',
    expectedDocumentTitle: 'Scope Change & Revision Policy',
    expectedKeywords: ['revision', 'change', 'hourly'],
  },
];
