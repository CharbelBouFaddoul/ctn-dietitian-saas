/** Week index (1-based) from global meal-plan dayNumber. */
export function weekOfDay(dayNumber: number): number {
  return Math.ceil(dayNumber / 7);
}

export function groupDaysByWeek<T extends { dayNumber: number }>(
  days: T[],
): Array<{ week: number; days: T[] }> {
  const map = new Map<number, T[]>();
  for (const day of days) {
    const week = weekOfDay(day.dayNumber);
    const list = map.get(week) ?? [];
    list.push(day);
    map.set(week, list);
  }
  return [...map.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([week, weekDays]) => ({ week, days: weekDays }));
}
