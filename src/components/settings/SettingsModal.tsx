import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Cpu,
  Shield,
  Terminal,
  Check,
  Folder,
  Trash2,
  Coffee,
  HardDrive,
  RefreshCw,
  MessageSquare,
  Palette,
  Sliders,
  Volume2,
  Activity,
  Sparkles,
  Image,
  Upload,
  Zap,
  Gauge,
  RotateCcw,
  Globe,
  Wifi,
  Radio,
  Type,
  Layers,
  Server,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useSystemStore } from "../../store/systemStore";
import {
  useCustomizationStore,
  ACCENT_PRESETS,
  BG_PRESETS,
  AccentColorKey,
  BgThemeKey,
  CardBlur,
  Density,
  AnimationEffect,
  FontFamily,
  CardStyle,
} from "../../store/customizationStore";
import { soundManager } from "../../utils/sound";
import { JavaInstallation, NetworkSettings, ConnectionTestResult } from "../../types";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type SettingsTab = "appearance" | "general" | "network" | "diagnostics";

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>("appearance");

  // System Store
  const { specs, recommendedMemory, getJvmArgs } = useSystemStore();
  const [selectedGc, setSelectedGc] = useState("fps_boost");
  const [sampleArgs, setSampleArgs] = useState<string[]>([]);
  const [javas, setJavas] = useState<JavaInstallation[]>([]);
  const [isLoadingJavas, setIsLoadingJavas] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanMessage, setCleanMessage] = useState<string | null>(null);

  // Customization Store
  const {
    accent,
    customAccentHex,
    bgTheme,
    wallpaperBlur,
    wallpaperOpacity,
    cardBlur,
    cardBorderOpacity,
    density,
    animationEffect,
    fontFamily,
    cardStyle,
    soundEnabled,
    soundVolume,
    setAccent,
    setCustomAccentHex,
    setBgTheme,
    setCustomWallpaperUrl,
    setWallpaperBlur,
    setWallpaperOpacity,
    setCardBlur,
    setCardBorderOpacity,
    setDensity,
    setAnimationEffect,
    setFontFamily,
    setCardStyle,
    setSoundEnabled,
    setSoundVolume,
    resetDefaults,
  } = useCustomizationStore();

  // Discord RPC State
  const [discordEnabled, setDiscordEnabled] = useState(true);
  const [discordConnected, setDiscordConnected] = useState(false);

  // Network & Proxy Settings State
  const [networkSettings, setNetworkSettings] = useState<NetworkSettings>({
    proxy_type: "none",
    proxy_url: "",
    modrinth_api_mirror: "",
    modrinth_cdn_mirror: "",
    auto_fallback_ru: true,
    bypass_ssl_verify: false,
  });
  const [isSavingNetwork, setIsSavingNetwork] = useState(false);
  const [networkSaveMessage, setNetworkSaveMessage] = useState<string | null>(null);
  const [testUrl, setTestUrl] = useState("https://api.modrinth.com/v2");
  const [isTestingConn, setIsTestingConn] = useState(false);
  const [connTestResult, setConnTestResult] = useState<ConnectionTestResult | null>(null);

  // Diagnostics State
  const [benchmarking, setBenchmarking] = useState(false);
  const [benchScore, setBenchScore] = useState<number | null>(null);
  const [netLatency, setNetLatency] = useState<{
    modrinth: number | null;
    elyby: number | null;
  }>({ modrinth: null, elyby: null });
  const [testingPing, setTestingPing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      getJvmArgs(
        recommendedMemory || { min_mb: 2048, max_mb: 4096 },
        selectedGc,
        []
      ).then(setSampleArgs);

      setIsLoadingJavas(true);
      invoke<JavaInstallation[]>("detect_installed_javas")
        .then(setJavas)
        .catch(console.error)
        .finally(() => setIsLoadingJavas(false));

      // Fetch Discord RPC Status
      invoke<{ enabled: boolean; connected: boolean }>("get_discord_rpc_status")
        .then((res) => {
          setDiscordEnabled(res.enabled);
          setDiscordConnected(res.connected);
        })
        .catch(() => {});

      // Fetch Network Settings
      invoke<NetworkSettings>("get_network_settings")
        .then((net) => {
          if (net) setNetworkSettings(net);
        })
        .catch(console.error);
    }
  }, [isOpen, selectedGc, recommendedMemory, getJvmArgs]);

  if (!isOpen) return null;

  const handleOpenFolder = async () => {
    soundManager.playClick();
    try {
      await invoke("open_launcher_dir");
    } catch (err) {
      console.error("Не удалось открыть папку лаунчера:", err);
    }
  };

  const handleCleanCache = async () => {
    soundManager.playClick();
    setIsCleaning(true);
    setCleanMessage(null);
    try {
      const freed = await invoke<number>("clean_launcher_cache");
      const mb = Math.round(freed / (1024 * 1024));
      setCleanMessage(`Кэш очищен! Освобождено ${mb} МБ.`);
      soundManager.playSuccess();
    } catch (err) {
      setCleanMessage(`Ошибка очистки: ${err}`);
      soundManager.playError();
    } finally {
      setIsCleaning(false);
    }
  };

  const handleSaveNetwork = async () => {
    soundManager.playClick();
    setIsSavingNetwork(true);
    setNetworkSaveMessage(null);
    try {
      await invoke("set_network_settings", { settings: networkSettings });
      setNetworkSaveMessage("Настройки сети успешно сохранены и применены!");
      soundManager.playSuccess();
    } catch (e) {
      setNetworkSaveMessage(`Ошибка: ${e}`);
      soundManager.playError();
    } finally {
      setIsSavingNetwork(false);
    }
  };

  const handleTestConnection = async (target?: string) => {
    soundManager.playClick();
    const url = target || testUrl;
    setIsTestingConn(true);
    setConnTestResult(null);
    try {
      const res = await invoke<ConnectionTestResult>("test_network_connection", { url });
      setConnTestResult(res);
      if (res.success) soundManager.playSuccess();
      else soundManager.playError();
    } catch (e) {
      setConnTestResult({
        success: false,
        message: String(e),
      });
      soundManager.playError();
    } finally {
      setIsTestingConn(false);
    }
  };

  const handleToggleDiscord = async () => {
    soundManager.playClick();
    const next = !discordEnabled;
    setDiscordEnabled(next);
    try {
      await invoke("toggle_discord_rpc", { enabled: next });
      const res = await invoke<{ enabled: boolean; connected: boolean }>("get_discord_rpc_status");
      setDiscordConnected(res.connected);
    } catch (err) {
      console.error("Failed to toggle discord rpc:", err);
    }
  };

  const handleWallpaperFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const rawData = event.target?.result as string;
      if (!rawData) return;

      // Downscale to max 1920x1080 JPEG to prevent localStorage quota exceeded errors
      const img = new window.Image();
      img.onload = () => {
        const MAX_WIDTH = 1920;
        const MAX_HEIGHT = 1080;
        let width = img.width;
        let height = img.height;

        if (width > MAX_WIDTH || height > MAX_HEIGHT) {
          if (width / height > MAX_WIDTH / MAX_HEIGHT) {
            height = Math.round((height * MAX_WIDTH) / width);
            width = MAX_WIDTH;
          } else {
            width = Math.round((width * MAX_HEIGHT) / height);
            height = MAX_HEIGHT;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          const compressed = canvas.toDataURL("image/jpeg", 0.85);
          setCustomWallpaperUrl(compressed);
          soundManager.playSuccess();
        } else {
          setCustomWallpaperUrl(rawData);
          soundManager.playSuccess();
        }
      };
      img.onerror = () => {
        setCustomWallpaperUrl(rawData);
        soundManager.playSuccess();
      };
      img.src = rawData;
    };
    reader.readAsDataURL(file);
  };

  // Run synthetic memory and latency diagnostics
  const runDiagnostics = async () => {
    soundManager.playClick();
    setBenchmarking(true);
    setTestingPing(true);

    // 1. Synthetic Memory Allocation Benchmark (approximate heap throughput)
    const start = performance.now();
    let sum = 0;
    const arraySize = 3_000_000;
    const testArr = new Float64Array(arraySize);
    for (let i = 0; i < arraySize; i++) {
      testArr[i] = Math.sqrt(i * 1.5);
      sum += testArr[i];
    }
    const duration = performance.now() - start;
    const mbPerSec = Math.round(((arraySize * 8) / (1024 * 1024) / (duration / 1000)) * 10) / 10;
    setBenchScore(mbPerSec);
    setBenchmarking(false);

    // 2. Measure network latency
    const pingEndpoint = async (url: string) => {
      const pStart = performance.now();
      try {
        await fetch(url, { method: "HEAD", mode: "no-cors" });
        return Math.round(performance.now() - pStart);
      } catch {
        return null;
      }
    };

    const modrinthPing = await pingEndpoint("https://api.modrinth.com/v2");
    const elybyPing = await pingEndpoint("https://skin.ely.by");
    setNetLatency({ modrinth: modrinthPing, elyby: elybyPing });
    setTestingPing(false);
    soundManager.playSuccess();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="glass-panel w-full max-w-3xl rounded-2xl p-6 border border-white/10 shadow-2xl relative max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08]">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <span>Настройки и кастомизация</span>
              <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                FRZ Next-Gen
              </span>
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Персонализация внешнего вида, параметры JVM, звук и диагностика системы
            </p>
          </div>
          <button
            onClick={() => {
              soundManager.playClick();
              onClose();
            }}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex items-center gap-1.5 pt-3 pb-3 border-b border-white/[0.06]">
          <button
            type="button"
            onClick={() => {
              setActiveTab("appearance");
              soundManager.playModeSwitch();
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "appearance"
                ? "bg-white/10 text-white border border-white/15 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Palette className="w-3.5 h-3.5 text-emerald-400" />
            <span>Внешний вид и стиль</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("general");
              soundManager.playModeSwitch();
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "general"
                ? "bg-white/10 text-white border border-white/15 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Cpu className="w-3.5 h-3.5 text-indigo-400" />
            <span>Система и JVM</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("network");
              soundManager.playModeSwitch();
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "network"
                ? "bg-white/10 text-white border border-white/15 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-blue-400" />
            <span>Сеть и Прокси (РФ)</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("diagnostics");
              soundManager.playModeSwitch();
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === "diagnostics"
                ? "bg-white/10 text-white border border-white/15 shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Диагностика</span>
          </button>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto py-4 space-y-5 custom-scrollbar pr-1">
          {/* TAB 1: APPEARANCE & CUSTOMIZATION */}
          {activeTab === "appearance" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Accent Colors */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Palette className="w-3.5 h-3.5 text-emerald-400" />
                    Акцентный цвет оформления
                  </h3>
                  <span className="text-[11px] font-mono text-slate-400">
                    Текущий: {ACCENT_PRESETS[accent]?.label || "Изумрудный"}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {(Object.keys(ACCENT_PRESETS) as AccentColorKey[]).map((key) => {
                    const preset = ACCENT_PRESETS[key];
                    const isSelected = accent === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setAccent(key)}
                        className={`p-2.5 rounded-xl border flex items-center gap-2.5 transition-all text-left cursor-pointer ${
                          isSelected
                            ? "bg-white/[0.08] border-white/30 shadow-md ring-1 ring-white/20"
                            : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.05]"
                        }`}
                      >
                        <div
                          className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 shadow-sm"
                          style={{
                            backgroundColor: preset.hex,
                            boxShadow: `0 0 10px ${preset.hex}`,
                          }}
                        >
                          {isSelected && <Check className="w-3 h-3 text-black stroke-[3]" />}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-white truncate">
                            {preset.label.split(" ")[0]}
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono">
                            {preset.hex}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Custom HEX Color Picker */}
                <div className="mt-3 p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="relative flex items-center">
                      <input
                        type="color"
                        value={customAccentHex || ACCENT_PRESETS[accent]?.hex || "#10b981"}
                        onChange={(e) => {
                          setCustomAccentHex(e.target.value);
                          soundManager.playClick();
                        }}
                        className="w-8 h-8 rounded-lg cursor-pointer bg-transparent border-0 p-0"
                      />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-white flex items-center gap-2">
                        <span>Свой произвольный HEX акцент</span>
                        {customAccentHex && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Активен
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        {customAccentHex ? `Выбран цвет: ${customAccentHex}` : "Нажмите на кружок слева для выбора любого цвета из спектра"}
                      </div>
                    </div>
                  </div>
                  {customAccentHex && (
                    <button
                      type="button"
                      onClick={() => {
                        setCustomAccentHex(null);
                        soundManager.playClick();
                      }}
                      className="text-[11px] px-2.5 py-1 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 font-mono transition-colors cursor-pointer"
                    >
                      Сбросить к пресету
                    </button>
                  )}
                </div>
              </div>

              {/* Background Theme & Wallpaper */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Image className="w-3.5 h-3.5 text-indigo-400" />
                    Фоновая тема и обои
                  </h3>
                  {bgTheme === "custom" && (
                    <button
                      type="button"
                      onClick={() => setCustomWallpaperUrl(null)}
                      className="text-[11px] text-red-400 hover:text-red-300 transition-colors"
                    >
                      Сбросить свои обои
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 mb-3">
                  {(Object.keys(BG_PRESETS) as BgThemeKey[]).map((key) => {
                    if (key === "custom") return null;
                    const def = BG_PRESETS[key];
                    const isSelected = bgTheme === key;

                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setBgTheme(key)}
                        className={`p-3 rounded-xl border text-left transition-all relative overflow-hidden group cursor-pointer ${
                          isSelected
                            ? "border-emerald-500/60 ring-1 ring-emerald-500/40"
                            : "border-white/[0.08] hover:border-white/20"
                        }`}
                      >
                        {/* Background Gradient Preview */}
                        <div
                          className={`absolute inset-0 bg-gradient-to-br ${def.previewGradient} opacity-90 group-hover:opacity-100 transition-opacity`}
                        />
                        <div className="relative z-10">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-bold text-white">{def.label}</span>
                            {isSelected && <Check className="w-3.5 h-3.5 text-emerald-400" />}
                          </div>
                          <p className="text-[10px] text-slate-300 mt-1 line-clamp-2 leading-tight">
                            {def.description}
                          </p>
                        </div>
                      </button>
                    );
                  })}

                  {/* Custom Wallpaper Upload Card */}
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className={`p-3 rounded-xl border border-dashed text-left transition-all relative overflow-hidden flex flex-col justify-center items-center gap-1.5 cursor-pointer ${
                      bgTheme === "custom"
                        ? "bg-indigo-950/40 border-indigo-500/60 text-indigo-300"
                        : "bg-white/[0.02] border-white/15 hover:border-indigo-400 text-slate-300"
                    }`}
                  >
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleWallpaperFileUpload}
                      className="hidden"
                    />
                    <Upload className="w-4 h-4 text-indigo-400" />
                    <span className="text-xs font-bold">Свои обои</span>
                    <span className="text-[9px] text-slate-400">JPG, PNG, WebP</span>
                  </div>
                </div>

                {/* Wallpaper Sliders (Blur & Darkness) */}
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                      Размытие фона (Blur):
                    </span>
                    <span className="font-mono text-cyan-300">{wallpaperBlur}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="32"
                    step="2"
                    value={wallpaperBlur}
                    onChange={(e) => setWallpaperBlur(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-300 font-semibold flex items-center gap-1.5">
                      <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                      Затемнение обоев (Overlay):
                    </span>
                    <span className="font-mono text-cyan-300">
                      {Math.round(wallpaperOpacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.2"
                    max="0.9"
                    step="0.05"
                    value={wallpaperOpacity}
                    onChange={(e) => setWallpaperOpacity(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                  />
                </div>
              </div>

              {/* Card Style & Layout Customization */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5 text-violet-400" />
                  Стиль карточек и плотность сетки
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Glassmorphism Blur */}
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    <div className="text-xs font-bold text-white mb-1.5">
                      Стекло (Glassmorphism):
                    </div>
                    <div className="flex gap-1">
                      {(["none", "low", "medium", "high"] as CardBlur[]).map((b) => (
                        <button
                          key={b}
                          type="button"
                          onClick={() => setCardBlur(b)}
                          className={`flex-1 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                            cardBlur === b
                              ? "bg-indigo-600 text-white"
                              : "bg-white/[0.04] text-slate-400 hover:text-white"
                          }`}
                        >
                          {b === "none" ? "Выкл" : b === "low" ? "Слабое" : b === "medium" ? "Станд." : "Макс"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Grid Density */}
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                    <div className="text-xs font-bold text-white mb-1.5">
                      Плотность карточек:
                    </div>
                    <div className="flex gap-1">
                      {(["comfortable", "compact"] as Density[]).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => setDensity(d)}
                          className={`flex-1 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                            density === d
                              ? "bg-indigo-600 text-white"
                              : "bg-white/[0.04] text-slate-400 hover:text-white"
                          }`}
                        >
                          {d === "comfortable" ? "Комфортная" : "Компактная"}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Card Border Opacity */}
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] sm:col-span-2">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="text-slate-300 font-semibold">Прозрачность границ карточек (Border Opacity):</span>
                      <span className="font-mono text-cyan-300">{Math.round(cardBorderOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.04"
                      max="0.30"
                      step="0.02"
                      value={cardBorderOpacity}
                      onChange={(e) => setCardBorderOpacity(parseFloat(e.target.value))}
                      className="w-full h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                    />
                  </div>

                  {/* Card Style Mode */}
                  <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] sm:col-span-2">
                    <div className="text-xs font-bold text-white mb-2 flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-indigo-400" />
                      Стиль оформления карточек интерфейса:
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      {[
                        { key: "glass", label: "Матовое стекло", desc: "Glassmorphism" },
                        { key: "solid", label: "Глубокий темный", desc: "Solid Dark" },
                        { key: "cyber", label: "Киберпанк неон", desc: "Cyber Glow" },
                        { key: "minimal", label: "Минимализм", desc: "Flat Borderless" },
                      ].map((cs) => {
                        const isSelected = cardStyle === cs.key;
                        return (
                          <button
                            key={cs.key}
                            type="button"
                            onClick={() => {
                              setCardStyle(cs.key as CardStyle);
                              soundManager.playClick();
                            }}
                            className={`p-2 rounded-lg border text-left transition-all cursor-pointer ${
                              isSelected
                                ? "bg-indigo-600/30 border-indigo-500 text-white shadow-sm"
                                : "bg-white/[0.03] border-white/[0.06] text-slate-400 hover:text-white"
                            }`}
                          >
                            <div className="text-xs font-bold truncate">{cs.label}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{cs.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>

              {/* Animated Canvas Background Effect */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    Интерактивный 60 FPS Canvas-фон
                  </h3>
                  <span className="text-[11px] font-mono text-cyan-300">
                    Режим: {animationEffect === "none" ? "Выключен" : animationEffect}
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {[
                    { key: "none", label: "Выключен", desc: "Без анимации" },
                    { key: "particles", label: "✨ Частицы", desc: "Мерцающая пыль" },
                    { key: "stars", label: "🌌 3D Звезды", desc: "Глубокий космос" },
                    { key: "fireflies", label: "🏮 Светлячки", desc: "Огни тайги" },
                    { key: "matrix", label: "⚡ Матрица", desc: "Кибер-код" },
                  ].map((fx) => {
                    const isSelected = animationEffect === fx.key;
                    return (
                      <button
                        key={fx.key}
                        type="button"
                        onClick={() => {
                          setAnimationEffect(fx.key as AnimationEffect);
                          soundManager.playClick();
                        }}
                        className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                          isSelected
                            ? "bg-cyan-500/20 border-cyan-400/60 ring-1 ring-cyan-400/40 text-white shadow-sm"
                            : "bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className="text-xs font-bold truncate">{fx.label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{fx.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Font Family / Typography */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Type className="w-3.5 h-3.5 text-amber-400" />
                    Типографика и системный шрифт
                  </h3>
                </div>
                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { key: "inter", label: "Современный Inter", desc: "Стандартный гладкий UI" },
                    { key: "minecraft", label: "Пиксельный Minecraft", desc: "Аутентичный стиль игры" },
                    { key: "mono", label: "Кибер Monospace", desc: "Хакерский моноширинный" },
                  ].map((f) => {
                    const isSelected = fontFamily === f.key;
                    return (
                      <button
                        key={f.key}
                        type="button"
                        onClick={() => {
                          setFontFamily(f.key as FontFamily);
                          soundManager.playClick();
                        }}
                        className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                          isSelected
                            ? "bg-amber-500/20 border-amber-500/60 ring-1 ring-amber-500/40 text-white shadow-sm"
                            : "bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white hover:bg-white/[0.05]"
                        }`}
                      >
                        <div className="text-xs font-bold">{f.label}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">{f.desc}</div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Sound Effects & Web Audio Synthesizer */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                    Звуковые эффекты интерфейса (Web Audio)
                  </h3>
                  <button
                    type="button"
                    onClick={() => setSoundEnabled(!soundEnabled)}
                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors cursor-pointer ${
                      soundEnabled ? "bg-emerald-500" : "bg-white/[0.1]"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        soundEnabled ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-300">
                      Мягкие звуки кликов, запуска игры и добавления в избранное
                    </span>
                    <span className="font-mono text-amber-300">
                      {Math.round(soundVolume * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={soundVolume}
                    disabled={!soundEnabled}
                    onChange={(e) => setSoundVolume(parseFloat(e.target.value))}
                    className="w-full h-1.5 bg-black/40 rounded-lg appearance-none cursor-pointer accent-amber-500 disabled:opacity-40"
                  />

                  {/* Sound Test Buttons */}
                  <div className="flex items-center gap-2 pt-1 text-[11px]">
                    <span className="text-slate-400">Проверить:</span>
                    <button
                      type="button"
                      onClick={() => soundManager.playClick()}
                      className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 font-mono transition-colors"
                    >
                      Клик
                    </button>
                    <button
                      type="button"
                      onClick={() => soundManager.playStar()}
                      className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-amber-300 font-mono transition-colors"
                    >
                      ⭐ Звезда
                    </button>
                    <button
                      type="button"
                      onClick={() => soundManager.playLaunch()}
                      className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-emerald-300 font-mono transition-colors"
                    >
                      🚀 Запуск
                    </button>
                    <button
                      type="button"
                      onClick={() => soundManager.playSuccess()}
                      className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-indigo-300 font-mono transition-colors"
                    >
                      ✓ Успех
                    </button>
                  </div>
                </div>
              </div>

              {/* Reset to Defaults */}
              <div className="pt-2 flex justify-start">
                <button
                  type="button"
                  onClick={resetDefaults}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>Сбросить оформление по умолчанию</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 2: GENERAL & JVM SYSTEM */}
          {activeTab === "general" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Hardware Telemetry */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                  Аппаратная телеметрия
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-[10px] text-slate-400">Процессор</div>
                    <div className="text-xs font-bold text-slate-200 truncate mt-0.5" title={specs?.cpu_brand}>
                      {specs?.cpu_brand || "Определение..."}
                    </div>
                    <div className="text-[10px] text-indigo-400 font-mono mt-0.5">
                      {specs?.cpu_cores} логических ядер
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-[10px] text-slate-400">Всего ОЗУ</div>
                    <div className="text-xs font-bold text-slate-200 mt-0.5">
                      {specs ? `${Math.round(specs.total_ram_mb / 1024)} ГБ` : "..."}
                    </div>
                    <div className="text-[10px] text-emerald-400 font-mono mt-0.5">
                      {specs ? `${Math.round(specs.available_ram_mb / 1024)} ГБ свободно` : ""}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-[10px] text-slate-400">Операционная система</div>
                    <div className="text-xs font-bold text-slate-200 mt-0.5">
                      {specs?.os_name || "Windows"}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {specs?.os_version || ""}
                    </div>
                  </div>

                  <div className="p-3 rounded-xl bg-white/[0.03] border border-white/[0.06]">
                    <div className="text-[10px] text-slate-400">Рекомендуемое ОЗУ</div>
                    <div className="text-xs font-bold text-indigo-300 mt-0.5">
                      {recommendedMemory ? `${Math.round(recommendedMemory.max_mb / 1024)} ГБ` : "4 ГБ"}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Авто-тюнинг</div>
                  </div>
                </div>
              </div>

              {/* Installed Java Runtimes (Java Detector) */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Coffee className="w-3.5 h-3.5 text-amber-400" />
                    Обнаруженные среды Java
                  </h3>
                  {isLoadingJavas && <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400" />}
                </div>

                <div className="space-y-2">
                  {javas.length === 0 ? (
                    <div className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] text-xs text-slate-400 text-center">
                      Среды Java не обнаружены в стандартных путях.
                    </div>
                  ) : (
                    javas.map((j, idx) => (
                      <div
                        key={idx}
                        className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] flex items-center justify-between gap-3 text-xs"
                      >
                        <div className="flex items-center gap-2.5 overflow-hidden">
                          <div className="w-8 h-8 rounded-lg bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-300 font-mono font-bold flex-shrink-0">
                            J{j.major_version}
                          </div>
                          <div className="overflow-hidden">
                            <div className="font-semibold text-slate-200 flex items-center gap-2">
                              <span>{j.vendor} Java {j.version}</span>
                              <span
                                className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-medium ${
                                  j.is_64_bit
                                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                    : "bg-amber-500/20 text-amber-300 border border-amber-500/30"
                                }`}
                              >
                                {j.is_64_bit ? "64-bit" : "⚠️ 32-bit (макс. 1 ГБ ОЗУ)"}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono truncate" title={j.path}>
                              {j.path}
                            </div>
                          </div>
                        </div>

                        <div className="flex-shrink-0">
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium">
                            {j.major_version >= 17 ? "Minecraft 1.18 - 1.21+" : "Minecraft 1.7 - 1.16"}
                          </span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Disk & Storage Management */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <HardDrive className="w-3.5 h-3.5 text-cyan-400" />
                  Хранилище и диск
                </h3>
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-200">Папка сборок и данных FRZlauncher</div>
                      <div className="text-[11px] text-slate-400">
                        Хранит моды, миры, конфиги и файлы сборок Minecraft
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleOpenFolder}
                      className="px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Folder className="w-3.5 h-3.5 text-indigo-400" />
                      <span>Открыть папку</span>
                    </button>
                  </div>

                  <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-200">Очистка временных файлов и кэша</div>
                      <div className="text-[11px] text-slate-400">
                        Удаляет неиспользуемые временные загрузки версий для экономии места
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCleanCache}
                      disabled={isCleaning}
                      className="px-3 py-1.5 rounded-lg bg-red-500/15 hover:bg-red-500/25 border border-red-500/30 text-red-300 text-xs font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      {isCleaning ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      )}
                      <span>Очистить кэш</span>
                    </button>
                  </div>

                  {cleanMessage && (
                    <div className="text-[11px] font-mono text-emerald-400 pt-1">
                      ✓ {cleanMessage}
                    </div>
                  )}
                </div>
              </div>

              {/* Discord Rich Presence Integration */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-400" />
                    Интеграция с Discord (Rich Presence)
                  </h3>
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-medium flex items-center gap-1.5 border ${
                      discordConnected && discordEnabled
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : "bg-white/[0.04] text-slate-400 border-white/[0.08]"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        discordConnected && discordEnabled
                          ? "bg-emerald-400 animate-pulse"
                          : "bg-slate-500"
                      }`}
                    />
                    <span>
                      {discordConnected && discordEnabled
                        ? "Подключено к Discord"
                        : "Discord не обнаружен"}
                    </span>
                  </span>
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <div>
                      <div className="font-semibold text-slate-200">
                        Отображать статус в профиле Discord
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Показывает запущенную сборку, версию Minecraft и кнопку перехода на канал @FRzher
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleToggleDiscord}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                        discordEnabled ? "bg-emerald-500" : "bg-white/[0.1]"
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          discordEnabled ? "translate-x-6" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Security & Vault */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  Безопасность и целостность
                </h3>
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Хранилище учетных данных:</span>
                    <span className="text-emerald-400 font-mono font-semibold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Windows Credential Manager (Keyring)
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Проверка целостности:</span>
                    <span className="text-emerald-400 font-mono font-semibold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Поточная верификация SHA-1 & SHA-256
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">Защита процессов:</span>
                    <span className="text-emerald-400 font-mono font-semibold flex items-center gap-1">
                      <Check className="w-3 h-3" /> Защита от инъекций аргументов JVM
                    </span>
                  </div>
                </div>
              </div>

              {/* Real-time JVM Optimizer Preview */}
              <div>
                <div className="flex items-center justify-between mb-2.5">
                  <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Terminal className="w-3.5 h-3.5 text-violet-400" />
                    Оптимизатор сборщика мусора JVM
                  </h3>
                  <div className="flex items-center gap-1">
                    {["fps_boost", "aikar", "shenandoah", "zgc"].map((preset) => (
                      <button
                        key={preset}
                        onClick={() => setSelectedGc(preset)}
                        className={`px-2 py-0.5 rounded-lg text-[11px] font-semibold border transition-all cursor-pointer ${
                          selectedGc === preset
                            ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40 shadow-sm"
                            : "bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {preset === "fps_boost" ? "⚡ Оптимизация JVM" : preset}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-[#090b10] border border-white/[0.08] font-mono text-[11px] text-indigo-300 max-h-36 overflow-y-auto leading-relaxed">
                  {sampleArgs.length > 0 ? (
                    sampleArgs.join(" ")
                  ) : (
                    <span className="text-slate-500">Генерация аргументов JVM...</span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: NETWORK & PROXY & ANTI-BLOCKING */}
          {activeTab === "network" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              {/* Anti-blocking info banner */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-blue-950/40 via-indigo-950/30 to-purple-950/30 border border-blue-500/30">
                <div className="flex items-start gap-3">
                  <Globe className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="text-xs font-bold text-white flex items-center gap-2">
                      <span>Обход блокировок и зеркала для игроков из РФ</span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-mono font-bold bg-blue-500/20 text-blue-300 border border-blue-500/30">
                        RU DPI Ready
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                      Если каталоги Modrinth блокируются провайдерами в РФ (ошибки подключения к api.modrinth.com / cdn.modrinth.com), вы можете настроить локальный или внешний SOCKS5/HTTP прокси, указать зеркала API/CDN или включить автоматическое переключение на российский каталог <b>Minecraft Inside</b>.
                    </p>
                  </div>
                </div>
              </div>

              {/* Proxy Settings */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Radio className="w-3.5 h-3.5 text-blue-400" />
                  Конфигурация Прокси-сервера
                </h3>
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                  <div>
                    <label className="text-xs font-semibold text-slate-200 block mb-1.5">
                      Тип подключения:
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { key: "none", label: "Прямое соединение", desc: "Без прокси (стандарт)" },
                        { key: "socks5", label: "SOCKS5 Прокси", desc: "V2Ray, Xray, NekoBox" },
                        { key: "http", label: "HTTP Прокси", desc: "Clash, Fiddler, VPN" },
                      ].map((t) => {
                        const isSelected = networkSettings.proxy_type === t.key;
                        return (
                          <button
                            key={t.key}
                            type="button"
                            onClick={() => {
                              setNetworkSettings({
                                ...networkSettings,
                                proxy_type: t.key as "none" | "socks5" | "http",
                              });
                              soundManager.playClick();
                            }}
                            className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                              isSelected
                                ? "bg-blue-600/30 border-blue-500 text-white shadow-sm ring-1 ring-blue-500/40"
                                : "bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-white"
                            }`}
                          >
                            <div className="text-xs font-bold">{t.label}</div>
                            <div className="text-[10px] text-slate-400 mt-0.5">{t.desc}</div>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {networkSettings.proxy_type !== "none" && (
                    <div className="space-y-2 pt-1 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-semibold text-slate-200">Адрес и порт прокси:</span>
                        <div className="flex gap-1.5 text-[10px]">
                          <button
                            type="button"
                            onClick={() =>
                              setNetworkSettings({
                                ...networkSettings,
                                proxy_url: "socks5://127.0.0.1:10808",
                              })
                            }
                            className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-blue-300 font-mono transition-colors"
                          >
                            V2Ray (10808)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setNetworkSettings({
                                ...networkSettings,
                                proxy_url: "socks5://127.0.0.1:2080",
                              })
                            }
                            className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-blue-300 font-mono transition-colors"
                          >
                            NekoBox (2080)
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setNetworkSettings({
                                ...networkSettings,
                                proxy_url: "http://127.0.0.1:7890",
                              })
                            }
                            className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-blue-300 font-mono transition-colors"
                          >
                            Clash (7890)
                          </button>
                        </div>
                      </div>
                      <input
                        type="text"
                        placeholder={
                          networkSettings.proxy_type === "socks5"
                            ? "socks5://127.0.0.1:10808"
                            : "http://127.0.0.1:7890"
                        }
                        value={networkSettings.proxy_url || ""}
                        onChange={(e) =>
                          setNetworkSettings({ ...networkSettings, proxy_url: e.target.value })
                        }
                        className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 font-mono focus:border-blue-500 focus:outline-none"
                      />
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <div>
                      <div className="font-semibold text-slate-200">
                        Игнорировать ошибки SSL (Bypass SSL verify)
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Включайте только при использовании кастомных MITM или самоподписанных сертификатов
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setNetworkSettings({
                          ...networkSettings,
                          bypass_ssl_verify: !networkSettings.bypass_ssl_verify,
                        })
                      }
                      className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                        networkSettings.bypass_ssl_verify ? "bg-amber-500" : "bg-white/[0.1]"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          networkSettings.bypass_ssl_verify ? "translate-x-5" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Modrinth Mirrors & Fallback */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Server className="w-3.5 h-3.5 text-indigo-400" />
                  Зеркала API и Российские каталоги
                </h3>
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3 text-xs">
                  {/* Auto Fallback Toggle */}
                  <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
                    <div>
                      <div className="font-semibold text-slate-200 flex items-center gap-2">
                        <span>Автоматический фолбэк на Minecraft Inside (РФ)</span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-mono">
                          Рекомендуется
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Если Modrinth недоступен или заблокирован, поиск и установка модов автоматически идут через незаблокированный русский каталог
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setNetworkSettings({
                          ...networkSettings,
                          auto_fallback_ru: !networkSettings.auto_fallback_ru,
                        })
                      }
                      className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors cursor-pointer flex-shrink-0 ${
                        networkSettings.auto_fallback_ru ? "bg-emerald-500" : "bg-white/[0.1]"
                      }`}
                    >
                      <span
                        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                          networkSettings.auto_fallback_ru ? "translate-x-5" : "translate-x-1"
                        }`}
                      />
                    </button>
                  </div>

                  {/* Modrinth API Mirror */}
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-200">
                      Зеркало Modrinth API (оставьте пустым для официального):
                    </label>
                    <input
                      type="text"
                      placeholder="https://api.modrinth.com/v2 (или ваш прокси-URL/зеркало)"
                      value={networkSettings.modrinth_api_mirror || ""}
                      onChange={(e) =>
                        setNetworkSettings({
                          ...networkSettings,
                          modrinth_api_mirror: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 font-mono focus:border-indigo-500 focus:outline-none"
                    />
                  </div>

                  {/* Modrinth CDN Mirror */}
                  <div className="space-y-1">
                    <label className="font-semibold text-slate-200">
                      Зеркало Modrinth CDN загрузок (оставьте пустым для официального):
                    </label>
                    <input
                      type="text"
                      placeholder="https://cdn.modrinth.com (или зеркало загрузки файлов)"
                      value={networkSettings.modrinth_cdn_mirror || ""}
                      onChange={(e) =>
                        setNetworkSettings({
                          ...networkSettings,
                          modrinth_cdn_mirror: e.target.value,
                        })
                      }
                      className="w-full px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white placeholder-slate-500 font-mono focus:border-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Connection Diagnostics Tool */}
              <div>
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                  Проверка доступности сетевых узлов
                </h3>
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] space-y-3">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={testUrl}
                      onChange={(e) => setTestUrl(e.target.value)}
                      placeholder="https://api.modrinth.com/v2"
                      className="flex-1 px-3 py-2 rounded-xl bg-black/40 border border-white/10 text-xs text-white font-mono focus:border-emerald-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => handleTestConnection()}
                      disabled={isTestingConn}
                      className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50 flex-shrink-0"
                    >
                      {isTestingConn ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Zap className="w-3.5 h-3.5" />
                      )}
                      <span>Проверить пинг</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2 text-[11px] text-slate-400">
                    <span>Быстрые цели:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setTestUrl("https://api.modrinth.com/v2");
                        handleTestConnection("https://api.modrinth.com/v2");
                      }}
                      className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-indigo-300 font-mono transition-colors"
                    >
                      Modrinth API
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTestUrl("https://minecraft-inside.ru");
                        handleTestConnection("https://minecraft-inside.ru");
                      }}
                      className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-emerald-300 font-mono transition-colors"
                    >
                      Minecraft Inside (РФ)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setTestUrl("https://authserver.ely.by/api/authlib-injector");
                        handleTestConnection("https://authserver.ely.by/api/authlib-injector");
                      }}
                      className="px-2 py-0.5 rounded bg-white/[0.05] hover:bg-white/[0.1] text-cyan-300 font-mono transition-colors"
                    >
                      Ely.by Auth
                    </button>
                  </div>

                  {connTestResult && (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-center justify-between ${
                        connTestResult.success
                          ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-300"
                          : "bg-red-500/10 border-red-500/30 text-red-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {connTestResult.success ? (
                          <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-red-400 flex-shrink-0" />
                        )}
                        <span>{connTestResult.message}</span>
                      </div>
                      {connTestResult.latency_ms !== undefined && (
                        <span className="font-mono font-bold text-[11px]">
                          {connTestResult.latency_ms} мс
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Save & Apply Network Settings Button */}
              <div className="pt-2 flex items-center justify-between">
                <div>
                  {networkSaveMessage && (
                    <div
                      className={`text-xs font-mono ${
                        networkSaveMessage.startsWith("Ошибка")
                          ? "text-red-400"
                          : "text-emerald-400"
                      }`}
                    >
                      {networkSaveMessage}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  onClick={handleSaveNetwork}
                  disabled={isSavingNetwork}
                  className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs shadow-glow transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {isSavingNetwork ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  <span>Сохранить настройки сети</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: DIAGNOSTICS & SYSTEM BENCHMARK */}
          {activeTab === "diagnostics" && (
            <div className="space-y-5 animate-in fade-in duration-150">
              <div className="p-4 rounded-xl bg-gradient-to-r from-cyan-950/30 to-indigo-950/30 border border-cyan-500/30 flex items-center justify-between">
                <div>
                  <div className="text-sm font-bold text-white flex items-center gap-2">
                    <Gauge className="w-4 h-4 text-cyan-400" />
                    <span>Экспресс-диагностика производительности</span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Проверка пропускной способности памяти, состояния CPU и задержек серверов
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runDiagnostics}
                  disabled={benchmarking || testingPing}
                  className="px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs flex items-center gap-2 shadow-glow transition-all cursor-pointer disabled:opacity-50"
                >
                  {benchmarking || testingPing ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Тестирование...</span>
                    </>
                  ) : (
                    <>
                      <Zap className="w-3.5 h-3.5" />
                      <span>Запустить тест</span>
                    </>
                  )}
                </button>
              </div>

              {/* Specs Breakdown */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    Загрузка памяти системы
                  </div>
                  <div className="text-base font-bold text-white mt-1">
                    {specs ? `${Math.round(specs.available_ram_mb / 1024)} ГБ свободно` : "..."}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    из {specs ? `${Math.round(specs.total_ram_mb / 1024)} ГБ` : "..."}
                  </div>
                  {specs && (
                    <div className="w-full h-1.5 rounded-full bg-white/[0.06] mt-2 overflow-hidden">
                      <div
                        className="h-full bg-emerald-500"
                        style={{
                          width: `${Math.round(
                            ((specs.total_ram_mb - specs.available_ram_mb) / specs.total_ram_mb) * 100
                          )}%`,
                        }}
                      />
                    </div>
                  )}
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    Скорость аллокации кучи
                  </div>
                  <div className="text-base font-bold text-cyan-300 mt-1">
                    {benchScore ? `${benchScore} МБ/сек` : "Не тестировалась"}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {benchScore
                      ? benchScore > 500
                        ? "⚡ Хорошая скорость выделения памяти"
                        : "Хорошая производительность"
                      : "Нажмите «Запустить тест»"}
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
                  <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                    Пинг сервисов
                  </div>
                  <div className="mt-1 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-400">Modrinth API:</span>
                      <span className="font-mono text-emerald-400">
                        {netLatency.modrinth ? `${netLatency.modrinth} мс` : "—"}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-400">Скины Ely.by:</span>
                      <span className="font-mono text-cyan-400">
                        {netLatency.elyby ? `${netLatency.elyby} мс` : "—"}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span>FRZlauncher v1.0.0</span>
            <span>•</span>
            <span className="text-emerald-400">Готов к релизу</span>
          </div>
          <button
            onClick={() => {
              soundManager.playClick();
              onClose();
            }}
            className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-glow transition-all cursor-pointer"
          >
            Готово
          </button>
        </div>
      </div>
    </div>
  );
};
