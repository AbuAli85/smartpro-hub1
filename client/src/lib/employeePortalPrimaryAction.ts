import type { ActionCenterItem } from "@/lib/employeePortalOverviewModel";

/**
 * When the home hero is already urgent (critical/warning), drop the first action-center row
 * if it is attendance — avoids repeating the same “go to attendance” message under “Do this next”.
 */
export function actionCenterAfterHeroDedupe(
  items: ActionCenterItem[],
  heroPrimaryDominant: boolean,
  maxVisible = 3,
): ActionCenterItem[] {
  const pool = items.slice(0, maxVisible + 1);
  if (!heroPrimaryDominant || pool.length === 0) return pool.slice(0, maxVisible);
  const [first, ...rest] = pool;
  if (first.actionType === "attendance") return rest.slice(0, maxVisible);
  return pool.slice(0, maxVisible);
}
