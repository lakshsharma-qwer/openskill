const DAY = 86_400_000;

export function weeksBetween(a: Date, b: Date) {
  return Math.max(1, Math.ceil((b.getTime() - a.getTime()) / (7 * DAY)));
}

/** 1-based week number of the plan, counting from its creation date. */
export function currentWeek(createdAt: string, now = new Date()) {
  return Math.max(1, Math.floor((now.getTime() - new Date(createdAt).getTime()) / (7 * DAY)) + 1);
}

/** 1-based day (1-7) within the current plan week. */
export function currentDay(createdAt: string, now = new Date()) {
  const days = Math.floor((startOfDay(now) - startOfDay(new Date(createdAt))) / DAY);
  return (((days % 7) + 7) % 7) + 1;
}

export function dateForPlanDay(createdAt: string, week: number, day: number) {
  return new Date(startOfDay(new Date(createdAt)) + ((week - 1) * 7 + (day - 1)) * DAY);
}

export function daysUntil(iso: string) {
  return Math.ceil((startOfDay(new Date(iso)) - startOfDay(new Date())) / DAY);
}

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function streak(activity: string[]) {
  const set = new Set(activity);
  let count = 0;
  const d = new Date();
  // A streak survives if today isn't done yet but yesterday was.
  if (!set.has(todayKey(d))) d.setDate(d.getDate() - 1);
  while (set.has(todayKey(d))) {
    count++;
    d.setDate(d.getDate() - 1);
  }
  return count;
}

function startOfDay(d: Date) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}
