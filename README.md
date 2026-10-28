This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Platform admin panel (`/apache`)

Internal, platform-owner-only tooling (Phase 33, `docs/phases.md`) -- never reachable by a tenant. A non-admin or logged-out visitor always gets a bare 404.

**Seeding the first admin** is deliberately a separate, manual SQL step -- never a literal value baked into a migration, which would hand anyone who can read this repo's history a hardcoded admin identity. After `20261102000000_create_platform_admins.sql` has been applied, run (Supabase SQL editor or `psql`), with your own real Clerk `user_id` (found in the Clerk Dashboard under Users, format `user_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`):

```sql
insert into public.platform_admins (user_id, role)
values ('user_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'owner');
```

**MFA is required.** `/apache` additionally requires the signed-in Clerk session to have completed a second factor within the last 60 minutes (re-checked at 5 minutes before any destructive action) -- enroll TOTP/SMS MFA on the admin's own Clerk account first, or every request will 404 even with a `platform_admins` row.

No new environment variables -- `/apache` reuses `SUPABASE_SECRET_KEY` (already required) through its own dedicated service-role client, `lib/supabase/admin.ts`.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
