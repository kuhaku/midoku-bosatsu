export function formatNewPostDestinationLabel(siteName: string): string {
  return `投稿先: ${siteName}`;
}

export function shouldConfirmNewPostSiteChange(formDirty: boolean): boolean {
  return formDirty;
}
