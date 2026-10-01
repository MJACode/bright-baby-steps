# Counsel brief: Finance Account Finder + sponsored links

**From:** Grace Flare LLC (Delaware) · **Date:** 2026-09-30 · **Contact:** legal@graceflare.com
**Ask:** a written yes/no opinion on the questions below before we activate any paid placement. Expertise needed: U.S. securities regulation (Advisers Act, Exchange Act, MSRB), FTC advertising, COPPA. Delaware governing law; California admission helpful.

## What the product does

Grace Flare is a U.S.-only iOS app for parents of children 0–3. Its Finance section (shipped 2026-09-30) has:

1. **Account finder.** Two taps: "What's the money for?" (Education / Anything / Not sure yet) and "Will family chip in?" (Yes / No). Combined with the child's birth date (or due date), a fixed rule shows one or two **account types** to look into:
   - Born 2025-01-01 – 2028-12-31 → Trump Account first (may qualify for the $1,000 Treasury deposit).
   - Education / Not sure → 529. Anything → custodial UGMA/UTMA. Maximum two.
   - The rule has no inputs for income, tax bracket, state, risk tolerance, holdings, or amounts. It never names a plan, fund, firm, or security. Copy says "Accounts to look into", "Based only on your child's birthday and your two answers, not your income, taxes or state", and "Educational, not financial or tax advice".
2. **Account list.** Six account types (Trump Account, 529, custodial UGMA/UTMA, high-yield savings, Coverdell ESA, custodial Roth IRA) with plain-language explainers, 2026 federal figures, and neutral "How to open" links (IRS, collegesavings.org, FINRA, FDIC).
3. **Sponsored "Open with [Firm]" buttons (not yet active).** At most one per account type, shown **only in the general account list** (identical for every parent), **never** on finder results and **never** on the Trump Account (enforced in the database). Each has an adjacent "Ad" label and a fixed disclosure: *"Paid ad from [Firm]. Grace Flare is paid for this placement and hasn't reviewed [Firm] or its products. Investing involves risk, including possible loss of money. Ads never change which accounts we suggest."* The outbound link is the sponsor's URL verbatim; we send no user, child, or device identifier. The neutral "How to open" link always shows alongside.
4. **Intended compensation:** flat fee or unattributed cost-per-click only. No per-account-opened, per-funded-account, or asset-based pay. No conversion postbacks.

Supporting material: Privacy Policy § 6 and Terms § 4 (as of 2026-09-30), `docs/legal-review-log.md` entries 2026-06-20 and 2026-09-30, spec `specs/001-finance-account-finder/`.

## Questions (yes/no per regime, with any required changes)

1. **Investment adviser (Advisers Act § 202(a)(11); *Lowe v. SEC*).** With the finder framed as above, sponsors excluded from finder results, and flat-fee/CPC compensation, is Grace Flare outside the investment-adviser definition (or within the publisher's exclusion)? Any state-law adviser registration concern?
2. **Broker (Exchange Act § 15(a)).** Does flat-fee/CPC paid placement for broker-dealers, RIAs, 529 program managers, or banks/fintechs create unregistered-broker risk? Which compensation structures must we refuse?
3. **Sponsor-side regimes.** Would any duty fall on us (rather than the sponsor) under the SEC Marketing Rule (17 CFR § 275.206(4)-1, "promoter"), FINRA Rule 2210, MSRB Rule G-21 (529 advertising legends, in-state tax-benefit statement), or 12 CFR Part 328 (FDIC misrepresentation, for non-bank fintechs)? Please supply a sponsor addendum template (advertiser warrants compliance-approved copy and landing pages; required legends appended to our disclosure).
4. **Trump Account copy.** Is our description accurate as of launch (Form 4547 / trumpaccounts.gov election, U.S.-citizen + SSN conditions, 2025–2028 births, $5,000/yr family cap with $2,500 employer portion per employee, proposed auto-enrollment of 2026-09-29)? Is barring paid placement on that card sufficient under the FTC Impersonation Rule (16 CFR Part 461)?
5. **COPPA (16 CFR § 312.4, § 312.5(a)(1)).** Is storing finder answers and "opened" status per child, plus date-of-birth-timed in-app reminders about opening accounts, a material change requiring renewed notice or consent from parents who consented before 2026-09-30? If not, confirm our rationale (parent-initiated, not disclosed to third parties, mutable, never used to select or target ads).
6. **FTC disclosure.** Does the ad label + disclosure placement meet the Endorsement Guides (16 CFR Part 255) and .com Disclosures standards?

## Gate

No `finance_account_sponsors` row may be set `is_active = true` until counsel signs off on 1–3 and 6. The database table carries this rule as a comment; the log records it.
