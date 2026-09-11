export type ParticipantCountSite = {
  id: string;
  name: string;
  enabled: boolean;
};

export type ParticipantCountItem = {
  siteId: string;
  siteName: string;
  countLabel: string;
};

export function participantCountItems(
  sites: ParticipantCountSite[],
  counts: ReadonlyMap<string, number | null>,
  visible = true,
): ParticipantCountItem[] {
  if (!visible) return [];

  return sites
    .filter((site) => site.enabled)
    .map((site) => ({
      siteId: site.id,
      siteName: site.name,
      countLabel: `${counts.get(site.id) ?? '?'}名`,
    }));
}
