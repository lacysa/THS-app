THS Operations MVP

1. Run Supabase SQL:
   supabase/10_OPERATIONS_MVP.sql

2. Deploy this project to the existing Vercel project.

3. Housekeeping is available at /housekeeping
   - all 17 active rooms
   - Status / Out-Refresh / Strip-Hold / Staff / Order / Complete / RF / Room condition / Next shift / Notes
   - Next-shift condition carries into the next day's room condition when that day has no saved row yet.

4. Maintenance is available at /maintenance
   - room or common-area tickets
   - Normal / High / Urgent
   - Open / In Progress / Waiting / Complete
   - assignment + notes

5. Theme behavior is restored:
   - Light = warm white / charcoal
   - Blue = blue-gray workspace
   - Dark = dark surfaces / light text
   The Settings theme selector updates the current page immediately and saves to staff_profiles.theme_preference.
