-- Keep an explicit cleared state, so a confirmed strip does not
-- reappear after a full clean or management cancellation.
ALTER TABLE public.housekeeping_daily_rooms
 DROP CONSTRAINT IF EXISTS housekeeping_daily_rooms_strip_status_check;
ALTER TABLE public.housekeeping_daily_rooms
 ADD CONSTRAINT housekeeping_daily_rooms_strip_status_check
 CHECK (strip_status = ANY (ARRAY['','needed','stripped','cleared']));
