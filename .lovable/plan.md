

## Dashboard Redesign: Action-First for Busy Parents

### Current Layout (top to bottom)
1. Greeting + child info
2. Today's Briefing (dynamic tips)
3. Streak card with 2 quick-log buttons
4. 4 stat cards in a 2x2 grid (Sleep, Feeding, Diapers, Speech)
5. Children section
6. Floating Action Button (FAB)

### Problems
- The 4 stat cards take up the most space but provide the least urgency — parents can see these numbers on each tab
- Quick actions are buried in the streak card and behind the FAB
- The most actionable content (Briefing) is sandwiched between passive elements

### Proposed New Layout (top to bottom)

1. **Greeting + child info** (keep as-is)

2. **Quick Actions row** — 4 prominent, colorful pill buttons in a single row: Log Sleep, Log Feed, Log Diaper, Log Milestone. Each navigates directly to the respective tab. These replace the FAB as the primary logging entry point. Big touch targets, one-tap logging.

3. **Today's Briefing** (keep as-is, move up for prominence) — the smart, data-driven nudges are the most valuable "at a glance" content

4. **Compact Today Summary** — replace the 4 large stat cards with a single compact card showing a horizontal row of today's numbers: `🌙 2h  🍼 3  🧷 4  💬 2`. Each segment is still tappable to navigate to its tab. Takes 1/4 the vertical space.

5. **Streak card** (keep as-is, remove the duplicate quick-log buttons since we now have the top row)

6. **Children section** (keep as-is)

7. **FAB** (keep for convenience, but it's no longer the only way to quick-log)

### Technical Changes

**File: `src/pages/Dashboard.tsx`**
- Add a new Quick Actions row component with 4 horizontal pill buttons (Sleep, Feed, Diaper, Milestone) using the existing category colors
- Replace the 2x2 `summaryCards` grid with a single compact "Today" card containing an inline horizontal stat row — each stat is a small icon + number, tappable
- Remove the "+ Log Sleep" and "+ Log Feed" buttons from the streak card (now redundant)
- Reorder sections: greeting → quick actions → briefing → compact summary → streak → children
- All existing queries remain unchanged; just the rendering changes

**No new files, no database changes, no new dependencies.**

### Result
- Parent opens app → immediately sees 4 big "log" buttons
- Below that, smart tips tell them what needs attention
- Compact stats still visible but don't dominate
- Fewer taps to the most common action (logging)

