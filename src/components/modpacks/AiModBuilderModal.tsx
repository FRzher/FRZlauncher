import React, { useState, useEffect } from "react";
import {
  X,
  Sparkles,
  Bot,
  Check,
  AlertTriangle,
  HelpCircle,
  Download,
  RefreshCw,
  Plus,
  Layers,
  CheckCircle2,
  Trash2,
  ExternalLink,
  ChevronRight,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { useInstanceStore } from "../../store/instanceStore";
import { soundManager } from "../../utils/sound";
import {
  AiBatchInstallProgress,
  AiModResolvedItem,
  AiModSuggestion,
  InstanceConfig,
  LoaderType,
  VersionEntry,
  FabricLoaderItem,
} from "../../types";

interface AiModBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectInstance?: (id: string) => void;
}

const PRESET_TEMPLATES = [
  {
    title: "Пак оптимизации (FPS)",
    desc: "Sodium, Iris, Lithium, FerriteCore, Indium, ImmediatelyFast, EntityCulling",
    text: "Sodium, Iris Shaders, Lithium, FerriteCore, Indium, ImmediatelyFast, EntityCulling, Reese's Sodium Options, Sodium Extra",
    version: "1.20.1",
    loader: "fabric" as LoaderType,
  },
  {
    title: "🧭 Выживание с комфортом",
    desc: "Миникарта, рецепты крафтов, войс чат, зум, скины, отображение еды",
    text: "JEI (Just Enough Items), AppleSkin, Xaero's Minimap, Xaero's World Map, Simple Voice Chat, Zoomify, ModMenu, ShulkerBoxTooltip, Custom Skin Loader",
    version: "1.20.1",
    loader: "fabric" as LoaderType,
  },
  {
    title: "✨ Графика и Анимации",
    desc: "Шейдеры, дальность прорисовки, свежие анимации, свет в руке",
    text: "Iris Shaders, Distant Horizons, LambDynamicLights, Fresh Animations, Visuals, 3D Skin Layers, Wavey Capes, Falling Leaves",
    version: "1.20.1",
    loader: "fabric" as LoaderType,
  },
];

const POPULAR_MC_VERSIONS = [
  "1.21.4",
  "1.21.1",
  "1.20.4",
  "1.20.1",
  "1.19.4",
  "1.19.2",
  "1.18.2",
  "1.16.5",
  "1.12.2",
  "1.7.10",
];

const ALL_FALLBACK_VERSIONS = [
  "1.21.4", "1.21.3", "1.21.2", "1.21.1", "1.21",
  "1.20.6", "1.20.5", "1.20.4", "1.20.3", "1.20.2", "1.20.1", "1.20",
  "1.19.4", "1.19.3", "1.19.2", "1.19.1", "1.19",
  "1.18.2", "1.18.1", "1.18",
  "1.17.1", "1.17",
  "1.16.5", "1.16.4", "1.16.3", "1.16.2", "1.16.1", "1.16",
  "1.15.2", "1.15.1", "1.15",
  "1.14.4", "1.14.3", "1.14.2", "1.14.1", "1.14",
  "1.13.2", "1.13.1", "1.13",
  "1.12.2", "1.12.1", "1.12",
  "1.11.2", "1.11",
  "1.10.2", "1.10",
  "1.9.4", "1.9",
  "1.8.9", "1.8",
  "1.7.10", "1.7.2",
  "1.6.4", "1.5.2", "1.4.7", "1.2.5",
];

