export type TrackedPostRef = {
  site_id: string;
  post_id: string;
};

export type TrackingUiState = {
  manual: TrackedPostRef[];
  automatic: TrackedPostRef[];
  error?: string;
};

export type NotificationButtonMode = 'off' | 'manual' | 'automatic';

export function trackingKey(siteId: string, postId: string): string {
  return `${siteId}\u0000${postId}`;
}

export function notificationButtonMode(
  state: TrackingUiState,
  siteId: string,
  postId: string,
): NotificationButtonMode {
  const key = trackingKey(siteId, postId);
  if (state.automatic.some((item) => trackingKey(item.site_id, item.post_id) === key)) return 'automatic';
  if (state.manual.some((item) => trackingKey(item.site_id, item.post_id) === key)) return 'manual';
  return 'off';
}

export function notificationButtonViewModel(mode: NotificationButtonMode): {
  label: string;
  pressed: boolean;
  disabled: boolean;
} {
  if (mode === 'automatic') return { label: '自動通知', pressed: true, disabled: true };
  if (mode === 'manual') return { label: '通知中', pressed: true, disabled: false };
  return { label: '通知', pressed: false, disabled: false };
}

export function notificationSoundMimeType(fileName: string): string {
  const extension = fileName.split('.').pop()?.toLowerCase() ?? '';
  switch (extension) {
    case 'ogg':
    case 'oga':
      return 'audio/ogg';
    case 'mp3':
      return 'audio/mpeg';
    case 'wav':
      return 'audio/wav';
    case 'flac':
      return 'audio/flac';
    case 'm4a':
      return 'audio/mp4';
    case 'aac':
      return 'audio/aac';
    case 'webm':
      return 'audio/webm';
    default:
      return 'application/octet-stream';
  }
}

export function shouldPlayReplyNotification(
  replyNotificationEnabled: boolean,
  soundEnabled: boolean,
  results: Array<{ reply_detected: boolean }>,
): boolean {
  return replyNotificationActions(replyNotificationEnabled, soundEnabled, results).play_sound;
}

export type ReplyNotificationActions = {
  play_sound: boolean;
  reply_post_keys: string[];
};

export type ReplyNotificationPostCandidate = {
  post_key: string;
  unread: boolean;
  timestamp: number;
};

export type ReplyNotificationPostPresentation = {
  highlighted: boolean;
  badge_label: 'レス通知' | null;
};

export function replyNotificationPostPresentation(
  unread: boolean,
  isReplyNotificationTarget: boolean,
): ReplyNotificationPostPresentation {
  const highlighted = unread && isReplyNotificationTarget;
  return {
    highlighted,
    badge_label: highlighted ? 'レス通知' : null,
  };
}

export function chooseOldestUnreadReplyPostKey(
  candidates: ReplyNotificationPostCandidate[],
): string | null {
  let oldest: ReplyNotificationPostCandidate | null = null;
  for (const candidate of candidates) {
    if (!candidate.unread) continue;
    if (oldest === null || candidate.timestamp < oldest.timestamp) oldest = candidate;
  }
  return oldest?.post_key ?? null;
}

export function replyNotificationActions(
  replyNotificationEnabled: boolean,
  soundEnabled: boolean,
  results: Array<{
    site_id?: string;
    reply_detected: boolean;
    reply_post_ids?: string[];
  }>,
): ReplyNotificationActions {
  const notify = replyNotificationEnabled && results.some((result) => result.reply_detected);
  const replyPostKeys = new Set<string>();
  if (replyNotificationEnabled) {
    for (const result of results) {
      if (!result.reply_detected || !result.site_id) continue;
      for (const postId of result.reply_post_ids ?? []) {
        if (postId.trim()) replyPostKeys.add(`${result.site_id}:${postId}`);
      }
    }
  }
  return { play_sound: notify && soundEnabled, reply_post_keys: [...replyPostKeys] };
}

export type ReplyTreePost = {
  site_id: string;
  id: string;
  parent_id: string | null;
  thread_id: string | null;
};

export function knownDescendantPostIds(
  siteId: string,
  rootPostId: string,
  posts: Iterable<ReplyTreePost>,
): string[] {
  const candidates = Array.from(posts).filter((post) => post.site_id === siteId && post.id !== rootPostId);
  const known = new Set<string>([rootPostId]);
  const descendants: string[] = [];

  let changed = true;
  while (changed) {
    changed = false;
    for (const post of candidates) {
      if (!post.id || known.has(post.id)) continue;
      const explicitParent = post.parent_id?.trim() ?? '';
      const threadParent = post.thread_id?.trim() ?? '';
      const connects = (explicitParent && explicitParent !== post.id && known.has(explicitParent))
        || (threadParent && threadParent !== post.id && known.has(threadParent));
      if (!connects) continue;
      known.add(post.id);
      descendants.push(post.id);
      changed = true;
    }
  }

  return descendants;
}
