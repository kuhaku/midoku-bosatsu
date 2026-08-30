type BbsSite = { id: string; name: string; enabled: boolean };

export type BbsTimelineMenuItem = {
  siteId: string | null;
  label: string;
  disabled: boolean;
  selected: boolean;
};

export function bbsTimelineMenuItems(
  sites: BbsSite[],
  selectedSiteId: string | null,
): BbsTimelineMenuItem[] {
  return [
    {
      siteId: null,
      label: 'すべての掲示板',
      disabled: false,
      selected: selectedSiteId === null,
    },
    ...sites.map((site) => ({
      siteId: site.id,
      label: site.name,
      disabled: !site.enabled,
      selected: selectedSiteId === site.id,
    })),
  ];
}
