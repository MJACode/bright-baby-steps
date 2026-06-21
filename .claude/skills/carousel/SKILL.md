---
name: carousel
description: Generates a shareable family-update carousel for a child tracked in Grace Flare. Use when the parent says "make a carousel", "share this milestone", "weekly update for grandma", "build the baby book", or wants to turn tracked data (a milestone, a week of logs, the milestone timeline) into 3-10 audience-tuned slides. Three modes - moment, weekly, babybook. Returns slide-by-slide copy, a cover concept, and a suggested caption.
---

You build family-facing carousels from real Grace Flare data — milestones, daily logs, the briefing engine output. Always warm, factual, never medicalized. Three modes; the parent picks one.

# Modes

## `moment` — single milestone → 3-5 slides
Source: one `custom_milestones` row (the parent provides the id, the milestone name, or "the latest one"). Pull `name`, `category`, `achieved_at`, `caption`, `notes`, `confidence`, plus the child's `name` and `date_of_birth` from `children`. Compute child's age at achievement (months/weeks).

Slide template:
1. **Hook** — child name + the milestone in one line ("Maya rolled over today.")
2. **The moment** — when, where, how (use `caption` / `notes` if present)
3. **What it means** — one-sentence age-appropriate context for this category (motor / language / social / cognitive / feeding)
4. **What's next** — the typical next milestone in the same category
5. **CTA slide** — audience-tuned (see Audience below)

## `weekly` — last 7 days of logs → 5-8 slides
Source: pull the same shape as `supabase/functions/briefing/index.ts` — sleep totals, feed counts, diaper counts, any new `custom_milestones` in the window, illness flags. Default window is the last 7 days; the parent can override.

Slide template:
1. **Hook** — "This week with [name]" + the standout stat
2. **Sleep** — total hours, longest stretch, nap count
3. **Feeds** — count, type breakdown (breast / bottle / solids), notable reactions
4. **Diapers** — count, anything notable (illness flag)
5. **Milestones** — any new `custom_milestones` rows this week (skip if none)
6. **Looking ahead** — next pediatric appointment from `children.next_appointment`
7. **CTA slide** — audience-tuned

## `babybook` — milestone timeline → one slide per milestone
Source: all `custom_milestones` for the child, ordered by `achieved_at`, grouped by age bucket: newborn (0-4w), 0-3mo, 3-6mo, 6-9mo, 9-12mo, 1y+. Use `due_date` instead of `date_of_birth` to compute corrected age if `is_premature` is true.

Slide template:
- **Cover** — child name + "[Name]'s First [N] Months"
- **Section divider** for each non-empty age bucket
- **One slide per milestone** in the bucket: name, age at achievement, one sentence from `caption` or `notes`
- **Closing CTA** — audience-tuned

# Audience

Always ask (or accept from `args`) who the carousel is for. The CTA slide and tone shift:

- **partner / coparent** — direct, no caption padding, suggest saving to `caregiver_notes` or starting a chat
- **grandparent / family viewer** — warmer, explain context terms ("rolling over = a motor milestone, usually around 4 months"), CTA = "ask Grandma to call"
- **social** — tightest copy, no medical claims, no health data (skip illness/weight/feeding details), CTA = save / comment / share
- **baby book** — no CTA needed; closing is just a date stamp

# Method

1. Confirm mode (`moment` / `weekly` / `babybook`) and audience. If unclear, ask one short question.
2. Pull the data. Surface the actual query you'd run against Supabase (table + columns + filter), so the parent can verify it matches the right child. Do not invent rows.
3. Write the slides per the template above. One idea per slide, max two sentences.
4. Pick a cover concept in one sentence (visual idea, not copy).
5. Write a 2-3 sentence caption with 3-5 hashtags only if audience is `social`.

# Output format

```
## Mode
<moment | weekly | babybook>

## Audience
<partner | grandparent | social | baby book>

## Data pulled
<one line: table(s), filter, row count>

## Cover concept
<one sentence>

## Slides
1. <hook>
2. ...
N. <CTA or closing>

## Caption
<only if audience = social, otherwise omit>
```

# Rules

- **Never** include weight, illness, medication, or anything that could be construed as medical advice in `social` mode. Those stay in `partner` / `grandparent` / `babybook` modes only.
- If the child has `archived_at` set, refuse and tell the parent the profile is archived.
- If the parent asks for a milestone the child hasn't hit, do not fabricate one — say so and offer the `drill` skill instead.
- Use the child's actual `name` from `children.name`, not a placeholder.
- For premature babies (`is_premature = true`), compute age from `due_date`, not `date_of_birth`, and note "(corrected age)" on the relevant slide.
