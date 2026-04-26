This is a classroom form builder built with [Next.js](https://nextjs.org), designed for a Supabase backend and Vercel hosting.

- **Teachers** sign up and sign in with email and password (Supabase Auth + RLS for forms and questions).
- **Students** use the site **without logging in**. Their answers are stored per browser using an anonymous session id. Public form listing uses the **anon** key with RLS; anonymous response read/write uses **SECURITY DEFINER RPCs** (`get_anonymous_form_response` / `save_anonymous_form_response`) so you do **not** need the service role key in this app.

## Getting Started

1) Install dependencies:

```bash
npm install
```

2) Create environment variables:

```bash
cp .env.example .env.local
```

Set values for:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

3) In the Supabase SQL editor, run `supabase/schema.sql` (full schema for a new project).

   If you use **migrations** instead of `schema.sql`, run them in **filename order**. The auth migration (`20260418120000_...`) expects `forms` / `questions` / `form_responses` to exist already—create them with `20260418100000_base_forms_questions_responses.sql` first. The anonymous RPCs live in `20260420120000_anonymous_response_rpc.sql`.

4) In Supabase **Authentication → Providers**, ensure **Email** is enabled.

5) **Email confirmation links** must redirect through this app so the auth code can be exchanged for a session:

   - In **Authentication → URL Configuration**, set **Site URL** to your app root (e.g. `http://localhost:3000`).
   - Under **Redirect URLs**, add:
     - `http://localhost:3000/auth/callback`
     - `https://<your-production-domain>/auth/callback`

   The route `app/auth/callback/route.ts` calls `exchangeCodeForSession` and then sends the user home. If the link points only at `/` without going through `/auth/callback`, confirmation may fail or you may see `otp_expired` / `access_denied` after the link is reused or expires.

6) Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Students can answer forms immediately. Teachers use **Teacher register** / **Teacher log in** (password rules apply on registration).

## Supabase + Vercel Deployment

1) Push this repo to GitHub.

2) Import it in [Vercel](https://vercel.com/new).

3) In Vercel project settings, add the same environment variables as `.env.local` (URL + anon key only).

4) Add the same **`/auth/callback`** redirect URLs for your production domain in the Supabase dashboard.

5) Redeploy.

The app uses Next.js API routes with cookie-based sessions for teachers and persists:

- forms (owned by the creating teacher)
- questions (multiple choice + text)
- student responses (one row per form per anonymous browser session via RPC, or per signed-in user on the authenticated responses API)

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
