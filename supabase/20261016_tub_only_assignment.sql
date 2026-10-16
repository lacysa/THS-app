-- Tub cleaning is an independently assigned service, not a full-room clean.
-- Existing work, room status, inspection, and completion history remain unchanged.
ALTER TABLE public.room_ops_details
  ADD COLUMN IF NOT EXISTS tub_clean_assigned_to text NOT NULL DEFAULT '';
COMMENT ON COLUMN public.room_ops_details.tub_clean_assigned_to IS
  'Independent tub-only cleaning assignment; does not alter housekeeping_daily_rooms.assigned_to';
