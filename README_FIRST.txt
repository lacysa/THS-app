THS SUPABASE COMPLETE REBUILD
=============================

This bundle rebuilds the PUBLIC tables used by the THS Breakfast / Operations Hub.

IMPORTANT:
- DO NOT delete or recreate auth.users.
- Supabase Auth owns auth.users and stores the real password hash there.
- Script 01 backs up staff_profiles before dropping the app tables so staff names,
  profile email aliases, phone numbers, themes and legacy roles can be restored.
- Breakfast reservations/orders/history are intentionally wiped by Script 01.
- Run the files in numeric order, OR run 00_MASTER_REBUILD.sql once.
- The phone login used by the matching app is an alias login:
    staff_profiles.phone -> staff_profiles.user_id -> auth.users email -> same existing password.
  It does not require the user to create a second password.
- Vercel MUST have a server-side Supabase admin key:
    SUPABASE_SECRET_KEY
  OR
    SUPABASE_SERVICE_ROLE_KEY

Recommended order:
  01_RESET_APP_TABLES.sql
  02_STAFF_ROLES_PROFILES.sql
  03_APP_MODULES.sql
  04_BREAKFAST_SCHEMA.sql
  05_BREAKFAST_SEED.sql
  06_RLS_AND_HELPERS.sql
  07_VERIFY.sql

If you want the simplest route, run:
  00_MASTER_REBUILD.sql

The reset script preserves existing staff profile values when possible but DOES NOT
preserve breakfast bookings, submissions, menus, notes, or audit history.

Phone format:
- 6165551234
- (616) 555-1234
- 616-555-1234
- +16165551234
All are normalized to +16165551234 in staff_profiles.

Owner:
- An existing profile named "sarah" OR profile/auth email lacysa@mail.gvsu.edu
  is assigned to the Owner role.
- Existing manager/front_desk/kitchen/housekeeping/maintenance/laundry legacy roles
  are mapped into the new role table.
