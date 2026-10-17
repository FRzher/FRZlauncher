import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { Account } from "../types";

interface AuthState {
  accounts: Account[];
  activeAccount: Account | null;
  isLoading: boolean;
  error: string | null;
  fetchAccounts: () => Promise<void>;
  createOfflineAccount: (username: string) => Promise<Account>;
  createElybyAccount: (username: string, token?: string) => Promise<Account>;
  loginWithElybyOAuth: (clientId?: string) => Promise<Account>;
  loginWithElybyCredentials: (identity: string, password: string) => Promise<Account>;
  startMicrosoftLogin: () => Promise<import("../types").DeviceCodeResponse>;
  pollMicrosoftLogin: (deviceCode: string) => Promise<Account>;
  setActiveAccount: (id: string) => Promise<void>;
  deleteAccount: (id: string) => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  accounts: [],
  activeAccount: null,
  isLoading: false,
  error: null,

  fetchAccounts: async () => {
    set({ isLoading: true });
    try {
      const accounts = await invoke<Account[]>("get_accounts");
      const activeAccount = await invoke<Account | null>("get_active_account");
      set({ accounts, activeAccount, isLoading: false });
    } catch (err: unknown) {
      set({ error: String(err), isLoading: false });
    }
  },

  createOfflineAccount: async (username: string) => {
    set({ isLoading: true, error: null });
    try {
      const account = await invoke<Account>("create_offline_account", { username });
      await get().fetchAccounts();
      set({ activeAccount: account, isLoading: false });
      return account;
    } catch (err: unknown) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  createElybyAccount: async (username: string, token?: string) => {
    set({ isLoading: true, error: null });
    try {
      const account = await invoke<Account>("create_elyby_account", {
        username,
        token: token || null,
      });
      await get().fetchAccounts();
      set({ activeAccount: account, isLoading: false });
      return account;
    } catch (err: unknown) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  loginWithElybyOAuth: async (clientId?: string) => {
    set({ isLoading: true, error: null });
    try {
      const account = await invoke<Account>("start_elyby_oauth", {
        clientId: clientId?.trim() || null,
      });
      await get().fetchAccounts();
      set({ activeAccount: account, isLoading: false });
      return account;
    } catch (err: unknown) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  loginWithElybyCredentials: async (identity: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const account = await invoke<Account>("login_elyby_credentials", {
        identity: identity.trim(),
        password,
      });
      await get().fetchAccounts();
      set({ activeAccount: account, isLoading: false });
      return account;
    } catch (err: unknown) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  startMicrosoftLogin: async () => {
    set({ isLoading: true, error: null });
    try {
      const resp = await invoke<import("../types").DeviceCodeResponse>("start_microsoft_login");
      set({ isLoading: false });
      return resp;
    } catch (err: unknown) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  pollMicrosoftLogin: async (deviceCode: string) => {
    set({ isLoading: true, error: null });
    try {
      const account = await invoke<Account>("poll_microsoft_login", {
        deviceCode,
      });
      await get().fetchAccounts();
      set({ activeAccount: account, isLoading: false });
      return account;
    } catch (err: unknown) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  setActiveAccount: async (id: string) => {
    try {
      await invoke("set_active_account", { id });
      await get().fetchAccounts();
    } catch (err: unknown) {
      set({ error: String(err) });
      throw err;
    }
  },

  deleteAccount: async (id: string) => {
    try {
      await invoke("delete_account", { id });
      await get().fetchAccounts();
    } catch (err: unknown) {
      set({ error: String(err) });
      throw err;
    }
  },
}));
