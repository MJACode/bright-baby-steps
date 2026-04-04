

## Add Home Tab + Merge Finance into Milestones

### What changes

**Bottom tab bar**: Replace the 5-tab layout (Sleep · Food · Diapers · Milestones · Finance) with a new 5-tab layout: **Sleep · Food · Home · Diapers · Milestones**. Home sits in the center with a distinct `Home` icon, making it immediately discoverable.

**Finance merged into Milestones**: The Milestones page gets a tab switcher (like the Feeding page has for Feed/Supplements/Allergens). Two tabs: "Development" (current milestones content) and "Financial" (current FinancialPage content, embedded directly). This keeps Finance accessible without occupying a bottom tab slot.

**Header cleanup**: Remove the Home icon button from the top header bar since it's now redundant — Home is always one tap away in the bottom bar.

**Route redirect**: Keep `/dashboard/financial` as a route but redirect it to `/dashboard/milestones` (with a query param or state to auto-select the Financial tab) so any existing links still work.

### Technical changes

**`src/components/BottomTabBar.tsx`**
- Replace the 5 tabs array: remove Finance, add Home (`/dashboard`) in center position
- Use `Home` icon from lucide-react for the center tab
- Style the Home tab slightly differently (primary color) to make it stand out

**`src/pages/dashboard/MilestonesPage.tsx`**
- Add a `Tabs` component at the top with two tabs: "Development" and "Financial"
- "Development" tab contains all existing milestones content
- "Financial" tab renders the `FinancialPage` component (extracted as a reusable component)
- Accept location state to auto-select Financial tab when redirected

**`src/pages/dashboard/FinancialPage.tsx`**
- Export the main content as a reusable `FinancialContent` component (no page wrapper)
- Keep the page-level default export for backward compatibility / direct route access

**`src/App.tsx`**
- Update the `/dashboard/financial` route to redirect to `/dashboard/milestones`

**`src/components/DashboardLayout.tsx`**
- Remove the Home button from the top header (no longer needed)

**`src/pages/Dashboard.tsx`**
- Update any quick action referencing `/dashboard/financial` to point to `/dashboard/milestones`

