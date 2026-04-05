import { describe, expect, it } from "vitest";
import { formatDateValue, resolvePlaceholders, type PlaceholderDefinitionRow } from "./placeholderResolver";

describe("placeholderResolver", () => {
  const defs: PlaceholderDefinitionRow[] = [
    {
      placeholder: "name",
      sourcePath: "user.name",
      dataType: "string",
      required: true,
      defaultValue: null,
    },
    {
      placeholder: "start",
      sourcePath: "period.start",
      dataType: "date",
      required: true,
      defaultValue: null,
    },
    {
      placeholder: "opt",
      sourcePath: "misc.note",
      dataType: "string",
      required: false,
      defaultValue: null,
    },
  ];

  it("resolves values by source_path", () => {
    const ctx = {
      user: { name: "  Acme  " },
      period: { start: "2026-01-15" },
      misc: {},
    };
    const { values, missing } = resolvePlaceholders(defs, ctx);
    expect(values.name).toBe("  Acme  ");
    expect(values.start).toBe("2026-01-15");
    expect(missing).not.toContain("name");
    expect(missing).not.toContain("start");
  });

  it("reports missing required placeholders", () => {
    const { values, missing } = resolvePlaceholders(defs, {
      user: { name: "" },
      period: {},
      misc: {},
    });
    expect(values).toEqual({});
    expect(missing).toContain("name");
    expect(missing).toContain("start");
  });

  it("formats dates consistently", () => {
    expect(formatDateValue(new Date("2026-04-05T12:00:00Z"))).toBe("2026-04-05");
    expect(formatDateValue("2026-12-01")).toBe("2026-12-01");
  });

  it("uses default_value when raw is missing", () => {
    const withDefault: PlaceholderDefinitionRow[] = [
      {
        placeholder: "x",
        sourcePath: "a.b",
        dataType: "string",
        required: true,
        defaultValue: "fallback",
      },
    ];
    const { values, missing } = resolvePlaceholders(withDefault, { a: {} });
    expect(values.x).toBe("fallback");
    expect(missing).toHaveLength(0);
  });
});
