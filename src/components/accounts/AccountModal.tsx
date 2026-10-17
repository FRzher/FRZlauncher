import React, { useState } from "react";
import {
  X,
  Trash2,
  UserPlus,
  Globe,
  User,
  ShieldCheck,
  RefreshCw,
  Copy,
  ExternalLink,
  Check,
  Sparkles,
  Calendar,
  Eye,
} from "lucide-react";
import { open as openUrl } from "@tauri-apps/plugin-shell";
import { useAuthStore } from "../../store/authStore";
import { PlayerAvatar, FullSkinPreview } from "../common/PlayerSkinView";
import { soundManager } from "../../utils/sound";
import { DeviceCodeResponse } from "../../types";

interface AccountModalProps {
  isOpen: boolean;
  onClose: () => void;
}

type AddMode = "none" | "offline" | "elyby" | "microsoft";
type ElySubTab = "direct" | "skin_only" | "oauth";

export const AccountModal: React.FC<AccountModalProps> = ({ isOpen, onClose }) => {
  const {
    accounts,
    activeAccount,
    createOfflineAccount,
    createElybyAccount,
    loginWithElybyCredentials,
    loginWithElybyOAuth,
    startMicrosoftLogin,
    pollMicrosoftLogin,
    setActiveAccount,
    deleteAccount,
  } = useAuthStore();

  const [addMode, setAddMode] = useState<AddMode>("none");
  const [elySubTab, setElySubTab] = useState<ElySubTab>("oauth");
  const [showFullSkin, setShowFullSkin] = useState(true);

  // Form inputs
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [clientId, setClientId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Microsoft Device Code State
  const [msDeviceCode, setMsDeviceCode] = useState<DeviceCodeResponse | null>(null);
  const [isMsPolling, setIsMsPolling] = useState(false);

  if (!isOpen) return null;

  // Reset states when changing modes
  const switchMode = (mode: AddMode) => {
    setError(null);
    setUsername("");
    setPassword("");
    setClientId("");
    setMsDeviceCode(null);
    setIsMsPolling(false);
    setAddMode(mode);
  };

  // 1. Direct Ely.by Login (Email/Nick + Password)
  const handleElybyDirectLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await loginWithElybyCredentials(username.trim(), password);
      switchMode("none");
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 2. Ely.by Skin-Only (no password)
  const handleElybySkinOnly = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await createElybyAccount(username.trim());
      switchMode("none");
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 3. Ely.by OAuth2 in browser
  const handleElybyOAuth = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await loginWithElybyOAuth(clientId.trim() || undefined);
      switchMode("none");
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  // 4. Microsoft Device Code Flow
  const handleStartMicrosoft = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      const codeResp = await startMicrosoftLogin();
      setMsDeviceCode(codeResp);
      setIsMsPolling(true);
      setIsSubmitting(false);

      // Automatically open the verification URL in user's browser
      try {
        await openUrl(codeResp.verification_uri);
      } catch {
        // Fallback if plugin fails
        window.open(codeResp.verification_uri, "_blank");
      }

      // Begin background polling
      try {
        await pollMicrosoftLogin(codeResp.device_code);
        switchMode("none");
      } catch (pollErr: unknown) {
        setError(String(pollErr));
        setIsMsPolling(false);
      }
    } catch (err: unknown) {
      setError(String(err));
      setIsSubmitting(false);
      setIsMsPolling(false);
    }
  };

  // 5. Offline Profile Creation
  const handleAddOffline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setError(null);
    setIsSubmitting(true);
    try {
      await createOfflineAccount(username.trim());
      switchMode("none");
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md animate-in fade-in duration-150">
      <div className="glass-panel w-full max-w-lg rounded-2xl p-6 border border-white/10 shadow-2xl relative max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.08] mb-4">
          <div>
            <h2 className="text-base font-bold text-white">Управление аккаунтами</h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Скины, онлайн-авторизация и оффлайн-профили
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs leading-relaxed animate-in fade-in">
            {error}
          </div>
        )}

        {/* Active Account Visual Banner */}
        {activeAccount && addMode === "none" && (
          <div className="mb-4 space-y-3">
            <div className="p-3.5 rounded-xl bg-gradient-to-r from-indigo-950/40 via-purple-950/20 to-slate-900/60 border border-indigo-500/30 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <PlayerAvatar account={activeAccount} size={48} showProviderBadge />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-white">{activeAccount.username}</span>
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
                        activeAccount.provider === "elyby"
                          ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/30"
                          : activeAccount.provider === "microsoft"
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                          : "bg-slate-500/20 text-slate-300 border-slate-500/30"
                      }`}
                    >
                      {activeAccount.provider === "elyby"
                        ? "Ely.by"
                        : activeAccount.provider === "microsoft"
                        ? "Microsoft"
                        : "Оффлайн"}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 font-mono mt-0.5">
                    <span>UUID: {activeAccount.uuid.slice(0, 12)}...</span>
                    <span>•</span>
                    <span className="flex items-center gap-1 font-sans text-slate-400">
                      <Calendar className="w-3 h-3 text-slate-500" />
                      {activeAccount.created_at
                        ? new Date(activeAccount.created_at * 1000).toLocaleDateString("ru-RU", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })
                        : "Недавно"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Skin Preview Toggle & Quick Actions */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    soundManager.playClick();
                    setShowFullSkin(!showFullSkin);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                    showFullSkin
                      ? "bg-indigo-600 text-white border-indigo-500"
                      : "bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border-white/10"
                  }`}
                  title="Показать / скрыть полный скин"
                >
                  <Eye className="w-3.5 h-3.5" />
                  <span>{showFullSkin ? "Скрыть" : "Скин"}</span>
                </button>

                {activeAccount.provider === "elyby" && (
                  <button
                    type="button"
                    onClick={() => {
                      soundManager.playClick();
                      openUrl("https://ely.by/skins");
                    }}
                    className="px-2.5 py-1.5 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-[11px] font-semibold flex items-center gap-1.5 transition-colors cursor-pointer"
                    title="Открыть каталог скинов на Ely.by"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Каталог</span>
                  </button>
                )}
              </div>
            </div>

            {/* Expandable 2D / 3D Full Character Skin Preview */}
            {showFullSkin && (
              <div className="animate-in fade-in slide-in-from-top-2 duration-200">
                <FullSkinPreview account={activeAccount} />
              </div>
            )}
          </div>
        )}

        {/* Accounts List (Only in main view) */}
        {addMode === "none" && (
          <div className="space-y-2 mb-4 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
            {accounts.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs border border-dashed border-white/10 rounded-xl">
                Нет добавленных аккаунтов. Войдите через Ely.by, Microsoft или создайте оффлайн профиль.
              </div>
            ) : (
              accounts.map((acc) => {
                const isActive = activeAccount?.id === acc.id;

                return (
                  <div
                    key={acc.id}
                    onClick={() => {
                      soundManager.playClick();
                      setActiveAccount(acc.id);
                    }}
                    className={`p-2.5 rounded-xl border flex items-center justify-between cursor-pointer transition-all ${
                      isActive
                        ? "bg-indigo-600/15 border-indigo-500/40 text-white shadow-sm"
                        : "bg-white/[0.02] border-white/[0.06] text-slate-300 hover:bg-white/[0.05]"
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <PlayerAvatar account={acc} size={32} showProviderBadge />
                      <div>
                        <div className="text-xs font-semibold flex items-center gap-1.5">
                          <span>{acc.username}</span>
                          {isActive && (
                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-mono">
                              Активен
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-slate-400 font-mono">
                          {acc.provider.toUpperCase()} • {acc.uuid.slice(0, 8)}...
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        soundManager.playClick();
                        deleteAccount(acc.id);
                      }}
                      className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                      title="Удалить аккаунт"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* Mode: Ely.by Authentication */}
        {addMode === "elyby" && (
          <div className="p-4 rounded-xl bg-cyan-950/20 border border-cyan-500/30 mb-4 space-y-3.5 animate-in fade-in">
            {/* Header & Tabs */}
            <div className="flex items-center justify-between border-b border-cyan-500/20 pb-2.5">
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setElySubTab("oauth")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    elySubTab === "oauth"
                      ? "bg-cyan-500/30 text-cyan-200 border border-cyan-500/40"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Браузер (Выбор аккаунта)
                </button>
                <button
                  type="button"
                  onClick={() => setElySubTab("direct")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    elySubTab === "direct"
                      ? "bg-cyan-500/30 text-cyan-200 border border-cyan-500/40"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Email / Пароль
                </button>
                <button
                  type="button"
                  onClick={() => setElySubTab("skin_only")}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all ${
                    elySubTab === "skin_only"
                      ? "bg-cyan-500/30 text-cyan-200 border border-cyan-500/40"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  Только скин
                </button>
              </div>

              <button
                type="button"
                onClick={() => switchMode("none")}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* SubTab 1: Direct Credentials Login (Recommended) */}
            {elySubTab === "direct" && (
              <form onSubmit={handleElybyDirectLogin} className="space-y-3">
                <div className="text-xs text-slate-300">
                  Прямой защищённый вход через официальный API Ely.by. Поддерживает скины и доступ на лицензионные серверы Ely.by.
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[11px] text-slate-400 mb-1 block">Никнейм или Email на Ely.by:</label>
                    <input
                      type="text"
                      required
                      placeholder="Например: notch или player@mail.com"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-cyan-500/30 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  {username.trim().length >= 3 && !username.includes("@") && (
                    <div className="mt-4 flex-shrink-0 flex items-center gap-1.5 p-1 rounded-lg bg-black/40 border border-cyan-500/30" title="Предпросмотр скина">
                      <PlayerAvatar
                        account={{
                          id: "temp",
                          username: username.trim(),
                          provider: "elyby" as any,
                          uuid: "",
                          is_active: false,
                          created_at: 0,
                        }}
                        size={36}
                        showProviderBadge
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="text-[11px] text-slate-400 mb-1 block">Пароль от аккаунта Ely.by:</label>
                  <input
                    type="password"
                    required
                    placeholder="Пароль"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-cyan-500/30 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                  />
                </div>
                <div className="flex items-center justify-between pt-1">
                  <span className="text-[10px] text-slate-400">
                    * Пароль шифруется в Windows Credential Manager
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => switchMode("none")}
                      className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                    >
                      Отмена
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-glow disabled:opacity-50 flex items-center gap-1.5"
                    >
                      {isSubmitting && <RefreshCw className="w-3 h-3 animate-spin" />}
                      <span>{isSubmitting ? "Вход..." : "Войти в Ely.by"}</span>
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* SubTab 2: Skin-Only (No password required) */}
            {elySubTab === "skin_only" && (
              <form onSubmit={handleElybySkinOnly} className="space-y-3">
                <div className="text-xs text-slate-300">
                  Играйте под любым никнеймом с автоматической загрузкой скина из базы Ely.by без пароля.
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1">
                    <label className="text-[11px] text-slate-400 mb-1 block">Никнейм на Ely.by:</label>
                    <input
                      type="text"
                      required
                      minLength={3}
                      maxLength={16}
                      placeholder="Игровой никнейм"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-cyan-500/30 text-xs text-slate-200 focus:outline-none focus:border-cyan-400"
                    />
                  </div>
                  {username.trim().length >= 3 && (
                    <div className="mt-4 flex-shrink-0">
                      <PlayerAvatar
                        account={{
                          id: "temp",
                          username: username.trim(),
                          provider: "elyby" as any,
                          uuid: "",
                          is_active: false,
                          created_at: 0,
                        }}
                        size={40}
                        showProviderBadge
                      />
                    </div>
                  )}
                </div>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => switchMode("none")}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                  >
                    Отмена
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs shadow-glow disabled:opacity-50"
                  >
                    {isSubmitting ? "Добавление..." : "Подключить скин"}
                  </button>
                </div>
              </form>
            )}

            {/* SubTab 3: OAuth2 Browser */}
            {elySubTab === "oauth" && (
              <div className="space-y-4">
                <div className="p-3 rounded-xl bg-cyan-950/40 border border-cyan-500/30 flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-300 flex-shrink-0 mt-0.5">
                    <Globe className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-cyan-200">Быстрый вход через браузер Ely.by</h4>
                    <p className="text-[11px] text-slate-300 mt-0.5 leading-relaxed">
                      Вход в один клик через официальный сервис Ely.by с выбором профиля, автоматической синхронизацией скина и поддержкой сетевой игры.
                    </p>
                  </div>
                </div>

                {isSubmitting ? (
                  <div className="p-5 rounded-xl bg-black/40 border border-cyan-500/30 text-center space-y-3 animate-in fade-in">
                    <RefreshCw className="w-7 h-7 animate-spin text-cyan-400 mx-auto" />
                    <div>
                      <div className="text-xs font-bold text-white">Ожидание выбора аккаунта...</div>
                      <div className="text-[11px] text-slate-300 mt-1 leading-relaxed">
                        В браузере открыта страница <b>account.ely.by</b>.<br />
                        Выберите ваш аккаунт (например, <b>Player</b>) и нажмите зелёную кнопку «Продолжить».
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setIsSubmitting(false)}
                      className="px-3.5 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      Отменить ожидание
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={handleElybyOAuth}
                      className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-600 via-teal-600 to-blue-600 hover:from-cyan-500 hover:via-teal-500 hover:to-blue-500 text-white font-bold text-xs shadow-glow flex items-center justify-center gap-2 transition-all active:scale-[0.99]"
                    >
                      <ExternalLink className="w-4 h-4" />
                      <span>Открыть окно выбора аккаунта на Ely.by</span>
                    </button>

                    <div className="flex items-center justify-between text-[11px] text-slate-400 px-1 pt-1">
                      <span>✓ Пароль не передаётся лаунчеру</span>
                      <span>✓ Официальный протокол Ely.by</span>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Mode: Microsoft Xbox Live Authentication */}
        {addMode === "microsoft" && (
          <div className="p-4 rounded-xl bg-emerald-950/20 border border-emerald-500/30 mb-4 space-y-3.5 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-emerald-500/20 pb-2">
              <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Авторизация Microsoft (Xbox Live)</span>
              </div>
              <button
                type="button"
                onClick={() => switchMode("none")}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {!msDeviceCode ? (
              <div className="space-y-3">
                <p className="text-xs text-slate-300 leading-relaxed">
                  FRZlauncher использует официальный протокол <b>Microsoft Device Code Flow</b>. 
                  Вам будет выдан одноразовый код для подтверждения на официальном сайте Microsoft.
                </p>
                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => switchMode("none")}
                    className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
                  >
                    Отмена
                  </button>
                  <button
                    type="button"
                    onClick={handleStartMicrosoft}
                    disabled={isSubmitting}
                    className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-glow disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>Генерация кода...</span>
                      </>
                    ) : (
                      <>
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Получить код Microsoft</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3 text-center">
                <div className="text-xs text-slate-300">
                  Шаг 1: Скопируйте ваш одноразовый код:
                </div>
                <div className="flex items-center justify-center gap-2">
                  <div className="px-4 py-2 rounded-xl bg-black/40 border border-emerald-500/40 text-lg font-mono font-bold tracking-widest text-emerald-300 select-all">
                    {msDeviceCode.user_code}
                  </div>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(msDeviceCode.user_code)}
                    className="p-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 transition-colors"
                    title="Скопировать код"
                  >
                    {copiedCode ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  </button>
                </div>

                <div className="text-xs text-slate-400">
                  Шаг 2: Вставьте код на странице подтверждения:
                </div>

                <button
                  type="button"
                  onClick={() => openUrl(msDeviceCode.verification_uri)}
                  className="w-full py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-glow flex items-center justify-center gap-2 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Открыть microsoft.com/link</span>
                </button>

                {isMsPolling && (
                  <div className="flex items-center justify-center gap-2 text-xs text-slate-400 pt-2">
                    <RefreshCw className="w-3 h-3 animate-spin text-emerald-400" />
                    <span>Ожидание подтверждения входа...</span>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Mode: Offline Profile */}
        {addMode === "offline" && (
          <form
            onSubmit={handleAddOffline}
            className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.08] mb-4 space-y-3 animate-in fade-in"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-200">
                <User className="w-3.5 h-3.5 text-indigo-400" />
                <span>Новый оффлайн профиль</span>
              </div>
              <button
                type="button"
                onClick={() => switchMode("none")}
                className="text-slate-400 hover:text-white p-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <input
              type="text"
              required
              minLength={3}
              maxLength={16}
              placeholder="Никнейм (например, Steve)"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
            />
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => switchMode("none")}
                className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white"
              >
                Отмена
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs shadow-glow disabled:opacity-50"
              >
                {isSubmitting ? "Создание..." : "Создать профиль"}
              </button>
            </div>
          </form>
        )}

        {/* Main Action Buttons (when not in a sub-mode) */}
        {addMode === "none" && (
          <div className="space-y-2 mb-4">
            <button
              type="button"
              onClick={() => {
                setAddMode("elyby");
                setElySubTab("oauth");
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-glow transition-all active:scale-[0.99]"
            >
              <Globe className="w-4 h-4" />
              <span>Войти через Ely.by (Скины и плащи)</span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => switchMode("microsoft")}
                className="py-2.5 px-3 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Microsoft Лицензия</span>
              </button>

              <button
                type="button"
                onClick={() => switchMode("offline")}
                className="py-2.5 px-3 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-slate-200 text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                <UserPlus className="w-4 h-4 text-indigo-400" />
                <span>Оффлайн профиль</span>
              </button>
            </div>
          </div>
        )}

        {/* Systems status footer */}
        <div className="pt-3 border-t border-white/[0.08] flex items-center justify-between text-[11px] text-slate-400 font-mono">
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Authlib-Injector v1.2.8</span>
          </div>
          <div>Windows Keyring Secure</div>
        </div>
      </div>
    </div>
  );
};
