import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { Friend, AddFriendRequest, UpdateFriendRequest } from "../types";

interface FriendState {
  friends: Friend[];
  isLoading: boolean;
  error: string | null;
  fetchFriends: () => Promise<void>;
  addFriend: (nickname: string, note?: string) => Promise<Friend>;
  removeFriend: (id: string) => Promise<void>;
  toggleFavorite: (id: string) => Promise<boolean>;
  updateFriend: (req: UpdateFriendRequest) => Promise<Friend>;
}

export const useFriendStore = create<FriendState>((set, get) => ({
  friends: [],
  isLoading: false,
  error: null,

  fetchFriends: async () => {
    set({ isLoading: true, error: null });
    try {
      const friends = await invoke<Friend[]>("get_friends");
      set({ friends, isLoading: false });
    } catch (err: unknown) {
      set({ error: String(err), isLoading: false });
    }
  },

  addFriend: async (nickname: string, note?: string) => {
    set({ isLoading: true, error: null });
    try {
      const req: AddFriendRequest = {
        nickname: nickname.trim(),
        note: note ? note.trim() : null,
      };
      const friend = await invoke<Friend>("add_friend", { req });
      await get().fetchFriends();
      set({ isLoading: false });
      return friend;
    } catch (err: unknown) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  removeFriend: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      await invoke("remove_friend", { id });
      await get().fetchFriends();
      set({ isLoading: false });
    } catch (err: unknown) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },

  toggleFavorite: async (id: string) => {
    try {
      const isFav = await invoke<boolean>("toggle_favorite_friend", { id });
      await get().fetchFriends();
      return isFav;
    } catch (err: unknown) {
      set({ error: String(err) });
      throw err;
    }
  },

  updateFriend: async (req: UpdateFriendRequest) => {
    set({ isLoading: true, error: null });
    try {
      const updated = await invoke<Friend>("update_friend", { req });
      await get().fetchFriends();
      set({ isLoading: false });
      return updated;
    } catch (err: unknown) {
      set({ error: String(err), isLoading: false });
      throw err;
    }
  },
}));
