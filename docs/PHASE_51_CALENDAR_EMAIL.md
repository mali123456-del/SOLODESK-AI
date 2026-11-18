# Phase 51 — Calendar, Schedule & Email Connectors

- **Offline-First Capabilities (`src/integrations/calendarEmailAdapter.ts`, `src/features/communication/CommunicationHubView.tsx`):**
  - `buildAppointmentIcsContent(appointment)`: generates RFC-5545 `VCALENDAR`/`VEVENT` `.ics` downloads locally offline with UTC timestamps and escaped text fields.
  - `buildMailtoDraftHref({ to, subject, body })`: safe URL-encoded `mailto:` handoff launching the user's native mail client.
  - Appointment scheduling, client follow-up reminders, and ICS export verified in `#/communication`.
- **OAuth Sync Status (`CALENDAR_EMAIL_CONNECTOR_CATALOG`):**
  - Google Calendar, Gmail, and Microsoft Graph connector definitions are cataloged with required scopes, while live two-way cloud OAuth sync is honestly marked `BLOCKED — EXTERNAL REQUIREMENT` pending OAuth client credentials.
