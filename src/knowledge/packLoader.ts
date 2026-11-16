import basicsMd from './built-in/freelancer-business-basics.md?raw';
import clientMgmtMd from './built-in/client-management-guide.md?raw';
import proposalMd from './built-in/proposal-writing-guide.md?raw';
import projectMgmtMd from './built-in/project-management-guide.md?raw';
import taskPlanMd from './built-in/task-planning-guide.md?raw';
import timeTrackMd from './built-in/time-tracking-guide.md?raw';
import invoiceMd from './built-in/invoice-management-guide.md?raw';
import expenseMd from './built-in/expense-management-guide.md?raw';
import profitMd from './built-in/project-profitability-guide.md?raw';
import reportingMd from './built-in/business-reporting-guide.md?raw';
import commMd from './built-in/client-communication-guide.md?raw';
import workflowExMd from './built-in/freelancer-workflow-examples.md?raw';
import automationExMd from './built-in/business-automation-examples.md?raw';
import glossaryJson from './built-in/solo-business-glossary.json?raw';

import { ConflictError } from '../core/errors';
import { addKnowledgeNote } from '../ai/knowledge/knowledgeService';

export interface BuiltInKnowledgePack {
  packId: string;
  fileName: string;
  title: string;
  collection: string;
  sourceType: 'markdown' | 'json';
  license: string;
  tags: string[];
  content: string;
}

