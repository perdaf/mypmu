import { describe, expect, it } from "vitest";
import { classifyCollectorError } from "./collector-status";

describe("classification des erreurs du collecteur", () => {
  it("reconnaît une coupure réseau", () => {
    expect(classifyCollectorError(new Error("fetch failed: ECONNRESET"))).toBe("network");
  });

  it("distingue une erreur SQLite", () => {
    expect(classifyCollectorError(new Error("SQLITE_BUSY: database is locked"))).toBe("database");
  });

  it("conserve une catégorie prudente pour une erreur inconnue", () => {
    expect(classifyCollectorError(new Error("incident inattendu"))).toBe("unknown");
  });
});
