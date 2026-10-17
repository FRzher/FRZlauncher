import { create } from "zustand";
import { soundManager } from "../utils/sound";

export type AccentColorKey =
  | "emerald"
  | "indigo"
  | "cyan"
  | "orange"
  | "crimson"
  | "lime"
  | "rose"
  | "amber"
  | "purple"
  | "sky";

export interface AccentColorDef {
  key: AccentColorKey;
  label: string;
  hex: string;
  rgb: string;
  glow: string;
}

export const ACCENT_PRESETS: Record<AccentColorKey, AccentColorDef> = {
  emerald: {
    key: "emerald",
    label: "Изумрудный (FRzher)",
    hex: "#10b981",
    rgb: "16, 185, 129",
    glow: "rgba(16, 185, 129, 0.45)",
  },
  indigo: {
    key: "indigo",
    label: "Неоновый Индиго",
    hex: "#6366f1",
    rgb: "99, 102, 241",
    glow: "rgba(99, 102, 241, 0.45)",
  },
  cyan: {
    key: "cyan",
    label: "Киберпанк Циан",
    hex: "#06b6d4",
    rgb: "6, 182, 212",
    glow: "rgba(6, 182, 212, 0.45)",
  },
  orange: {
    key: "orange",
    label: "Закатный Оранжевый",
    hex: "#f97316",
    rgb: "249, 115, 22",
    glow: "rgba(249, 115, 22, 0.45)",
  },
  crimson: {
    key: "crimson",
    label: "Багровый Рубин",
    hex: "#ef4444",
    rgb: "239, 68, 68",
    glow: "rgba(239, 68, 68, 0.45)",
  },
  lime: {
    key: "lime",
    label: "Неоновый Лайм",
    hex: "#84cc16",
    rgb: "132, 204, 22",
    glow: "rgba(132, 204, 22, 0.45)",
  },
  rose: {
    key: "rose",
    label: "Розовое Золото",
    hex: "#ec4899",
    rgb: "236, 72, 153",
    glow: "rgba(236, 72, 153, 0.45)",
  },
  amber: {
    key: "amber",
    label: "Янтарный Золотой",
    hex: "#f59e0b",
    rgb: "245, 158, 11",
    glow: "rgba(245, 158, 11, 0.45)",
  },
  purple: {
    key: "purple",
    label: "Аметистовый Фиолетовый",
    hex: "#a855f7",
    rgb: "168, 85, 247",
    glow: "rgba(168, 85, 247, 0.45)",
  },
  sky: {
    key: "sky",
    label: "Небесно-Голубой",
    hex: "#0284c7",
    rgb: "2, 132, 199",
    glow: "rgba(2, 132, 199, 0.45)",
  },
};

export type BgThemeKey =
  | "obsidian"
  | "shaders"
  | "cyberpunk"
  | "aurora"
  | "slate"
  | "nether"
  | "end"
  | "emerald_cave"
  | "custom";

export interface BgThemeDef {
  key: BgThemeKey;
  label: string;
  description: string;
  cssBackground: string;
  previewGradient: string;
}

export const BG_PRESETS: Record<BgThemeKey, BgThemeDef> = {
  obsidian: {
    key: "obsidian",
    label: "Deep Space Obsidian",
    description: "Глубокий темный обсидиан с мягким космическим градиентом",
    cssBackground: "radial-gradient(ellipse at 50% 0%, #151c2e 0%, #0c0f18 60%, #07090f 100%)",
    previewGradient: "from-[#151c2e] via-[#0c0f18] to-[#07090f]",
  },
  shaders: {
    key: "shaders",
    label: "Minecraft Shaders Dark",
    description: "Атмосферный темный шейдерный фон в стилистике Minecraft",
    cssBackground: "linear-gradient(135deg, #0e1a24 0%, #0d121c 50%, #080a11 100%)",
    previewGradient: "from-[#0e1a24] via-[#0d121c] to-[#080a11]",
  },
  cyberpunk: {
    key: "cyberpunk",
    label: "Cyberpunk Grid",
    description: "Футуристическая неоновая атмосфера с кибер-сеткой",
    cssBackground: "linear-gradient(180deg, #130e24 0%, #0b0d19 60%, #05060c 100%)",
    previewGradient: "from-[#130e24] via-[#0b0d19] to-[#05060c]",
  },
  aurora: {
    key: "aurora",
    label: "Aurora Borealis",
    description: "Северное сияние с изумрудными и фиолетовыми переливами",
    cssBackground: "radial-gradient(circle at 20% 20%, #0d2b26 0%, #121026 50%, #080a10 100%)",
    previewGradient: "from-[#0d2b26] via-[#121026] to-[#080a10]",
  },
  nether: {
    key: "nether",
    label: "Багровый Незер",
    description: "Атмосферный темный градиент Багрового леса и Незера",
    cssBackground: "radial-gradient(ellipse at 50% 0%, #2e0d16 0%, #17070b 50%, #080305 100%)",
    previewGradient: "from-[#2e0d16] via-[#17070b] to-[#080305]",
  },
  end: {
    key: "end",
    label: "Пустота Края (The End)",
    description: "Космическая бездна Эндермира с мягким фиолетовым сиянием",
    cssBackground: "radial-gradient(ellipse at 50% 10%, #1e1133 0%, #0d0918 55%, #05040a 100%)",
    previewGradient: "from-[#1e1133] via-[#0d0918] to-[#05040a]",
  },
  emerald_cave: {
    key: "emerald_cave",
    label: "Изумрудные Недра",
    description: "Глубинные сланцевые пещеры с изумрудным свечением",
    cssBackground: "radial-gradient(ellipse at 40% 0%, #0a261e 0%, #0c1514 55%, #060a09 100%)",
    previewGradient: "from-[#0a261e] via-[#0c1514] to-[#060a09]",
  },
  slate: {
    key: "slate",
    label: "Minimalist Slate",
    description: "Минималистичный матовый графит без визуального шума",
    cssBackground: "linear-gradient(180deg, #11141c 0%, #0d0f14 100%)",
    previewGradient: "from-[#11141c] to-[#0d0f14]",
  },
  custom: {
    key: "custom",
    label: "Пользовательские обои",
    description: "Собственное фоновое изображение или арт",
    cssBackground: "#0b0d13",
    previewGradient: "from-slate-800 to-slate-950",
  },
};

