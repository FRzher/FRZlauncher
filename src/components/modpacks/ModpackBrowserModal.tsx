import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Sparkles,
  Download,
  Search,
  Check,
  RefreshCw,
  Zap,
  Flame,
  Gamepad2,
  Shield,
  Layers,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Package,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useInstanceStore } from "../../store/instanceStore";
import { SpotlightCard } from "../common/SpotlightCard";
import {
  InstanceConfig,
  ModpackVersionOption,
  ModrinthHit,
  ModrinthSearchResult,
  VersionEntry,
} from "../../types";

interface ModpackBrowserModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectInstance?: (id: string) => void;
}

interface ModpackProgressPayload {
  modpack_name: string;
  stage: string;
  current_file: string;
  completed: number;
  total: number;
  percentage: number;
}

interface FeaturedModpack {
  id: string;
  projectId: string;
  title: string;
  tagline: string;
  description: string;
  gameVersion: string;
  loader: string;
  icon: string;
  bannerColor: string;
  badge: string;
  iconType: React.FC<{ className?: string }>;
}

const FEATURED_MODPACKS: FeaturedModpack[] = [
  {
    id: "fabulously-optimized",
    projectId: "fabulously-optimized",
    title: "Fabulously Optimized",
    tagline: "Экстремальный FPS и поддержка шейдеров (500+ FPS)",
    description: "Легендарная сборка на базе Sodium, Iris и Lithium. Поднимает FPS в 3-5 раз, ускоряет загрузку чанков и снижает лаги. Полная совместимость с FRZlauncher!",
    gameVersion: "1.21.1",
    loader: "Fabric",
    icon: "https://cdn.modrinth.com/data/NNAgCjsB/icon.png",
    bannerColor: "rgba(16, 185, 129, 0.4)",
    badge: "⚡ ТОП ОПТИМИЗАЦИЯ",
    iconType: Zap,
  },
  {
    id: "cobblemon-official",
    projectId: "cobblemon-fabric",
    title: "Cobblemon Official Modpack",
    tagline: "Покемоны в открытом мире Minecraft",
    description: "Ловите, разводите и тренируйте покемонов в живом мире! Полная анимация, пошаговые битвы, шейдеры и оптимизация.",
    gameVersion: "1.21.1",
    loader: "Fabric",
    icon: "https://cdn.modrinth.com/data/5FFgwNNP/e7f9ee2e9d361623847853fe2ddce42f519ee64f.png",
    bannerColor: "rgba(239, 68, 68, 0.4)",
    badge: "🎮 ПОПУЛЯРНОЕ",
    iconType: Gamepad2,
  },
  {
    id: "simply-optimized",
    projectId: "simply-optimized",
    title: "Simply Optimized",
    tagline: "Максимальная скорость для слабых ПК",
    description: "Супер-лёгкая сборка, выжимающая максимальный FPS даже на самых слабых ноутбуках без изменения ванильной механики игры.",
    gameVersion: "1.21.1",
    loader: "Fabric",
    icon: "https://cdn.modrinth.com/data/mOgUtBDg/icon.png",
    bannerColor: "rgba(99, 102, 241, 0.4)",
    badge: "🛡️ ДЛЯ СЛАБЫХ ПК",
    iconType: Shield,
  },
  {
    id: "better-mc-fabric",
    projectId: "better-mc-fabric-1-21",
    title: "Better MC [Fabric]",
    tagline: "Глобальное приключение и RPG",
    description: "Майнкрафт 2.0: 200+ модов с новыми измерениями, данжами, боссами, артефактами и переработанной генерацией мира.",
    gameVersion: "1.21.1",
    loader: "Fabric",
    icon: "https://cdn.modrinth.com/data/Ua74yIpQ/icon.png",
    bannerColor: "rgba(168, 85, 247, 0.4)",
    badge: "🔥 ПРИКЛЮЧЕНИЯ",
    iconType: Flame,
  },
];

const MODPACK_CLASSES = [
  { id: "all", label: "Все сборки", icon: Sparkles },
  { id: "optimization", label: "⚡ Оптимизация", icon: Zap },
  { id: "adventure", label: "🗺️ Приключения & RPG", icon: Flame },
  { id: "technology", label: "⚙️ Технологии", icon: Layers },
  { id: "magic", label: "✨ Магия", icon: Sparkles },
  { id: "quests", label: "📜 Квесты", icon: Shield },
  { id: "hardcore", label: "💀 Хардкор", icon: Flame },
  { id: "vanilla-plus", label: "🌿 Ванилла+", icon: Sparkles },
  { id: "mini-game", label: "🎮 Мини-игры", icon: Gamepad2 },
];

