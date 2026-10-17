import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { MemoryConfig, SystemSpecs } from "../types";

interface SystemState {
  specs: SystemSpecs | null;
  recommendedMemory: MemoryConfig | null;
  isLoading: boolean;
  fetchSystemSpecs: () => Promise<void>;
  getJvmArgs: (
    memory: MemoryConfig,
    gcPreset: string,
    customArgs: string[]
  ) => Promise<string[]>;
}

export const useSystemStore = create<SystemState>((set) => ({
  specs: null,
  recommendedMemory: null,
  isLoading: false,

  fetchSystemSpecs: async () => {
    set({ isLoading: true });
    try {
      const specs = await invoke<SystemSpecs>("get_system_specs");
      const recommendedMemory = await invoke<MemoryConfig>("recommend_memory");
      set({ specs, recommendedMemory, isLoading: false });
    } catch {
      set({ isLoading: false });
    }
  },

  getJvmArgs: async (
    memory: MemoryConfig,
    gcPreset: string,
    customArgs: string[]
  ) => {
    return await invoke<string[]>("get_jvm_args", {
      memory,
      gcPreset,
      customArgs,
    });
  },
}));
