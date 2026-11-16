# Business Automation & Approval Gate Examples

## Human-in-the-Loop Automation Principles
SOLODESK AI enforces strict approval gates and idempotency guards across business automations:
- **No Silent Mutations**: AI drafts and workflow previews show the exact records that will be created before writing to IndexedDB.
- **Duplicate Execution Guard**: Executed workflows record immutable `WorkflowRun` entries keyed by `(workflowType, triggerEntityId)` so accepting or retrying does not generate duplicate projects or duplicate tasks.
- **Failed Run Inspection & Retry**: Transient errors record `status: 'failed'` with diagnostic error messages and allow targeted manual retry once conditions are fixed.

## Supported Local Workflow Rules
1. `proposal_to_project_and_tasks`: Triggered when a Proposal reaches `accepted`; generates one linked Project plus tasks from its deliverables list.
2. `quotation_to_invoice_draft`: Atomic transaction converting an accepted Quotation into a uniquely numbered Draft Invoice without duplicating existing links.
3. `overdue_invoice_followup_task`: Triggered on open/overdue invoices; creates one high-priority follow-up task due tomorrow linked to the client.
