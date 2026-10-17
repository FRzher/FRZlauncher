import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { CreateInstanceRequest, InstanceConfig, InstanceSummary } from "../types";

interface InstanceState {
  instances: InstanceSummary[];
  selectedInstance: InstanceConfig | null;
  isLoading: boolean;
  error: string | null;
  fetchInstances: () => Promise<void>;
  selectInstance: (id: string) => Promise<void>;
  createInstance: (req: CreateInstanceRequest) => Promise<InstanceConfig>;
  updateInstance: (config: InstanceConfig) => Promise<InstanceConfig>;
  deleteInstance: (id: string) => Promise<void>;
  cloneInstance: (id: string, newName: string) => Promise<InstanceConfig>;
  openInstanceFolder: (id: string) => Promise<void>;
}

const normalizeConfig = (raw: any): InstanceConfig => {
  const gv = raw.game_version || raw.mcVersion || "1.21.1";
  const lt = raw.loader_type || raw.loader || "vanilla";
  const lv = raw.loader_version || raw.loaderVersion;
  return {
    ...raw,
    game_version: gv,
    mcVersion: gv,
    loader_type: lt,
    loader: lt,
    loader_version: lv,
    loaderVersion: lv,
  };
};

const normalizeSummary = (raw: any): InstanceSummary => {
  const gv = raw.game_version || raw.mcVersion || "1.21.1";
  const lt = raw.loader_type || raw.loader || "vanilla";
  const lv = raw.loader_version || raw.loaderVersion;
  return {
    ...raw,
    game_version: gv,
    mcVersion: gv,
    loader_type: lt,
    loader: lt,
    loader_version: lv,
    loaderVersion: lv,
  };
};

export const useInstanceStore = create<InstanceState>((set, get) => ({
  instances: [],
  selectedInstance: null,
  isLoading: false,
  error: null,

  fetchInstances: async () => {
    set({ isLoading: true, error: null });
    try {
      const rawInstances = await invoke<any[]>("get_instances");
      const instances = rawInstances.map(normalizeSummary);
      set({ instances, isLoading: false });
      
      // If nothing selected and we have instances, select the first one
      if (!get().selectedInstance && instances.length > 0) {
        get().selectInstance(instances[0].id);
      }
    } catch (err: unknown) {
      set({ error: String(err), isLoading: false });
    }
  },

  selectInstance: async (id: string) => {
    try {
      const raw = await invoke<any>("get_instance", { id });
      const instance = normalizeConfig(raw);
      set({ selectedInstance: instance });
    } catch (err: unknown) {
      set({ error: String(err) });
    }
  },

  createInstance: async (req: CreateInstanceRequest) => {
    set({ isLoading: true, error: null });
    try {
      const raw = await invoke<any>("create_instance", { req });
      const newInstance = normalizeConfig(raw);
      await get().fetchInstances();
      set({ selectedInstance: newInstance, isLoading: false });
      return newInstance;
    } catch (err: unknown) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  updateInstance: async (config: InstanceConfig) => {
    try {
      const raw = await invoke<any>("update_instance", { config });
      const updated = normalizeConfig(raw);
      set({ selectedInstance: updated });
      await get().fetchInstances();
      return updated;
    } catch (err: unknown) {
      set({ error: String(err) });
      throw err;
    }
  },

  deleteInstance: async (id: string) => {
    try {
      await invoke("delete_instance", { id });
      if (get().selectedInstance?.id === id) {
        set({ selectedInstance: null });
      }
      await get().fetchInstances();
    } catch (err: unknown) {
      set({ error: String(err) });
      throw err;
    }
  },

  cloneInstance: async (id: string, newName: string) => {
    try {
      const cloned = await invoke<InstanceConfig>("clone_instance", {
        id,
        newName,
      });
      await get().fetchInstances();
      return cloned;
    } catch (err: unknown) {
      set({ error: String(err) });
      throw err;
    }
  },

  openInstanceFolder: async (id: string) => {
    try {
      await invoke("open_instance_folder", { id });
    } catch (err: unknown) {
      set({ error: String(err) });
    }
  },
}));