const BASE_MC_VERSIONS = [
  { value: "all", label: "Все версии MC" },
  { value: "1.21.4", label: "1.21.4 (Новейшая)" },
  { value: "1.21.3", label: "1.21.3" },
  { value: "1.21.1", label: "1.21.1 (Топ Fabric)" },
  { value: "1.21", label: "1.21" },
  { value: "1.20.6", label: "1.20.6" },
  { value: "1.20.4", label: "1.20.4" },
  { value: "1.20.2", label: "1.20.2" },
  { value: "1.20.1", label: "1.20.1 (Топ модов)" },
  { value: "1.20", label: "1.20" },
  { value: "1.19.4", label: "1.19.4" },
  { value: "1.19.2", label: "1.19.2" },
  { value: "1.18.2", label: "1.18.2" },
  { value: "1.17.1", label: "1.17.1" },
  { value: "1.16.5", label: "1.16.5 (Классика)" },
  { value: "1.15.2", label: "1.15.2" },
  { value: "1.14.4", label: "1.14.4" },
  { value: "1.12.2", label: "1.12.2 (Топ Forge)" },
  { value: "1.7.10", label: "1.7.10" },
];

const LOADERS = [
  { value: "all", label: "Все загрузчики" },
  { value: "Fabric", label: "Fabric" },
  { value: "NeoForge", label: "NeoForge" },
  { value: "Forge", label: "Forge" },
  { value: "Quilt", label: "Quilt" },
];

