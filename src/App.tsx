import React, { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Titlebar } from "./components/titlebar/Titlebar";
import { Sidebar } from "./components/sidebar/Sidebar";
import { InstanceGrid } from "./components/instances/InstanceGrid";
import { CreateInstanceModal } from "./components/instances/CreateInstanceModal";
import { AccountModal } from "./components/accounts/AccountModal";
import { SettingsModal } from "./components/settings/SettingsModal";
import { LogConsoleModal } from "./components/console/LogConsoleModal";
import { ModsModal } from "./components/instances/ModsModal";
import { ModBrowserView } from "./components/mods/ModBrowserView";
import { ModpackBrowserModal } from "./components/modpacks/ModpackBrowserModal";
import { AiModBuilderModal } from "./components/modpacks/AiModBuilderModal";
import { FriendsModal } from "./components/friends/FriendsModal";
import { SplashScreen } from "./components/common/SplashScreen";
import { AnimatedBackground } from "./components/common/AnimatedBackground";
import { useInstanceStore } from "./store/instanceStore";
import { useSystemStore } from "./store/systemStore";
import { useAuthStore } from "./store/authStore";
import { useLaunchStore } from "./store/launchStore";
import { useFriendStore } from "./store/friendStore";
import { useCustomizationStore, BG_PRESETS } from "./store/customizationStore";

