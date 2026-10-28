import React, { useState, useEffect } from "react";
import {
  X,
  UserPlus,
  Users,
  Star,
  Trash2,
  Copy,
  Check,
  Search,
  MessageSquare,
  Sparkles,
  AlertCircle,
  Clock,
} from "lucide-react";
import { useFriendStore } from "../../store/friendStore";
import { Friend } from "../../types";
import { soundManager } from "../../utils/sound";

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FriendsModal: React.FC<FriendsModalProps> = ({ isOpen, onClose }) => {
  const {
    friends,
    isLoading,
    fetchFriends,
    addFriend,
    removeFriend,
    toggleFavorite,
  } = useFriendStore();

  const [searchQuery, setSearchQuery] = useState("");
  const [showAddForm, setShowAddForm] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [newNote, setNewNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchFriends();
      setShowAddForm(false);
      setFormError(null);
    }
  }, [isOpen, fetchFriends]);

  if (!isOpen) return null;

  const handleCopyNickname = (nickname: string, id: string) => {
    navigator.clipboard.writeText(nickname);
    soundManager.playClick();
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const nick = newNickname.trim();
    if (!nick) {
      setFormError("Введите никнейм друга");
      return;
    }

    if (nick.length < 2 || nick.length > 32) {
      setFormError("Длина ника должна быть от 2 до 32 символов");
      return;
    }

    if (!/^[\p{L}0-9_]+$/u.test(nick)) {
      setFormError("Никнейм может содержать только буквы, цифры и символ _");
      return;
    }

    setIsSubmitting(true);
    try {
      soundManager.playClick();
      await addFriend(nick, newNote.trim() || undefined);
      setNewNickname("");
      setNewNote("");
      setShowAddForm(false);
    } catch (err: unknown) {
      setFormError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      soundManager.playClick();
      await removeFriend(id);
      setConfirmDeleteId(null);
    } catch (err: unknown) {
      console.error("Failed to remove friend:", err);
    }
  };

  const filteredFriends = friends.filter((f) => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      f.nickname.toLowerCase().includes(q) ||
      (f.note && f.note.toLowerCase().includes(q))
    );
  });

  const favorites = filteredFriends.filter((f) => f.favorite);
  const others = filteredFriends.filter((f) => !f.favorite);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl bg-gradient-to-b from-gray-900 via-gray-900 to-gray-950 border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center text-purple-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-bold text-white">Список друзей</h2>
                <span className="px-2 py-0.5 text-xs font-semibold rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/30">
                  {friends.length}
                </span>
              </div>
              <p className="text-xs text-gray-400">
                Добавляйте друзей по нику и копируйте их для совместной игры
              </p>
            </div>
          </div>
          <button
            onClick={() => {
              soundManager.playClick();
              onClose();
            }}
            className="p-2 text-gray-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Action bar: Search + Add button */}
        <div className="px-6 py-3 border-b border-white/5 bg-black/20 flex items-center gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Поиск по нику или заметке..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-white/5 border border-white/10 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500/50 transition-colors"
            />
          </div>
          <button
            onClick={() => {
              soundManager.playClick();
              setShowAddForm(!showAddForm);
              setFormError(null);
            }}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              showAddForm
                ? "bg-white/10 text-white"
                : "bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30"
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>{showAddForm ? "Отмена" : "Добавить"}</span>
          </button>
        </div>

        {/* Collapsible Add Friend Form */}
        {showAddForm && (
          <form
            onSubmit={handleAddSubmit}
            className="px-6 py-4 bg-purple-950/20 border-b border-purple-500/20 flex flex-col gap-3 animate-slide-down"
          >
            <div className="flex items-center gap-3">
              {/* Live Avatar Preview */}
              <div className="relative w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center overflow-hidden shrink-0 shadow-inner">
                {newNickname.trim().length >= 3 ? (
                  <img
                    src={`https://minotar.net/helm/${encodeURIComponent(
                      newNickname.trim()
                    )}/48.png`}
                    alt={newNickname}
                    className="w-10 h-10 rounded image-render-pixel"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src =
                        "https://minotar.net/helm/Steve/48.png";
                    }}
                  />
                ) : (
                  <Sparkles className="w-5 h-5 text-purple-400/50" />
                )}
              </div>

              <div className="flex-1 flex flex-col gap-2">
                <input
                  type="text"
                  placeholder="Никнейм игрока (например, Notch)"
                  value={newNickname}
                  onChange={(e) => setNewNickname(e.target.value)}
                  maxLength={32}
                  autoFocus
                  className="w-full px-3 py-1.5 bg-black/40 border border-white/15 rounded-lg text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-400 transition-colors"
                />
                <input
                  type="text"
                  placeholder="Заметка (необязательно, например: друг из школы)"
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  maxLength={64}
                  className="w-full px-3 py-1.5 bg-black/40 border border-white/15 rounded-lg text-xs text-white placeholder-gray-500 focus:outline-none focus:border-purple-400 transition-colors"
                />
              </div>
            </div>

            {formError && (
              <div className="flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-3 py-1.5 text-xs text-gray-400 hover:text-white rounded-lg hover:bg-white/5 transition-colors"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting || !newNickname.trim()}
                className="px-4 py-1.5 text-xs font-semibold bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg shadow-md shadow-purple-600/30 transition-all flex items-center gap-1.5"
              >
                {isSubmitting ? (
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>Сохранить друга</span>
              </button>
            </div>
          </form>
        )}

        {/* Friends List Scroll Area */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4 custom-scrollbar">
          {isLoading && friends.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-gray-400 gap-2">
              <div className="w-6 h-6 border-2 border-purple-500/30 border-t-purple-500 rounded-full animate-spin" />
              <p className="text-xs">Загрузка списка друзей...</p>
            </div>
          ) : filteredFriends.length === 0 ? (
            <div className="py-12 flex flex-col items-center justify-center text-center px-4">
              <div className="w-16 h-16 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center text-gray-500 mb-3">
                <Users className="w-8 h-8 opacity-40" />
              </div>
              <p className="text-sm font-medium text-gray-300">
                {searchQuery ? "Друзья не найдены" : "Список друзей пуст"}
              </p>
              <p className="text-xs text-gray-500 max-w-sm mt-1">
                {searchQuery
                  ? "Попробуйте изменить поисковый запрос"
                  : "Добавьте друзей по их никнейму, чтобы быстро приглашать их на сервера и в локальную сеть"}
              </p>
              {!showAddForm && !searchQuery && (
                <button
                  onClick={() => setShowAddForm(true)}
                  className="mt-4 px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold rounded-lg shadow-lg shadow-purple-600/30 transition-all flex items-center gap-1.5"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>Добавить первого друга</span>
                </button>
              )}
            </div>
          ) : (
            <>
              {/* Favorites Section */}
              {favorites.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-yellow-400/90 uppercase tracking-wider px-1">
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    <span>Избранные ({favorites.length})</span>
                  </div>
                  <div className="space-y-1.5">
                    {favorites.map((friend) => (
                      <FriendRow
                        key={friend.id}
                        friend={friend}
                        copiedId={copiedId}
                        confirmDeleteId={confirmDeleteId}
                        onCopy={handleCopyNickname}
                        onToggleFavorite={toggleFavorite}
                        onConfirmDelete={setConfirmDeleteId}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Other Friends Section */}
              {others.length > 0 && (
                <div className="space-y-2">
                  {favorites.length > 0 && (
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wider px-1 pt-2">
                      <span>Все друзья ({others.length})</span>
                    </div>
                  )}
                  <div className="space-y-1.5">
                    {others.map((friend) => (
                      <FriendRow
                        key={friend.id}
                        friend={friend}
                        copiedId={copiedId}
                        confirmDeleteId={confirmDeleteId}
                        onCopy={handleCopyNickname}
                        onToggleFavorite={toggleFavorite}
                        onConfirmDelete={setConfirmDeleteId}
                        onDelete={handleDelete}
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer info */}
        <div className="px-6 py-3 border-t border-white/5 bg-black/40 flex items-center justify-between text-xs text-gray-500">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            <span>Аватарки синхронизируются через Minotar / MC-Heads</span>
          </div>
          <span>Нажмите ник для копирования</span>
        </div>
      </div>
    </div>
  );
};

interface FriendRowProps {
  friend: Friend;
  copiedId: string | null;
  confirmDeleteId: string | null;
  onCopy: (nickname: string, id: string) => void;
  onToggleFavorite: (id: string) => void;
  onConfirmDelete: (id: string | null) => void;
  onDelete: (id: string) => void;
}

const FriendRow: React.FC<FriendRowProps> = ({
  friend,
  copiedId,
  confirmDeleteId,
  onCopy,
  onToggleFavorite,
  onConfirmDelete,
  onDelete,
}) => {
  const isCopied = copiedId === friend.id;
  const isConfirming = confirmDeleteId === friend.id;

  const avatarUrl =
    friend.avatar_url ||
    `https://minotar.net/helm/${encodeURIComponent(friend.nickname)}/40.png`;

  return (
    <div className="group relative flex items-center justify-between p-2.5 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/5 hover:border-white/10 transition-all">
      <div className="flex items-center gap-3 min-w-0">
        {/* Head Avatar */}
        <div className="relative w-9 h-9 rounded-lg bg-black/30 border border-white/10 overflow-hidden shrink-0 shadow">
          <img
            src={avatarUrl}
            alt={friend.nickname}
            className="w-full h-full object-cover image-render-pixel"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "https://minotar.net/helm/Steve/40.png";
            }}
          />
        </div>

        {/* Info */}
        <div className="min-w-0 flex flex-col">
          <div className="flex items-center gap-2">
            <button
              onClick={() => onCopy(friend.nickname, friend.id)}
              className="text-sm font-semibold text-white hover:text-purple-300 transition-colors flex items-center gap-1.5 truncate group/nick"
              title="Нажмите, чтобы скопировать ник"
            >
              <span className="truncate">{friend.nickname}</span>
              {isCopied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <Copy className="w-3 h-3 text-gray-500 opacity-0 group-hover/nick:opacity-100 transition-opacity shrink-0" />
              )}
            </button>
            {isCopied && (
              <span className="text-[10px] text-emerald-400 font-medium px-1.5 py-0.2 rounded bg-emerald-500/10">
                Скопировано!
              </span>
            )}
          </div>

          {friend.note ? (
            <p className="text-xs text-gray-400 truncate flex items-center gap-1">
              <MessageSquare className="w-3 h-3 text-gray-500 shrink-0" />
              <span className="truncate">{friend.note}</span>
            </p>
          ) : (
            <p className="text-[11px] text-gray-500 truncate flex items-center gap-1">
              <Clock className="w-3 h-3 shrink-0" />
              <span>Добавлен {new Date(friend.created_at).toLocaleDateString()}</span>
            </p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1 shrink-0">
        {isConfirming ? (
          <div className="flex items-center gap-1 animate-fade-in">
            <button
              onClick={() => onDelete(friend.id)}
              className="px-2 py-1 text-xs bg-red-600 hover:bg-red-500 text-white rounded font-medium transition-colors"
            >
              Удалить
            </button>
            <button
              onClick={() => onConfirmDelete(null)}
              className="px-2 py-1 text-xs text-gray-400 hover:text-white rounded hover:bg-white/5 transition-colors"
            >
              Отмена
            </button>
          </div>
        ) : (
          <>
            <button
              onClick={() => {
                soundManager.playStar();
                onToggleFavorite(friend.id);
              }}
              className={`p-1.5 rounded-lg transition-colors ${
                friend.favorite
                  ? "text-yellow-400 hover:bg-yellow-400/10"
                  : "text-gray-500 hover:text-yellow-400 hover:bg-white/5"
              }`}
              title={friend.favorite ? "Убрать из избранного" : "В избранное"}
            >
              <Star
                className={`w-4 h-4 ${
                  friend.favorite ? "fill-yellow-400" : ""
                }`}
              />
            </button>
            <button
              onClick={() => onConfirmDelete(friend.id)}
              className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
              title="Удалить друга"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </>
        )}
      </div>
    </div>
  );
};
