This is a classroom form builder built with [Next.js](https://nextjs.org), designed for a Supabase backend and Vercel hosting. It uses **Supabase Auth** (email + password) with **Row Level Security** so each request runs as the signed-in user.

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

   If you already applied an older schema, run the migration in `supabase/migrations/` instead (see file header comments).

4) In Supabase **Authentication → Providers**, ensure **Email** is enabled. If **Confirm email** is on, users must verify before `signInWithPassword` works.

5) Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser. Use **Register** to create a teacher or student account, then **Log in**.

## Supabase + Vercel Deployment

1) Push this repo to GitHub.

2) Import it in [Vercel](https://vercel.com/new).

3) In Vercel project settings, add the same environment variables as `.env.local`:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

4) Redeploy.

The app uses Next.js API routes (`app/api/**`) with cookie-based sessions and persists:

- forms (owned by the creating teacher)
- questions (multiple choice + text)
- student responses (one row per form per signed-in student)

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
