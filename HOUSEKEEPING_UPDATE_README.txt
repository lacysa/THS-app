THS HOUSEKEEPING UPDATE — 2026-10-02

WHAT CHANGED
- Housekeeping page now renders the Daily Room Board instead of the owner-preview placeholder.
- Autosave runs about 700ms after edits; Save All remains as a manual fallback.
- Active Housekeeping/Runner staff are loaded from staff_members + staff_member_capabilities.
- Staff picker is searchable and supports multiple staff members per room.
- HA and FOH room sign-offs use the logged-in user and capability permissions.
- Date / save status / refresh / Save All toolbar stays visible.
- Table has its own vertical/horizontal scrolling, sticky headers, and a sticky Room column.
- Tomorrow's breakfast status is read from breakfast_bookings.
- A top reminder lists rooms with a scheduled breakfast whose menu is still missing.

BEFORE DEPLOYING
1. In Supabase SQL Editor, run:
   supabase/10_HOUSEKEEPING_AUTOSAVE_STAFF_SIGNOFFS.sql
2. Confirm the verification query at the bottom shows the expected team and capabilities.
3. Deploy the full project to Vercel.

IMPORTANT BREAKFAST NOTE
The reminder can only identify rooms that already have a breakfast_bookings row for tomorrow.
It does not infer breakfast eligibility from the PMS or reservation system.

SIGN-OFF PERMISSIONS
- HA: Kyree, Ashley
- HA management override: Sarah, Brittany, David
- FOH: David
- FOH management override: Sarah, Brittany

ROOM ASSIGNMENT STAFF
Ashley, Betty, Bonne, Brittany Hughes, Chloe, Emma, Kiana, Laura
(active Housekeeping/Runner capability only)
