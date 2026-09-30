# Data Model: Finance Account Finder

`account_key` enum (text + CHECK): `trump`, `529`, `ugma_utma`, `hysa`, `esa`, `custodial_roth`.

## child_finance_finder
One row per child — the last finder answers.

| Column | Type | Notes |
|---|---|---|
| child_id | uuid PK, FK children(id) ON DELETE CASCADE | |
| goal | text NOT NULL CHECK in ('education','anything','not_sure') | |
| family_contributes | boolean NOT NULL | |
| updated_by | uuid NOT NULL DEFAULT auth.uid() | |
| updated_at | timestamptz NOT NULL DEFAULT now() | |

## child_account_status
One row per child per account the parent marked opened. Undo = delete row.

| Column | Type | Notes |
|---|---|---|
| child_id | uuid FK children(id) ON DELETE CASCADE | |
| account_key | text CHECK in account_key set | |
| opened_at | timestamptz NOT NULL DEFAULT now() | |
| marked_by | uuid NOT NULL DEFAULT auth.uid() | |
| PK | (child_id, account_key) | |

## finance_account_sponsors
Not child data. One active sponsor per account type.

| Column | Type | Notes |
|---|---|---|
| id | uuid PK | |
| account_key | text CHECK in account_key set | |
| firm_name | text NOT NULL | |
| cta_label | text NOT NULL | e.g. "Open with Acme" |
| cta_url | text NOT NULL CHECK (cta_url ~ '^https://') | used verbatim |
| disclosure | text | optional extra disclosure line |
| is_active | boolean NOT NULL DEFAULT false | |
| unique | partial unique index on (account_key) WHERE is_active | |

## Access (RLS)
- New helper `public.can_manage_child_finance(p_child_id uuid)` SECURITY DEFINER, stable: true if `auth.uid()` owns the child OR has an `active` `partner_access` row with role `coparent` for the child's owner.
- `child_finance_finder`, `child_account_status`: SELECT/INSERT/UPDATE/DELETE using the helper.
- `finance_account_sponsors`: SELECT for `authenticated` where `is_active`; no client writes.
- Deletion: both child tables cascade from `children`, so `_purge_user_data` and `delete_user_account` need no change.

## Notifications
New types in `check-notifications`, category `finance`, cap priority 2:
- `finance_trump_claim` — child DOB in [2025-01-01, 2028-12-31], not expected, age ≥ 21 days, no `trump` status row.
- `finance_529_newborn` — not expected, age ≥ 30 days and < 1 year, no `529` status row.
- `finance_529_birthday` — age ≥ 1 year and < 1 year + 30 days, no `529` status row.
Recipient: child owner only. Dedupe: skip if any `notifications` row exists for (child_id, type), ever. Skip archived children.
