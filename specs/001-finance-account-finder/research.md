# Research: Finance Account Finder

Market research brief (2026-09-30) summarized in the founder conversation; decisions below.

## Trump Account eligibility and claim
- **Decision**: $1,000 Treasury deposit for U.S.-citizen children with an SSN born 2025-01-01 → 2028-12-31; parent claims via IRS Form 4547 or trumpaccounts.gov. Family contributions up to $5,000/yr (employer up to $2,500 within that). Accounts opened for contributions July 4, 2026. Any child under 18 with an SSN can have an account; only the pilot cohort gets the $1,000.
- **Rationale**: OBBBA (signed 2025-07-04); Savingforcollege, Schwab, IRS Form 4547.
- **Watch**: Treasury proposed auto-enrollment (2026-09-29); copy keeps "claim" language and states it may change.

## 529 figures (2026)
- **Decision**: K-12 tuition withdrawals up to $20,000/yr from 2026; credentialing programs qualify; $35K lifetime 529→Roth rollover after 15 years; gift-tax annual exclusion $19,000/donor; 5-year superfunding $95,000.
- **Source**: Savingforcollege 529 rule changes; IRS.

## Recommendation rule
- **Decision**: Trump Account first if eligible; then 529 for Education / Not sure, custodial UGMA/UTMA for Anything. Max two.
- **Rationale**: "Not sure" → 529 because the parent keeps control and the Roth rollover lowers the "what if they don't go to college" risk. UGMA hands money to the child at majority, so it is only the default when the parent explicitly wants flexibility.
- **Alternatives**: HYSA as a default (rejected — no tax advantage; kept in list for short-term cash); ESA (rejected — $2K cap, income limits).

## Reminder timing
- **Decision**: Trump claim at ≥21 days old; 529 at ≥30 days; 529 at first birthday. Once per child per type, ever.
- **Rationale**: SSN cards typically arrive 2–6 weeks after birth registration; 30 days avoids stacking on the first weeks; first birthday is the most common gifting moment.

## Delivery channel
- **Decision**: Existing `check-notifications` cron → `notifications` table, new category `finance`. Email deferred.
- **Alternatives**: Resend email (deferred — adds template + unsubscribe surface for v1).

## Sponsor model
- **Decision**: `finance_account_sponsors` table, one active sponsor per account type, managed via Supabase dashboard. Outbound URL used verbatim; no identifiers appended. "Ad" label adjacent. Covered by Privacy § 6 and Terms § 4.
- **Compliance**: FTC Endorsement Guides — clear, conspicuous, adjacent disclosure; recommendations independent of sponsors (tested).

## Access
- **Decision**: owner or active `coparent` partner may read/write; caregiver/viewer no access. Matches `ROLE_COPY.caregiver` ("not finance").
