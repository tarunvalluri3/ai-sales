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

## Instagram access per business (until Meta approves the app)

Instagram is on no plan yet (`lib/plans.ts`). A business may still use it when its **`businesses.instagram_enabled`** flag is on (migration `20261113000000`). Customers cannot change this flag -- it has no customer UPDATE grant and a restrictive INSERT policy forces it to `false` (pgTAP `065`) -- so it is set only with the service-role key, by these scripts. The connect route, OAuth callback, account chooser, webhook and every send check it on the server.

The scripts read `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SECRET_KEY` and `CLERK_SECRET_KEY` from `.env.local`, print the Supabase project they act on (and `(PRODUCTION)` when it is production), and never print a secret. "The business owned by an email" = the business of the Clerk organization that email's user is an `org:admin` of. If the email owns several, the script lists them and asks for `--org <clerk org id>`.

```bash
npm run instagram:enable  -- --email owner@example.com            # prints the business name and the new value
npm run instagram:disable -- --email owner@example.com
npm run instagram:enable  -- --email owner@example.com --org org_xxx   # when the email owns several businesses
```

**Meta App Review demo business.** Create the reviewer login by hand through the normal sign-up page (no account or password is ever stored in this repo), finish onboarding up to having a business, then:

```bash
npm run seed:review-demo -- --email reviewer@example.com
```

It turns `instagram_enabled` on and fills "Waves Demo Store": description, Asia/Kolkata timezone, Mon-Sat 10:00-19:00 hours, 3 products and 2 services priced in ₹, and 6 FAQs (pricing, delivery, timings, booking, refunds, contact). It only touches that one business and is safe to run again (rows are matched by name/question and updated, never duplicated). The knowledge documents are queued for ingestion (no Gemini call from the script); they are embedded on the daily cron, or straight away when any product/service/FAQ is saved in the dashboard (each save processes up to 5 queued documents). Then sign in as the reviewer and click **Publish** so the agent serves the new content.

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
