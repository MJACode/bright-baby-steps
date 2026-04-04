

## Analysis: Pediatrician Report & Reminders UX

### Current Pain Points

1. **Reminders are in localStorage** -- they don't sync across devices and are lost if the parent clears browser data. For something as important as "ask doctor about rash," this is risky.

2. **Too many choices upfront** -- The export form shows date pickers, 6 section checkboxes, and a child selector all at once. A busy parent just wants to tap "Generate Report" before a visit. The cognitive load is high for a feature used maybe once a month.

3. **Buried in Profile** -- The report and reminders live behind a collapsible inside the Profile page. A parent prepping for a doctor visit has to navigate to Profile, scroll past account info, write reminders, then expand and configure the report. It's not discoverable.

4. **Duplicated logic** -- Quick Export and the full PediatricianExport component have nearly identical Supabase queries (100+ lines each). ExportHistory has a third copy. This is fragile.

5. **Reminders disconnected from export** -- The checkbox "include in report" concept is clever, but the visual separation between the reminders card and the export card (which is collapsed) makes the connection unclear.

6. **No appointment awareness** -- There's no concept of "next pediatrician visit date." Smart defaults like "generate report since last visit" or a reminder notification before an appointment are missing.

### Proposed Redesign

#### 1. Move reminders to Supabase (persistent, synced)
- Create a `pediatrician_reminders` table (id, child_id, parent_id, text, include_in_report, created_at)
- Reminders survive device switches and browser clears

#### 2. Create a dedicated "Visit Prep" card on the home dashboard
- A small card that says "Next Visit" with a date (optional, stored per child) and a count of reminders
- Tapping it opens a focused "Visit Prep" sheet/page
- This makes the feature discoverable from the main screen

#### 3. Simplify the export into a wizard-style flow
Instead of showing everything at once, use a two-step approach:
- **Step 1**: "Since Last Visit" (smart default) or "Custom Range" toggle. Show reminders inline with checkboxes. One-tap "Generate PDF."
- **Step 2** (optional): Expand to pick specific sections. Default: all sections selected.
- This reduces the default view to just a date toggle + generate button.

#### 4. Add a "next appointment" date field per child
- Add `next_appointment` column to the `children` table
- When set, the briefing on the home screen can say "Dr visit in 3 days -- tap to prep"
- The export date range auto-defaults to "since last export" or "since last visit"

#### 5. Consolidate the query logic
- Extract a single `fetchReportData(childId, from, to, sections)` service function
- Used by Quick Export, Custom Export, and Re-download -- no duplication

### Files to Change

**Database migration:**
- Add `pediatrician_reminders` table
- Add `next_appointment` date column to `children`

**New file: `src/services/reportDataService.ts`**
- Shared `fetchReportData()` function used by all export paths

**New file: `src/components/VisitPrepCard.tsx`**
- Home dashboard card showing next appointment + reminder count
- Opens the visit prep flow

**Refactor: `src/components/PediatricianExport.tsx`**
- Simplify to two-step wizard: smart date default + optional section picker
- Inline reminders with checkboxes
- Use shared `fetchReportData()`

**Edit: `src/pages/dashboard/ProfilePage.tsx`**
- Remove localStorage reminders (replaced by Supabase)
- Keep the collapsible report section but simplify it
- Add "next appointment" date picker near child info

**Edit: `src/components/ExportHistory.tsx`**
- Use shared `fetchReportData()` for re-download

**Edit: `src/pages/Dashboard.tsx`**
- Add `VisitPrepCard` to the home screen (below quick actions)

**Edit: `src/components/TodaysBriefing.tsx`**
- Add "upcoming appointment" tip when next_appointment is within 3 days

