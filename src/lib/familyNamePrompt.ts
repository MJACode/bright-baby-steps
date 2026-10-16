export interface FamilyAccessRow {
  owner_id: string;
  partner_id: string;
  label: string | null;
}

/**
 * Whether anyone would see the caller's own name. get_family_display_names
 * prefers the owner's partner_access.label over profiles.full_name, so a
 * partner the owner has already labelled ("Barbara") would type a name that
 * never appears. Owners have no label, so any family they own counts.
 */
export function ownNameReachesFamily(rows: FamilyAccessRow[], userId: string): boolean {
  return rows.some((r) => r.owner_id === userId || !r.label?.trim());
}

export function shouldShowFamilyNamePrompt(opts: {
  fullName: string | null | undefined;
  nameReachesFamily: boolean | undefined;
  dismissed: boolean;
}): boolean {
  return !opts.dismissed && opts.nameReachesFamily === true && !opts.fullName?.trim();
}
