import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  DownloadProgressPayload,
  GameExitedPayload,
  GameLogEntry,
  GameStatusChangedPayload,
  LaunchStatus,
  CrashDiagnosis,
  AutoRepairResult,
} from "../types";

interface LaunchState {
  statuses: Record<string, LaunchStatus>;
  granularProgress: Record<string, DownloadProgressPayload>;
  logs: Record<string, GameLogEntry[]>;
  crashDiagnoses: Record<string, CrashDiagnosis>;
  isRepairing: Record<string, boolean>;
  isConsoleOpen: boolean;
  activeConsoleInstanceId: string | null;
  isGameRunning: boolean;
  runningInstanceId: string | null;
  launchInstance: (id: string) => Promise<void>;
  killActiveGame: () => Promise<void>;
  killProcess: (id?: string) => Promise<void>;
  openConsole: (instanceId: string) => void;
  closeConsole: () => void;
  clearLogs: (instanceId: string) => void;
  autoRepairInstance: (instanceId: string) => Promise<AutoRepairResult>;
  initListeners: () => Promise<() => void>;
}

export const useLaunchStore = create<LaunchState>((set) => ({
  statuses: {},
  granularProgress: {},
  logs: {},
  crashDiagnoses: {},
  isRepairing: {},
  isConsoleOpen: false,
  activeConsoleInstanceId: null,
  isGameRunning: false,
  runningInstanceId: null,

  launchInstance: async (id: string) => {
    set((state) => ({
      statuses: {
        ...state.statuses,
        [id]: {
          instance_id: id,
          state: "launching",
          message: "Инициализация запуска игры...",
          progress: 5,
        },
      },
      isConsoleOpen: false,
      activeConsoleInstanceId: id,
      runningInstanceId: id,
    }));

    try {
      await invoke("launch_instance", { id });
      set((state) => {
        const newProgress = { ...state.granularProgress };
        delete newProgress[id];
        return {
          runningInstanceId: id,
          granularProgress: newProgress,
        };
      });
    } catch (err: unknown) {
      set((state) => ({
        isGameRunning: false,
        runningInstanceId: null,
        statuses: {
          ...state.statuses,
          [id]: {
            instance_id: id,
            state: "crashed",
            message: String(err),
          },
        },
      }));
    }
  },

  killActiveGame: async () => {
    try {
      await invoke("kill_active_game");
      set((state) => {
        const newStatuses = { ...state.statuses };
        if (state.runningInstanceId && newStatuses[state.runningInstanceId]) {
          newStatuses[state.runningInstanceId] = {
            instance_id: state.runningInstanceId,
            state: "ready",
            message: "Готов к запуску",
            progress: undefined,
          };
        }
        return {
          isGameRunning: false,
          runningInstanceId: null,
          statuses: newStatuses,
        };
      });
    } catch (err: unknown) {
      console.error("Не удалось завершить активную игру:", err);
    }
  },

  killProcess: async (id?: string) => {
    try {
      if (id) {
        await invoke("kill_instance_process", { id });
      } else {
        await invoke("kill_active_game");
      }
      set((state) => {
        const targetId = id || state.runningInstanceId;
        const newStatuses = { ...state.statuses };
        if (targetId && newStatuses[targetId]) {
          newStatuses[targetId] = {
            instance_id: targetId,
            state: "ready",
            message: "Готов к запуску",
            progress: undefined,
          };
        }
        return {
          isGameRunning: false,
          runningInstanceId: null,
          statuses: newStatuses,
        };
      });
    } catch (err: unknown) {
      console.error("Не удалось завершить процесс:", err);
    }
  },

  openConsole: (instanceId: string) => {
    set({ isConsoleOpen: true, activeConsoleInstanceId: instanceId });
  },

  closeConsole: () => {
    set({ isConsoleOpen: false });
  },

  clearLogs: (instanceId: string) => {
    set((state) => ({
      logs: {
        ...state.logs,
        [instanceId]: [],
      },
    }));
  },

  autoRepairInstance: async (instanceId: string) => {
    set((state) => ({
      isRepairing: { ...state.isRepairing, [instanceId]: true },
    }));
    try {
      const result = await invoke<AutoRepairResult>("auto_repair_instance", {
        instanceId,
      });
      set((state) => {
        const newDiagnoses = { ...state.crashDiagnoses };
        if (result.success) {
          delete newDiagnoses[instanceId];
        }
        return {
          isRepairing: { ...state.isRepairing, [instanceId]: false },
          crashDiagnoses: newDiagnoses,
          statuses: {
            ...state.statuses,
            [instanceId]: {
              instance_id: instanceId,
              state: result.success ? "ready" : "crashed",
              message: result.message,
              progress: undefined,
            },
          },
        };
      });
      return result;
    } catch (err: unknown) {
      set((state) => ({
        isRepairing: { ...state.isRepairing, [instanceId]: false },
      }));
      throw err;
    }
  },

  initListeners: async () => {
    // 1. Process Lifecycle State Changed (True Single Source of Truth)
    const unlistenGameStatus = await listen<GameStatusChangedPayload>(
      "game-status-changed",
      (event) => {
        const { running, exit_code, instance_id } = event.payload;
        set((state) => {
          const instId = instance_id || state.runningInstanceId || state.activeConsoleInstanceId;
          const newProgress = { ...state.granularProgress };
          if (instId) {
            delete newProgress[instId];
          }
          const newStatuses = { ...state.statuses };

          if (running) {
            if (instId) {
              newStatuses[instId] = {
                instance_id: instId,
                state: "running",
                message: "В игре",
                progress: undefined,
              };
            }
            return {
              isGameRunning: true,
              runningInstanceId: instId || null,
              granularProgress: newProgress,
              statuses: newStatuses,
            };
          } else {
            // Process terminated
            const isClean = exit_code === 0 || exit_code === undefined;
            if (instId) {
              newStatuses[instId] = {
                instance_id: instId,
                state: isClean ? "ready" : "crashed",
                message: isClean ? "Готов к запуску" : `Код выхода: ${exit_code}`,
                progress: undefined,
              };
            } else {
              for (const k of Object.keys(newStatuses)) {
                if (newStatuses[k].state === "running" || newStatuses[k].state === "starting") {
                  newStatuses[k] = {
                    instance_id: k,
                    state: isClean ? "ready" : "crashed",
                    message: isClean ? "Готов к запуску" : `Код выхода: ${exit_code}`,
                    progress: undefined,
                  };
                }
              }
            }
            return {
              isGameRunning: false,
              runningInstanceId: null,
              granularProgress: newProgress,
              statuses: newStatuses,
            };
          }
        });
      }
    );

    const unlistenStatus = await listen<LaunchStatus>("launch-status", (event) => {
      set((state) => {
        const newProgress = { ...state.granularProgress };
        if (
          event.payload.state === "running" ||
          event.payload.state === "ready" ||
          event.payload.state === "crashed" ||
          event.payload.state === "exited"
        ) {
          delete newProgress[event.payload.instance_id];
        }
        return {
          isGameRunning: event.payload.state === "running" ? true : state.isGameRunning,
          granularProgress: newProgress,
          statuses: {
            ...state.statuses,
            [event.payload.instance_id]: event.payload,
          },
        };
      });
    });

    const unlistenGranular = await listen<DownloadProgressPayload>(
      "download-progress-granular",
      (event) => {
        set((state) => ({
          granularProgress: {
            ...state.granularProgress,
            [event.payload.instance_id]: event.payload,
          },
        }));
      }
    );

    const unlistenLaunched = await listen<any>("game-launched", (event) => {
      set((state) => {
        const instId = event.payload?.instance_id || state.activeConsoleInstanceId;
        const newProgress = { ...state.granularProgress };
        const newStatuses = { ...state.statuses };
        if (instId) {
          delete newProgress[instId];
          newStatuses[instId] = {
            instance_id: instId,
            state: "starting",
            message: "Инициализация Minecraft и загрузка модов...",
            progress: undefined,
          };
        }
        return {
          runningInstanceId: instId || state.runningInstanceId,
          granularProgress: newProgress,
          statuses: newStatuses,
        };
      });
    });

    const unlistenWindowReady = await listen<any>("game-window-ready", (event) => {
      set((state) => {
        const instId = event.payload?.instance_id || state.runningInstanceId;
        const newStatuses = { ...state.statuses };
        if (instId) {
          newStatuses[instId] = {
            instance_id: instId,
            state: "running",
            message: "В игре",
            progress: undefined,
          };
        }
        return {
          isGameRunning: true,
          runningInstanceId: instId || state.runningInstanceId,
          statuses: newStatuses,
        };
      });
    });

    const unlistenCrash = await listen<any>("game-crash-diagnosed", (event) => {
      const { instance_id, diagnosis } = event.payload || {};
      if (instance_id && diagnosis) {
        set((state) => ({
          crashDiagnoses: {
            ...state.crashDiagnoses,
            [instance_id]: diagnosis,
          },
        }));
      }
    });

    const unlistenExited = await listen<GameExitedPayload>("game-exited", (event) => {
      set((state) => {
        const instId = event.payload?.instance_id || state.activeConsoleInstanceId;
        const newProgress = { ...state.granularProgress };
        if (instId) {
          delete newProgress[instId];
        }
        const isClean = event.payload?.exit_code === 0;
        return {
          isGameRunning: false,
          runningInstanceId: null,
          granularProgress: newProgress,
          statuses: {
            ...state.statuses,
            ...(instId
              ? {
                  [instId]: {
                    instance_id: instId,
                    state: isClean ? "ready" : "crashed",
                    message: isClean ? "Готов к запуску" : `Код выхода: ${event.payload.exit_code}`,
                    progress: undefined,
                  },
                }
              : {}),
          },
        };
      });
    });

    const unlistenLog = await listen<GameLogEntry>("game-log", (event) => {
      const entry = event.payload;
      set((state) => {
        const existing = state.logs[entry.instance_id] || [];
        const updated = existing.length > 2500 ? existing.slice(-2000) : existing;
        return {
          logs: {
            ...state.logs,
            [entry.instance_id]: [...updated, entry],
          },
        };
      });
    });

    return () => {
      unlistenGameStatus();
      unlistenStatus();
      unlistenGranular();
      unlistenLaunched();
      unlistenWindowReady();
      unlistenCrash();
      unlistenExited();
      unlistenLog();
    };
  },
}));
