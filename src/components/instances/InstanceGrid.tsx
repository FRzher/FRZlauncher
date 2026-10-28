import React, { useState } from "react";
import {
  Play,
  Folder,
  Trash2,
  Copy,
  Plus,
  Search,
  Cpu,
  Box,
  Terminal,
  Package,
  RefreshCw,
  AlertCircle,
  Square,
  UserCircle,
  Sparkles,
  Bot,
  Zap,
  Check,
  Star,
  Wrench,
} from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useInstanceStore } from "../../store/instanceStore";
import { useLaunchStore } from "../../store/launchStore";
import { useAuthStore } from "../../store/authStore";
import { useCustomizationStore } from "../../store/customizationStore";
import { PlayerAvatar } from "../common/PlayerSkinView";
import { soundManager } from "../../utils/sound";
import { InstanceSummary, UltraFpsBoostResult } from "../../types";

interface InstanceGridProps {
  onOpenCreate: () => void;
  onOpenMods: (instanceId: string) => void;
  onOpenAccounts: () => void;
  onOpenModpacks: () => void;
  onOpenAiBuilder?: () => void;
}

export const InstanceGrid: React.FC<InstanceGridProps> = ({
  onOpenCreate,
  onOpenMods,
  onOpenAccounts,
  onOpenModpacks,
  onOpenAiBuilder,
}) => {
  const { instances, deleteInstance, cloneInstance, openInstanceFolder } = useInstanceStore();
  const {
    launchInstance,
    killActiveGame,
    statuses,
    granularProgress,
    isGameRunning,
    runningInstanceId,
    openConsole,
    crashDiagnoses,
    isRepairing,
    autoRepairInstance,
  } = useLaunchStore();
  const activeAccount = useAuthStore((s) => s.activeAccount);
  const density = useCustomizationStore((s) => s.density);
  const [searchTerm, setSearchTerm] = useState("");
  const [installingOpt, setInstallingOpt] = useState<Record<string, boolean>>({});
  const [optSuccess, setOptSuccess] = useState<Record<string, boolean>>({});
  const [instanceToDelete, setInstanceToDelete] = useState<InstanceSummary | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const [starredIds, setStarredIds] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("frzlauncher_starred_instances");
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  });

  const toggleStar = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    soundManager.playStar();
    setStarredIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [id, ...prev];
      try {
        localStorage.setItem("frzlauncher_starred_instances", JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  const filteredInstances = (instances || []).filter((inst) =>
    (inst?.name || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (inst?.mcVersion || inst?.game_version || "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (inst?.loader || inst?.loader_type || "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  const sortedInstances = [...filteredInstances].sort((a, b) => {
    const aStarred = starredIds.includes(a.id);
    const bStarred = starredIds.includes(b.id);
    if (aStarred && !bStarred) return -1;
    if (!aStarred && bStarred) return 1;
    return 0;
  });

  const getLoaderBadge = (type?: string) => {
    switch ((type || "").toLowerCase()) {
      case "fabric":
        return "bg-amber-500/10 text-amber-300 border-amber-500/20";
      case "neoforge":
        return "bg-orange-500/10 text-orange-300 border-orange-500/20";
      case "forge":
        return "bg-blue-500/10 text-blue-300 border-blue-500/20";
      case "quilt":
        return "bg-purple-500/10 text-purple-300 border-purple-500/20";
      default:
        return "bg-emerald-500/10 text-emerald-300 border-emerald-500/20";
    }
  };

  const handleClone = async (inst: InstanceSummary) => {
    soundManager.playClick();
    const newName = `${inst.name} (Копия)`;
    await cloneInstance(inst.id, newName);
  };

  const handleDeleteClick = (inst: InstanceSummary) => {
    soundManager.playError();
    setInstanceToDelete(inst);
  };

  const handleConfirmDelete = async () => {
    if (!instanceToDelete) return;
    setIsDeleting(true);
    try {
      await deleteInstance(instanceToDelete.id);
      soundManager.playSuccess();
      setInstanceToDelete(null);
    } catch (err: unknown) {
      alert(`Ошибка при удалении сборки: ${err}`);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleInstallOptimization = async (instId: string) => {
    setInstallingOpt((p) => ({ ...p, [instId]: true }));
    soundManager.playClick();
    try {
      const res = await invoke<UltraFpsBoostResult>("apply_ultra_fps_boost", { instanceId: instId });
      setOptSuccess((p) => ({ ...p, [instId]: true }));
      soundManager.playSuccess();
      useInstanceStore.getState().fetchInstances();
      const modsList = res.installed_mods.length > 0 ? `\n• Моды: ${res.installed_mods.join(", ")}` : "";
      const tweaksList = res.tweaks_applied.length > 0 ? `\n• Твики: ${res.tweaks_applied.join("; ")}` : "";
      alert(`⚡ ${res.message}${modsList}${tweaksList}\n• Выделено ОЗУ: ${Math.round(res.memory_allocated_mb / 1024)} ГБ (пресет GC: ${res.gc_preset})`);
    } catch (err: unknown) {
      alert(`Не удалось применить Ультра-буст FPS: ${err}`);
    } finally {
      setInstallingOpt((p) => ({ ...p, [instId]: false }));
    }
  };

  const renderLaunchButton = (instId: string) => {
    const status = statuses[instId];
    const progress = granularProgress[instId];
    const isRunning = status?.state === "running" || (isGameRunning && runningInstanceId === instId);

    if (isRunning) {
      return (
        <div className="flex items-center gap-1.5 w-full">
          <button
            onClick={() => {
              soundManager.playClick();
              openConsole(instId);
            }}
            className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white transition-all cursor-pointer shadow-sm"
          >
            <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
            <span>В ИГРЕ</span>
          </button>
          <button
            onClick={() => {
              soundManager.playError();
              killActiveGame();
            }}
            className="py-2.5 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 bg-red-600 hover:bg-red-500 text-white transition-all cursor-pointer active:scale-95"
            title="Завершить процесс игры (принудительно)"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
            <span>Завершить</span>
          </button>
        </div>
      );
    }

    if (status?.state === "starting") {
      return (
        <div className="flex items-center gap-1.5 w-full">
          <button
            onClick={() => {
              soundManager.playClick();
              openConsole(instId);
            }}
            className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-2 bg-amber-500/20 border border-amber-500/40 text-amber-200 hover:bg-amber-500/30 transition-all cursor-pointer shadow-sm"
            title="Инициализация Minecraft и загрузка модов..."
          >
            <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
            <span className="truncate">ЗАГРУЗКА...</span>
          </button>
          <button
            onClick={() => {
              soundManager.playError();
              killActiveGame();
            }}
            className="py-2.5 px-3 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 bg-red-600/80 hover:bg-red-500 text-white transition-all cursor-pointer active:scale-95"
            title="Завершить процесс игры"
          >
            <Square className="w-3.5 h-3.5 fill-current" />
          </button>
        </div>
      );
    }

    if (!status || status.state === "ready" || status.state === "exited") {
      return (
        <button
          onClick={() => {
            if (!activeAccount) {
              soundManager.playClick();
              onOpenAccounts();
              return;
            }
            soundManager.playLaunch();
            launchInstance(instId);
          }}
          className="w-full py-2.5 px-4 rounded-xl font-bold text-xs flex items-center justify-center gap-2 btn-accent transition-all active:scale-[0.98] cursor-pointer"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>ИГРАТЬ</span>
        </button>
      );
    }

    if (status.state === "crashed") {
      const isRep = isRepairing[instId];
      const diagnosis = crashDiagnoses[instId];
      return (
        <div className="flex items-center gap-1.5 w-full">
          <button
            onClick={async () => {
              soundManager.playClick();
              try {
                const res = await autoRepairInstance(instId);
                alert(`⚡ Авторемонт: ${res.message}\n• Действия:\n${res.actions_taken.join("\n")}`);
              } catch (err: unknown) {
                alert(`Не удалось устранить ошибку: ${err}`);
              }
            }}
            disabled={isRep}
            className="flex-1 py-2.5 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-black shadow-md shadow-emerald-500/20 transition-all active:scale-[0.98] cursor-pointer disabled:opacity-50"
            title={diagnosis ? `Причина: ${diagnosis.title}\nРешение: ${diagnosis.suggested_fix}` : "Автоматически устранить сбой"}
          >
            {isRep ? (
              <span className="w-3.5 h-3.5 border-2 border-black/40 border-t-black rounded-full animate-spin" />
            ) : (
              <Wrench className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isRep ? "РЕМОНТ..." : "⚡ ПОЧИНИТЬ"}</span>
          </button>
          <button
            onClick={() => {
              if (!activeAccount) {
                soundManager.playClick();
                onOpenAccounts();
                return;
              }
              soundManager.playLaunch();
              launchInstance(instId);
            }}
            className="py-2.5 px-2.5 rounded-xl font-semibold text-xs flex items-center justify-center bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 transition-all border border-white/10 cursor-pointer"
            title="Повторить запуск игры"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
          </button>
          <button
            onClick={() => openConsole(instId)}
            className="py-2.5 px-2.5 rounded-xl font-semibold text-xs flex items-center justify-center gap-1 bg-white/[0.04] hover:bg-white/[0.08] text-red-300 transition-all border border-red-500/20 cursor-pointer"
            title="Открыть лог ошибки"
          >
            <AlertCircle className="w-3.5 h-3.5 text-red-400" />
          </button>
        </div>
      );
    }

    // Downloading or Verifying Progress Bar
    const pct = progress ? Math.round(progress.percentage) : Math.round(status.progress || 10);
    const stage = progress?.stage || status.message;
    const currentFile = progress?.current_file ? progress.current_file.split("/").pop() : "";

    return (
      <div className="w-full rounded-xl bg-[#090c14] border border-emerald-500/30 p-2.5 relative overflow-hidden flex flex-col justify-center">
        <div
          className="absolute inset-y-0 left-0 bg-emerald-500/20 transition-all duration-150 ease-out"
          style={{ width: `${pct}%` }}
        />
        <div className="relative z-10 flex items-center justify-between text-[11px] font-bold text-slate-200 px-1 mb-1">
          <span className="flex items-center gap-1.5 truncate">
            <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
            <span className="truncate">{stage}</span>
          </span>
          <span className="font-mono text-emerald-300 ml-2">{pct}%</span>
        </div>
        {progress && (
          <div className="relative z-10 flex items-center justify-between text-[10px] text-slate-400 font-mono px-1">
            <span className="truncate max-w-[170px]" title={currentFile}>
              {currentFile}
            </span>
            <span>
              {progress.completed_items} / {progress.total_items}
            </span>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden p-6">
      {/* Top Bar */}
      <div className="flex items-center justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">Сборки</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            {instances.length} {instances.length === 1 ? "профиль" : "профилей"} • Готовы к запуску
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          {/* Active Account Pill */}
          {activeAccount ? (
            <button
              onClick={() => {
                soundManager.playClick();
                onOpenAccounts();
              }}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] hover:border-emerald-500/40 transition-all cursor-pointer group"
              title="Нажмите для смены аккаунта"
            >
              <PlayerAvatar account={activeAccount} size={22} showProviderBadge />
              <span className="text-xs font-semibold text-slate-200 group-hover:text-emerald-300 truncate max-w-[110px]">
                {activeAccount.username}
              </span>
              <span
                className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-semibold ${
                  activeAccount.provider === "elyby"
                    ? "bg-cyan-500/15 text-cyan-300 border border-cyan-500/30"
                    : activeAccount.provider === "microsoft"
                    ? "bg-emerald-500/15 text-emerald-300 border border-emerald-500/30"
                    : "bg-white/[0.06] text-slate-300 border border-white/[0.08]"
                }`}
              >
                {activeAccount.provider === "elyby"
                  ? "Ely.by"
                  : activeAccount.provider === "microsoft"
                  ? "Microsoft"
                  : "Оффлайн"}
              </span>
            </button>
          ) : (
            <button
              onClick={() => {
                soundManager.playClick();
                onOpenAccounts();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-emerald-300 text-xs font-semibold transition-all cursor-pointer active:scale-95"
              title="Нажмите для входа в аккаунт"
            >
              <UserCircle className="w-4 h-4" />
              <span>Войти в аккаунт</span>
            </button>
          )}

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Поиск сборок..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-white/20 w-44 transition-colors"
            />
          </div>

          <button
            onClick={onOpenModpacks}
            className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Каталог готовых сборок"
          >
            <Sparkles className="w-3.5 h-3.5 text-slate-400" />
            <span>Каталог сборок</span>
          </button>

          {onOpenAiBuilder && (
            <button
              onClick={onOpenAiBuilder}
              className="px-3 py-1.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 hover:text-white border border-white/[0.08] text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
              title="Импорт списка модов"
            >
              <Bot className="w-3.5 h-3.5 text-slate-400" />
              <span>Подбор модов</span>
            </button>
          )}

          <button
            onClick={onOpenCreate}
            className="px-3.5 py-1.5 rounded-xl btn-accent font-semibold text-xs flex items-center gap-1.5 transition-all duration-150 active:scale-[0.98] cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Создать сборку</span>
          </button>
        </div>
      </div>

      {/* Grid Content */}
      <div className="flex-1 overflow-y-auto pr-1">
        {filteredInstances.length === 0 ? (
          <div className="h-96 flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.01] p-8 text-center">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center text-slate-400 mb-3">
              <Box className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200 mb-1">Сборки не найдены</h3>
            <p className="text-xs text-slate-400 max-w-sm mb-4">
              {searchTerm
                ? "Нет сборок, соответствующих поисковому запросу."
                : "Создайте свою первую сборку Minecraft или выберите готовый модпак."}
            </p>
            <div className="flex items-center gap-3">
              <button
                onClick={onOpenModpacks}
                className="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/[0.1] text-white font-semibold text-xs border border-white/[0.08] transition-all flex items-center gap-2 cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-emerald-400" />
                <span>Каталог сборок</span>
              </button>
              <button
                onClick={onOpenCreate}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-all cursor-pointer shadow-sm"
              >
                Создать сборку
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* Quick Launch Banner for Starred Instances */}
            {starredIds.length > 0 && filteredInstances.some((inst) => starredIds.includes(inst.id)) && (
              (() => {
                const primaryStarred = sortedInstances.find((inst) => starredIds.includes(inst.id));
                if (!primaryStarred) return null;
                const mcVer = primaryStarred.mcVersion || primaryStarred.game_version || "1.20.1";
                const ldr = primaryStarred.loader || primaryStarred.loader_type || "vanilla";

                return (
                  <div className="mb-4 p-4 rounded-2xl bg-gradient-to-r from-emerald-950/40 via-slate-900/60 to-indigo-950/30 border border-emerald-500/30 shadow-[0_4px_24px_rgba(16,185,129,0.12)] flex flex-col md:flex-row md:items-center justify-between gap-4 backdrop-blur-md">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="relative flex-shrink-0">
                        <div className="w-12 h-12 rounded-xl bg-black/40 border border-emerald-500/40 flex items-center justify-center overflow-hidden shadow-inner">
                          {primaryStarred.icon ? (
                            <img
                              src={primaryStarred.icon}
                              alt={primaryStarred.name}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Box className="w-6 h-6 text-emerald-400" />
                          )}
                        </div>
                        <div className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-amber-400/20 border border-amber-400/50 flex items-center justify-center text-amber-300">
                          <Star className="w-3 h-3 fill-current" />
                        </div>
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                            <Zap className="w-3 h-3 fill-current" />
                            Быстрый запуск
                          </span>
                          {getLoaderBadge(ldr)}
                          <span className="text-[11px] font-mono text-slate-400 font-semibold">
                            MC {mcVer}
                          </span>
                        </div>
                        <h3 className="text-base font-bold text-white truncate mt-0.5">
                          {primaryStarred.name}
                        </h3>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 flex-shrink-0 md:min-w-[220px]">
                      <div className="flex-1">
                        {renderLaunchButton(primaryStarred.id)}
                      </div>
                      <button
                        onClick={(e) => toggleStar(e, primaryStarred.id)}
                        className="p-2.5 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-amber-400 border border-white/[0.08] transition-colors cursor-pointer"
                        title="Убрать из избранного"
                      >
                        <Star className="w-4 h-4 fill-current" />
                      </button>
                    </div>
                  </div>
                );
              })()
            )}

            <div
              className={`grid ${
                density === "compact"
                  ? "grid-cols-1 md:grid-cols-3 xl:grid-cols-4 gap-3"
                  : "grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
              } pb-4`}
            >
            {sortedInstances.map((inst) => {
              const status = statuses[inst.id];
              const isRunning = status?.state === "running";
              const isCrashed = status?.state === "crashed";
              const isModded = (inst.loader_type || inst.loader || "").toLowerCase() !== "vanilla";
              const isStarred = starredIds.includes(inst.id);

              return (
                <div
                  key={inst.id}
                  className={`rounded-2xl ${
                    density === "compact" ? "p-3" : "p-4"
                  } transition-all duration-150 flex flex-col justify-between glass-card ${
                    isRunning
                      ? "border-accent shadow-glow"
                      : isCrashed
                      ? "border-red-500/50"
                      : isStarred
                      ? "border-amber-500/40 shadow-[0_0_12px_rgba(245,158,11,0.12)]"
                      : ""
                  }`}
                >
                  {/* Top Card Info */}
                  <div>
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="overflow-hidden flex-1">
                        <div className="flex items-center gap-1.5">
                          {isStarred && (
                            <span className="text-[11px] text-amber-400 font-bold" title="В избранном">
                              ⭐
                            </span>
                          )}
                          <h3 className="text-sm font-bold text-white group-hover:text-emerald-300 transition-colors truncate">
                            {inst.name}
                          </h3>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Minecraft {inst.game_version || inst.mcVersion || ""}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <button
                          type="button"
                          onClick={(e) => toggleStar(e, inst.id)}
                          className={`p-1 rounded-lg transition-all cursor-pointer ${
                            isStarred
                              ? "text-amber-400 bg-amber-400/15 border border-amber-400/30"
                              : "text-slate-500 hover:text-amber-300 hover:bg-white/[0.05]"
                          }`}
                          title={isStarred ? "Убрать из избранного" : "Закрепить в избранное"}
                        >
                          <Star className={`w-3.5 h-3.5 ${isStarred ? "fill-amber-400 text-amber-400" : ""}`} />
                        </button>
                        <span
                          className={`text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded-md border ${getLoaderBadge(
                            inst.loader_type || inst.loader || "vanilla"
                          )}`}
                        >
                          {inst.loader_type || inst.loader || "vanilla"}
                        </span>
                      </div>
                    </div>

                    {/* Chips Row */}
                    <div className="flex flex-wrap items-center gap-1.5 my-2.5">
                      <span className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.06] text-slate-300 flex items-center gap-1 font-mono">
                        <Cpu className="w-3 h-3 text-slate-400" />
                        {Math.round((inst.memory?.max_mb || 4096) / 1024)} ГБ ОЗУ
                      </span>

                      <button
                        onClick={() => {
                          soundManager.playClick();
                          onOpenMods(inst.id);
                        }}
                        className="text-[10px] px-2 py-0.5 rounded-md bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] text-slate-300 flex items-center gap-1 font-mono transition-colors cursor-pointer"
                        title="Открыть менеджер модов"
                      >
                        <Box className="w-3 h-3 text-emerald-400" />
                        <span>{inst.mod_count || 0} модов</span>
                      </button>

                      {/* 1-Click Ultra FPS Boost (500+ FPS) Button */}
                      {isModded && (
                        <button
                          onClick={() => handleInstallOptimization(inst.id)}
                          disabled={installingOpt[inst.id]}
                          className="text-[10px] px-2.5 py-0.5 rounded-md bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border border-amber-500/30 flex items-center gap-1 transition-all cursor-pointer font-bold shadow-sm"
                          title="⚡ Ультра-буст FPS: установка Sodium + Lithium + FerriteCore + ImmediatelyFast, разблокировка FPS и твики NVIDIA/AMD"
                        >
                          {optSuccess[inst.id] ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-400" />
                              <span>⚡ 500+ FPS активен</span>
                            </>
                          ) : installingOpt[inst.id] ? (
                            <>
                              <RefreshCw className="w-3 h-3 animate-spin text-amber-400" />
                              <span>Разгон FPS...</span>
                            </>
                          ) : (
                            <>
                              <Zap className="w-3 h-3 text-amber-400 fill-amber-400" />
                              <span>⚡ Ультра-буст FPS (500+)</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Actions & Launch */}
                  <div className="pt-3 border-t border-white/[0.06] flex flex-col gap-2 mt-2">
                    {renderLaunchButton(inst.id)}

                    {/* Secondary Action Row */}
                    <div className="flex items-center justify-between gap-1">
                      <button
                        onClick={() => {
                          soundManager.playClick();
                          openConsole(inst.id);
                        }}
                        className="flex-1 py-1 px-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] text-slate-400 hover:text-slate-200 border border-white/[0.06] text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="Открыть консоль логов"
                      >
                        <Terminal className="w-3.5 h-3.5" />
                        <span>Консоль</span>
                      </button>

                      <button
                        onClick={() => {
                          soundManager.playClick();
                          onOpenMods(inst.id);
                        }}
                        className="flex-1 py-1 px-2 rounded-lg bg-white/[0.02] hover:bg-white/[0.06] text-slate-400 hover:text-slate-200 border border-white/[0.06] text-[11px] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                        title="Управление модами"
                      >
                        <Package className="w-3.5 h-3.5" />
                        <span>Моды</span>
                      </button>

                      <button
                        onClick={() => {
                          soundManager.playClick();
                          openInstanceFolder(inst.id);
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] border border-white/[0.06] transition-colors cursor-pointer"
                        title="Открыть папку сборки"
                      >
                        <Folder className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleClone(inst)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-white/[0.06] border border-white/[0.06] transition-colors cursor-pointer"
                        title="Дублировать сборку"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>

                      <button
                        onClick={() => handleDeleteClick(inst)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-red-500/10 border border-white/[0.06] transition-colors cursor-pointer"
                        title="Удалить сборку"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>

      {/* Release-Ready Custom Deletion Confirmation Modal */}
      {instanceToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-150">
          <div className="glass-panel w-full max-w-md rounded-2xl border border-red-500/30 bg-[#0e111a] shadow-2xl p-6 flex flex-col gap-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center text-red-400">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-white">Удаление сборки</h2>
                <p className="text-xs text-slate-400 mt-0.5">Подтверждение удаления</p>
              </div>
            </div>

            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-slate-300 leading-relaxed space-y-2">
              <p>
                Вы действительно хотите удалить сборку <span className="font-bold text-white">«{instanceToDelete.name}»</span>?
              </p>
              <div className="flex items-center gap-2 py-1">
                <span className="px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.08] text-[11px] font-mono text-slate-300">
                  MC {instanceToDelete.game_version || instanceToDelete.mcVersion}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.08] text-[11px] font-mono text-slate-300 uppercase">
                  {instanceToDelete.loader_type || instanceToDelete.loader}
                </span>
                <span className="px-2 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.08] text-[11px] font-mono text-slate-300">
                  {instanceToDelete.mod_count || 0} модов
                </span>
              </div>
              <p className="text-red-300/90 text-[11px]">
                ⚠️ Внимание: Все сохранённые миры (saves), скриншоты, конфигурации и моды этой сборки будут безвозвратно стёрты с диска.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setInstanceToDelete(null)}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-300 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                disabled={isDeleting}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {isDeleting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Удаление...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Удалить навсегда</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
