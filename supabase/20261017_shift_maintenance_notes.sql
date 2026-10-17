-- Add a per-staff maintenance section to existing shift report notes; leave all saved notes intact.
ALTER TABLE public.shift_report_notes DROP CONSTRAINT IF EXISTS shift_report_notes_section_check;
ALTER TABLE public.shift_report_notes ADD CONSTRAINT shift_report_notes_section_check CHECK (section IN ('guest','staff','supplies','tomorrow','general','maintenance','management'));
