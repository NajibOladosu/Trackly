# ApplyOS

ApplyOS is an AI-assisted job and scholarship application manager. It combines a Next.js application, Supabase, Google Gemini, and Resend to help users organise applications, analyse resumes, prepare for interviews, and generate tailored application materials.

## What it does

- Track applications, deadlines, priorities, status history, documents, and rich notes.
- Upload PDF, DOCX, text, and JSON documents for extraction and AI analysis.
- Create tailored cover letters, extract application questions, and generate grounded answers.
- Run the Apply Kit: parse a job posting, analyse resume compatibility, and create application materials in one flow.
- Edit resumes with templates, AI rewrite support, document settings, version history, and PDF/DOCX export.
- Practise text, voice, resume-grill, company-prep, and conversational interviews with feedback and reports.
- View application metrics, conversion funnels, timelines, and status-flow visualisations.
- Receive welcome, status, deadline, and weekly-digest emails through Resend.
- Publish MDX blog posts via `blog.applyos.io` subdomain routing and an automated PR workflow.

## Stack

| Area | Technology |
| --- | --- |
| Application | Next.js 16 App Router, React 19, TypeScript |
| UI | Tailwind CSS, Radix UI, TipTap, Framer Motion, React Three Fiber |
| Data and auth | Supabase PostgreSQL, Auth, Storage, Row Level Security |
| AI | Google Gemini with model fallback, telemetry, and retry support |
| Email | Resend and React Email |
| Testing | Vitest, Testing Library, Playwright |
| Deployment | Vercel |

## Repository map

```text
app/                     App Router pages and API route handlers
modules/                 Domain modules: applications, documents, interviews, notes, analytics
shared/                  Supabase clients, AI and email infrastructure, shared UI primitives
lib/                     Security, validation, parsing, editor, blog, and rate-limit utilities
supabase/migrations/     PostgreSQL schema, RLS, triggers, and security migrations
content/blog/            MDX blog posts
extension/               Browser-extension project
tests/                   Unit, integration, and end-to-end tests
```

The root layout provides authentication, theme, toast, and analytics providers. `proxy.ts` applies Supabase session refresh, route protection, CSP nonces, CORS allowlisting, security headers, and blog-subdomain routing.

## Prerequisites

- Node.js 24 LTS recommended
- npm 10+
- A Supabase project
- A Gemini API key for AI-powered workflows
- A Resend account and verified domain for email features

## Get started

```bash
git clone git@github.com:NajibOladosu/ApplyOS.git
cd ApplyOS
npm ci
cp .env.example .env.local
npm run dev
```

The development server runs at [http://localhost:3000](http://localhost:3000).

Populate `.env.local` from [`.env.example`](.env.example). Required values are:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
GEMINI_API_KEY=
```

For email, cron jobs, server-side administration, and unsubscribe links, also configure `RESEND_API_KEY`, `RESEND_DOMAIN`, `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY`, and `UNSUBSCRIBE_SIGNING_SECRET` as applicable. Never expose server-only credentials in the browser.

## Database and storage

Apply the SQL files in `supabase/migrations/` to the target Supabase project before using protected product flows. The migrations create the core application and document tables, interview tables, resume versions, analytics support, RLS policies, storage policies, and security fixes.

Important:

- Review the migrations in commit order or your team's migration ledger before applying them. There are historical duplicate numeric prefixes, so filename sorting alone is not a safe deployment plan.
- Create a private `documents` storage bucket before uploading documents.
- Apply the RLS and function-security migrations before exposing the project publicly.

## Development commands

```bash
npm run dev                 # Start Next.js in development mode
npm run build               # Create a production build
npm start                   # Serve the production build
npm run lint                # Run ESLint
npm run test                # Run unit tests
npm run test:integration    # Run integration tests (requires test Supabase secrets)
npm run test:e2e            # Run Playwright tests (requires test Supabase secrets)
npm run test:all            # Run all test tiers
```

Integration and end-to-end tests require isolated Supabase credentials. See [tests/README.md](tests/README.md) and [docs/TESTING.md](docs/TESTING.md) before running them against any shared environment.

## Key HTTP surfaces

- `POST /api/documents/upload` and `POST /api/documents/reprocess` manage extraction and AI analysis.
- `POST /api/apply-kit/parse` parses a URL or pasted job description; it is SSRF guarded.
- `POST /api/cover-letter/generate` and the question routes generate application materials.
- `POST /api/interview/*` creates, conducts, scores, and reports interview sessions.
- `GET /api/analytics/*` supplies application metrics and status-flow data.
- `POST /api/cron/*` runs authenticated scheduled maintenance, deadline, digest, and AI-retry tasks.

Route handlers should authenticate users, rate limit sensitive operations, validate input, and return safe error responses. Use the existing domain services and validation helpers instead of duplicating data-access logic.

## Security model

- Supabase Row Level Security isolates user-owned data and storage objects.
- `proxy.ts` provides authentication gates, session handling, a per-request CSP nonce, CORS allowlisting, HSTS in production, and protective response headers.
- Sensitive endpoints use route-level rate limiting. With `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`, the limiter uses Upstash; otherwise it falls back safely to in-memory limiting. See [TODO_UPSTASH_UPGRADE.md](TODO_UPSTASH_UPGRADE.md).
- Cron handlers require `CRON_SECRET`.
- User-supplied URLs are validated before server-side retrieval.

## Email and scheduled jobs

Email delivery uses Resend, not SMTP or an in-app queue. Sender addresses are configured from the verified `RESEND_DOMAIN`; templates live in `shared/infrastructure/email/templates/`.

Available cron handlers include deadline reminders, weekly digests, old-notification cleanup, and retrying queued AI work. Configure the schedules and secrets in the deployment environment before enabling them.

## Blog automation

The blog is rendered from `content/blog/*.mdx`. Requests to `blog.applyos.io` are rewritten internally to the blog routes. [`.github/workflows/blog-autopost.yml`](.github/workflows/blog-autopost.yml) generates new posts on a scheduled run, opens a pull request, and enables auto-merge.

## Deployment

Deploy as a Next.js project on Vercel. Set the production environment variables from `.env.example`, ensure the Supabase migrations and private bucket are ready, verify the Resend domain, configure cron authentication, and run the test suite before release.

The project configuration is in [`vercel.json`](vercel.json). For a deployment checklist, start with [`.env.example`](.env.example), [CRON_JOB_SETUP.md](CRON_JOB_SETUP.md), and [EMAIL_SETUP.md](EMAIL_SETUP.md).

## Contributing

1. Branch from current `main`.
2. Keep route handlers authenticated, validated, and covered by appropriate tests.
3. Run `npm run lint` and the relevant test tier before opening a pull request.
4. Do not commit environment files, service keys, or generated build artifacts.

## License

MIT. See [LICENSE](LICENSE).
