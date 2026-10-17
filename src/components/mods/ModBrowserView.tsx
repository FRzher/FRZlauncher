import React, { useState, useEffect, useRef } from "react";
import {
  Search,
  Package,
  Download,
  Check,
  RefreshCw,
  Layers,
  ExternalLink,
  Globe,
  FileCode,
  Sparkles,
  Palette,
  Box,
  Link2,
  X,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Compass,
  Monitor,
  Server,
  SlidersHorizontal,
  Filter,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useInstanceStore } from "../../store/instanceStore";
import {
  InstallModResult,
  MinecraftInsideDownloadItem,
  MinecraftInsideSearchResult,
  ModrinthHit,
  ModrinthSearchResult,
  ProjectType,
  VersionEntry,
} from "../../types";
import { SpotlightCard } from "../common/SpotlightCard";

type CatalogSource = "modrinth" | "minecraft_inside";

const MOD_CATEGORIES = [
  { id: "all", label: "Все категории" },
  { id: "optimization", label: "⚡ Оптимизация (FPS)" },
  { id: "utility", label: "🛠️ Утилиты & HUD" },
  { id: "technology", label: "⚙️ Технологии & Механизмы" },
  { id: "magic", label: "✨ Магия & Заклинания" },
  { id: "adventure", label: "🗺️ Приключения & Квесты" },
  { id: "decoration", label: "🪑 Декорации & Мебель" },
  { id: "storage", label: "📦 Хранилища & Сундуки" },
  { id: "equipment", label: "⚔️ Оружие & Броня" },
  { id: "worldgen", label: "🌍 Генерация мира" },
  { id: "mobs", label: "🐉 Мобы & Существа" },
  { id: "food", label: "🍎 Еда и фермы" },
  { id: "library", label: "📚 Библиотеки & API" },
  { id: "transportation", label: "🚂 Транспорт & Поезда" },
  { id: "game-mechanics", label: "🎮 Геймплей & Механики" },
  { id: "social", label: "💬 Чат & Голос" },
  { id: "economy", label: "🪙 Экономика" },
];

const RESOURCEPACK_CATEGORIES = [
  { id: "all", label: "Все стили" },
  { id: "realistic", label: "📸 Фотореализм" },
  { id: "simplistic", label: "🎨 Минимализм" },
  { id: "faithful", label: "💎 Faithful / Классика" },
  { id: "medieval", label: "🏰 Средневековье" },
  { id: "modern", label: "🏙️ Современные" },
  { id: "steampunk", label: "⚙️ Стимпанк" },
  { id: "animated", label: "✨ Анимированные" },
];

const SHADER_CATEGORIES = [
  { id: "all", label: "Все шейдеры" },
  { id: "realistic", label: "🌅 Реалистичные" },
  { id: "performance", label: "⚡ Для слабых ПК (Potato/Lite)" },
  { id: "fantasy", label: "🔮 Фэнтези & Магия" },
  { id: "chocapic", label: "🎬 Кинематографичные" },
];

const DATAPACK_CATEGORIES = [
  { id: "all", label: "Все датапаки" },
  { id: "worldgen", label: "🌍 Новая генерация" },
  { id: "adventure", label: "🗺️ Квесты и структуры" },
  { id: "game-mechanics", label: "🎮 Новые механики" },
  { id: "utility", label: "🛠️ Утилиты" },
];

export type ModEnvironmentFilter = "all" | "client" | "client_only" | "both" | "server_only";

const ENVIRONMENT_FILTERS: { id: ModEnvironmentFilter; label: string; shortLabel: string; title: string }[] = [
  { id: "all", label: "Все окружения", shortLabel: "Все", title: "Все моды без фильтрации по стороне запуска" },
  { id: "client", label: "🖥️ Клиентские", shortLabel: "🖥️ Клиент", title: "Моды, работающие на клиенте (одиночная игра и мультиплеер)" },
  { id: "client_only", label: "🖥️ Только клиент (Vanilla)", shortLabel: "🖥️ Только клиент", title: "Клиентские моды, не требующие установки на сервер (HUD, FPS, шейдеры, зум)" },
  { id: "both", label: "🌐 Клиент + Сервер", shortLabel: "🌐 Клиент + Сервер", title: "Универсальные геймплейные моды с новыми предметами, блоками и биомами" },
  { id: "server_only", label: "⚙️ Только сервер", shortLabel: "⚙️ Сервер", title: "Моды, предназначенные только для серверной стороны" },
];

