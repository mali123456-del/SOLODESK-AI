# Freelancer End-to-End Workflow Examples

## Standard Lead-to-Paid-Invoice Flow
1. **Lead Intake**: Add prospect in Clients CRM (`status: lead`), attach discovery notes, and check duplicate emails.
2. **Discovery & Scheduling**: Log appointment in Communication Hub with agenda and capture meeting notes.
3. **Proposal & Quotation**: Create a Proposal outlining scope/deliverables and a priced Quotation selecting packages from the Service Catalog.
4. **Client Acceptance & Project Kickoff**: Mark Proposal `accepted`, run the approval-gated Workflow (`Proposal -> Project + Tasks`) to scaffold deliverables automatically, and mark Quotation `accepted`.
5. **Execution & Time Tracking**: Track timer sessions against project tasks and update milestone completion.
6. **Invoicing & Payment Settlement**: Convert the accepted Quotation cleanly into an Invoice (1:1 guarded against duplicate conversion), record partial or full payments, and inspect Net Profit & Aging reports.
