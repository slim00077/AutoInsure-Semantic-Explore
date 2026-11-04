import { describe, expect, it } from "vitest";
import { dateFr, humanize, money, statusLabel } from "./format";

describe("format", () => {
  it("formate les dates ISO en français", () => {
    expect(dateFr("2026-10-01T00:00:00")).toBe("01/10/2026");
    expect(dateFr(null)).toBe("—");
  });
  it("humanise les identifiants OWL", () => {
    expect(humanize("AssuranceTousRisques")).toBe("Assurance Tous Risques");
  });
  it("formate les montants", () => {
    expect(money(null)).toBe("—");
    expect(money(4050, "€").replace(/\s/g, " ")).toContain("4");
  });
  it("traduit les statuts de l'ontologie", () => {
    expect(statusLabel("Acceptee")).toBe("Acceptée");
    expect(statusLabel(undefined)).toBe("—");
  });
});
