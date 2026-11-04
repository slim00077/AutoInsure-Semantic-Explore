import { describe, expect, it } from "vitest";
import { ApiError, errorMessage, http } from "./api";

describe("client API", () => {
  it("cible le préfixe /api", () => {
    expect(http.defaults.baseURL?.endsWith("/api")).toBe(true);
  });
  it("normalise les messages d'erreur", () => {
    expect(errorMessage(new ApiError("Boom", 409, "CONFLICT"))).toBe("Boom");
    expect(errorMessage("x")).toBe("Erreur inattendue.");
  });
});