export const App: React.FC = () => {
  const [currentTab, setCurrentTab] = useState("instances");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isAccountsOpen, setIsAccountsOpen] = useState(false);
  const [isFriendsOpen, setIsFriendsOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isModpacksOpen, setIsModpacksOpen] = useState(false);
  const [isAiBuilderOpen, setIsAiBuilderOpen] = useState(false);
  const [isSplashVisible, setIsSplashVisible] = useState(true);
  const [modsInstanceId, setModsInstanceId] = useState<string | null>(null);

  const fetchInstances = useInstanceStore((s) => s.fetchInstances);
  const fetchSystemSpecs = useSystemStore((s) => s.fetchSystemSpecs);
  const fetchAccounts = useAuthStore((s) => s.fetchAccounts);
  const fetchFriends = useFriendStore((s) => s.fetchFriends);
  const initLaunchListeners = useLaunchStore((s) => s.initListeners);

  const bgTheme = useCustomizationStore((s) => s.bgTheme);
  const customWallpaperUrl = useCustomizationStore((s) => s.customWallpaperUrl);
  const wallpaperBlur = useCustomizationStore((s) => s.wallpaperBlur);
  const wallpaperOpacity = useCustomizationStore((s) => s.wallpaperOpacity);
  const applyToDom = useCustomizationStore((s) => s.applyToDom);

  useEffect(() => {
    applyToDom();
    fetchInstances();
    fetchSystemSpecs();
    fetchAccounts();
    fetchFriends();

    let unlisten: (() => void) | undefined;
    initLaunchListeners().then((cleanup) => {
      unlisten = cleanup;
    });

    const timer = setTimeout(() => {
      setIsSplashVisible(false);
    }, 1200);

    return () => {
      if (unlisten) unlisten();
      clearTimeout(timer);
    };
  }, [fetchInstances, fetchSystemSpecs, fetchAccounts, initLaunchListeners]);

  const handleTabChange = (tab: string) => {
    invoke("set_discord_view", { view: tab }).catch(() => {});
    if (tab === "accounts") {
      setIsAccountsOpen(true);
    } else if (tab === "friends") {
      setIsFriendsOpen(true);
    } else if (tab === "settings") {
      setIsSettingsOpen(true);
    } else if (tab === "modpacks") {
      setIsModpacksOpen(true);
    } else if (tab === "ai_builder") {
      setIsAiBuilderOpen(true);
    } else {
      setCurrentTab(tab);
    }
  };

  const activeBg = BG_PRESETS[bgTheme] || BG_PRESETS.obsidian;

  return (
    <div className="h-screen w-screen flex flex-col text-slate-100 overflow-hidden select-none relative bg-[#090b10]">
      {/* Dynamic Background theme or Custom Wallpaper layer */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
        {bgTheme === "custom" && customWallpaperUrl ? (
          <>
            <div
              className="absolute inset-0 bg-cover bg-center transition-all duration-300"
              style={{
                backgroundImage: `url(${customWallpaperUrl})`,
                filter: `blur(${wallpaperBlur}px)`,
                transform: "scale(1.06)",
              }}
            />
            <div
              className="absolute inset-0 bg-[#090b10] transition-opacity duration-300"
              style={{ opacity: wallpaperOpacity }}
            />
          </>
        ) : (
          <>
            <div
              className="absolute inset-0 transition-all duration-500"
              style={{
                background: activeBg.cssBackground,
                filter: wallpaperBlur > 0 ? `blur(${wallpaperBlur}px)` : undefined,
                transform: wallpaperBlur > 0 ? "scale(1.06)" : undefined,
              }}
            />
            <div
              className="absolute inset-0 bg-[#090b10] transition-opacity duration-300"
              style={{ opacity: wallpaperOpacity * 0.4 }}
            />
          </>
        )}
        {/* Subtle geometric grid backdrop */}
        <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff03_1px,transparent_1px),linear-gradient(to_bottom,#ffffff03_1px,transparent_1px)] bg-[size:48px_48px]" />
        {/* Interactive Living Animated Background (Stars / Particles / Fireflies / Matrix) */}
        <AnimatedBackground />
      </div>

      {/* Sleek Initial Splash Screen */}
      <SplashScreen isVisible={isSplashVisible} />

      {/* Frameless Acrylic Titlebar */}
      <Titlebar onOpenAccounts={() => setIsAccountsOpen(true)} />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex overflow-hidden relative z-10">
        {/* Left Acrylic Navigation Sidebar */}
        <Sidebar
          currentTab={currentTab}
          onTabChange={handleTabChange}
          onOpenCreate={() => setIsCreateOpen(true)}
          onOpenAccounts={() => setIsAccountsOpen(true)}
          onOpenFriends={() => setIsFriendsOpen(true)}
        />

        {/* Dynamic Content View */}
        <main className="flex-1 flex flex-col mt-10 overflow-hidden bg-transparent">
          {currentTab === "instances" && (
            <InstanceGrid
              onOpenCreate={() => setIsCreateOpen(true)}
              onOpenMods={(id) => setModsInstanceId(id)}
              onOpenAccounts={() => setIsAccountsOpen(true)}
              onOpenModpacks={() => setIsModpacksOpen(true)}
              onOpenAiBuilder={() => setIsAiBuilderOpen(true)}
            />
          )}

          {currentTab === "mods" && <ModBrowserView />}
        </main>
      </div>

      {/* Modals */}
      <CreateInstanceModal
        isOpen={isCreateOpen}
        onClose={() => setIsCreateOpen(false)}
      />
      <ModpackBrowserModal
        isOpen={isModpacksOpen}
        onClose={() => {
          setIsModpacksOpen(false);
          invoke("set_discord_view", { view: currentTab }).catch(() => {});
        }}
      />
      <AiModBuilderModal
        isOpen={isAiBuilderOpen}
        onClose={() => setIsAiBuilderOpen(false)}
        onSelectInstance={() => {
          setIsAiBuilderOpen(false);
          setCurrentTab("instances");
        }}
      />
      <AccountModal
        isOpen={isAccountsOpen}
        onClose={() => setIsAccountsOpen(false)}
      />
      <FriendsModal
        isOpen={isFriendsOpen}
        onClose={() => setIsFriendsOpen(false)}
      />
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
      />
      <LogConsoleModal />
      <ModsModal
        instanceId={modsInstanceId}
        isOpen={!!modsInstanceId}
        onClose={() => setModsInstanceId(null)}
      />
    </div>
  );
};

export default App;