export const ModpackBrowserModal: React.FC<ModpackBrowserModalProps> = ({
  isOpen,
  onClose,
  onSelectInstance,
}) => {
  const { fetchInstances, selectInstance } = useInstanceStore();

  // Search & Filter State
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedClass, setSelectedClass] = useState("all");
  const [selectedVersion, setSelectedVersion] = useState("all");
  const [selectedLoader, setSelectedLoader] = useState("all");
  const [mcVersionList, setMcVersionList] = useState(BASE_MC_VERSIONS);

  useEffect(() => {
    invoke<VersionEntry[]>("get_mojang_versions")
      .then((mojangList) => {
        const releases = mojangList
          .filter((v) => v.type === "release")
          .map((v) => ({ value: v.id, label: v.id }));

        const existing = new Set(BASE_MC_VERSIONS.map((b) => b.value));
        const additional = releases.filter((r) => !existing.has(r.value));
        setMcVersionList([...BASE_MC_VERSIONS, ...additional]);
      })
      .catch(() => {});
  }, []);

  // Pagination & Results State
  const [modpacks, setModpacks] = useState<ModrinthHit[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 24;
  const [isLoading, setIsLoading] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Install State
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [progress, setProgress] = useState<ModpackProgressPayload | null>(null);
  const [installedInstance, setInstalledInstance] = useState<InstanceConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Version Picker Sub-Modal State
  const [versionPickerPack, setVersionPickerPack] = useState<{
    projectId: string;
    title: string;
  } | null>(null);
  const [availableVersions, setAvailableVersions] = useState<ModpackVersionOption[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);

  // Listen to backend progress
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<ModpackProgressPayload>("modpack-progress", (event) => {
      setProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // Fetch modpacks from backend
  const fetchModpacks = async (targetPage = page) => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await invoke<ModrinthSearchResult>("search_modrinth", {
        query: searchQuery.trim(),
        gameVersion: selectedVersion === "all" ? undefined : selectedVersion,
        loader: selectedLoader === "all" ? undefined : selectedLoader,
        projectType: "modpack",
        category: selectedClass === "all" ? undefined : selectedClass,
        offset: targetPage * PAGE_SIZE,
        limit: PAGE_SIZE,
      });

      setModpacks(res.hits || []);
      setTotalHits(res.total_hits || 0);
      setPage(targetPage);

      if (scrollContainerRef.current) {
        scrollContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setIsLoading(false);
    }
  };

  // Re-fetch when filters change (reset to page 0)
  useEffect(() => {
    if (isOpen) {
      fetchModpacks(0);
    }
  }, [isOpen, selectedClass, selectedVersion, selectedLoader]);

  // Open Version Picker for a Modpack
  const handleOpenVersionPicker = async (projectId: string, title: string) => {
    setVersionPickerPack({ projectId, title });
    setLoadingVersions(true);
    setAvailableVersions([]);
    try {
      const vers = await invoke<ModpackVersionOption[]>("get_modpack_versions", {
        projectId,
      });
      setAvailableVersions(vers || []);
    } catch (err: unknown) {
      setError(`Ошибка загрузки версий: ${err}`);
      setVersionPickerPack(null);
    } finally {
      setLoadingVersions(false);
    }
  };

  // Execute Installation
  const handleInstall = async (
    projectId: string,
    customName?: string,
    versionId?: string,
    targetGameVersion?: string
  ) => {
    setVersionPickerPack(null);
    setInstallingId(projectId);
    setError(null);
    setProgress({
      modpack_name: customName || projectId,
      stage: "Инициализация загрузки...",
      current_file: "Подготовка",
      completed: 0,
      total: 100,
      percentage: 5,
    });

    try {
      const config = await invoke<InstanceConfig>("install_modpack", {
        projectId,
        customName,
        versionId,
        gameVersion: targetGameVersion || (selectedVersion !== "all" ? selectedVersion : undefined),
      });

      setInstalledInstance(config);
      await fetchInstances();
      selectInstance(config.id);
      if (onSelectInstance) {
        onSelectInstance(config.id);
      }
    } catch (err: unknown) {
      setError(`Ошибка установки сборки: ${err}`);
    } finally {
      setInstallingId(null);
    }
  };

  const totalPages = Math.ceil(totalHits / PAGE_SIZE);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-5">
      <div className="glass-card w-full max-w-6xl h-[92vh] rounded-3xl border border-emerald-500/20 p-5 shadow-[0_0_50px_rgba(16,185,129,0.15)] flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-hidden relative">
        {/* Modal Header */}
        <div className="flex items-start justify-between gap-4 pb-3 border-b border-white/[0.08] flex-shrink-0">
          <div>
            <div className="flex items-center gap-2.5">
              <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 shadow-glow-accent">
                <Sparkles className="w-5 h-5" />
              </span>
              <div>
                <h2 className="text-xl font-black text-white tracking-tight flex items-center gap-2">
                  <span>Каталог сборок</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono font-bold">
                    Modrinth Modpacks
                  </span>
                </h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Более {totalHits > 0 ? totalHits.toLocaleString() : "10,000"} готовых сборок с автоматической установкой в изолированную папку
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Global Progress Bar when downloading a modpack */}
        {installingId && progress && (
          <div className="my-3 p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/40 shadow-glow-accent animate-pulse flex-shrink-0">
            <div className="flex items-center justify-between text-xs font-bold text-emerald-200 mb-2">
              <span className="flex items-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                <span>{progress.stage}</span>
              </span>
              <span className="font-mono text-emerald-300 font-bold">{Math.round(progress.percentage)}%</span>
            </div>
            <div className="w-full h-2 rounded-full bg-white/[0.08] overflow-hidden mb-2">
              <div
                className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-indigo-500 transition-all duration-300 rounded-full"
                style={{ width: `${Math.max(5, progress.percentage)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
              <span className="truncate max-w-sm text-emerald-300/80">{progress.current_file}</span>
              {progress.total > 0 && (
                <span>
                  {progress.completed} / {progress.total}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Success Alert */}
        {installedInstance && !installingId && (
          <div className="my-3 p-3.5 rounded-2xl bg-emerald-950/50 border border-emerald-500/40 text-emerald-200 flex items-center justify-between gap-4 shadow-glow-accent flex-shrink-0">
            <div className="flex items-center gap-3">
              <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <div>
                <div className="text-xs font-bold">Сборка «{installedInstance.name}» успешно установлена!</div>
                <div className="text-[11px] text-slate-300 mt-0.5">
                  Создана изолированная папка: <code className="text-emerald-300 font-mono">instances/{installedInstance.id.slice(0, 8)}</code> (FPS оптимизирован)
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-glow transition-all active:scale-95 cursor-pointer flex-shrink-0"
            >
              Перейти к игре
            </button>
          </div>
        )}

        {/* Error Alert */}
        {error && (
          <div className="my-3 p-3 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center justify-between flex-shrink-0">
            <span>{error}</span>
            <button
              onClick={() => setError(null)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Class / Category Filter Tabs ("раздел по классам") */}
        <div className="flex items-center gap-1.5 overflow-x-auto py-2 flex-shrink-0 no-scrollbar border-b border-white/[0.05]">
          {MODPACK_CLASSES.map((cls) => {
            const Icon = cls.icon;
            const isSelected = selectedClass === cls.id;
            return (
              <button
                key={cls.id}
                onClick={() => setSelectedClass(cls.id)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer ${
                  isSelected
                    ? "bg-emerald-500 text-black shadow-glow-accent scale-[1.02]"
                    : "bg-white/[0.04] text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.05]"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isSelected ? "text-black" : "text-emerald-400"}`} />
                <span>{cls.label}</span>
              </button>
            );
          })}
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-wrap items-center gap-2.5 my-3 flex-shrink-0">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              fetchModpacks(0);
            }}
            className="flex-1 min-w-[240px] relative"
          >
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Поиск любых сборок (напр. Fabulously, Better MC, Cobblemon, Create)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-20 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery("");
                  setTimeout(() => fetchModpacks(0), 10);
                }}
                className="absolute right-12 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-xs px-1"
              >
                Очистить
              </button>
            )}
            <button
              type="submit"
              disabled={isLoading}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] transition-all cursor-pointer"
            >
              Найти
            </button>
          </form>

          {/* Minecraft Version Select */}
          <select
            value={selectedVersion}
            onChange={(e) => setSelectedVersion(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            {mcVersionList.map((v) => (
              <option key={v.value} value={v.value} className="bg-slate-900 text-white">
                {v.label}
              </option>
            ))}
          </select>

          {/* Modloader Select */}
          <select
            value={selectedLoader}
            onChange={(e) => setSelectedLoader(e.target.value)}
            className="px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            {LOADERS.map((ld) => (
              <option key={ld.value} value={ld.value} className="bg-slate-900 text-white">
                {ld.label}
              </option>
            ))}
          </select>

          <button
            onClick={() => fetchModpacks(page)}
            disabled={isLoading}
            className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors cursor-pointer border border-white/[0.08]"
            title="Обновить"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
          </button>
        </div>

        {/* Scrollable Catalog Content */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto pr-1 space-y-6">
          {/* Top Featured Presets (Shown on "Все сборки" tab without search query) */}
          {selectedClass === "all" && !searchQuery.trim() && page === 0 && (
            <div>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Рекомендуемые сборки (Проверено на совместимость)</span>
                </h3>
                <span className="text-[11px] text-emerald-400 font-mono">100% совместимо с FRZlauncher</span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {FEATURED_MODPACKS.map((pack) => {
                  const IconComponent = pack.iconType;
                  const isCurrentlyInstalling = installingId === pack.projectId;

                  return (
                    <SpotlightCard
                      key={pack.id}
                      className="hover:border-emerald-500/60 hover:shadow-[0_0_30px_rgba(16,185,129,0.3)] transition-all duration-300 group"
                      glowColor={pack.bannerColor}
                    >
                      <div>
                        {/* Top Row: Icon + Badge + Title */}
                        <div className="flex items-start justify-between gap-3 mb-2.5">
                          <div className="flex items-center gap-3">
                            <img
                              src={pack.icon}
                              alt={pack.title}
                              className="w-12 h-12 rounded-2xl object-cover border border-white/10 shadow-md flex-shrink-0 group-hover:scale-105 transition-transform"
                            />
                            <div>
                              <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono">
                                {pack.badge}
                              </span>
                              <h4 className="text-sm font-bold text-white mt-1 group-hover:text-emerald-300 transition-colors">
                                {pack.title}
                              </h4>
                            </div>
                          </div>
                          <IconComponent className="w-5 h-5 text-emerald-400 opacity-70 flex-shrink-0" />
                        </div>

                        <div className="text-xs font-semibold text-emerald-400 mb-1.5">
                          {pack.tagline}
                        </div>

                        <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed mb-3">
                          {pack.description}
                        </p>

                        <div className="flex items-center gap-2 text-[10px] font-mono text-slate-400 mb-3.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-slate-300">
                            MC {pack.gameVersion}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-white/[0.04] border border-white/[0.06] text-slate-300">
                            {pack.loader}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                            Изолированная папка
                          </span>
                        </div>
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2">
                        <button
                          disabled={isCurrentlyInstalling || !!installingId}
                          onClick={() => handleInstall(pack.projectId, pack.title, undefined, pack.gameVersion)}
                          className="flex-1 py-2 px-3 rounded-xl btn-accent font-bold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                        >
                          {isCurrentlyInstalling ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Установка...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              <span>Установить сборку (1 клик)</span>
                            </>
                          )}
                        </button>
                        <button
                          disabled={!!installingId}
                          onClick={() => handleOpenVersionPicker(pack.projectId, pack.title)}
                          className="py-2 px-3 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 hover:text-white text-xs font-semibold border border-white/[0.08] transition-all cursor-pointer"
                          title="Выбрать другую версию"
                        >
                          Версии
                        </button>
                      </div>
                    </SpotlightCard>
                  );
                })}
              </div>
            </div>
          )}

          {/* Catalog Modpack List */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <Package className="w-3.5 h-3.5 text-emerald-400" />
                <span>
                  {searchQuery ? `Результаты поиска (${totalHits})` : `Каталог сборок (${totalHits})`}
                </span>
              </h3>
              {totalHits > 0 && (
                <span className="text-[11px] text-slate-400 font-mono">
                  Страница {page + 1} из {totalPages || 1}
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="py-20 flex flex-col items-center justify-center text-slate-400 gap-3">
                <RefreshCw className="w-8 h-8 animate-spin text-emerald-400" />
                <span className="text-xs font-medium">Загрузка каталога сборок...</span>
              </div>
            ) : modpacks.length === 0 ? (
              <div className="py-16 text-center text-slate-400 bg-white/[0.02] rounded-3xl border border-white/[0.05] p-8">
                <Package className="w-10 h-10 mx-auto text-slate-600 mb-3" />
                <p className="text-sm font-bold text-white">Сборки не найдены</p>
                <p className="text-xs text-slate-500 mt-1">
                  Попробуйте изменить поисковый запрос, категорию или фильтр версии
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {modpacks.map((mod) => {
                  const isCurrent = installingId === mod.project_id;
                  const formattedDownloads =
                    mod.downloads >= 1_000_000
                      ? `${(mod.downloads / 1_000_000).toFixed(1)}M`
                      : mod.downloads >= 1_000
                      ? `${Math.round(mod.downloads / 1_000)}K`
                      : `${mod.downloads}`;

                  return (
                    <SpotlightCard
                      key={mod.project_id}
                      className="hover:border-emerald-500/50 hover:shadow-[0_0_25px_rgba(16,185,129,0.25)] transition-all duration-300 group flex flex-col justify-between"
                      glowColor="rgba(16, 185, 129, 0.3)"
                    >
                      <div>
                        {/* Header: Icon + Title + Author */}
                        <div className="flex items-start gap-3 mb-2.5">
                          {mod.icon_url ? (
                            <img
                              src={mod.icon_url}
                              alt={mod.title}
                              className="w-12 h-12 rounded-xl object-cover border border-white/10 shadow-md flex-shrink-0 group-hover:scale-105 transition-transform"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center text-emerald-400 flex-shrink-0">
                              <Layers className="w-6 h-6" />
                            </div>
                          )}
                          <div className="overflow-hidden flex-1 min-w-0">
                            <h4 className="text-sm font-bold text-white truncate group-hover:text-emerald-300 transition-colors">
                              {mod.title}
                            </h4>
                            <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                              <span className="truncate">от {mod.author}</span>
                              <span>•</span>
                              <span className="text-emerald-400 font-mono font-semibold">{formattedDownloads} скач.</span>
                            </div>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed mb-3">
                          {mod.description}
                        </p>

                        {/* Categories tags */}
                        {mod.categories && mod.categories.length > 0 && (
                          <div className="flex items-center gap-1.5 flex-wrap mb-3.5">
                            {mod.categories.slice(0, 3).map((cat) => (
                              <span
                                key={cat}
                                className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-slate-400"
                              >
                                {cat}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-2 pt-2 border-t border-white/[0.05]">
                        <button
                          disabled={isCurrent || !!installingId}
                          onClick={() => handleInstall(mod.project_id, mod.title)}
                          className="flex-1 py-2 px-3 rounded-xl btn-accent font-semibold text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 cursor-pointer disabled:opacity-50"
                        >
                          {isCurrent ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Установка...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              <span>Установить</span>
                            </>
                          )}
                        </button>
                        <button
                          disabled={!!installingId}
                          onClick={() => handleOpenVersionPicker(mod.project_id, mod.title)}
                          className="py-2 px-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-400 hover:text-white text-xs border border-white/[0.06] transition-colors cursor-pointer"
                          title="Выбрать версию сборки"
                        >
                          Версии
                        </button>
                      </div>
                    </SpotlightCard>
                  );
                })}
              </div>
            )}

            {/* Pagination Controls ("бесконечность сборок") */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-4 mt-6 pt-4 border-t border-white/[0.08]">
                <div className="text-xs text-slate-400 font-mono">
                  Сборки {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, totalHits)} из {totalHits.toLocaleString()}
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    disabled={page === 0 || isLoading}
                    onClick={() => fetchModpacks(0)}
                    className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title="Первая страница"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={page === 0 || isLoading}
                    onClick={() => fetchModpacks(page - 1)}
                    className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-slate-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    <span>Назад</span>
                  </button>

                  <span className="px-3 py-1.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 text-xs font-bold font-mono">
                    {page + 1} / {totalPages}
                  </span>

                  <button
                    disabled={page >= totalPages - 1 || isLoading}
                    onClick={() => fetchModpacks(page + 1)}
                    className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-slate-300 hover:text-white text-xs font-semibold transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer flex items-center gap-1"
                  >
                    <span>Вперед</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  <button
                    disabled={page >= totalPages - 1 || isLoading}
                    onClick={() => fetchModpacks(totalPages - 1)}
                    className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-all disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                    title="Последняя страница"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Version Picker Sub-Modal */}
        {versionPickerPack && (
          <div className="fixed inset-0 z-60 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
            <div className="glass-card w-full max-w-lg max-h-[80vh] rounded-3xl border border-emerald-500/30 p-5 shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-150">
              <div className="flex items-start justify-between pb-3 border-b border-white/[0.08]">
                <div>
                  <h3 className="text-base font-bold text-white">Выбор версии сборки</h3>
                  <p className="text-xs text-emerald-400 font-medium truncate max-w-sm mt-0.5">
                    {versionPickerPack.title}
                  </p>
                </div>
                <button
                  onClick={() => setVersionPickerPack(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.08]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto py-3 space-y-2 pr-1 my-2">
                {loadingVersions ? (
                  <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                    <RefreshCw className="w-6 h-6 animate-spin text-emerald-400" />
                    <span className="text-xs">Загрузка доступных версий...</span>
                  </div>
                ) : availableVersions.length === 0 ? (
                  <div className="py-10 text-center text-slate-400 text-xs">
                    Не найдено версий сборки
                  </div>
                ) : (
                  availableVersions.map((v) => (
                    <div
                      key={v.id}
                      className="p-3 rounded-2xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-emerald-500/40 transition-all flex items-center justify-between gap-3 group"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-white group-hover:text-emerald-300 transition-colors">
                            {v.name || v.version_number}
                          </span>
                          <span
                            className={`text-[10px] px-2 py-0.5 rounded-md font-mono ${
                              v.version_type === "release"
                                ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30"
                                : "bg-amber-500/15 text-amber-400 border border-amber-500/30"
                            }`}
                          >
                            {v.version_type}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1 font-mono flex items-center gap-2 flex-wrap">
                          <span>MC: {v.game_versions.slice(0, 3).join(", ")}</span>
                          <span>•</span>
                          <span>{v.loaders.join(", ")}</span>
                        </div>
                      </div>

                      <button
                        onClick={() =>
                          handleInstall(
                            versionPickerPack.projectId,
                            versionPickerPack.title,
                            v.id,
                            v.game_versions[0]
                          )
                        }
                        className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-glow transition-all active:scale-95 cursor-pointer flex-shrink-0"
                      >
                        Выбрать
                      </button>
                    </div>
                  ))
                )}
              </div>

              <div className="pt-2 border-t border-white/[0.08] flex justify-end">
                <button
                  onClick={() => setVersionPickerPack(null)}
                  className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-slate-300 text-xs font-semibold cursor-pointer"
                >
                  Закрыть
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
