import { describe, expect, it } from "vitest";
import { dayBoundsUtc, localDateKey } from "@nutrition-saas/utilities";

describe("timezone utilities", () => {
  it("maps instants to organization-local dates", () => {
    const instant = new Date("2026-08-17T22:30:00.000Z");
    expect(localDateKey(instant, "UTC")).toBe("2026-08-17");
    expect(localDateKey(instant, "Asia/Beirut")).toBe("2026-08-18");
  });

  it("covers a full local day in UTC bounds", () => {
    const { start, end } = dayBoundsUtc("2026-08-18", "Asia/Beirut");
    expect(localDateKey(start, "Asia/Beirut")).toBe("2026-08-18");
    expect(localDateKey(end, "Asia/Beirut")).toBe("2026-08-18");
    expect(start.getTime()).toBeLessThan(end.getTime());
  });
});
