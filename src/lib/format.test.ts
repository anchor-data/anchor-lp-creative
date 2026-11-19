import { describe, expect, it } from "vitest";
import { addDays, compactNumber, date, dateTime, daysBetween, jstToday, pct, ratio, yen } from "./format";

describe("format", () => {
  it("formats yen with separators", () => {
    expect(yen(1200000)).toBe("¥1,200,000");
    expect(yen(null)).toBe("—");
  });

  it("formats compact numbers", () => {
    expect(compactNumber(1_200_000)).toBe("1.2M");
    expect(compactNumber(3_000_000)).toBe("3M");
    expect(compactNumber(860_000)).toBe("860K");
    expect(compactNumber(3200)).toBe("3,200");
  });

  it("formats rates with one decimal and dash for zero denominators", () => {
    expect(pct(1.44)).toBe("1.4%");
    expect(pct(ratio(5, 0))).toBe("—");
    expect(ratio(1, 4)).toBe(25);
  });

  it("converts UTC to JST", () => {
    expect(dateTime("2026-11-12T21:32:00Z")).toBe("2026/11/13 06:32");
    expect(date("2026-11-13")).toBe("2026/11/13");
    expect(jstToday(new Date("2026-11-12T16:00:00Z"))).toBe("2026-11-13");
  });

  it("does date arithmetic on YYYY-MM-DD", () => {
    expect(addDays("2026-02-28", 1)).toBe("2026-03-01");
    expect(daysBetween("2026-08-01", "2026-08-30")).toBe(30);
  });
});
