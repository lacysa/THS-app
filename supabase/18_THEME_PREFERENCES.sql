alter table public.staff_profiles
  drop constraint if exists staff_profiles_theme_preference_check;

alter table public.staff_profiles
  add constraint staff_profiles_theme_preference_check
  check (
    theme_preference = any (
      array[
        'light'::text,
        'blue'::text,
        'sage'::text,
        'violet'::text,
        'dark'::text
      ]
    )
  );