export const BUILT_IN_KNOWLEDGE_PACKS: BuiltInKnowledgePack[] = [
  {
    packId: 'pack-freelancer-basics',
    fileName: 'freelancer-business-basics.md',
    title: 'Freelancer Business Basics — Solo Operations Playbook',
    collection: 'SOLODESK Knowledge Packs',
    sourceType: 'markdown',
    license: 'MIT (First-Party SOLODESK AI)',
    tags: ['built-in-pack', 'freelance', 'operations'],
    content: basicsMd,
  },
  {
    packId: 'pack-client-management',
    fileName: 'client-management-guide.md',
    title: 'Client Management & Lead Pipeline Guide',
    collection: 'SOLODESK Knowledge Packs',
    sourceType: 'markdown',
    license: 'MIT (First-Party SOLODESK AI)',
    tags: ['built-in-pack', 'crm', 'leads', 'clients'],
    content: clientMgmtMd,
  },
  {
    packId: 'pack-proposal-writing',
    fileName: 'proposal-writing-guide.md',
    title: 'Proposal Writing & Scope Definition Guide',
    collection: 'SOLODESK Knowledge Packs',
    sourceType: 'markdown',
    license: 'MIT (First-Party SOLODESK AI)',
    tags: ['built-in-pack', 'proposals', 'scope'],
    content: proposalMd,
  },
  {
    packId: 'pack-project-management',
    fileName: 'project-management-guide.md',
    title: 'Project Management & Delivery Control Guide',
    collection: 'SOLODESK Knowledge Packs',
    sourceType: 'markdown',
    license: 'MIT (First-Party SOLODESK AI)',
    tags: ['built-in-pack', 'projects', 'milestones'],
    content: projectMgmtMd,
  },
  {
    packId: 'pack-task-planning',
    fileName: 'task-planning-guide.md',
    title: 'Task Planning & Daily Execution Guide',
    collection: 'SOLODESK Knowledge Packs',
    sourceType: 'markdown',
    license: 'MIT (First-Party SOLODESK AI)',
    tags: ['built-in-pack', 'tasks', 'kanban', 'productivity'],
    content: taskPlanMd,
  },
  {
    packId: 'pack-time-tracking',
    fileName: 'time-tracking-guide.md',
    title: 'Time Tracking & Estimates vs Actuals Guide',
    collection: 'SOLODESK Knowledge Packs',
    sourceType: 'markdown',
    license: 'MIT (First-Party SOLODESK AI)',
    tags: ['built-in-pack', 'time-tracking', 'estimates'],
    content: timeTrackMd,
  },
  {
    packId: 'pack-invoice-management',
    fileName: 'invoice-management-guide.md',
    title: 'Invoice Management, Tax & Payment Terms Guide',
    collection: 'SOLODESK Knowledge Packs',
    sourceType: 'markdown',
    license: 'MIT (First-Party SOLODESK AI)',
    tags: ['built-in-pack', 'invoicing', 'tax', 'aging'],
    content: invoiceMd,
  },
  {
    packId: 'pack-expense-management',
    fileName: 'expense-management-guide.md',
    title: 'Expense Management & Categorization SOP',
    collection: 'SOLODESK Knowledge Packs',
    sourceType: 'markdown',
    license: 'MIT (First-Party SOLODESK AI)',
    tags: ['built-in-pack', 'expenses', 'finance'],
    content: expenseMd,
  },
  {
    packId: 'pack-project-profitability',
    fileName: 'project-profitability-guide.md',
    title: 'Project Profitability & Effective Hourly Rate Guide',
    collection: 'SOLODESK Knowledge Packs',
    sourceType: 'markdown',
    license: 'MIT (First-Party SOLODESK AI)',
    tags: ['built-in-pack', 'profitability', 'pricing'],
    content: profitMd,
  },
  {
    packId: 'pack-business-reporting',
    fileName: 'business-reporting-guide.md',
    title: 'Business Reporting, Cash Flow & Monthly Goals Guide',
    collection: 'SOLODESK Knowledge Packs',
    sourceType: 'markdown',
    license: 'MIT (First-Party SOLODESK AI)',
    tags: ['built-in-pack', 'reporting', 'cashflow', 'goals'],
    content: reportingMd,
  },
  {
    packId: 'pack-client-communication',
    fileName: 'client-communication-guide.md',
    title: 'Client Communication & Follow-Up Playbook',
    collection: 'SOLODESK Knowledge Packs',
    sourceType: 'markdown',
    license: 'MIT (First-Party SOLODESK AI)',
    tags: ['built-in-pack', 'communication', 'email', 'followup'],
    content: commMd,
  },
  {
    packId: 'pack-workflow-examples',
    fileName: 'freelancer-workflow-examples.md',
    title: 'Freelancer End-to-End Workflow Examples',
    collection: 'SOLODESK Knowledge Packs',
    sourceType: 'markdown',
    license: 'MIT (First-Party SOLODESK AI)',
    tags: ['built-in-pack', 'workflows', 'sop'],
    content: workflowExMd,
  },
  {
    packId: 'pack-automation-examples',
    fileName: 'business-automation-examples.md',
    title: 'Business Automation & Approval Gate Examples',
    collection: 'SOLODESK Knowledge Packs',
    sourceType: 'markdown',
    license: 'MIT (First-Party SOLODESK AI)',
    tags: ['built-in-pack', 'automation', 'approval'],
    content: automationExMd,
  },
  {
    packId: 'pack-solo-glossary',
    fileName: 'solo-business-glossary.json',
    title: 'Solo Business & SOLODESK Terminology Glossary',
    collection: 'SOLODESK Knowledge Packs',
    sourceType: 'json',
    license: 'MIT (First-Party SOLODESK AI)',
    tags: ['built-in-pack', 'glossary', 'definitions'],
    content: glossaryJson,
  },
];

export async function installBuiltInKnowledgePacks(): Promise<{
  installedCount: number;
  skippedDuplicates: number;
}> {
  let installedCount = 0;
  let skippedDuplicates = 0;

  for (const pack of BUILT_IN_KNOWLEDGE_PACKS) {
    try {
      await addKnowledgeNote({
        title: pack.title,
        content: pack.content,
        tags: pack.tags,
        collection: pack.collection,
        sourceType: pack.sourceType,
        fileName: pack.fileName,
        mimeType: pack.sourceType === 'json' ? 'application/json' : 'text/markdown',
        licenseOrRights: pack.license,
        allowDuplicate: false,
      });
      installedCount += 1;
    } catch (err) {
      if (err instanceof ConflictError) {
        skippedDuplicates += 1;
      } else {
        throw err;
      }
    }
  }

  return { installedCount, skippedDuplicates };
}
