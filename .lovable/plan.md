
## Plan: LeetCode Tracker — Foundation (Auth + Schema)

### 1. Enable Lovable Cloud
Provision the backend so we have a database, auth, and server runtime ready.

### 2. Database schema (one migration)

Create four tables with the exact names/columns specified, plus required GRANTs and RLS.

**`profiles`**
- `id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`
- `username text UNIQUE NOT NULL`
- `display_name text`
- `created_at timestamptz DEFAULT now()`

**`problems`**
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- `lc_url text`, `lc_slug text`, `title text`, `lc_difficulty text`
- `topic_tags text[]`
- `box_level integer NOT NULL DEFAULT 1`
- `last_solved_at date`, `next_due date`
- `created_at timestamptz DEFAULT now()`

**`solves`**
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- `problem_id uuid NOT NULL REFERENCES public.problems(id) ON DELETE CASCADE`
- `rating integer NOT NULL CHECK (rating BETWEEN 1 AND 5)`
- `solved_at date NOT NULL`
- `created_at timestamptz DEFAULT now()`

**`friendships`**
- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()`
- `requester_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- `addressee_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE`
- `status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted'))`
- `created_at timestamptz DEFAULT now()`
- `UNIQUE (requester_id, addressee_id)`

**GRANTs (per table):**
- `authenticated`: SELECT/INSERT/UPDATE/DELETE on all four
- `service_role`: ALL on all four
- `anon`: none (auth-only app)

**RLS policies:**
- `profiles`: SELECT to any authenticated user; INSERT/UPDATE restricted to `auth.uid() = id`
- `problems`: all actions require `auth.uid() = user_id`
- `solves`: all actions require `auth.uid() = user_id`
- `friendships`: SELECT/DELETE allowed if `auth.uid() IN (requester_id, addressee_id)`; INSERT requires `auth.uid() = requester_id`; UPDATE (accept/decline) restricted to `auth.uid() = addressee_id`

**Auto-profile trigger:**
A `handle_new_user()` SECURITY DEFINER function reads `username` and `display_name` from `auth.users.raw_user_meta_data` and inserts a `profiles` row. Wired to `AFTER INSERT ON auth.users`.

### 3. Frontend

- **`/auth`** (public): tabbed Login / Sign up form. Sign up collects email, password, and username; checks username uniqueness against `profiles` before submitting; passes `username` in `options.data` so the trigger uses it; uses `emailRedirectTo: window.location.origin`.
- **`_authenticated` layout**: integration-managed gate (redirects to `/auth` if unauthenticated).
- **`/` (home)**: moved under `_authenticated`. Fetches the user's `profiles` row and renders "Welcome, {username}" plus a Sign out button. Nothing else.
- Wire `onAuthStateChange` once in `__root.tsx` to invalidate the router on sign in/out.
- Mobile-first styling with existing Tailwind tokens; no hardcoded colors.

### 4. Out of scope (per request)
No logging form, no review schedule, no streaks, no history, no friends UI, no spaced-repetition logic.

### Notes
- Email confirmations: I'll disable "Confirm email" in auth settings so users can log in immediately after signup (matches the described outcome). Say the word if you'd rather keep email confirmation on.
- Username uniqueness is enforced both by the DB unique constraint and a pre-submit check for a nicer error message.