export type CardBlur = "low" | "medium" | "high" | "none";
export type Density = "comfortable" | "compact";
export type AnimationEffect = "stars" | "particles" | "matrix" | "fireflies" | "none";
export type FontFamily = "inter" | "minecraft" | "mono";
export type CardStyle = "modern_glass" | "neon_glow" | "minimal_flat";

interface CustomizationState {
  accent: AccentColorKey;
  customAccentHex: string | null;
  bgTheme: BgThemeKey;
  customWallpaperUrl: string | null;
  wallpaperBlur: number; // 0..40
  wallpaperOpacity: number; // 0.1..0.9
  cardBlur: CardBlur;
  cardBorderOpacity: number; // 0.04..0.30
  density: Density;
  animationEffect: AnimationEffect;
  fontFamily: FontFamily;
  cardStyle: CardStyle;
  soundEnabled: boolean;
  soundVolume: number;

  setAccent: (accent: AccentColorKey) => void;
  setCustomAccentHex: (hex: string | null) => void;
  setBgTheme: (theme: BgThemeKey) => void;
  setCustomWallpaperUrl: (url: string | null) => void;
  setWallpaperBlur: (blur: number) => void;
  setWallpaperOpacity: (opacity: number) => void;
  setCardBlur: (blur: CardBlur) => void;
  setCardBorderOpacity: (opacity: number) => void;
  setDensity: (density: Density) => void;
  setAnimationEffect: (effect: AnimationEffect) => void;
  setFontFamily: (font: FontFamily) => void;
  setCardStyle: (style: CardStyle) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setSoundVolume: (vol: number) => void;
  applyToDom: () => void;
  resetDefaults: () => void;
}

const STORAGE_KEY = "frzlauncher_customization_v1";

const getSavedState = (): Partial<CustomizationState> => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
};

