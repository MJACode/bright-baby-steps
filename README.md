# Baby Steps — Parenting & Baby Tracker

A smart baby tracking app for new parents. Log sleep, feeding, diapers, and milestones, and get AI-powered insights from specialized parenting experts.

## Tech Stack

- **Frontend**: React 18 + TypeScript + Vite
- **UI**: shadcn/ui + Tailwind CSS
- **Backend**: Supabase (Postgres, Auth, Storage, Edge Functions)
- **AI**: Anthropic Claude API (claude-haiku-4-5) via Supabase Edge Functions
- **State**: TanStack React Query
- **Routing**: React Router v6

## AI Features

The app includes 8 specialized AI skills powered by Claude:

- **General** — Parenting Q&A
- **Pediatrician** — Health, vaccines, illness guidance
- **Sleep** — Sleep schedules, training, regressions
- **Nutrition** — Feeding, solids, allergen introduction
- **Developmental** — Motor, sensory, cognitive milestones
- **Speech (SLP)** — Language development tracking
- **Financial** — 529s, tax credits, childcare budgeting
- **Onboarding** — Conversational child profile setup

## Local Development

```sh
# Clone the repo
git clone <YOUR_GIT_URL>
cd bright-baby-steps

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Fill in your Supabase URL and anon key

# Start the dev server
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |

## Supabase Edge Functions

The AI features run as Supabase Edge Functions. They require the following secret set in your Supabase project:

| Secret | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic API key from console.anthropic.com |

Edge functions are automatically deployed to Supabase via GitHub Actions on every push to `main` that touches `supabase/functions/`.

## Prototyping on Vercel

Vercel is the fastest way to get a shareable preview URL for testing or sharing with stakeholders.

### 1. Import the project

1. Go to [vercel.com/new](https://vercel.com/new) and import your Git repository.
2. Vercel auto-detects Vite. Keep the defaults:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`

### 2. Add environment variables

In the Vercel project → **Settings → Environment Variables**, add:

| Variable | Value |
|---|---|
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase anon/publishable key |

Set these for **Production**, **Preview**, and **Development** environments.

### 3. Configure Supabase Auth redirect URLs

Supabase needs to know which origins are allowed to redirect after auth flows (email confirmation, password reset).

In your Supabase project → **Authentication → URL Configuration**:

- **Site URL**: set to your Vercel production URL (e.g. `https://your-app.vercel.app`)
- **Additional redirect URLs**: add the following to cover preview deployments:
  ```
  https://*.vercel.app/**
  http://localhost:8080/**
  ```

Without this step, email confirmation links and password reset links will be blocked by Supabase.

### 4. Deploy

Push to your branch — Vercel builds automatically. Each branch gets its own preview URL. Production deploys on push to `main`.

The `vercel.json` at the repo root configures SPA routing so that deep links (e.g. `/dashboard`, `/reset-password`) work correctly on Vercel.

---

## Deployment

Push to `main` — GitHub Actions handles deploying edge functions automatically. The frontend is served by Vercel (see above).
