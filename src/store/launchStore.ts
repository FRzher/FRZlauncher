import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import {
  DownloadProgressPayload,
  GameExitedPayload,
  GameLogEntry,
  GameStartedPayload,
  GameStatusChangedPayload,
  LaunchStatus,
} from "../types";

interface LaunchState {
  statuses: Record<string, LaunchStatus>;
  granularProgress: Record<string, DownloadProgressPayload>;
  logs: Record<string, GameLogEntry[]>;
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
  initListeners: () => Promise<() => void>;
}

export const useLaunchStore = create<LaunchState>((set) => ({
  statuses: {},
  granularProgress: {},
  logs: {},
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
          isGameRunning: true,
          runningInstanceId: id,
          granularProgress: newProgress,
          statuses: {
            ...state.statuses,
            [id]: {
              instance_id: id,
              state: "running",
              message: "В игре",
              progress: undefined,
            },
          },
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
                if (newStatuses[k].state === "running") {
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

    const handleGameLaunched = (payload: any) => {
      set((state) => {
        const instId = payload?.instance_id || state.activeConsoleInstanceId;
        const newProgress = { ...state.granularProgress };
        const newStatuses = { ...state.statuses };
        if (instId) {
          delete newProgress[instId];
          newStatuses[instId] = {
            instance_id: instId,
            state: "running",
            message: "В игре",
            progress: undefined,
          };
        } else {
          for (const k of Object.keys(newStatuses)) {
            delete newProgress[k];
            newStatuses[k] = {
              ...newStatuses[k],
              state: "running",
              message: "В игре",
              progress: undefined,
            };
          }
        }
        return {
          isGameRunning: true,
          runningInstanceId: instId || state.runningInstanceId,
          granularProgress: newProgress,
          statuses: newStatuses,
        };
      });
    };

    const unlistenLaunched = await listen<any>("game-launched", (event) => {
      handleGameLaunched(event.payload);
    });

    const unlistenStarted = await listen<GameStartedPayload>("game-started", (event) => {
      handleGameLaunched(event.payload);
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
      unlistenStarted();
      unlistenExited();
      unlistenLog();
    };
  },
}));
