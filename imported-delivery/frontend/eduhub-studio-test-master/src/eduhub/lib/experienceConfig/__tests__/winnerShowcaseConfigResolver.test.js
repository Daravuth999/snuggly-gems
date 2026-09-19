/**
 * winnerShowcaseConfigResolver.test.js — twin of
 * achievementConfigResolver.test.js, same coverage shape applied to the
 * independent winner_showcase_theme resolver, plus the additive
 * nextSessionCountdown field achievement's own resolver doesn't have.
 */
import {
  resolveWinnerShowcasePresentation, DEFAULT_NEXT_SESSION_COUNTDOWN,
} from "../winnerShowcaseConfigResolver";
import { achievementThemes, getAchievementTheme } from "../../../styles/tokens/achievementThemes";
import { mergeAchievementOverrides } from "../achievementConfigResolver";

describe("resolveWinnerShowcasePresentation — no config yet (never a broken/blank panel)", () => {
  test("null config + light app theme -> Emerald Achievement, no artwork", () => {
    const r = resolveWinnerShowcasePresentation(null, { appTheme: "light" });
    expect(r.id).toBe("emeraldAchievement");
    expect(r.artwork).toBeNull();
    expect(r.visible).toBe(true);
  });

  test("null config + dark app theme -> Midnight Achievement", () => {
    const r = resolveWinnerShowcasePresentation(null, { appTheme: "dark" });
    expect(r.id).toBe("midnightAchievement");
  });

  test("null config still resolves a usable default nextSessionCountdown", () => {
    const r = resolveWinnerShowcasePresentation(null, { appTheme: "light" });
    expect(r.nextSessionCountdown).toEqual(DEFAULT_NEXT_SESSION_COUNTDOWN);
  });
});

describe("sync mode — same contract as achievementConfigResolver, independent type", () => {
  test("followWelcome (default) tracks the app theme, ignoring any themeId", () => {
    const config = { appearance: { syncMode: "followWelcome", themeId: "halloween" } };
    expect(resolveWinnerShowcasePresentation(config, { appTheme: "light" }).id).toBe("emeraldAchievement");
    expect(resolveWinnerShowcasePresentation(config, { appTheme: "dark" }).id).toBe("midnightAchievement");
  });

  test("independent uses the admin-selected preset regardless of app theme", () => {
    const config = { appearance: { syncMode: "independent", themeId: "halloween" } };
    expect(resolveWinnerShowcasePresentation(config, { appTheme: "light" }).id).toBe("halloween");
    expect(resolveWinnerShowcasePresentation(config, { appTheme: "dark" }).id).toBe("halloween");
  });

  test("independent with no themeId falls back to Emerald Achievement, not a crash", () => {
    const config = { appearance: { syncMode: "independent" } };
    expect(resolveWinnerShowcasePresentation(config, { appTheme: "light" }).id).toBe("emeraldAchievement");
  });
});

describe("winner_showcase_theme is genuinely independent of achievement_top_earner", () => {
  test("picking a different preset for each type never makes one bleed into the other", () => {
    const winnerConfig = { appearance: { syncMode: "independent", themeId: "christmas" } };
    const achievementConfig = { appearance: { syncMode: "independent", themeId: "halloween" } };
    expect(resolveWinnerShowcasePresentation(winnerConfig, { appTheme: "light" }).id).toBe("christmas");
    expect(resolveWinnerShowcasePresentation(achievementConfig, { appTheme: "light" }).id).toBe("halloween");
  });
});

describe("visibility + artwork passthrough", () => {
  test("content.visible=false is surfaced on the resolved presentation", () => {
    const r = resolveWinnerShowcasePresentation({ content: { visible: false }, appearance: {} }, { appTheme: "light" });
    expect(r.visible).toBe(false);
  });

  test("appearance.artwork passes through untouched", () => {
    const artwork = { url: "https://cdn/x.png", placement: "right", scale: 100 };
    const r = resolveWinnerShowcasePresentation({ appearance: { artwork } }, { appTheme: "light" });
    expect(r.artwork).toEqual(artwork);
  });
});

describe("nextSessionCountdown resolution", () => {
  test("a partial admin-set countdown is merged onto the default, not replaced wholesale", () => {
    const r = resolveWinnerShowcasePresentation(
      { appearance: { nextSessionCountdown: { hour: 9 } } },
      { appTheme: "light" },
    );
    expect(r.nextSessionCountdown).toEqual({ ...DEFAULT_NEXT_SESSION_COUNTDOWN, hour: 9 });
  });

  test("an admin can disable the countdown entirely", () => {
    const r = resolveWinnerShowcasePresentation(
      { appearance: { nextSessionCountdown: { enabled: false } } },
      { appTheme: "light" },
    );
    expect(r.nextSessionCountdown.enabled).toBe(false);
  });
});

describe("reuses achievementConfigResolver's own merge function — not a fork", () => {
  test("mergeAchievementOverrides applied to a winner_showcase override behaves identically to the achievement twin", () => {
    const base = getAchievementTheme("emeraldAchievement");
    const merged = mergeAchievementOverrides(base, { trophy: { color: "#ABCDEF" } });
    const r = resolveWinnerShowcasePresentation(
      { appearance: { syncMode: "independent", themeId: "emeraldAchievement", overrides: { trophy: { color: "#ABCDEF" } } } },
      { appTheme: "light" },
    );
    expect(r.trophy.color).toBe(merged.trophy.color);
    expect(r.trophy.style).toBe(merged.trophy.style); // untouched fields still match
  });
});

test("EVERY preset resolves cleanly through the full pipeline with a full override set (same guarantee as achievement's own twin test)", () => {
  Object.keys(achievementThemes).forEach((id) => {
    const config = {
      appearance: {
        syncMode: "independent",
        themeId: id,
        overrides: { primary: "#000000", trophy: { color: "#111111" }, decorations: { snow: { enabled: true } } },
      },
    };
    expect(() => resolveWinnerShowcasePresentation(config, { appTheme: "light" })).not.toThrow();
    const r = resolveWinnerShowcasePresentation(config, { appTheme: "light" });
    expect(r.id).toBe(id);
    expect(r.primary).toBe("#000000");
  });
});