export const AiModBuilderModal: React.FC<AiModBuilderModalProps> = ({
  isOpen,
  onClose,
  onSelectInstance,
}) => {
  const { instances, fetchInstances } = useInstanceStore();

  const [rawText, setRawText] = useState("");
  const [targetVersion, setTargetVersion] = useState("1.20.1");
  const [targetLoader, setTargetLoader] = useState<LoaderType>("fabric");
  const [loaderVersion, setLoaderVersion] = useState<string>("");
  const [fabricLoaders, setFabricLoaders] = useState<FabricLoaderItem[]>([]);
  const [neoforgeLoaders, setNeoforgeLoaders] = useState<string[]>([]);
  const [forgeLoaders, setForgeLoaders] = useState<string[]>([]);
  const [isLoadingLoaders, setIsLoadingLoaders] = useState(false);

  const [targetMode, setTargetMode] = useState<"new" | "existing">("new");
  const [newInstanceName, setNewInstanceName] = useState("ИИ Сборка - 1.20.1");
  const [selectedInstanceId, setSelectedInstanceId] = useState("");

  const [versionList, setVersionList] = useState<string[]>(ALL_FALLBACK_VERSIONS);
  const [allMojangVersions, setAllMojangVersions] = useState<VersionEntry[]>([]);
  const [versionCategory, setVersionCategory] = useState<"releases" | "snapshots" | "all">("releases");

  const [isResolving, setIsResolving] = useState(false);
  const [resolvedMods, setResolvedMods] = useState<AiModResolvedItem[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());

  const [isInstalling, setIsInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<AiBatchInstallProgress | null>(null);
  const [installSuccess, setInstallSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadingInside, setDownloadingInside] = useState<Record<string, boolean>>({});

  // Fetch full list of versions from Mojang
  useEffect(() => {
    if (isOpen) {
      invoke<VersionEntry[]>("get_mojang_versions")
        .then((mojangList) => {
          if (Array.isArray(mojangList) && mojangList.length > 0) {
            setAllMojangVersions(mojangList);
            const releases = mojangList.filter((v) => v.type === "release").map((v) => v.id);
            if (releases.length > 0) {
              const set = new Set(releases);
              ALL_FALLBACK_VERSIONS.forEach((v) => set.add(v));
              setVersionList(Array.from(set));
            }
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  // Fetch Modloader versions when targetVersion or targetLoader changes
  useEffect(() => {
    if (!targetVersion) return;

    if (targetLoader === "fabric") {
      setIsLoadingLoaders(true);
      invoke<FabricLoaderItem[]>("get_fabric_versions", { gameVersion: targetVersion })
        .then((items) => {
          setFabricLoaders(items);
          if (items.length > 0) {
            setLoaderVersion(items[0].loader.version);
          } else {
            setLoaderVersion("");
          }
        })
        .catch(() => setFabricLoaders([]))
        .finally(() => setIsLoadingLoaders(false));
    } else if (targetLoader === "neoforge") {
      setIsLoadingLoaders(true);
      invoke<string[]>("get_neoforge_versions", { gameVersion: targetVersion })
        .then((versions) => {
          setNeoforgeLoaders(versions);
          if (versions.length > 0) {
            setLoaderVersion(versions[0]);
          } else {
            setLoaderVersion("");
          }
        })
        .catch(() => setNeoforgeLoaders([]))
        .finally(() => setIsLoadingLoaders(false));
    } else if (targetLoader === "forge") {
      setIsLoadingLoaders(true);
      invoke<string[]>("get_forge_versions", { gameVersion: targetVersion })
        .then((versions) => {
          setForgeLoaders(versions);
          if (versions.length > 0) {
            setLoaderVersion(versions[0]);
          } else {
            setLoaderVersion("");
          }
        })
        .catch(() => setForgeLoaders([]))
        .finally(() => setIsLoadingLoaders(false));
    } else {
      setLoaderVersion("");
    }
  }, [targetVersion, targetLoader]);

  // Set default selected existing instance if available
  useEffect(() => {
    if (instances.length > 0 && !selectedInstanceId) {
      setSelectedInstanceId(instances[0].id);
    }
  }, [instances, selectedInstanceId]);

  // Listen to install progress events
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen<AiBatchInstallProgress>("ai-builder-progress", (event) => {
      setInstallProgress(event.payload);
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleVersionChange = (ver: string) => {
    soundManager.playClick();
    setTargetVersion(ver);
    setNewInstanceName(`ИИ Сборка - ${ver}`);
    const parts = ver.split(".").map(Number);
    const minor = parts[1] || 0;
    if (minor > 0 && minor < 14 && (targetLoader === "fabric" || targetLoader === "neoforge" || targetLoader === "quilt")) {
      setTargetLoader("forge");
    } else if (minor > 0 && minor < 20 && targetLoader === "neoforge") {
      setTargetLoader("forge");
    }
  };

  const displayedVersions =
    versionCategory === "snapshots"
      ? allMojangVersions.filter((v) => v.type === "snapshot").map((v) => v.id)
      : versionCategory === "all" && allMojangVersions.length > 0
      ? allMojangVersions.map((v) => v.id)
      : versionList;

  const isLegacy = (() => {
    const parts = targetVersion.split(".").map(Number);
    const minor = parts[1] || 0;
    return minor > 0 && minor < 14;
  })();

  const isPre120 = (() => {
    const parts = targetVersion.split(".").map(Number);
    const minor = parts[1] || 0;
    return minor > 0 && minor < 20;
  })();

  if (!isOpen) return null;

  const handleResolve = async () => {
    if (!rawText.trim()) {
      setErrorMessage("Введите или вставьте список модов!");
      return;
    }

    setErrorMessage(null);
    setIsResolving(true);
    setResolvedMods([]);
    setInstallSuccess(null);

    try {
      const items = await invoke<AiModResolvedItem[]>("ai_parse_and_resolve_mods", {
        text: rawText,
        gameVersion: targetVersion,
        loader: targetLoader,
      });

      setResolvedMods(items);

      // By default select all compatible mods
      const compatibleIds = new Set<string>();
      items.forEach((m) => {
        if (m.status === "compatible" && m.project_id) {
          compatibleIds.add(m.project_id);
        }
      });
      setSelectedProjectIds(compatibleIds);

      if (items.length === 0) {
        setErrorMessage("ИИ не нашел названий модов в тексте. Попробуйте перечислить их через | или запятую.");
        soundManager.playError();
      } else {
        soundManager.playSuccess();
      }
    } catch (e: any) {
      setErrorMessage(String(e?.message || e));
      soundManager.playError();
    } finally {
      setIsResolving(false);
    }
  };

  const handleSelectSuggestion = async (itemIndex: number, sugg: AiModSuggestion) => {
    soundManager.playClick();
    const oldItem = resolvedMods[itemIndex];
    if (!oldItem) return;

    const isInsideSugg = sugg.project_id.startsWith("http");

    // Preserve previous item in suggestions so user can toggle back
    const previousAsSuggestion: AiModSuggestion = {
      project_id: oldItem.project_id || oldItem.slug || "",
      slug: oldItem.slug || "",
      title: oldItem.title,
      author: oldItem.author || "",
      icon_url: oldItem.icon_url || undefined,
      downloads: oldItem.downloads,
    };
    const updatedSuggestions = [
      previousAsSuggestion,
      ...(oldItem.suggestions || []).filter((s) => s.project_id !== sugg.project_id),
    ];

    setResolvedMods((prev) => {
      const next = [...prev];
      next[itemIndex] = {
        ...oldItem,
        project_id: isInsideSugg ? null : sugg.project_id,
        slug: sugg.slug,
        title: sugg.title,
        author: sugg.author,
        icon_url: sugg.icon_url || null,
        downloads: sugg.downloads,
        status: isInsideSugg ? "minecraft_inside" : "compatible",
        external_url: isInsideSugg ? sugg.slug : undefined,
        match_confidence: isInsideSugg ? "inside" : "exact",
        suggestions: updatedSuggestions,
      };
      return next;
    });

    // Remove old project_id, and if compatible mod, add new project_id
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (oldItem.project_id) {
        next.delete(oldItem.project_id);
      }
      if (!isInsideSugg && sugg.project_id) {
        next.add(sugg.project_id);
      }
      return next;
    });
  };

  const handleRemoveModItem = (index: number) => {
    soundManager.playClick();
    const item = resolvedMods[index];
    if (item?.project_id) {
      setSelectedProjectIds((prev) => {
        const next = new Set(prev);
        next.delete(item.project_id!);
        return next;
      });
    }
    setResolvedMods((prev) => prev.filter((_, i) => i !== index));
  };

  const handleDownloadInside = async (e: React.MouseEvent, mod: AiModResolvedItem) => {
    e.stopPropagation();
    if (!selectedInstanceId) {
      setErrorMessage("Для загрузки с Minecraft Inside выберите существующий инстанс в настройках выше!");
      soundManager.playError();
      return;
    }
    if (!mod.external_url) return;

    soundManager.playClick();
    setDownloadingInside((p) => ({ ...p, [mod.external_url!]: true }));
    try {
      const downloads = await invoke<Array<{ name: string; url: string; size: string; date: string }>>(
        "get_minecraft_inside_downloads",
        { pageUrl: mod.external_url }
      );

      if (downloads.length === 0) {
        throw new Error("Файлы для скачивания не найдены на странице Minecraft Inside.");
      }

      const bestDl =
        downloads.find(
          (d) =>
            d.name.toLowerCase().includes(targetVersion.toLowerCase()) &&
            d.name.toLowerCase().includes(targetLoader.toLowerCase())
        ) ||
        downloads.find((d) => d.name.toLowerCase().includes(targetVersion.toLowerCase())) ||
        downloads[0];

      await invoke("install_minecraft_inside_file", {
        instanceId: selectedInstanceId,
        downloadUrl: bestDl.url,
        pageUrl: mod.external_url,
        fileType: "mod",
      });

      soundManager.playSuccess();
      setInstallSuccess(`Мод "${mod.title}" (${bestDl.name}) успешно установлен в инстанс!`);
    } catch (err: any) {
      setErrorMessage(`Ошибка установки с Minecraft Inside: ${err?.message || err}`);
      soundManager.playError();
    } finally {
      setDownloadingInside((p) => ({ ...p, [mod.external_url!]: false }));
    }
  };

  const toggleSelectMod = (projectId: string) => {
    soundManager.playClick();
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    const allCompat = new Set<string>();
    resolvedMods.forEach((m) => {
      if (m.status === "compatible" && m.project_id) {
        allCompat.add(m.project_id);
      }
    });
    setSelectedProjectIds(allCompat);
  };

  const handleDeselectAll = () => {
    setSelectedProjectIds(new Set());
  };

  const handleInstall = async () => {
    if (selectedProjectIds.size === 0) {
      setErrorMessage("Выберите хотя бы один совместимый мод для установки!");
      return;
    }

    setErrorMessage(null);
    setIsInstalling(true);
    setInstallProgress({
      current_index: 0,
      total_count: selectedProjectIds.size,
      current_mod: "Подготовка...",
      stage: "Инициализация пакетной сборки...",
      percentage: 0,
    });

    const projectIdsList = Array.from(selectedProjectIds);

    try {
      if (targetMode === "new") {
        const name = newInstanceName.trim() || `ИИ Сборка (${targetVersion} ${targetLoader})`;
        const newInst = await invoke<InstanceConfig>("ai_create_instance_and_install", {
          name,
          gameVersion: targetVersion,
          loader: targetLoader,
          loaderVersion: loaderVersion || undefined,
          projectIds: projectIdsList,
        });

        await fetchInstances();
        setInstallSuccess(`Сборка "${newInst.name}" успешно создана и содержит все выбранные моды!`);
        if (onSelectInstance) {
          onSelectInstance(newInst.id);
        }
      } else {
        if (!selectedInstanceId) {
          throw new Error("Выберите целевой инстанс для установки!");
        }

        await invoke("ai_batch_install_mods", {
          instanceId: selectedInstanceId,
          projectIds: projectIdsList,
          gameVersion: targetVersion,
          loader: targetLoader,
        });

        await fetchInstances();
        setInstallSuccess(`Успешно установлено ${projectIdsList.length} модов в выбранный инстанс!`);
      }
    } catch (e: any) {
      setErrorMessage(String(e?.message || e));
    } finally {
      setIsInstalling(false);
    }
  };

  const applyTemplate = (tmpl: typeof PRESET_TEMPLATES[0]) => {
    setRawText(tmpl.text);
    setTargetVersion(tmpl.version);
    setTargetLoader(tmpl.loader);
    setNewInstanceName(`ИИ - ${tmpl.title.replace(/[^а-яА-Яa-zA-Z0-9\s]/g, "").trim()}`);
    setResolvedMods([]);
    setErrorMessage(null);
  };

  const compatibleCount = resolvedMods.filter((m) => m.status === "compatible").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in">
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col rounded-2xl bg-[#0b0e14] border border-indigo-500/30 shadow-[0_0_50px_rgba(79,70,229,0.25)] overflow-hidden">
        {/* Modal Top Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/[0.08] bg-[#0e121b]/80">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-fuchsia-600 flex items-center justify-center shadow-[0_0_15px_rgba(99,102,241,0.5)]">
              <Bot className="w-5 h-5 text-white animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-white tracking-wide">
                  Подбор и импорт модов
                </h2>
                <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-white/[0.06] text-slate-300 border border-white/[0.08]">
                  ПАКЕТНЫЙ ИМПОРТ
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Вставьте список модов или скопируйте описание — лаунчер автоматически найдет и установит их
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5 custom-scrollbar">
          {/* Preset Buttons */}
          <div>
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
              <span>Быстрые готовые пресеты</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
              {PRESET_TEMPLATES.map((tmpl, idx) => (
                <button
                  key={idx}
                  onClick={() => applyTemplate(tmpl)}
                  className="p-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] hover:border-indigo-500/40 transition-all text-left group cursor-pointer"
                >
                  <div className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors flex items-center justify-between">
                    <span>{tmpl.title}</span>
                    <span className="text-[10px] text-slate-500 font-mono">1.20.1</span>
                  </div>
                  <div className="text-[10px] text-slate-400 mt-1 line-clamp-2 leading-relaxed">
                    {tmpl.desc}
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Text Input Area */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-300 flex items-center gap-2">
                <span>Список модов / Текст для распознавания</span>
                <span className="text-[10px] text-slate-500 font-normal">
                  (поддерживаются русские названия: содиум, шейдеры, джеи, миникарта...)
                </span>
              </label>
              {rawText && (
                <button
                  onClick={() => setRawText("")}
                  className="text-[11px] text-slate-400 hover:text-red-400 flex items-center gap-1 transition-colors"
                >
                  <Trash2 className="w-3 h-3" />
                  <span>Очистить</span>
                </button>
              )}
            </div>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Вставьте сюда любой список, например:&#10;• Sodium | Lithium | Iris | Distant Horizons | JEI&#10;• Содиум, ирис шейдеры, литиум, ферритекор, джеи, миникарта, эпплскин, войс чат&#10;• 1. Sodium 0.5.8 (by Cortex) | 2. Lithium | 3. ModMenu&#10;• Скопируйте список модов из описания ролика YouTube или Discord..."
              className="w-full h-28 p-3 rounded-xl bg-black/40 border border-white/10 hover:border-indigo-500/40 focus:border-indigo-500 focus:outline-none text-xs text-white placeholder-slate-500 resize-none font-sans leading-relaxed"
            />
          </div>

          {/* Target Parameters Bar */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06]">
            {/* Version Selection */}
            <div className="flex flex-col justify-between space-y-2">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-400">
                    Версия Minecraft
                  </label>
                  <div className="flex items-center gap-1 bg-black/40 p-0.5 rounded-md border border-white/[0.06]">
                    <button
                      type="button"
                      onClick={() => {
                        soundManager.playClick();
                        setVersionCategory("releases");
                      }}
                      className={`px-1.5 py-0.5 text-[9px] font-semibold rounded transition-colors ${
                        versionCategory === "releases"
                          ? "bg-indigo-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Релизы
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundManager.playClick();
                        setVersionCategory("snapshots");
                      }}
                      className={`px-1.5 py-0.5 text-[9px] font-semibold rounded transition-colors ${
                        versionCategory === "snapshots"
                          ? "bg-indigo-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Снапшоты
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        soundManager.playClick();
                        setVersionCategory("all");
                      }}
                      className={`px-1.5 py-0.5 text-[9px] font-semibold rounded transition-colors ${
                        versionCategory === "all"
                          ? "bg-indigo-600 text-white"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Все ({displayedVersions.length})
                    </button>
                  </div>
                </div>
                <select
                  value={targetVersion}
                  onChange={(e) => handleVersionChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-[#111622] border border-white/10 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                >
                  {!displayedVersions.includes(targetVersion) && (
                    <option value={targetVersion}>
                      Minecraft {targetVersion} (текущая)
                    </option>
                  )}
                  {displayedVersions.map((v) => (
                    <option key={v} value={v}>
                      Minecraft {v}
                    </option>
                  ))}
                </select>
              </div>

              {/* Quick Pick Popular Versions */}
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[10px] text-slate-500 mr-0.5">Топ:</span>
                {POPULAR_MC_VERSIONS.slice(0, 5).map((pv) => (
                  <button
                    key={pv}
                    type="button"
                    onClick={() => handleVersionChange(pv)}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-all ${
                      targetVersion === pv
                        ? "bg-indigo-600 text-white font-bold shadow-sm ring-1 ring-indigo-400"
                        : "bg-white/[0.04] text-slate-400 hover:bg-white/[0.08] hover:text-slate-200"
                    }`}
                  >
                    {pv}
                  </button>
                ))}
              </div>
            </div>

            {/* Loader & Loader Version Selection */}
            <div className="flex flex-col justify-between space-y-2">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[11px] font-bold text-slate-400">
                    Загрузчик модов
                  </label>
                  {(targetLoader === "fabric" || targetLoader === "forge" || targetLoader === "neoforge") && (
                    <span className="text-[10px] text-indigo-400 font-mono">
                      Версия: {loaderVersion || "auto"}
                    </span>
                  )}
                </div>
                <select
                  value={targetLoader}
                  onChange={(e) => {
                    soundManager.playClick();
                    setTargetLoader(e.target.value as LoaderType);
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-[#111622] border border-white/10 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none mb-2"
                >
                  <option value="fabric" disabled={isLegacy}>
                    Fabric {isLegacy ? "(недоступен < 1.14)" : "(Рекомендуется для FPS)"}
                  </option>
                  <option value="neoforge" disabled={isPre120}>
                    NeoForge {isPre120 ? "(только для 1.20.1+)" : "(Новый Forge)"}
                  </option>
                  <option value="forge">Forge (Классический)</option>
                  <option value="quilt" disabled={isLegacy}>
                    Quilt {isLegacy ? "(недоступен < 1.14)" : ""}
                  </option>
                </select>

                {/* Loader Version Dropdown */}
                {(targetLoader === "fabric" || targetLoader === "neoforge" || targetLoader === "forge") && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] font-bold text-slate-400">
                        Версия {targetLoader === "fabric" ? "Fabric Loader" : targetLoader === "forge" ? "Forge" : "NeoForge"}
                      </label>
                      {isLoadingLoaders && (
                        <span className="text-[9px] text-indigo-400 flex items-center gap-1">
                          <RefreshCw className="w-2.5 h-2.5 animate-spin" />
                          Загрузка...
                        </span>
                      )}
                    </div>
                    <select
                      value={loaderVersion}
                      onChange={(e) => setLoaderVersion(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-[#111622] border border-white/10 text-xs text-white font-mono focus:border-indigo-500 focus:outline-none"
                    >
                      {targetLoader === "fabric" ? (
                        fabricLoaders.map((item) => (
                          <option key={item.loader.version} value={item.loader.version}>
                            {item.loader.version} {item.loader.stable ? "(Stable)" : "(Beta)"}
                          </option>
                        ))
                      ) : targetLoader === "forge" ? (
                        forgeLoaders.map((ver) => (
                          <option key={ver} value={ver}>
                            {ver}
                          </option>
                        ))
                      ) : (
                        neoforgeLoaders.map((ver) => (
                          <option key={ver} value={ver}>
                            {ver}
                          </option>
                        ))
                      )}
                    </select>
                  </div>
                )}
              </div>

              {isLegacy ? (
                <p className="text-[10px] text-amber-400/90 leading-tight">
                  ⚠️ Для версий до 1.14 моды ставятся на Forge
                </p>
              ) : (
                <p className="text-[10px] text-slate-500 leading-tight">
                  Для модов на оптимизацию рекомендуется Fabric
                </p>
              )}
            </div>

            {/* Target Mode */}
            <div className="flex flex-col justify-between space-y-2">
              <div>
                <label className="text-[11px] font-bold text-slate-400 block mb-1.5">
                  Куда установить?
                </label>
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      soundManager.playClick();
                      setTargetMode("new");
                    }}
                    className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                      targetMode === "new"
                        ? "bg-indigo-600 text-white shadow-glow"
                        : "bg-[#111622] text-slate-400 hover:text-white"
                    }`}
                  >
                    Новая сборка
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      soundManager.playClick();
                      setTargetMode("existing");
                      const inst = instances.find((i) => i.id === selectedInstanceId) || instances[0];
                      if (inst) {
                        setSelectedInstanceId(inst.id);
                        const v = inst.game_version || inst.mcVersion;
                        if (v) setTargetVersion(v);
                        const l = (inst.loader || inst.loader_type) as LoaderType;
                        if (l) setTargetLoader(l);
                      }
                    }}
                    disabled={instances.length === 0}
                    className={`flex-1 py-2 px-2 rounded-lg text-xs font-bold transition-all ${
                      targetMode === "existing"
                        ? "bg-indigo-600 text-white shadow-glow"
                        : "bg-[#111622] text-slate-400 hover:text-white"
                    }`}
                  >
                    В существующий
                  </button>
                </div>
              </div>
              <p className="text-[10px] text-slate-500 leading-tight">
                {targetMode === "new"
                  ? "Создаст отдельный чистый профиль"
                  : "Добавит моды в выбранную папку сборки"}
              </p>
            </div>
          </div>

          {/* New Instance Name or Existing Instance Selector */}
          {targetMode === "new" ? (
            <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/20 flex items-center gap-3">
              <Plus className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-[11px] text-indigo-300 font-semibold mb-1">
                  Название нового инстанса:
                </div>
                <input
                  type="text"
                  value={newInstanceName}
                  onChange={(e) => setNewInstanceName(e.target.value)}
                  placeholder="Название сборки..."
                  className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white focus:border-indigo-500 focus:outline-none"
                />
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-indigo-950/20 border border-indigo-500/20 flex items-center gap-3">
              <Layers className="w-4 h-4 text-indigo-400 flex-shrink-0" />
              <div className="flex-1">
                <div className="text-[11px] text-indigo-300 font-semibold mb-1">
                  Выберите инстанс для добавления модов:
                </div>
                <select
                  value={selectedInstanceId}
                  onChange={(e) => {
                    soundManager.playClick();
                    const newId = e.target.value;
                    setSelectedInstanceId(newId);
                    const inst = instances.find((i) => i.id === newId);
                    if (inst) {
                      const v = inst.game_version || inst.mcVersion;
                      if (v) setTargetVersion(v);
                      const l = (inst.loader || inst.loader_type) as LoaderType;
                      if (l) setTargetLoader(l);
                    }
                  }}
                  className="w-full px-3 py-1.5 rounded-lg bg-black/40 border border-white/10 text-xs text-white focus:border-indigo-500 focus:outline-none"
                >
                  {instances.map((inst) => (
                    <option key={inst.id} value={inst.id}>
                      {inst.name} ({inst.game_version || inst.mcVersion} - {inst.loader || inst.loader_type})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}

          {/* Parse Button */}
          <div>
            <button
              onClick={handleResolve}
              disabled={isResolving || !rawText.trim()}
              className="w-full py-3 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 hover:brightness-110 text-white shadow-glow transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
            >
              {isResolving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>ИИ распознает моды и проверяет совместимость на Modrinth...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  <span>Распознать и проверить моды для {targetVersion} ({targetLoader})</span>
                </>
              )}
            </button>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div className="p-3.5 rounded-xl bg-red-950/40 border border-red-500/30 text-xs text-red-200 flex items-center gap-2.5 animate-in fade-in">
              <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Success Banner */}
          {installSuccess && (
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 text-xs text-emerald-200 flex items-center justify-between gap-3 animate-in fade-in">
              <div className="flex items-center gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
                <span className="font-semibold">{installSuccess}</span>
              </div>
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-[11px] shadow-sm transition-colors cursor-pointer"
              >
                К списку сборок
              </button>
            </div>
          )}

          {/* Progress Bar (during batch install) */}
          {isInstalling && installProgress && (
            <div className="p-4 rounded-xl bg-[#090c14] border border-indigo-500/40 space-y-2 animate-in fade-in">
              <div className="flex items-center justify-between text-xs font-bold text-white">
                <span className="flex items-center gap-2">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                  <span>{installProgress.stage}</span>
                </span>
                <span className="font-mono text-indigo-300">
                  {Math.round(installProgress.percentage)}%
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-black/60 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                  style={{ width: `${installProgress.percentage}%` }}
                />
              </div>
              <div className="text-[10px] text-slate-400 flex justify-between font-mono">
                <span>
                  Обработано: {installProgress.current_index} из {installProgress.total_count}
                </span>
                <span className="truncate max-w-[200px] text-slate-300">
                  {installProgress.current_mod}
                </span>
              </div>
            </div>
          )}

          {/* Resolved Mods Results List */}
          {resolvedMods.length > 0 && (
            <div className="space-y-3 pt-2">
              <div className="flex items-center justify-between">
                <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                  <span>Распознанные моды:</span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                    {resolvedMods.length} найдено ({compatibleCount} совместимо)
                  </span>
                </div>
                <div className="flex gap-2 text-[11px]">
                  <button
                    onClick={handleSelectAll}
                    className="text-indigo-400 hover:text-indigo-300 font-semibold cursor-pointer"
                  >
                    Выбрать все совместимые
                  </button>
                  <span className="text-slate-600">|</span>
                  <button
                    onClick={handleDeselectAll}
                    className="text-slate-400 hover:text-slate-300 cursor-pointer"
                  >
                    Снять выбор
                  </button>
                </div>
              </div>

              <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
                {resolvedMods.map((mod, idx) => {
                  const isCompatible = mod.status === "compatible";
                  const isInside = mod.status === "minecraft_inside";
                  const isChecked = Boolean(mod.project_id && selectedProjectIds.has(mod.project_id));

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border flex flex-col gap-2 transition-all ${
                        isCompatible
                          ? isChecked
                            ? "bg-indigo-950/30 border-indigo-500/50 hover:border-indigo-400"
                            : "bg-white/[0.02] border-white/[0.06] hover:border-white/20"
                          : isInside
                          ? "bg-cyan-950/15 border-cyan-500/30"
                          : mod.status === "incompatible"
                          ? "bg-amber-950/10 border-amber-500/20 opacity-80"
                          : "bg-red-950/10 border-red-500/20 opacity-60"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        {/* Checkbox */}
                        <div
                          className="flex-shrink-0 cursor-pointer"
                          onClick={() => {
                            if (isCompatible && mod.project_id) {
                              toggleSelectMod(mod.project_id);
                            }
                          }}
                        >
                          {isCompatible ? (
                            <div
                              className={`w-5 h-5 rounded-md flex items-center justify-center border transition-all ${
                                isChecked
                                  ? "bg-indigo-600 border-indigo-500 text-white"
                                  : "border-white/20 bg-black/40"
                              }`}
                            >
                              {isChecked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                            </div>
                          ) : (
                            <div className="w-5 h-5 rounded-md flex items-center justify-center border border-white/10 bg-black/20 text-slate-600">
                              <X className="w-3.5 h-3.5" />
                            </div>
                          )}
                        </div>

                        {/* Icon */}
                        <div className="w-9 h-9 rounded-lg bg-black/40 border border-white/10 overflow-hidden flex items-center justify-center flex-shrink-0">
                          {mod.icon_url ? (
                            <img
                              src={mod.icon_url}
                              alt={mod.title}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Bot className="w-5 h-5 text-indigo-400" />
                          )}
                        </div>

                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-white truncate">
                              {mod.title}
                            </span>
                            {mod.author && (
                              <span className="text-[10px] text-slate-400 truncate">
                                от {mod.author}
                              </span>
                            )}
                            {mod.match_confidence && (
                              <span
                                className={`text-[9px] px-1.5 py-0.2 rounded font-mono font-bold ${
                                  mod.match_confidence === "exact"
                                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                                    : mod.match_confidence === "high"
                                    ? "bg-indigo-500/20 text-indigo-300 border border-indigo-500/30"
                                    : mod.match_confidence === "inside"
                                    ? "bg-cyan-500/20 text-cyan-300 border border-cyan-500/30"
                                    : "bg-white/10 text-slate-400 border border-white/15"
                                }`}
                              >
                                {mod.match_confidence === "exact"
                                  ? "Точное"
                                  : mod.match_confidence === "high"
                                  ? "Высокая уверенность"
                                  : mod.match_confidence === "inside"
                                  ? "Inside"
                                  : "Похожий"}
                              </span>
                            )}
                            {mod.raw_query.toLowerCase() !== mod.title.toLowerCase() && (
                              <span className="text-[9px] px-1.5 py-0.2 rounded bg-white/5 text-slate-400 font-mono">
                                запрос: {mod.raw_query}
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {mod.description}
                          </div>
                        </div>

                        {/* Status Badge & External Action */}
                        <div className="flex-shrink-0 text-right flex items-center gap-1.5">
                          {isCompatible ? (
                            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                              <Check className="w-3 h-3" />
                              <span>Совместим</span>
                            </div>
                          ) : isInside ? (
                            <div className="flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                                <Sparkles className="w-3 h-3" />
                                <span>Minecraft Inside (RU)</span>
                              </span>
                              {mod.external_url && (
                                <>
                                  <button
                                    type="button"
                                    onClick={(e) => handleDownloadInside(e, mod)}
                                    disabled={downloadingInside[mod.external_url]}
                                    className="px-2 py-1 rounded-lg bg-cyan-500/25 hover:bg-cyan-500/40 text-cyan-200 border border-cyan-500/40 text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-50"
                                    title="Скачать и установить в выбранный инстанс"
                                  >
                                    {downloadingInside[mod.external_url] ? (
                                      <RefreshCw className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Download className="w-3 h-3" />
                                    )}
                                    <span>Установить</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      openUrl(mod.external_url!);
                                    }}
                                    className="p-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 text-[10px] flex items-center gap-1 cursor-pointer"
                                    title="Открыть страницу мода на Minecraft Inside"
                                  >
                                    <ExternalLink className="w-3 h-3" />
                                  </button>
                                </>
                              )}
                            </div>
                          ) : mod.status === "incompatible" ? (
                            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                              <AlertTriangle className="w-3 h-3" />
                              <span>Нет для {targetVersion}</span>
                            </div>
                          ) : (
                            <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-red-500/20 text-red-300 border border-red-500/40">
                              <HelpCircle className="w-3 h-3" />
                              <span>Не найден</span>
                            </div>
                          )}

                          {/* Delete Item from resolved list */}
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleRemoveModItem(idx);
                            }}
                            className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer ml-1"
                            title="Удалить из списка"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Suggestions Row (if multiple matches exist on Modrinth) */}
                      {mod.suggestions && mod.suggestions.length > 0 && (
                        <div className="pl-8 pt-1.5 border-t border-white/[0.04] flex items-center gap-1.5 text-[10px] overflow-x-auto">
                          <span className="text-slate-500 flex-shrink-0">Другие варианты:</span>
                          {mod.suggestions.map((sugg) => (
                            <button
                              key={sugg.project_id}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectSuggestion(idx, sugg);
                              }}
                              className="px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-indigo-600/30 text-slate-300 hover:text-white border border-white/10 hover:border-indigo-400 transition-colors flex items-center gap-1 flex-shrink-0 cursor-pointer"
                              title={`Выбрать ${sugg.title} (${sugg.downloads.toLocaleString()} скач.)`}
                            >
                              <span>{sugg.title}</span>
                              <ChevronRight className="w-2.5 h-2.5 text-indigo-400" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Install Selected Button */}
              <div className="pt-2">
                <button
                  onClick={handleInstall}
                  disabled={isInstalling || selectedProjectIds.size === 0}
                  className="w-full py-3.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-600 via-teal-600 to-indigo-600 hover:brightness-110 text-white shadow-glow-accent transition-all active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  <Download className="w-4 h-4" />
                  <span>
                    Собрать и установить выбранные моды ({selectedProjectIds.size}) со всеми зависимостями
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
