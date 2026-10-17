import React, { useEffect, useState, useRef } from "react";
import {
  X,
  Package,
  FolderOpen,
  RefreshCw,
  Trash2,
  Power,
  Download,
  Check,
  Search,
  Upload,
  AlertTriangle,
  Monitor,
  Globe,
  Server,
  Zap,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useInstanceStore } from "../../store/instanceStore";
import { ModInfo, ModrinthHit, ModrinthSearchResult, UltraFpsBoostResult } from "../../types";

interface ModsModalProps {
  instanceId: string | null;
  isOpen: boolean;
  onClose: () => void;
}

export type ModEnvFilter = "all" | "client" | "client_only" | "both" | "server_only";

export const ModsModal: React.FC<ModsModalProps> = ({
  instanceId,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<"installed" | "search">("installed");
  const [mods, setMods] = useState<ModInfo[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [installedFilter, setInstalledFilter] = useState("");

  // File upload state
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  // Modrinth search state
  const [searchQuery, setSearchQuery] = useState("");
  const [searchEnv, setSearchEnv] = useState<ModEnvFilter>("all");
  const [searchResults, setSearchResults] = useState<ModrinthHit[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [installingMap, setInstallingMap] = useState<Record<string, boolean>>({});
  const [installedMap, setInstalledMap] = useState<Record<string, boolean>>({});
  const [isBoostingFps, setIsBoostingFps] = useState(false);

  const { instances, openInstanceFolder } = useInstanceStore();
  const activeInstance = instances.find((i) => i.id === instanceId);

  const handleUltraFpsBoost = async () => {
    if (!instanceId) return;
    setIsBoostingFps(true);
    try {
      const res = await invoke<UltraFpsBoostResult>("apply_ultra_fps_boost", { instanceId });
      await fetchInstalledMods();
      useInstanceStore.getState().fetchInstances();
      const modsList = res.installed_mods.length > 0 ? `\n• Моды: ${res.installed_mods.join(", ")}` : "";
      const tweaksList = res.tweaks_applied.length > 0 ? `\n• Твики: ${res.tweaks_applied.join("; ")}` : "";
      alert(`⚡ ${res.message}${modsList}${tweaksList}\n• Выделено ОЗУ: ${Math.round(res.memory_allocated_mb / 1024)} ГБ (пресет GC: ${res.gc_preset})`);
    } catch (err: unknown) {
      alert(`Не удалось применить Ультра-буст FPS: ${err}`);
    } finally {
      setIsBoostingFps(false);
    }
  };

  const fetchInstalledMods = async () => {
    if (!instanceId) return;
    setIsLoading(true);
    try {
      const list = await invoke<ModInfo[]>("get_instance_mods_detailed", { id: instanceId });
      setMods(list);
    } catch {
      setMods([]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleMod = async (filename: string) => {
    if (!instanceId) return;
    try {
      await invoke("toggle_mod", { id: instanceId, filename });
      await fetchInstalledMods();
    } catch (err: unknown) {
      alert(`Ошибка переключения мода: ${err}`);
    }
  };

  const [modToDelete, setModToDelete] = useState<string | null>(null);
  const [isDeletingMod, setIsDeletingMod] = useState(false);

  const handleConfirmDeleteMod = async () => {
    if (!instanceId || !modToDelete) return;
    setIsDeletingMod(true);
    try {
      await invoke("delete_mod", { id: instanceId, filename: modToDelete });
      setModToDelete(null);
      await fetchInstalledMods();
    } catch (err: unknown) {
      alert(`Ошибка удаления мода: ${err}`);
    } finally {
      setIsDeletingMod(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!instanceId || !e.target.files || e.target.files.length === 0) return;
    setIsUploading(true);
    try {
      const files = Array.from(e.target.files);
      for (const file of files) {
        const buffer = await file.arrayBuffer();
        const bytes = Array.from(new Uint8Array(buffer));
        await invoke("save_mod_bytes", {
          id: instanceId,
          filename: file.name,
          bytes,
        });
      }
      await fetchInstalledMods();
    } catch (err: unknown) {
      alert(`Ошибка добавления файла мода: ${err}`);
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleSearchModrinth = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeInstance) return;
    setIsSearching(true);
    try {
      const gv = activeInstance.game_version || activeInstance.mcVersion || "1.21.1";
      const loader = activeInstance.loader_type || activeInstance.loader || "fabric";
      const envParam = searchEnv === "all" ? undefined : searchEnv;
      const res = await invoke<ModrinthSearchResult>("search_modrinth", {
        query: searchQuery.trim() || "optimization",
        gameVersion: gv,
        loader: loader === "vanilla" ? undefined : loader,
        environment: envParam,
      });
      setSearchResults(res?.hits || []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleInstallFromSearch = async (mod: ModrinthHit) => {
    if (!activeInstance) return;
    setInstallingMap((p) => ({ ...p, [mod.project_id]: true }));
    try {
      const gv = activeInstance.game_version || activeInstance.mcVersion || "1.21.1";
      const loader = activeInstance.loader_type || activeInstance.loader || "fabric";
      await invoke("install_modrinth_mod", {
        instanceId: activeInstance.id,
        projectId: mod.project_id,
        gameVersion: gv,
        loader: loader,
      });
      setInstalledMap((p) => ({ ...p, [mod.project_id]: true }));
      await fetchInstalledMods();
    } catch (err: unknown) {
      alert(`Ошибка установки: ${err}`);
    } finally {
      setInstallingMap((p) => ({ ...p, [mod.project_id]: false }));
    }
  };

  useEffect(() => {
    if (isOpen && instanceId) {
      fetchInstalledMods();
      if (activeTab === "search") {
        handleSearchModrinth();
      }
    }
  }, [isOpen, instanceId, activeTab, searchEnv]);

  if (!isOpen || !instanceId) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="glass-panel w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl flex flex-col h-[85vh] overflow-hidden">
        {/* Header */}
        <div className="h-14 px-5 flex items-center justify-between border-b border-white/[0.08] bg-[#0c0e17]/80 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">
                Моды сборки: {activeInstance?.name}
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                {activeInstance?.loader_type} {activeInstance?.game_version} • {mods.filter((m) => m.is_enabled).length} активных модов
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".jar,.zip"
              multiple
              className="hidden"
            />
            {activeInstance?.loader_type !== "vanilla" && (
              <button
                onClick={handleUltraFpsBoost}
                disabled={isBoostingFps}
                className="px-2.5 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                title="Автоматическая установка Sodium + Lithium + FerriteCore + ImmediatelyFast, разблокировка FPS и твики NVIDIA/AMD"
              >
                {isBoostingFps ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                )}
                <span>{isBoostingFps ? "Разгон FPS..." : "⚡ Ультра-буст FPS (500+)"}</span>
              </button>
            )}
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="px-2.5 py-1.5 rounded-lg bg-indigo-600/30 hover:bg-indigo-600/50 text-indigo-300 border border-indigo-500/40 text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Добавить файлы модов (.jar, .zip) напрямую в сборку"
            >
              <Upload className="w-3.5 h-3.5" />
              <span>{isUploading ? "Добавление..." : "Добавить .jar"}</span>
            </button>
            <button
              onClick={() => openInstanceFolder(instanceId)}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="Открыть папку модов"
            >
              <FolderOpen className="w-3.5 h-3.5" />
              <span>Папка модов</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Vanilla Loader Warning Banner */}
        {activeInstance?.loader_type === "vanilla" && (
          <div className="mx-4 mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <div>
              <span className="font-bold">Внимание: Загрузчик Vanilla!</span> Моды не будут запускаться игрой. Переключите загрузчик на Fabric, NeoForge или Forge в настройках сборки.
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex items-center gap-2 px-5 py-2.5 border-b border-white/[0.06] bg-black/20 flex-shrink-0">
          <button
            onClick={() => setActiveTab("installed")}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "installed"
                ? "bg-indigo-600 text-white shadow-glow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Установленные ({mods.length})
          </button>
          <button
            onClick={() => {
              setActiveTab("search");
              if (searchResults.length === 0) handleSearchModrinth();
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeTab === "search"
                ? "bg-indigo-600 text-white shadow-glow"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            Каталог Modrinth
          </button>
        </div>

        {/* Tab 1: Installed Mods */}
        {activeTab === "installed" && (
          <div className="p-4 overflow-y-auto flex-1 space-y-2">
            {/* Search among installed mods */}
            {mods.length > 0 && (
              <div className="relative mb-2">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Поиск среди установленных модов..."
                  value={installedFilter}
                  onChange={(e) => setInstalledFilter(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center text-xs text-slate-500 gap-2">
                <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                <span>Чтение списка модов...</span>
              </div>
            ) : mods.length === 0 ? (
              <div className="text-center py-12 text-slate-500 text-xs">
                В этой сборке еще нет модов. Нажмите «Добавить .jar» или перейдите в «Каталог Modrinth»!
              </div>
            ) : (
              mods
                .filter(
                  (m) =>
                    !installedFilter.trim() ||
                    m.display_name.toLowerCase().includes(installedFilter.toLowerCase()) ||
                    m.filename.toLowerCase().includes(installedFilter.toLowerCase())
                )
                .map((mod) => (
                  <div
                    key={mod.filename}
                    className={`p-3 rounded-xl border flex items-center justify-between text-xs transition-all ${
                      mod.is_enabled
                        ? "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]"
                        : "bg-white/[0.01] border-white/[0.03] opacity-60"
                    }`}
                  >
                    <div className="flex items-center gap-3 overflow-hidden flex-1 mr-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          mod.is_enabled
                            ? "bg-indigo-500/15 border border-indigo-500/30 text-indigo-400"
                            : "bg-white/[0.04] text-slate-500"
                        }`}
                      >
                        <Package className="w-4 h-4" />
                      </div>
                      <div className="overflow-hidden">
                        <div className="font-semibold text-slate-200 truncate">
                          {mod.display_name}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                          {mod.filename} • {Math.round(mod.size_bytes / 1024)} КБ
                        </div>
                      </div>
                    </div>

                    {/* Actions: Toggle & Delete */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button
                        onClick={() => handleToggleMod(mod.filename)}
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                          mod.is_enabled
                            ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
                            : "bg-white/[0.05] text-slate-400 border border-white/[0.08] hover:text-white"
                        }`}
                        title={mod.is_enabled ? "Отключить мод" : "Включить мод"}
                      >
                        <Power className="w-3 h-3" />
                        <span>{mod.is_enabled ? "Включен" : "Отключен"}</span>
                      </button>

                      <button
                        onClick={() => setModToDelete(mod.filename)}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                        title="Удалить мод"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
            )}
          </div>
        )}

        {/* Tab 2: Modrinth Search & Install */}
        {activeTab === "search" && (
          <div className="flex-1 flex flex-col overflow-hidden p-4">
            <form onSubmit={handleSearchModrinth} className="flex items-center gap-2 mb-2">
              <div className="relative flex-1">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Поиск модов на Modrinth..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-glow transition-all cursor-pointer"
              >
                {isSearching ? "Поиск..." : "Найти"}
              </button>
            </form>

            {/* Quick Environment Filter Pills in ModsModal */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 mb-2 scrollbar-none">
              {[
                { id: "all", label: "Все" },
                { id: "client", label: "🖥️ Клиентские" },
                { id: "client_only", label: "🖥️ Только клиент" },
                { id: "both", label: "🌐 Клиент + Сервер" },
                { id: "server_only", label: "⚙️ Сервер" },
              ].map((ef) => (
                <button
                  key={ef.id}
                  type="button"
                  onClick={() => setSearchEnv(ef.id as ModEnvFilter)}
                  className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold transition-all cursor-pointer whitespace-nowrap ${
                    searchEnv === ef.id
                      ? "bg-indigo-600/30 text-indigo-300 border border-indigo-500/50 shadow-glow"
                      : "bg-white/[0.02] text-slate-400 hover:text-white hover:bg-white/[0.05] border border-white/[0.06]"
                  }`}
                >
                  {ef.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
              {isSearching ? (
                <div className="py-12 flex flex-col items-center justify-center text-xs text-slate-500 gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Поиск модов...</span>
                </div>
              ) : !Array.isArray(searchResults) || searchResults.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-xs">
                  Ничего не найдено.
                </div>
              ) : (
                (searchResults || []).map((mod) => {
                  const isInstalling = !!installingMap[mod.project_id];
                  const isInstalled = !!installedMap[mod.project_id];

                  return (
                    <div
                      key={mod.project_id}
                      className="p-3 rounded-xl bg-white/[0.02] border border-white/[0.06] hover:bg-white/[0.04] flex items-center justify-between gap-3 text-xs"
                    >
                      <div className="flex items-center gap-3 overflow-hidden flex-1">
                        {mod.icon_url ? (
                          <img
                            src={mod.icon_url}
                            alt=""
                            className="w-9 h-9 rounded-lg object-cover flex-shrink-0"
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-9 h-9 rounded-lg bg-indigo-500/15 flex items-center justify-center text-indigo-400 flex-shrink-0">
                            <Package className="w-4 h-4" />
                          </div>
                        )}
                        <div className="overflow-hidden">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200 truncate">
                              {mod.title}
                            </span>
                            {/* Environment Badge */}
                            {mod.client_side && mod.client_side !== "unsupported" ? (
                              mod.server_side === "unsupported" ? (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-semibold whitespace-nowrap flex items-center gap-1">
                                  <Monitor className="w-2.5 h-2.5" />
                                  <span>Только клиент</span>
                                </span>
                              ) : mod.server_side === "required" ? (
                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 font-semibold whitespace-nowrap flex items-center gap-1">
                                  <Globe className="w-2.5 h-2.5" />
                                  <span>Клиент+Сервер</span>
                                </span>
                              ) : null
                            ) : mod.client_side === "unsupported" ? (
                              <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300 border border-amber-500/30 font-semibold whitespace-nowrap flex items-center gap-1">
                                <Server className="w-2.5 h-2.5" />
                                <span>Только сервер</span>
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate mt-0.5">
                            {mod.description}
                          </div>
                        </div>
                      </div>

                      <button
                        disabled={isInstalling || isInstalled}
                        onClick={() => handleInstallFromSearch(mod)}
                        className={`px-3 py-1.5 rounded-xl font-semibold text-xs flex items-center gap-1.5 flex-shrink-0 transition-all cursor-pointer ${
                          isInstalled
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 cursor-default"
                            : isInstalling
                            ? "bg-indigo-700 text-slate-300 cursor-wait"
                            : "bg-indigo-600 hover:bg-indigo-500 text-white shadow-glow"
                        }`}
                      >
                        {isInstalled ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-400" />
                            <span>Установлен</span>
                          </>
                        ) : isInstalling ? (
                          <>
                            <RefreshCw className="w-3 h-3 animate-spin" />
                            <span>Загрузка...</span>
                          </>
                        ) : (
                          <>
                            <Download className="w-3 h-3" />
                            <span>Установить</span>
                          </>
                        )}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
        {/* Mod Delete Confirmation Sub-Modal */}
        {modToDelete && (
          <div className="absolute inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-100">
            <div className="glass-panel w-full max-w-sm rounded-2xl border border-red-500/30 bg-[#0e111a] p-5 shadow-2xl flex flex-col gap-4">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
                  <Trash2 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-white">Удаление мода</h3>
                  <p className="text-[11px] text-slate-400">Действие необратимо</p>
                </div>
              </div>
              <p className="text-xs text-slate-300">
                Удалить файл <span className="font-semibold text-white font-mono break-all">«{modToDelete}»</span> из папки модов?
              </p>
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setModToDelete(null)}
                  disabled={isDeletingMod}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                >
                  Отмена
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteMod}
                  disabled={isDeletingMod}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-bold bg-red-600 hover:bg-red-500 text-white transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isDeletingMod ? <RefreshCw className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
                  <span>Удалить</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
