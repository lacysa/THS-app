# THS Operations Hub v12.6

Aligned to the clean Supabase rebuild schema.

## Important authentication behavior

- Supabase Auth remains the source of truth for passwords.
- `staff_profiles.phone` is a login alias. The app resolves that profile to the linked `auth.users` account and authenticates against the existing Supabase email/password.
- Saving a phone number in Settings does **not** rewrite `auth.users.phone` and does not change the password.
- Saving a profile email does **not** rewrite the canonical Auth email. It is an editable contact/login alias.
- Password-reset email is sent to the canonical `auth.users.email`.

## Required Vercel variables

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (or legacy anon-key equivalent)
- `SUPABASE_SECRET_KEY` **or** `SUPABASE_SERVICE_ROLE_KEY`

The server-only secret/service-role key is required for phone alias login, guest breakfast writes, profile updates, module toggles, and admin lookups. Never expose it with a `NEXT_PUBLIC_` prefix.

## Breakfast date rules

- Guest menu/service date rolls to the next day at 6:00 AM America/Detroit.
- Kitchen and read-only default service date rolls to the next day at 10:30 AM America/Detroit.
- Once `menu_submitted` is true, the delivery-time screen no longer returns a menu link.

## Supabase SQL

The `supabase/` directory now contains the exact complete rebuild bundle used for this version.


v12.7 Fall Menu Fix
- Restores verified Fall 2026 menu seed and conditional/dietary rules.
- Single-select categories visually show one Selected choice.
- Hover no longer resembles selected state.
- Includes supabase/08_FALL_MENU_RESTORE.sql for existing deployments.


v12.9 Guest Menu Completion Fix
- No guest menu options are preselected.
- Guest 2 requires an explicit Add Breakfast or No Breakfast decision.
- Declined Guest 2 is saved with meal_declined=true and shown clearly in Kitchen/Overview.
- Required menu selections are validated before saving.
- Run supabase/09_GUEST2_DECLINE.sql before deploying this version.


v12.9.1 Build Fix
- Corrected malformed escaped use client directive in components/BreakfastMenu.tsx.
- Keeps v12.9 guest menu behavior unchanged.


v12.9.2 Build Fix
- Fixed malformed JSX in BreakfastOverview.tsx introduced by Guest 2 declined-breakfast rendering.
- Keeps no preselected guest menu options and explicit Guest 2 order/decline flow.