export const useCustomizationStore = create<CustomizationState>((set, get) => {
  const saved = getSavedState();

  const initialState = {
    accent: saved.accent || "emerald",
    customAccentHex: saved.customAccentHex || null,
    bgTheme: saved.bgTheme || "obsidian",
    customWallpaperUrl: saved.customWallpaperUrl || null,
    wallpaperBlur: saved.wallpaperBlur ?? 16,
    wallpaperOpacity: saved.wallpaperOpacity ?? 0.65,
    cardBlur: saved.cardBlur || "medium",
    cardBorderOpacity: saved.cardBorderOpacity ?? 0.08,
    density: saved.density || "comfortable",
    animationEffect: (saved.animationEffect as AnimationEffect) || "particles",
    fontFamily: (saved.fontFamily as FontFamily) || "inter",
    cardStyle: (saved.cardStyle as CardStyle) || "modern_glass",
    soundEnabled: saved.soundEnabled ?? true,
    soundVolume: saved.soundVolume ?? 0.4,
  };

  const persist = (partial: Partial<CustomizationState>) => {
    try {
      const current = get();
      const next = {
        accent: current.accent,
        customAccentHex: current.customAccentHex,
        bgTheme: current.bgTheme,
        customWallpaperUrl: current.customWallpaperUrl,
        wallpaperBlur: current.wallpaperBlur,
        wallpaperOpacity: current.wallpaperOpacity,
        cardBlur: current.cardBlur,
        cardBorderOpacity: current.cardBorderOpacity,
        density: current.density,
        animationEffect: current.animationEffect,
        fontFamily: current.fontFamily,
        cardStyle: current.cardStyle,
        soundEnabled: current.soundEnabled,
        soundVolume: current.soundVolume,
        ...partial,
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {}
  };

  return {
    ...initialState,

    setAccent: (accent) => {
      set({ accent, customAccentHex: null });
      persist({ accent, customAccentHex: null });
      get().applyToDom();
      soundManager.playClick();
    },

    setCustomAccentHex: (customAccentHex) => {
      set({ customAccentHex });
      persist({ customAccentHex });
      get().applyToDom();
    },

    setBgTheme: (bgTheme) => {
      set({ bgTheme });
      persist({ bgTheme });
      get().applyToDom();
      soundManager.playClick();
    },

    setCustomWallpaperUrl: (customWallpaperUrl) => {
      set({ customWallpaperUrl, bgTheme: "custom" });
      persist({ customWallpaperUrl, bgTheme: "custom" });
      get().applyToDom();
    },

    setWallpaperBlur: (wallpaperBlur) => {
      set({ wallpaperBlur });
      persist({ wallpaperBlur });
      get().applyToDom();
    },

    setWallpaperOpacity: (wallpaperOpacity) => {
      set({ wallpaperOpacity });
      persist({ wallpaperOpacity });
      get().applyToDom();
    },

    setCardBlur: (cardBlur) => {
      set({ cardBlur });
      persist({ cardBlur });
      get().applyToDom();
    },

    setCardBorderOpacity: (cardBorderOpacity) => {
      set({ cardBorderOpacity });
      persist({ cardBorderOpacity });
      get().applyToDom();
    },

    setDensity: (density) => {
      set({ density });
      persist({ density });
      soundManager.playClick();
    },

    setAnimationEffect: (animationEffect) => {
      set({ animationEffect });
      persist({ animationEffect });
      soundManager.playClick();
    },

    setFontFamily: (fontFamily) => {
      set({ fontFamily });
      persist({ fontFamily });
      get().applyToDom();
      soundManager.playClick();
    },

    setCardStyle: (cardStyle) => {
      set({ cardStyle });
      persist({ cardStyle });
      get().applyToDom();
      soundManager.playClick();
    },

    setSoundEnabled: (soundEnabled) => {
      set({ soundEnabled });
      soundManager.setEnabled(soundEnabled);
      persist({ soundEnabled });
    },

    setSoundVolume: (soundVolume) => {
      set({ soundVolume });
      soundManager.setVolume(soundVolume);
      persist({ soundVolume });
    },

    applyToDom: () => {
      const state = get();
      const root = document.documentElement;

      let hex = "#10b981";
      let rgb = "16, 185, 129";
      let glow = "rgba(16, 185, 129, 0.45)";

      if (state.customAccentHex && state.customAccentHex.startsWith("#") && state.customAccentHex.length === 7) {
        hex = state.customAccentHex;
        const r = parseInt(hex.slice(1, 3), 16) || 16;
        const g = parseInt(hex.slice(3, 5), 16) || 185;
        const b = parseInt(hex.slice(5, 7), 16) || 129;
        rgb = `${r}, ${g}, ${b}`;
        glow = `rgba(${r}, ${g}, ${b}, 0.45)`;
      } else {
        const def = ACCENT_PRESETS[state.accent] || ACCENT_PRESETS.emerald;
        hex = def.hex;
        rgb = def.rgb;
        glow = def.glow;
      }

      root.style.setProperty("--accent-color", hex);
      root.style.setProperty("--accent-color-rgb", rgb);
      root.style.setProperty("--accent-glow", glow);
      root.style.setProperty("--accent-subtle", `rgba(${rgb}, 0.15)`);
      root.style.setProperty("--accent-border", `rgba(${rgb}, 0.35)`);

      const blurPx =
        state.cardBlur === "none"
          ? "0px"
          : state.cardBlur === "low"
          ? "8px"
          : state.cardBlur === "high"
          ? "24px"
          : "16px";
      root.style.setProperty("--card-blur", blurPx);
      root.style.setProperty("--card-border-opacity", String(state.cardBorderOpacity));
      root.style.setProperty("--wallpaper-blur", `${state.wallpaperBlur}px`);
      root.style.setProperty("--bg-overlay-opacity", String(state.wallpaperOpacity));

      root.setAttribute("data-font", state.fontFamily);
      root.setAttribute("data-card-style", state.cardStyle);
      if (state.fontFamily === "minecraft") {
        document.body.style.fontFamily = "'Minecraft', monospace, sans-serif";
      } else if (state.fontFamily === "mono") {
        document.body.style.fontFamily = "'JetBrains Mono', monospace";
      } else {
        document.body.style.fontFamily = "'Inter', system-ui, -apple-system, sans-serif";
      }
    },

    resetDefaults: () => {
      const defaults = {
        accent: "emerald" as AccentColorKey,
        customAccentHex: null,
        bgTheme: "obsidian" as BgThemeKey,
        customWallpaperUrl: null,
        wallpaperBlur: 16,
        wallpaperOpacity: 0.65,
        cardBlur: "medium" as CardBlur,
        cardBorderOpacity: 0.08,
        density: "comfortable" as Density,
        animationEffect: "particles" as AnimationEffect,
        fontFamily: "inter" as FontFamily,
        cardStyle: "modern_glass" as CardStyle,
        soundEnabled: true,
        soundVolume: 0.4,
      };
      set(defaults);
      persist(defaults);
      get().applyToDom();
      soundManager.playSuccess();
    },
  };
});

