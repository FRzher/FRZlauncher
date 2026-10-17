import React, { useEffect, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { invoke } from "@tauri-apps/api/core";
import { Minus, Square, X, Shield, Cpu, User } from "lucide-react";
import { useSystemStore } from "../../store/systemStore";
import { useAuthStore } from "../../store/authStore";
import { PlayerAvatar } from "../common/PlayerSkinView";
import { soundManager } from "../../utils/sound";
import { YouTubeIcon } from "../common/YouTubeIcon";
import frzherAvatar from "../../assets/frzher_avatar.jpg";

const getAppWindow = () => {
  try {
    return getCurrentWebviewWindow();
  } catch {
    return null;
  }
};

interface TitlebarProps {
  onOpenAccounts?: () => void;
}

export const Titlebar: React.FC<TitlebarProps> = ({ onOpenAccounts }) => {
  const [isMaximized, setIsMaximized] = useState(false);
  const specs = useSystemStore((state) => state.specs);
  const activeAccount = useAuthStore((state) => state.activeAccount);

  const openChannel = async (e: React.MouseEvent) => {
    e.stopPropagation();
    soundManager.playClick();
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open("https://www.youtube.com/@FRzher");
    } catch {
      window.open("https://www.youtube.com/@FRzher", "_blank");
    }
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    const setupListener = async () => {
      try {
        const win = getAppWindow();
        if (win) {
          setIsMaximized(await win.isMaximized());
          unlisten = await win.onResized(async () => {
            setIsMaximized(await win.isMaximized());
          });
        }
      } catch {
        // Browser preview fallback
      }
    };
    setupListener();
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const handleMinimize = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const win = getAppWindow();
      if (win) {
        await win.minimize();
      } else {
        await invoke("window_minimize");
      }
    } catch {
      await invoke("window_minimize").catch(() => {});
    }
  };

  const handleToggleMaximize = async (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      const win = getAppWindow();
      if (win) {
        await win.toggleMaximize();
        setIsMaximized(await win.isMaximized());
      } else {
        await invoke("window_toggle_maximize");
      }
    } catch {
      await invoke("window_toggle_maximize").catch(() => {});
    }
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const win = getAppWindow();
      if (win) {
        await win.close();
      } else {
        await invoke("window_close");
      }
    } catch {
      try {
        const win = getAppWindow();
        if (win) await win.destroy();
      } catch {
        await invoke("window_close").catch(() => {});
      }
    }
  };

  return (
    <header
      data-tauri-drag-region
      onDoubleClick={() => handleToggleMaximize()}
      className="h-10 w-full flex items-center justify-between px-3 bg-[#0d0f17]/95 backdrop-blur-md border-b border-white/[0.06] select-none z-50 fixed top-0 left-0"
    >
      {/* Brand & App Info */}
      <div data-tauri-drag-region className="flex items-center gap-2.5">
        <div className="w-6 h-6 rounded-full border border-emerald-400/60 shadow-[0_0_12px_rgba(0,230,118,0.45)] overflow-hidden flex items-center justify-center bg-black/50 pointer-events-none flex-shrink-0">
          <img src={frzherAvatar} alt="FRzher" className="w-full h-full object-cover" />
        </div>
        <div className="flex items-baseline gap-1 pointer-events-none">
          <span className="text-xs font-black tracking-wider bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-200 bg-clip-text text-transparent">
            FRzher
          </span>
          <span className="text-[11px] font-semibold text-slate-300">
            Launcher
          </span>
        </div>
        <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono font-semibold pointer-events-none">
          v1.0.0
        </span>

        {/* Clickable YouTube Channel Badge */}
        <div data-tauri-drag-region="false" className="pointer-events-auto ml-2 flex items-center">
          <button
            onClick={openChannel}
            type="button"
            className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-600/15 hover:bg-red-600/30 border border-red-500/30 text-[10px] font-bold text-red-300 hover:text-white transition-all shadow-sm cursor-pointer active:scale-95"
            title="Перейти на канал FRzher"
          >
            <YouTubeIcon className="w-3.5 h-3.5 text-red-500 fill-current" />
            <span>@FRzher</span>
          </button>
        </div>

        {specs && (
          <div className="hidden md:flex items-center gap-2 ml-3 text-[11px] text-slate-400 pointer-events-none">
            <span className="flex items-center gap-1">
              <Cpu className="w-3 h-3 text-emerald-400" />
              {specs.cpu_cores} пот.
            </span>
            <span>•</span>
            <span>{Math.round(specs.total_ram_mb / 1024)} ГБ ОЗУ</span>
            <span>•</span>
            <span className="flex items-center gap-1 text-emerald-400">
              <Shield className="w-3 h-3" />
              Оптимизировано
            </span>
          </div>
        )}
      </div>

      {/* Middle Drag Space */}
      <div data-tauri-drag-region className="flex-1 h-full cursor-default" />

      {/* Account quick badge */}
      {onOpenAccounts && (
        <div data-tauri-drag-region="false" className="pointer-events-auto mr-2">
          <button
            onClick={() => {
              soundManager.playClick();
              onOpenAccounts();
            }}
            type="button"
            className="flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/[0.04] hover:bg-white/[0.09] border border-white/[0.08] hover:border-emerald-500/40 text-xs text-slate-300 transition-all cursor-pointer group active:scale-95"
            title={activeAccount ? `Аккаунт: ${activeAccount.username} (${activeAccount.provider})` : "Выбрать аккаунт"}
          >
            {activeAccount ? (
              <>
                <PlayerAvatar account={activeAccount} size={18} showProviderBadge />
                <span className="font-medium text-slate-200 group-hover:text-emerald-300 max-w-[110px] truncate text-[11px]">
                  {activeAccount.username}
                </span>
              </>
            ) : (
              <>
                <div className="w-4 h-4 rounded-full bg-slate-700 flex items-center justify-center text-slate-400">
                  <User className="w-2.5 h-2.5" />
                </div>
                <span className="text-[11px] text-slate-400">Войти</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Window Controls (Explicitly clickable, excluded from drag) */}
      <div
        data-tauri-drag-region="false"
        className="flex items-center -mr-1 relative z-50 pointer-events-auto"
      >
        <button
          onClick={handleMinimize}
          type="button"
          className="w-9 h-8 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title="Свернуть"
        >
          <Minus className="w-3.5 h-3.5" />
        </button>
        <button
          onClick={handleToggleMaximize}
          type="button"
          className="w-9 h-8 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
          title={isMaximized ? "Восстановить" : "Развернуть"}
        >
          <Square className="w-3 h-3" />
        </button>
        <button
          onClick={handleClose}
          type="button"
          className="w-9 h-8 flex items-center justify-center rounded text-slate-400 hover:text-white hover:bg-red-600 transition-colors cursor-pointer"
          title="Закрыть"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </header>
  );
};
