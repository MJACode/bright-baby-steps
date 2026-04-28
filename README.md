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

## Deployment

Push to `main` — GitHub Actions handles deploying Supabase edge functions automatically. The frontend is a standard Vite SPA (`npm run build` → `dist/`); host it wherever you prefer.

When configuring Supabase Auth → URL Configuration for your chosen host, set the **Site URL** to your production origin and add `http://localhost:8080/**` (plus your host's preview-URL pattern) to **Additional redirect URLs** so email confirmation and password reset links work.
