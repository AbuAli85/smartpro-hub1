import type { ActionQueueItem } from "./actionQueueTypes";

const OWNER_USER_PREFIX = /^User\s+(.+)$/i;

export type CurrentUserLike = {
  id: number | string;
  name?: string | null;
  email?: string | null;
} | null;

/**
 * Display label for ownership — prefers existing queue label.
 */
export function getOwnerLabel(item: ActionQueueItem, _currentUser: CurrentUserLike): string | null {
  const raw = item.ownerLabel?.trim();
  if (raw) return raw;
  return null;
}

export function isAssigned(item: ActionQueueItem): boolean {
  if (item.ownerUserId != null && String(item.ownerUserId).length > 0) return true;
  return Boolean(item.ownerLabel?.trim());
}

export function isAssignedToSelf(item: ActionQueueItem, currentUser: CurrentUserLike): boolean {
  if (!currentUser) return false;
  if (item.ownerUserId != null && item.ownerUserId !== "") {
    return String(item.ownerUserId) === String(currentUser.id);
  }
  const m = item.ownerLabel?.trim().match(OWNER_USER_PREFIX);
  if (m) return String(m[1]) === String(currentUser.id);
  if (item.ownerLabel && currentUser.name && item.ownerLabel.trim() === currentUser.name.trim()) return true;
  if (item.ownerLabel && currentUser.email && item.ownerLabel.trim() === currentUser.email.trim()) return true;
  return false;
}
