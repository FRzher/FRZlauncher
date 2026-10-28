import { Layers, PackageSearch, Users, Settings, Plus, UserCircle, Sparkles, Bot, HeartHandshake } from "lucide-react";
import { useAuthStore } from "../../store/authStore";
import { useFriendStore } from "../../store/friendStore";
import { PlayerAvatar } from "../common/PlayerSkinView";
import { soundManager } from "../../utils/sound";
import { YouTubeIcon } from "../common/YouTubeIcon";
import frzherAvatar from "../../assets/frzher_avatar.jpg";

interface SidebarProps {
  currentTab: string;
  onTabChange: (tab: string) => void;
  onOpenCreate: () => void;
  onOpenAccounts: () => void;
  onOpenFriends?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  onTabChange,
  onOpenCreate,
  onOpenAccounts,
  onOpenFriends,
}) => {
  const activeAccount = useAuthStore((state) => state.activeAccount);
  const friendsCount = useFriendStore((state) => state.friends.length);

  const openChannel = async () => {
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open("https://www.youtube.com/@FRzher");
    } catch {
      window.open("https://www.youtube.com/@FRzher", "_blank");
    }
  };

  const navItems = [
    { id: "instances", label: "Сборки", icon: Layers },
    { id: "modpacks", label: "Модпаки", icon: Sparkles },
    { id: "mods", label: "Каталог модов", icon: PackageSearch },
    { id: "ai_builder", label: "Подбор модов", icon: Bot },
    { id: "friends", label: "Друзья", icon: HeartHandshake },
    { id: "accounts", label: "Аккаунты", icon: Users },
    { id: "settings", label: "Настройки", icon: Settings },
  ];

  return (
    <aside className="w-56 h-[calc(100vh-2.5rem)] mt-10 bg-[#0e1118]/80 backdrop-blur-xl border-r border-white/[0.07] flex flex-col justify-between p-3 select-none flex-shrink-0">
      {/* Top Section */}
      <div className="space-y-4">
        {/* Create Instance Button */}
        <button
          onClick={onOpenCreate}
          className="w-full py-2.5 px-3 rounded-xl btn-accent font-semibold text-xs flex items-center justify-center gap-2 transition-all duration-150 active:scale-[0.98] cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Создать сборку</span>
        </button>

        {/* Navigation Items */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  soundManager.playClick();
                  if (item.id === "friends" && onOpenFriends) {
                    onOpenFriends();
                  } else {
                    onTabChange(item.id);
                  }
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 cursor-pointer ${
                  isActive
                    ? "btn-accent-subtle shadow-sm"
                    : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.04]"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? "text-accent" : "text-slate-400"}`} />
                  <span className={isActive ? "font-bold text-white" : ""}>{item.label}</span>
                </div>
                {item.id === "friends" && friendsCount > 0 && (
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 font-bold border border-purple-500/30">
                    {friendsCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom Section: Channel Card & Account Card */}
      <div className="pt-3 border-t border-white/[0.06] space-y-2">
        {/* FRzher Official Channel Card */}
        <button
          onClick={openChannel}
          className="w-full p-2 rounded-xl bg-gradient-to-r from-emerald-950/40 via-[#0d1716] to-[#0c131a] hover:from-emerald-900/40 hover:to-[#111e24] border border-emerald-500/25 hover:border-emerald-400/50 flex items-center gap-2.5 transition-all cursor-pointer group text-left shadow-sm"
          title="Открыть YouTube-канал автора @FRzher"
        >
          <div className="w-8 h-8 rounded-full border border-emerald-400/60 overflow-hidden flex-shrink-0 shadow-[0_0_10px_rgba(0,230,118,0.4)]">
            <img src={frzherAvatar} alt="FRzher" className="w-full h-full object-cover" />
          </div>
          <div className="overflow-hidden flex-1">
            <div className="text-xs font-bold text-emerald-300 group-hover:text-emerald-200 truncate flex items-center gap-1.5">
              <span>FRzher</span>
              <span className="flex items-center gap-0.5 text-[9px] px-1.5 py-0.2 rounded bg-red-600 text-white font-black">
                <YouTubeIcon className="w-2.5 h-2.5 fill-current" />
                YT
              </span>
            </div>
            <div className="text-[10px] text-slate-400 group-hover:text-slate-300 transition-colors truncate">
              Канал разработчика
            </div>
          </div>
        </button>

        <button
          onClick={() => {
            soundManager.playClick();
            onOpenAccounts();
          }}
          className="w-full p-2 rounded-xl bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.06] flex items-center gap-2.5 transition-colors text-left cursor-pointer group"
        >
          {activeAccount ? (
            <PlayerAvatar account={activeAccount} size={32} showProviderBadge />
          ) : (
            <div className="w-8 h-8 rounded-lg bg-slate-800 border border-white/10 flex items-center justify-center text-slate-400 flex-shrink-0">
              <UserCircle className="w-5 h-5 text-slate-400" />
            </div>
          )}
          <div className="overflow-hidden flex-1">
            <div className="text-xs font-semibold text-slate-200 group-hover:text-emerald-300 transition-colors truncate">
              {activeAccount ? activeAccount.username : "Нет аккаунта"}
            </div>
            <div className="text-[10px] text-slate-400 truncate">
              {activeAccount
                ? activeAccount.provider === "elyby"
                  ? "Ely.by аккаунт"
                  : activeAccount.provider === "microsoft"
                  ? "Microsoft аккаунт"
                  : "Оффлайн режим"
                : "Нажмите для входа"}
            </div>
          </div>
        </button>
      </div>
    </aside>
  );
};
