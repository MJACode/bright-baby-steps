# RECORDS_TAB_SPEC.md

> Product specification for the Records tab. This document reflects approved product decisions as of April 2026.

---

## Purpose

The Records tab is the **low-frequency, high-importance** quadrant of the app. Parents open it rarely, but when they do, the stakes are high — they're navigating insurance enrollment deadlines, preparing for a pediatrician visit, or locating a document they need urgently.

The design principle is **a trusted family records vault, not a daily tool.** It should feel like a well-organized filing cabinet, not a dashboard. Speed of access and confidence that data is safe and complete are the primary UX goals.

This tab is **free for all users.** It is a hook — parents who organize their child's record here are deeply retained and far more likely to convert on premium features like the flagging engine and EI pathway.

---

## Information Architecture

Records is organized into four sections. **No document or image storage anywhere in this tab — structured data fields only.**

```
Records
├── Medical
│   ├── Pediatrician visits
│   ├── Vaccinations
│   └── Dental
├── Insurance & Plans
│   ├── Health insurance
│   ├── Life insurance
│   └── College savings (529)
├── Legal Documents
│   └── Birth certificate (reference fields only — no image upload)
└── Early Intervention
    ├── EI referral status
    ├── IFSP tracker (no document upload)
    └── Provider contacts
```

---

## Section Specs

### 1. Medical

#### Pediatrician Visits

**What it stores:**

- Visit date
- Child's age at visit
- Visit type (well visit / sick visit / follow-up)
- Provider name and practice
- Notes (parent-entered)
- Next appointment date and reminder

**Key feature — well visit alignment:**
AAP Bright Futures well visit schedule maps directly to our milestone windows. The app should surface upcoming well visits and prompt parents to bring milestone flag summaries to those appointments. Suggested visit ages: 1, 2, 4, 6, 9, 12, 15, 18, 24, 30 months.

**Reminder logic:**

- Notify 2 weeks before upcoming appointment
- If a milestone flag exists, prompt: "You have a milestone flag for Oliver. Would you like to generate a summary to bring to this visit?"

**Note:** This is the most important cross-feature moment in the product — a milestone flag exists, a well visit is approaching, and the app bridges both. This connection should be treated as a priority design problem, not a nice-to-have.

#### Vaccinations

**What it stores:**

- Vaccine name
- Date administered
- Lot number (optional, useful for recall tracking)
- Administering provider
- Next due date

**CDC immunization schedule** for 0–36 months is the reference. App displays what's due at each age but does not give medical advice — display only, always recommend consulting pediatrician.

**Design note:** Vaccination records are sensitive in the current environment. We display the schedule neutrally. We do not editorialize, recommend, or take positions on vaccine policy. If parents decline a vaccine, they can mark it as declined without judgment. This is a tracking tool, not an advocacy tool.

#### Dental

**What it stores:**

- First dental visit date (AAP recommends first visit by age 1 or when first tooth erupts)
- Subsequent visit dates
- Provider name

**Reminder:** Flag if no dental visit logged by 12 months — "AAP recommends a first dental visit by your child's first birthday."

---

### 2. Insurance & Plans

#### Health Insurance

**What it stores:**

- Insurance carrier name
- Plan name and type (HMO / PPO / HDHP)
- Member ID
- Group number
- Primary care provider (in-network)
- Insurance card — front and back image (stored encrypted)
- Open enrollment dates with reminder
- Dependent addition confirmation date

**Critical UX moment — adding child to plan:**
Adding a newborn to a health insurance plan has a strict window — typically 30 days from birth. Missing this window means waiting for open enrollment. The app should:

1. At child creation, immediately prompt: "Have you added [child] to your health insurance plan?"
2. If no: display the 30-day window countdown with carrier contact information
3. If yes: capture confirmation date and store
4. Surface open enrollment dates annually with reminder 30 days prior

**What we store vs. what we don't:**
We store plan identifiers (text fields) to help parents find information quickly. No card images. We do not process claims, verify coverage, or connect to insurance APIs. This is a structured reference tool, not an insurance portal.

#### Life Insurance

**What it stores:**

