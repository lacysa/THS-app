THE HOTEL SAUGATUCK — SHIFT REPORTS + ROOM-FIRST MAINTENANCE UPDATE

BEFORE DEPLOYING
1. In Supabase > SQL Editor, run:
   RUN_THIS_FIRST_SHIFT_REPORTS_MAINTENANCE.sql
2. Then deploy this project to Vercel.

WHAT THIS UPDATE ADDS

SHIFT REPORTS
- New /shift-reports module.
- Daily / Morning / Evening report selection.
- Auto-populates housekeeping activity for the selected date.
- Auto-populates tomorrow's breakfast menu status.
- Shows outstanding menus and declined breakfasts.
- Auto-populates open maintenance and maintenance completed on the selected date.
- Pulls room notes into the report.
- Editable Guest Notes, Staff Notes, Supplies / Inventory, Tomorrow, and General Notes.
- Manager-only Management Notes.
- Shift Handoff tab with unresolved room notes, outstanding breakfast menus, open maintenance, and tomorrow priorities.
- Save Draft, Finalize, Reopen, and Print / Save PDF.
- Finalized reports are locked until reopened.
- Shift report saves/finalization write to the existing audit_log.

ROOM NOTES
- Daily room notes.
- Persistent room notes that remain until resolved.
- Include-in-shift-report toggle.
- Resolve / reopen workflow.

MAINTENANCE
- Replaces the placeholder maintenance page with a room-first work-order board.
- Guest rooms are the primary grouping.
- Property-area locations are also supported: Lobby, Kitchen, Laundry, Exterior, Grounds, Mechanical, Office, Other.
- Filters: Open Only, Urgent, Completed Today, All.
- Priority, status, assignment, completion tracking.
- Maintenance-capable staff / managers can manage ticket status and assignments.
- Any authenticated staff member can submit a maintenance issue.
- Existing maintenance_requests and maintenance_tickets tables are NOT deleted or modified.
  The new workflow uses maintenance_work_orders so older data is preserved.

STAFF LOGIN / PROVISIONING INCLUDED
- One-time owner-only route at /api/admin/provision-staff remains included.
- Al is explicitly excluded.
- Username login is supported on the normal login page after staff accounts are provisioned.
- The SQL adds staff_members.username if needed and seeds the usernames already discussed.
- Megan is added to staff_members as active Housekeeping if not already present.

IMPORTANT
- Run the SQL before opening Shift Reports or the new Maintenance page.
- This update does not delete your existing breakfast, housekeeping, auth, staff profile, maintenance_requests, or maintenance_tickets data.