export const ModBrowserView: React.FC = () => {
  const { instances, selectedInstance, selectInstance } = useInstanceStore();

  const [source, setSource] = useState<CatalogSource>("modrinth");
  const [projectType, setProjectType] = useState<ProjectType>("mod");
  const [query, setQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [environmentFilter, setEnvironmentFilter] = useState<ModEnvironmentFilter>("all");

  // Version and Loader Filters (Supports ALL Minecraft versions)
  const [selectedGameVersion, setSelectedGameVersion] = useState<string>("instance");
  const [selectedLoader, setSelectedLoader] = useState<string>("instance");
  const [mcVersionList, setMcVersionList] = useState<string[]>([
    "1.21.4", "1.21.1", "1.20.4", "1.20.1", "1.19.4", "1.19.2", "1.18.2", "1.16.5", "1.12.2", "1.7.10"
  ]);

  // Fetch full list of versions from Mojang manifest
  useEffect(() => {
    invoke<VersionEntry[]>("get_mojang_versions")
      .then((mojangList) => {
        const releases = mojangList
          .filter((v) => v.type === "release")
          .map((v) => v.id);
        const popular = ["1.21.4", "1.21.1", "1.20.4", "1.20.1", "1.19.4", "1.19.2", "1.18.2", "1.16.5", "1.12.2", "1.7.10"];
        const combined = Array.from(new Set([...popular, ...releases]));
        setMcVersionList(combined);
      })
      .catch(() => {});
  }, []);

  // Modrinth State & Pagination
  const [mods, setMods] = useState<ModrinthHit[]>([]);
  const [totalHits, setTotalHits] = useState(0);
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 24;
  const gridContainerRef = useRef<HTMLDivElement>(null);
  const [isModrinthLoading, setIsModrinthLoading] = useState(false);
  const [installingMap, setInstallingMap] = useState<Record<string, boolean>>({});
  const [installedMap, setInstalledMap] = useState<Record<string, boolean>>({});

  // Current active categories depending on project type
  const activeCategories =
    projectType === "mod"
      ? MOD_CATEGORIES
      : projectType === "resourcepack"
      ? RESOURCEPACK_CATEGORIES
      : projectType === "shader"
      ? SHADER_CATEGORIES
      : DATAPACK_CATEGORIES;

  // Minecraft Inside State
  const [insideQuery, setInsideQuery] = useState("");
  const [insideResults, setInsideResults] = useState<MinecraftInsideSearchResult[]>([]);
  const [isInsideLoading, setIsInsideLoading] = useState(false);
  const [activeInsideItem, setActiveInsideItem] = useState<MinecraftInsideSearchResult | null>(null);
  const [insideDownloads, setInsideDownloads] = useState<MinecraftInsideDownloadItem[]>([]);
  const [isDownloadsLoading, setIsDownloadsLoading] = useState(false);
  const [insideInstallingUrl, setInsideInstallingUrl] = useState<string | null>(null);
  const [insideInstalledUrls, setInsideInstalledUrls] = useState<Record<string, string>>({});

  // Direct URL paste
  const [directUrl, setDirectUrl] = useState("");

  // Notifications / Feedback
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Active target instance
  const currentInstance = selectedInstance || instances[0];
  const currentGameVersion = currentInstance?.game_version || currentInstance?.mcVersion || "";
  const currentLoaderType = currentInstance?.loader_type || currentInstance?.loader || "vanilla";

  const effectiveGameVersion =
    selectedGameVersion === "instance"
      ? (currentGameVersion || undefined)
      : selectedGameVersion === "all"
      ? undefined
      : selectedGameVersion;

  const effectiveLoader =
    selectedLoader === "instance"
      ? (currentLoaderType && currentLoaderType !== "vanilla" ? currentLoaderType : undefined)
      : selectedLoader === "all"
      ? undefined
      : selectedLoader;

  const showNotification = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
    setTimeout(() => {
      setNotification((curr) => (curr?.message === message ? null : curr));
    }, 6000);
  };

  // Search Modrinth with category, environment and pagination
  const searchModrinth = async (targetPage = page) => {
    setIsModrinthLoading(true);
    setError(null);
    try {
      const searchType = projectType === "map" ? "datapack" : projectType;
      const searchCat = projectType === "map" ? "adventure" : (selectedCategory === "all" ? undefined : selectedCategory);
      const envParam = projectType === "mod" && environmentFilter !== "all" ? environmentFilter : undefined;

      const res = await invoke<ModrinthSearchResult>("search_modrinth", {
        query: query.trim(),
        gameVersion: effectiveGameVersion,
        loader: searchType === "mod" ? effectiveLoader : undefined,
        projectType: searchType,
        category: searchCat,
        environment: envParam,
        offset: targetPage * PAGE_SIZE,
        limit: PAGE_SIZE,
      });
      setMods(res?.hits || []);
      setTotalHits(res?.total_hits || 0);
      if (gridContainerRef.current) {
        gridContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch (err: unknown) {
      // Modrinth is unreachable from some networks (including parts of Russia).
      // Switch to the Russian catalog instead of leaving the whole tab unusable.
      const fallbackQuery = query.trim() || (projectType === "map" ? "skyblock" : "sodium");
      try {
        const results = await invoke<MinecraftInsideSearchResult[]>("search_minecraft_inside", { query: fallbackQuery });
        setInsideQuery(fallbackQuery);
        setInsideResults(results);
        setSource("minecraft_inside");
        setError(null);
        showNotification("Modrinth недоступен — открыли каталог Minecraft Inside (RU)");
      } catch (fallbackErr: unknown) {
        setError(`Modrinth: ${String(err)}. Каталог Minecraft Inside тоже недоступен: ${String(fallbackErr)}`);
      }
    } finally {
      setIsModrinthLoading(false);
    }
  };

  useEffect(() => {
    if (source === "modrinth") {
      setPage(0);
      searchModrinth(0);
    }
  }, [
    source,
    projectType,
    selectedCategory,
    environmentFilter,
    selectedGameVersion,
    selectedLoader,
    currentInstance?.id,
    currentGameVersion,
    currentLoaderType,
  ]);

  // Install Modrinth Project with auto-dependencies
  const handleModrinthInstall = async (mod: ModrinthHit) => {
    if (!currentInstance) {
      showNotification("Сначала создайте или выберите сборку Minecraft!", "error");
      return;
    }
    setInstallingMap((prev) => ({ ...prev, [mod.project_id]: true }));
    setError(null);
    try {
      const gv = currentGameVersion || "1.21.1";
      const loader = currentLoaderType || "fabric";
      const res = await invoke<InstallModResult>("install_modrinth_mod", {
        instanceId: currentInstance.id,
        projectId: mod.project_id,
        gameVersion: gv,
        loader: loader,
        projectType,
      });

      setInstalledMap((prev) => ({ ...prev, [mod.project_id]: true }));

      if (res.installed_dependencies && res.installed_dependencies.length > 0) {
        showNotification(
          `«${mod.title}» установлен! Зависимости автоматически загружены: ${res.installed_dependencies.join(", ")}`,
          "success"
        );
      } else {
        showNotification(`«${mod.title}» (${res.filename}) успешно установлен в сборку!`, "success");
      }
    } catch (err: unknown) {
      setError(`Ошибка установки: ${err}`);
      showNotification(`Не удалось установить «${mod.title}»: ${err}`, "error");
    } finally {
      setInstallingMap((prev) => ({ ...prev, [mod.project_id]: false }));
    }
  };

  // Search Minecraft Inside
  const searchMinecraftInside = async (searchStory?: string) => {
    const term = searchStory !== undefined ? searchStory : insideQuery;
    if (!term.trim()) return;
    setIsInsideLoading(true);
    setError(null);
    try {
      const results = await invoke<MinecraftInsideSearchResult[]>("search_minecraft_inside", {
        query: term.trim(),
      });
      setInsideResults(results);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setIsInsideLoading(false);
    }
  };

  // Open Minecraft Inside item & fetch downloads
  const handleOpenInsideItem = async (item: MinecraftInsideSearchResult) => {
    setActiveInsideItem(item);
    setIsDownloadsLoading(true);
    setInsideDownloads([]);
    try {
      const downloads = await invoke<MinecraftInsideDownloadItem[]>(
        "get_minecraft_inside_downloads",
        { pageUrl: item.url }
      );
      setInsideDownloads(downloads);
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setIsDownloadsLoading(false);
    }
  };

  // Handle direct link paste from Minecraft Inside
  const handleDirectUrlFetch = async () => {
    const url = directUrl.trim();
    if (!url.startsWith("http")) {
      setError("Укажите корректный URL-адрес (например, https://minecraft-inside.ru/mods/...)");
      return;
    }
    const item: MinecraftInsideSearchResult = {
      title: "Прямая ссылка",
      url,
      category: url.includes("/resource-packs/")
        ? "Ресурспак"
        : url.includes("/datapacks/")
        ? "Датапак"
        : url.includes("/shaders/")
        ? "Шейдеры"
        : "Мод",
      description: url,
    };
    handleOpenInsideItem(item);
  };

  // Download file from Minecraft Inside
  const handleDownloadInsideFile = async (dl: MinecraftInsideDownloadItem) => {
    if (!currentInstance || !activeInsideItem) return;
    setInsideInstallingUrl(dl.url);
    setError(null);
    try {
      const filename = await invoke<string>("install_minecraft_inside_file", {
        instanceId: currentInstance.id,
        downloadUrl: dl.url,
        pageUrl: activeInsideItem.url,
        fileType: projectType,
      });

      setInsideInstalledUrls((prev) => ({ ...prev, [dl.url]: filename }));
      if (filename.includes("распакована") || projectType === "map" || activeInsideItem.category === "Карта") {
        showNotification(filename, "success");
      } else {
        showNotification(`Файл «${filename}» успешно скачан в сборку!`, "success");
      }
    } catch (err: unknown) {
      setError(`Ошибка скачивания: ${err}`);
      showNotification(`Ошибка скачивания: ${err}`, "error");
    } finally {
      setInsideInstallingUrl(null);
    }
  };

  const formatDownloads = (num?: number) => {
    if (typeof num !== "number" || isNaN(num)) return "0";
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
    return num.toString();
  };

  const typeTabs: { id: ProjectType; label: string; icon: React.FC<{ className?: string }> }[] = [
    { id: "mod", label: "Моды", icon: Box },
    { id: "map", label: "Карты", icon: Compass },
    { id: "datapack", label: "Датапаки", icon: FileCode },
    { id: "resourcepack", label: "Ресурспаки", icon: Palette },
    { id: "shader", label: "Шейдеры", icon: Sparkles },
    { id: "modpack", label: "Сборки", icon: Layers },
  ];

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-6">
      {/* Notification Toast */}
      {notification && (
        <div
          className={`fixed top-12 right-6 z-50 p-4 rounded-2xl shadow-2xl border backdrop-blur-xl flex items-center gap-3 animate-in fade-in slide-in-from-top-4 duration-300 max-w-md ${
            notification.type === "success"
              ? "bg-emerald-950/80 border-emerald-500/40 text-emerald-200"
              : "bg-red-950/80 border-red-500/40 text-red-200"
          }`}
        >
          {notification.type === "success" ? (
            <Check className="w-5 h-5 text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
          )}
          <span className="text-xs leading-relaxed">{notification.message}</span>
          <button
            onClick={() => setNotification(null)}
            className="text-slate-400 hover:text-white ml-auto"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2.5">
            <span>Каталог контента</span>
            <span className="text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-md bg-white/[0.06] text-slate-300 border border-white/[0.08]">
              {source === "modrinth" ? "Modrinth" : "Minecraft Inside"}
            </span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Установка модов, карт, ресурспаков, шейдеров и датапаков
          </p>
        </div>

        {/* Target Instance Selector */}
        {instances.length > 0 && (
          <div className="flex items-center gap-2 bg-white/[0.03] p-1.5 rounded-xl border border-white/[0.08]">
            <Layers className="w-3.5 h-3.5 text-indigo-400 ml-1.5" />
            <span className="text-xs text-slate-400">Сборка:</span>
            <select
              value={currentInstance?.id}
              onChange={(e) => selectInstance(e.target.value)}
              className="bg-surface-card border border-white/[0.08] text-xs font-semibold text-slate-200 rounded-lg px-2.5 py-1 focus:outline-none focus:border-indigo-500 cursor-pointer"
            >
              {instances.map((inst) => (
                <option key={inst.id} value={inst.id}>
                  {inst.name} ({inst.loader_type || inst.loader || "vanilla"} {inst.game_version || inst.mcVersion || ""})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Source Selector & Content Type Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        {/* Source Switcher */}
        <div className="flex items-center p-1 bg-white/[0.03] border border-white/[0.08] rounded-xl">
          <button
            onClick={() => setSource("modrinth")}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              source === "modrinth"
                ? "bg-indigo-600 text-white shadow-glow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Modrinth API</span>
          </button>
          <button
            onClick={() => {
              setSource("minecraft_inside");
              if (projectType === "map" && !insideQuery) {
                setInsideQuery("skyblock");
                searchMinecraftInside("skyblock");
              } else if (insideResults.length === 0 && !insideQuery) {
                setInsideQuery("sodium");
                searchMinecraftInside("sodium");
              }
            }}
            className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
              source === "minecraft_inside"
                ? "bg-indigo-600 text-white shadow-glow"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Minecraft Inside (RU)</span>
          </button>
        </div>

        {/* Content Type Filter Chips */}
        <div className="flex items-center gap-1.5 bg-white/[0.02] p-1 rounded-xl border border-white/[0.06]">
          {typeTabs.map((tab) => {
            const Icon = tab.icon;
            const isActive = projectType === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setProjectType(tab.id);
                  if (tab.id === "map" && source === "minecraft_inside") {
                    const q = insideQuery || "skyblock";
                    setInsideQuery(q);
                    searchMinecraftInside(q);
                  }
                }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                  isActive
                    ? "bg-white/[0.1] text-white shadow-sm border border-white/[0.12]"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.03]"
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${isActive ? "text-indigo-400" : "text-slate-500"}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* MODRINTH SECTION */}
      {source === "modrinth" && (
        <>
          {/* RU Anti-block Quick Switch Bar */}
          <div className="mb-3 px-3 py-2 rounded-xl bg-gradient-to-r from-blue-950/30 to-indigo-950/20 border border-blue-500/20 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-slate-300">
              <Globe className="w-3.5 h-3.5 text-blue-400" />
              <span>Modrinth может блокироваться провайдерами РФ без VPN/прокси.</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setSource("minecraft_inside");
                  const q = query.trim() || (projectType === "map" ? "skyblock" : "sodium");
                  setInsideQuery(q);
                  searchMinecraftInside(q);
                }}
                className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-[11px] font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Перейти на Minecraft Inside (РФ)</span>
              </button>
            </div>
          </div>

          {/* Search Bar */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              searchModrinth();
            }}
            className="flex items-center gap-3 mb-4"
          >
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                placeholder={`Поиск ${
                  projectType === "mod"
                    ? "модов"
                    : projectType === "datapack"
                    ? "датапаков"
                    : projectType === "resourcepack"
                    ? "ресурспаков"
                    : "шейдеров"
                } для Minecraft ${currentGameVersion || "Все версии"} (${currentLoaderType || "vanilla"})...`}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={isModrinthLoading}
              className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-glow transition-all flex items-center gap-2 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isModrinthLoading ? "animate-spin" : ""}`} />
              <span>Найти</span>
            </button>
          </form>

          {/* Map Recommendation Banner on Modrinth */}
          {projectType === "map" && (
            <div className="mb-4 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 flex-shrink-0">
                  <Compass className="w-4 h-4" />
                </div>
                <div className="text-xs text-amber-200">
                  <span className="font-bold">Ищете карты (SkyBlock, Паркур, Хоррор, Один Блок, Города)?</span>
                  <p className="text-amber-300/80 text-[11px] mt-0.5">В каталоге Minecraft Inside собраны тысячи русскоязычных карт с автоматической распаковкой в одиночную игру.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSource("minecraft_inside");
                  setInsideQuery("skyblock");
                  searchMinecraftInside("skyblock");
                }}
                className="px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs whitespace-nowrap transition-all cursor-pointer shadow-sm flex-shrink-0"
              >
                Открыть Minecraft Inside
              </button>
            </div>
          )}

          {/* Quick Filters: Version & Modloader & Environment */}
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {/* Minecraft Version Selector */}
            <div className="flex items-center gap-1.5 bg-white/[0.03] px-2.5 py-1.5 rounded-xl border border-white/[0.08] text-xs">
              <span className="text-slate-400 font-medium">Версия MC:</span>
              <select
                value={selectedGameVersion}
                onChange={(e) => setSelectedGameVersion(e.target.value)}
                className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="instance" className="bg-slate-900 text-white">
                  Сборка ({currentGameVersion || "Не выбрана"})
                </option>
                <option value="all" className="bg-slate-900 text-white">
                  Все версии MC
                </option>
                {mcVersionList.map((v) => (
                  <option key={v} value={v} className="bg-slate-900 text-white">
                    {v}
                  </option>
                ))}
              </select>
            </div>

            {/* Modloader Selector */}
            {(projectType === "mod" || projectType === "modpack") && (
              <div className="flex items-center gap-1.5 bg-white/[0.03] px-2.5 py-1.5 rounded-xl border border-white/[0.08] text-xs">
                <span className="text-slate-400 font-medium">Загрузчик:</span>
                <select
                  value={selectedLoader}
                  onChange={(e) => setSelectedLoader(e.target.value)}
                  className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
                >
                  <option value="instance" className="bg-slate-900 text-white">
                    Сборка ({currentLoaderType})
                  </option>
                  <option value="all" className="bg-slate-900 text-white">
                    Все загрузчики
                  </option>
                  <option value="fabric" className="bg-slate-900 text-white">Fabric</option>
                  <option value="neoforge" className="bg-slate-900 text-white">NeoForge</option>
                  <option value="forge" className="bg-slate-900 text-white">Forge</option>
                  <option value="quilt" className="bg-slate-900 text-white">Quilt</option>
                </select>
              </div>
            )}

            {/* Environment Filter Selector (Client vs Server) */}
            {projectType === "mod" && (
              <div className="flex items-center gap-1.5 bg-white/[0.03] px-2.5 py-1.5 rounded-xl border border-white/[0.08] text-xs">
                <SlidersHorizontal className="w-3.5 h-3.5 text-indigo-400" />
                <span className="text-slate-400 font-medium">Окружение:</span>
                <select
                  value={environmentFilter}
                  onChange={(e) => {
                    setEnvironmentFilter(e.target.value as ModEnvironmentFilter);
                    setPage(0);
                  }}
                  className="bg-transparent text-slate-200 font-semibold focus:outline-none cursor-pointer"
                >
                  {ENVIRONMENT_FILTERS.map((ef) => (
                    <option key={ef.id} value={ef.id} className="bg-slate-900 text-white" title={ef.title}>
                      {ef.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Quick Environment Filter Chips (For instant 1-click toggling) */}
          {source === "modrinth" && projectType === "mod" && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-2 scrollbar-none">
              <span className="text-[11px] text-slate-400 font-medium flex items-center gap-1 mr-1">
                <Filter className="w-3 h-3 text-slate-500" />
                <span>Тип мода:</span>
              </span>
              {ENVIRONMENT_FILTERS.map((ef) => {
                const isSelected = environmentFilter === ef.id;
                return (
                  <button
                    key={ef.id}
                    onClick={() => {
                      setEnvironmentFilter(ef.id);
                      setPage(0);
                    }}
                    title={ef.title}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                      isSelected
                        ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 shadow-glow"
                        : "bg-white/[0.02] text-slate-400 hover:text-white hover:bg-white/[0.05] border border-white/[0.06]"
                    }`}
                  >
                    {ef.shortLabel}
                  </button>
                );
              })}
            </div>
          )}

          {/* Modrinth Category Filter Bar */}
          {source === "modrinth" && activeCategories.length > 0 && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-thin">
              {activeCategories.map((cat) => {
                const isSelected = selectedCategory === cat.id;
                return (
                  <button
                    key={cat.id}
                    onClick={() => {
                      setSelectedCategory(cat.id);
                      setPage(0);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                      isSelected
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-glow"
                        : "bg-white/[0.03] text-slate-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.06]"
                    }`}
                  >
                    <span>{cat.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {error && (
            <div className="p-3.5 mb-4 rounded-xl bg-red-950/40 border border-red-500/30 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2.5 text-red-300">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSource("minecraft_inside");
                  const q = query.trim() || (projectType === "map" ? "skyblock" : "sodium");
                  setInsideQuery(q);
                  searchMinecraftInside(q);
                }}
                className="px-3 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] flex items-center gap-1.5 transition-colors cursor-pointer flex-shrink-0 shadow-sm"
              >
                <ExternalLink className="w-3 h-3" />
                <span>Открыть Minecraft Inside</span>
              </button>
            </div>
          )}

          {/* Mod Cards Grid */}
          <div ref={gridContainerRef} className="flex-1 overflow-y-auto pr-1">
            {isModrinthLoading ? (
              <div className="h-80 flex flex-col items-center justify-center text-slate-500 gap-3">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                <span className="text-xs">Загрузка каталога Modrinth...</span>
              </div>
            ) : !Array.isArray(mods) || mods.length === 0 ? (
              <div className="h-80 flex flex-col items-center justify-center text-slate-500 text-xs">
                Ничего не найдено по данному запросу или фильтрам.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-4">
                {(mods || []).map((mod) => {
                  const isInstalling = !!installingMap[mod.project_id];
                  const isInstalled = !!installedMap[mod.project_id];

                  return (
                    <SpotlightCard
                      key={mod.project_id}
                      className="hover:border-indigo-500/50"
                      glowColor="rgba(99, 102, 241, 0.4)"
                    >
                      <div>
                        {/* Top Row: Icon + Name + Author */}
                        <div className="flex items-start gap-3 mb-3">
                          {mod.icon_url ? (
                            <img
                              src={mod.icon_url}
                              alt={mod.title}
                              className="w-12 h-12 rounded-xl object-cover border border-white/10 flex-shrink-0"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400 flex-shrink-0">
                              <Package className="w-6 h-6" />
                            </div>
                          )}

                          <div className="overflow-hidden flex-1">
                            <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors truncate">
                              {mod.title}
                            </h3>
                            <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                              автор: <span className="text-slate-300 font-medium">{mod.author}</span>
                            </div>
                          </div>
                        </div>

                        {/* Description */}
                        <p className="text-xs text-slate-300 line-clamp-2 leading-relaxed mb-3">
                          {mod.description}
                        </p>

                        {/* Tags & Downloads & Environment Badges */}
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                          <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-slate-300 font-mono flex items-center gap-1">
                            <Download className="w-3 h-3 text-slate-400" />
                            {formatDownloads(mod.downloads)}
                          </span>

                          {/* Client / Server Environment Badges */}
                          {mod.client_side && mod.client_side !== "unsupported" ? (
                            mod.server_side === "unsupported" ? (
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold flex items-center gap-1"
                                title="Клиентский мод: устанавливается только на ПК игрока, работает на любых серверах"
                              >
                                <Monitor className="w-3 h-3" />
                                <span>Только клиент</span>
                              </span>
                            ) : mod.server_side === "required" ? (
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold flex items-center gap-1"
                                title="Клиент + Сервер: геймплейный мод, требуется одинаковая установка на клиенте и сервере"
                              >
                                <Globe className="w-3 h-3" />
                                <span>Клиент + Сервер</span>
                              </span>
                            ) : (
                              <span
                                className="text-[10px] px-2 py-0.5 rounded-md bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 font-semibold flex items-center gap-1"
                                title="Поддерживается клиентом (сервер опционален)"
                              >
                                <Monitor className="w-3 h-3" />
                                <span>Клиент</span>
                              </span>
                            )
                          ) : mod.client_side === "unsupported" ? (
                            <span
                              className="text-[10px] px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold flex items-center gap-1"
                              title="Серверный мод: устанавливается только на сервер"
                            >
                              <Server className="w-3 h-3" />
                              <span>Только сервер</span>
                            </span>
                          ) : null}

                          {(mod.categories || []).slice(0, 3).map((cat) => (
                            <span
                              key={cat}
                              className="text-[10px] px-1.5 py-0.5 rounded-md bg-white/[0.03] text-slate-300 border border-white/[0.06] font-mono capitalize"
                            >
                              {cat}
                            </span>
                          ))}
                        </div>
                      </div>

                      {/* Install Button with auto-dependencies */}
                      <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between gap-2">
                        <button
                          disabled={isInstalling || isInstalled}
                          onClick={() => handleModrinthInstall(mod)}
                          className={`flex-1 py-2 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-all shadow-glow cursor-pointer ${
                            isInstalled
                              ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 cursor-default"
                              : isInstalling
                              ? "bg-indigo-700 text-slate-300 cursor-wait"
                              : "bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95"
                          }`}
                        >
                          {isInstalled ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Установлено</span>
                            </>
                          ) : isInstalling ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              <span>Установка с зависимостями...</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-3.5 h-3.5" />
                              <span>Установить в сборку</span>
                            </>
                          )}
                        </button>

                        <a
                          href={`https://modrinth.com/${projectType === "mod" ? "mod" : projectType}/${mod.slug}`}
                          target="_blank"
                          rel="noreferrer"
                          className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/[0.06] border border-white/[0.06] transition-colors"
                          title="Открыть на Modrinth"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>
                    </SpotlightCard>
                  );
                })}
              </div>
            )}

            {/* Modrinth Full Pagination Bar */}
            {source === "modrinth" && totalHits > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 pb-3 border-t border-white/[0.08] mt-2 select-none">
                <div className="text-xs text-slate-400">
                  Показано{" "}
                  <span className="font-semibold text-white">
                    {page * PAGE_SIZE + 1} - {Math.min((page + 1) * PAGE_SIZE, totalHits)}
                  </span>{" "}
                  из <span className="font-semibold text-emerald-400">{totalHits.toLocaleString("ru-RU")}</span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    disabled={page === 0 || isModrinthLoading}
                    onClick={() => {
                      setPage(0);
                      searchModrinth(0);
                    }}
                    className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 transition-colors cursor-pointer"
                    title="В самое начало"
                  >
                    <ChevronsLeft className="w-4 h-4" />
                  </button>

                  <button
                    disabled={page === 0 || isModrinthLoading}
                    onClick={() => {
                      const prev = Math.max(0, page - 1);
                      setPage(prev);
                      searchModrinth(prev);
                    }}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Назад</span>
                  </button>

                  <div className="px-3.5 py-2 rounded-xl bg-white/[0.02] border border-white/[0.08] text-xs font-mono font-bold text-slate-200">
                    {page + 1} / {Math.max(1, Math.ceil(totalHits / PAGE_SIZE))}
                  </div>

                  <button
                    disabled={(page + 1) * PAGE_SIZE >= totalHits || isModrinthLoading}
                    onClick={() => {
                      const next = page + 1;
                      setPage(next);
                      searchModrinth(next);
                    }}
                    className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold text-slate-300 transition-colors cursor-pointer"
                  >
                    <span>Вперед</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <button
                    disabled={(page + 1) * PAGE_SIZE >= totalHits || isModrinthLoading}
                    onClick={() => {
                      const last = Math.floor((totalHits - 1) / PAGE_SIZE);
                      setPage(last);
                      searchModrinth(last);
                    }}
                    className="p-2 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed text-slate-300 transition-colors cursor-pointer"
                    title="В самый конец"
                  >
                    <ChevronsRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* MINECRAFT INSIDE SECTION */}
      {source === "minecraft_inside" && (
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Search & URL Bar */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 mb-4">
            {/* Search Input */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                searchMinecraftInside();
              }}
              className="lg:col-span-2 flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Поиск по сайту minecraft-inside.ru (напр. sodium, jei, shaders)..."
                  value={insideQuery}
                  onChange={(e) => setInsideQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <button
                type="submit"
                disabled={isInsideLoading}
                className="px-4 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-glow transition-all flex items-center gap-2 cursor-pointer flex-shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isInsideLoading ? "animate-spin" : ""}`} />
                <span>Искать</span>
              </button>
            </form>

            {/* Direct Link Paste */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleDirectUrlFetch();
              }}
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Link2 className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Вставьте ссылку на материал..."
                  value={directUrl}
                  onChange={(e) => setDirectUrl(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>
              <button
                type="submit"
                className="px-3.5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white font-medium text-xs border border-white/[0.1] transition-all flex items-center gap-1.5 cursor-pointer flex-shrink-0"
              >
                <span>Открыть</span>
              </button>
            </form>
          </div>

          {/* Popular Map Tags on Minecraft Inside */}
          {projectType === "map" && (
            <div className="flex items-center gap-1.5 overflow-x-auto pb-1 mb-3 text-xs">
              <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mr-1">Популярные карты:</span>
              {[
                "skyblock",
                "один блок",
                "паркур",
                "dropper",
                "выживание",
                "хоррор",
                "город",
                "побег",
              ].map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => {
                    setInsideQuery(tag);
                    searchMinecraftInside(tag);
                  }}
                  className="px-2.5 py-1 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.06] text-[11px] capitalize transition-all cursor-pointer whitespace-nowrap"
                >
                  {tag}
                </button>
              ))}
            </div>
          )}

          {error && (
            <div className="p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
              {error}
            </div>
          )}

          {/* Results Grid */}
          <div className="flex-1 overflow-y-auto pr-1">
            {isInsideLoading ? (
              <div className="h-80 flex flex-col items-center justify-center text-slate-500 gap-3">
                <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                <span className="text-xs">Поиск на minecraft-inside.ru...</span>
              </div>
            ) : insideResults.length === 0 ? (
              <div className="h-80 flex flex-col items-center justify-center text-slate-500 text-xs gap-2">
                <Package className="w-8 h-8 text-slate-600 mb-1" />
                <span>Введите запрос или вставьте ссылку на материал с сайта minecraft-inside.ru</span>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4 pb-4">
                {insideResults.map((item, idx) => (
                  <SpotlightCard
                    key={idx}
                    className="hover:border-indigo-500/50"
                    glowColor="rgba(99, 102, 241, 0.4)"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                          {item.category}
                        </span>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-500 hover:text-white transition-colors"
                          title="Открыть на сайте"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      </div>

                      <h3 className="text-sm font-bold text-white group-hover:text-indigo-300 transition-colors line-clamp-2 mb-3">
                        {item.title}
                      </h3>
                    </div>

                    <button
                      onClick={() => handleOpenInsideItem(item)}
                      className="w-full py-2 px-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-glow transition-all active:scale-95 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Выбрать версию и скачать</span>
                    </button>
                  </SpotlightCard>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* MINECRAFT INSIDE DOWNLOAD MODAL / DRAWER */}
      {activeInsideItem && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-md flex items-center justify-center p-4">
          <div className="glass-card w-full max-w-xl max-h-[85vh] rounded-3xl border border-white/[0.12] p-6 shadow-2xl flex flex-col animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 pb-4 border-b border-white/[0.08]">
              <div className="overflow-hidden">
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                  {activeInsideItem.category}
                </span>
                <h2 className="text-base font-bold text-white mt-1.5 line-clamp-2">
                  {activeInsideItem.title}
                </h2>
                <div className="flex items-center gap-2 text-xs text-slate-400 mt-1">
                  <span>Целевая папка:</span>
                  <span className="font-mono text-indigo-400 font-medium">
                    {projectType === "datapack"
                      ? "datapacks/"
                      : projectType === "resourcepack"
                      ? "resourcepacks/"
                      : projectType === "shader"
                      ? "shaderpacks/"
                      : "mods/"}
                  </span>
                </div>
              </div>
              <button
                onClick={() => setActiveInsideItem(null)}
                className="p-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.1] text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Downloads List */}
            <div className="flex-1 overflow-y-auto py-4 space-y-2 pr-1">
              {isDownloadsLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-500 gap-3">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-400" />
                  <span className="text-xs">Получение ссылок на скачивание...</span>
                </div>
              ) : insideDownloads.length === 0 ? (
                <div className="py-12 text-center text-slate-400 text-xs">
                  На странице не найдено прямых файлов для скачивания.
                </div>
              ) : (
                insideDownloads.map((dl, idx) => {
                  const isDownloading = insideInstallingUrl === dl.url;
                  const installedFilename = insideInstalledUrls[dl.url];

                  return (
                    <div
                      key={idx}
                      className="p-3.5 rounded-2xl bg-white/[0.03] border border-white/[0.06] hover:border-indigo-500/30 transition-all flex items-center justify-between gap-3"
                    >
                      <div className="overflow-hidden flex-1">
                        <div className="text-xs font-semibold text-white truncate">
                          {dl.name}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-slate-400 mt-0.5">
                          {dl.size && <span>Размер: {dl.size}</span>}
                          {dl.date && <span>Дата: {dl.date}</span>}
                        </div>
                      </div>

                      <button
                        disabled={isDownloading || !!installedFilename}
                        onClick={() => handleDownloadInsideFile(dl)}
                        className={`py-2 px-3.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 transition-all shadow-glow flex-shrink-0 cursor-pointer ${
                          installedFilename
                            ? "bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 cursor-default"
                            : isDownloading
                            ? "bg-indigo-700 text-slate-300 cursor-wait"
                            : "bg-indigo-600 hover:bg-indigo-500 text-white active:scale-95"
                        }`}
                      >
                        {installedFilename ? (
                          <>
                            <Check className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{projectType === "map" || activeInsideItem?.category === "Карта" ? "Установлено" : "Скачано"}</span>
                          </>
                        ) : isDownloading ? (
                          <>
                            <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            <span>{projectType === "map" || activeInsideItem?.category === "Карта" ? "Распаковка..." : "Скачивание..."}</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3.5 h-3.5" />
                            <span>{projectType === "map" || activeInsideItem?.category === "Карта" ? "Установить карту" : "Скачать в сборку"}</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between text-xs text-slate-400">
              <a
                href={activeInsideItem.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-1.5 text-indigo-400 hover:underline"
              >
                <span>Открыть страницу в браузере</span>
                <ExternalLink className="w-3 h-3" />
              </a>
              <button
                onClick={() => setActiveInsideItem(null)}
                className="px-4 py-1.5 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-slate-200 font-medium cursor-pointer"
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
