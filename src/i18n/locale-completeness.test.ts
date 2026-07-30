import { describe, expect, it } from "vitest";
import en from "./locales/en.json";
import zhCN from "./locales/zh-CN.json";
import i18n from "./index";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return prefix ? [prefix] : [];
  return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
}

function leafValues(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.values(value).flatMap(leafValues);
}

describe("locale contract", () => {
  it("keeps Chinese and English leaf key sets identical", () => {
    expect(leafKeys(zhCN).sort()).toEqual(leafKeys(en).sort());
  });

  it("does not ship raw dotted translation keys as locale values", () => {
    const rawKey = /^[a-z][a-z0-9_-]*(?:\.[a-z][a-z0-9_-]*)+$/i;
    expect([...leafValues(zhCN), ...leafValues(en)].filter((value) => rawKey.test(value))).toEqual([]);
  });

  it("resolves the high-visibility empty-state keys in both languages", async () => {
    await i18n.changeLanguage("zh-CN");
    expect(i18n.t("navigation.settings")).not.toBe("navigation.settings");
    expect(i18n.t("inspector.noProjectBody")).not.toBe("inspector.noProjectBody");
    await i18n.changeLanguage("en");
    expect(i18n.t("navigation.settings")).not.toBe("navigation.settings");
    expect(i18n.t("inspector.noProjectBody")).not.toBe("inspector.noProjectBody");
    await i18n.changeLanguage("zh-CN");
  });
});