- Policy type (term / whole / universal)
- Carrier
- Policy number
- Coverage amount
- Beneficiary designation — confirmation that child has been added
- Premium due dates and amounts
- Agent contact information

**Beneficiary checklist — the core value here:**
Most parents don't update beneficiaries after having a child. The app surfaces a simple checklist:

```
[ ] Added child as beneficiary on life insurance policy
[ ] Updated will or trust to include child
[ ] Designated guardian in will
[ ] Updated 401(k) / retirement account beneficiary
[ ] Updated any existing trusts
```

This is not financial advice. It is a checklist prompt to have conversations with the appropriate professionals. Every item links to a generic explainer of why it matters, not specific advice.

**Disclaimer to display in app:** "This checklist is a reminder tool only and does not constitute legal or financial advice. Consult an attorney and financial advisor to ensure your documents are properly executed."

#### College Savings (529)

**What it stores:**

- 529 plan state and plan name
- Account number (last 4 digits only)
- Beneficiary confirmation (child named)
- Contribution tracking — amount and date (manual entry)
- Running total of contributions logged in app

**What we don't store:** Full account numbers, investment details, or live balances. This is a contribution log and reminder tool, not a financial account aggregator.

**MA-specific note:** Massachusetts has the U.Fund College Investing Plan (managed by Fidelity). Surface as the default suggestion for MA families with a link to the MA state plan — not a recommendation, just a "here's the MA option" prompt.

---

### 3. Legal Documents

#### Birth Certificate

**No image upload.** Reference fields only — helps parents find their physical copy when needed.

**What it stores:**

- Child's full legal name (as on certificate)
- Date of birth
- Place of birth (city, state, country)
- Certificate number (optional, for reference)
- State issued (links to that state's vital records office for ordering certified copies)

**Copy to display in app:**

> "Certified copies of birth certificates must be requested from the vital records office in the state where your child was born. For Massachusetts: mass.gov/vital-records."

---

### 4. Early Intervention (EI) Records

This section is unique to our product and directly connected to our core mission. It gives parents a place to track the EI process — which is often confusing, slow, and poorly documented.

**What it stores:**

```
EI Process Tracker
├── Referral status
│   ├── Date of self-referral or physician referral
│   ├── Regional EI program contacted
│   ├── Intake appointment date
│   └── Status (referred / intake scheduled / evaluation scheduled / active / closed)
├── Evaluation
│   ├── Evaluation date
│   ├── Evaluating providers
│   ├── Domains evaluated
│   └── Eligibility determination (eligible / not eligible)
├── IFSP (Individualized Family Service Plan)
│   ├── IFSP start date
│   ├── Review dates (IFSPs are reviewed every 6 months)
│   ├── Goals (parent-entered summary)
│   ├── Services authorized (speech / OT / PT / developmental)
│   ├── Service frequency (e.g., speech 2x/week)
│   └── IFSP document upload (PDF)
└── Providers
    ├── EI service coordinator name and contact
    ├── EI therapists (name, discipline, contact)
    └── Notes
```

**Third birthday alert:**
If a child has active EI status and is approaching their third birthday, surface a prominent notification at 6 months, 3 months, and 1 month before the birthday:

> "Oliver's Early Intervention services end on [date] — his third birthday. Services through the school system (IDEA Part B) require a separate evaluation and transition process. Contact your EI service coordinator now to begin transition planning."

**IFSP document upload:** Not in scope. Structured fields only — goals, services, dates, provider contacts.

---

## Security

All data stored in Supabase with standard RLS. No document images, no uploads, no special encryption requirements beyond what the rest of the app already uses. Partner access follows the same `has_partner_access` policy pattern used throughout.

---

## What Records Is Not

- **Not a financial account aggregator** — no live balances or financial institution connections
- **Not a certified document provider** — stored documents are personal reference only
- **Not an insurance portal** — no coverage verification or claims processing
- **Not a legal document preparer** — the beneficiary checklist prompts action, not legal advice
- **Not a HIPAA covered entity** — handle sensitive data carefully but we are not subject to HIPAA today; architect as if we will be

---

*Last updated: April 2026*
*Owner: Product Lead*
