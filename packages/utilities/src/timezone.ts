/** Local calendar date (YYYY-MM-DD) for an instant in an IANA time zone. */
export function localDateKey(instant: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(instant);
}

/** UTC bounds covering all instants that map to `localDate` in `timeZone`. */
export function dayBoundsUtc(localDate: string, timeZone: string): { start: Date; end: Date } {
  const [year, month, day] = localDate.split("-").map(Number);
  if (!year || !month || !day) {
    throw new RangeError("localDate must be YYYY-MM-DD");
  }

  let startMs = Date.UTC(year, month - 1, day, 0, 0, 0) - 36 * 60 * 60 * 1000;
  let endMs = Date.UTC(year, month - 1, day, 23, 59, 59) + 36 * 60 * 60 * 1000;

  while (localDateKey(new Date(startMs), timeZone) !== localDate) {
    startMs += 60 * 60 * 1000;
  }
  while (localDateKey(new Date(endMs), timeZone) !== localDate) {
    endMs -= 60 * 60 * 1000;
  }

  const start = new Date(startMs);
  let end = new Date(endMs);
  while (localDateKey(new Date(end.getTime() + 1), timeZone) === localDate) {
    end = new Date(end.getTime() + 1);
  }
  return { start, end };
}

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    throw new RangeError("date must be YYYY-MM-DD");
  }
  return new Date(Date.UTC(year, month - 1, day));
}
