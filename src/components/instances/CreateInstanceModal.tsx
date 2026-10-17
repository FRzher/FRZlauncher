import React, { useEffect, useState } from "react";
import { X, Cpu, Check, Sparkles, Search, Layers, RefreshCw, ChevronRight, ChevronLeft } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useInstanceStore } from "../../store/instanceStore";
import { useSystemStore } from "../../store/systemStore";
import { FabricLoaderItem, LoaderType, VersionEntry } from "../../types";

interface CreateInstanceModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateInstanceModal: React.FC<CreateInstanceModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { createInstance } = useInstanceStore();
  const { recommendedMemory, specs } = useSystemStore();

  // Wizard Steps: 1 = Version & Loader, 2 = Tuning & Confirm
  const [step, setStep] = useState<1 | 2>(1);

  // Form State
  const [name, setName] = useState("");
  const [gameVersion, setGameVersion] = useState("1.21.1");
  const [loaderType, setLoaderType] = useState<LoaderType>("fabric");
  const [loaderVersion, setLoaderVersion] = useState<string>("");
  const [installFabricApi, setInstallFabricApi] = useState(true);
  const [maxRamMb, setMaxRamMb] = useState(4096);
  const [gcPreset, setGcPreset] = useState("fps_boost");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Dynamic API State
  const [mojangVersions, setMojangVersions] = useState<VersionEntry[]>([]);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [versionCategory, setVersionCategory] = useState<"all" | "release" | "snapshot" | "old">("release");
  const [versionSearch, setVersionSearch] = useState("");

  const [fabricLoaders, setFabricLoaders] = useState<FabricLoaderItem[]>([]);
  const [neoforgeLoaders, setNeoforgeLoaders] = useState<string[]>([]);
  const [forgeLoaders, setForgeLoaders] = useState<string[]>([]);
  const [isLoadingLoaders, setIsLoadingLoaders] = useState(false);

  // Fetch Mojang Versions on mount
  useEffect(() => {
    if (isOpen) {
      setIsLoadingVersions(true);
      invoke<VersionEntry[]>("get_mojang_versions")
        .then((versions) => {
          setMojangVersions(versions);
          if (versions.length > 0 && !gameVersion) {
            setGameVersion(versions[0].id);
          }
        })
        .catch(() => {
          // Fallback if offline
          setMojangVersions([
            { id: "1.21.4", type: "release", url: "", time: "", releaseTime: "", sha1: "" },
            { id: "1.21.1", type: "release", url: "", time: "", releaseTime: "", sha1: "" },
            { id: "1.20.4", type: "release", url: "", time: "", releaseTime: "", sha1: "" },
            { id: "1.20.1", type: "release", url: "", time: "", releaseTime: "", sha1: "" },
            { id: "1.19.4", type: "release", url: "", time: "", releaseTime: "", sha1: "" },
            { id: "1.18.2", type: "release", url: "", time: "", releaseTime: "", sha1: "" },
            { id: "1.16.5", type: "release", url: "", time: "", releaseTime: "", sha1: "" },
            { id: "1.12.2", type: "release", url: "", time: "", releaseTime: "", sha1: "" },
            { id: "1.7.10", type: "release", url: "", time: "", releaseTime: "", sha1: "" },
          ]);
        })
        .finally(() => setIsLoadingVersions(false));
    }
  }, [isOpen]);

  // Fetch Modloader versions when gameVersion or loaderType changes
  useEffect(() => {
    if (!gameVersion) return;

    if (loaderType === "fabric") {
      setIsLoadingLoaders(true);
      invoke<FabricLoaderItem[]>("get_fabric_versions", { gameVersion })
        .then((items) => {
          setFabricLoaders(items);
          if (items.length > 0) {
            setLoaderVersion(items[0].loader.version);
          } else {
            setLoaderVersion("");
          }
        })
        .catch(() => setFabricLoaders([]))
        .finally(() => setIsLoadingLoaders(false));
    } else if (loaderType === "neoforge") {
      setIsLoadingLoaders(true);
      invoke<string[]>("get_neoforge_versions", { gameVersion })
        .then((versions) => {
          setNeoforgeLoaders(versions);
          if (versions.length > 0) {
            setLoaderVersion(versions[0]);
          } else {
            setLoaderVersion("");
          }
        })
        .catch(() => setNeoforgeLoaders([]))
        .finally(() => setIsLoadingLoaders(false));
    } else if (loaderType === "forge") {
      setIsLoadingLoaders(true);
      invoke<string[]>("get_forge_versions", { gameVersion })
        .then((versions) => {
          setForgeLoaders(versions);
          if (versions.length > 0) {
            setLoaderVersion(versions[0]);
          } else {
            setLoaderVersion("");
          }
        })
        .catch(() => setForgeLoaders([]))
        .finally(() => setIsLoadingLoaders(false));
    } else {
      setLoaderVersion("");
    }
  }, [gameVersion, loaderType]);

  // Auto-suggest name
  useEffect(() => {
    const loaderName = loaderType.charAt(0).toUpperCase() + loaderType.slice(1);
    setName(`${loaderName} ${gameVersion}`);
  }, [gameVersion, loaderType]);

  if (!isOpen) return null;

  // Filter Mojang Versions (ALL versions supported)
  const filteredVersions = mojangVersions.filter((v) => {
    const matchesSearch = v.id.toLowerCase().includes(versionSearch.toLowerCase());
    if (!matchesSearch) return false;

    if (versionCategory === "all") return true;
    if (versionCategory === "release") return v.type === "release";
    if (versionCategory === "snapshot") return v.type === "snapshot";
    return v.type === "old_beta" || v.type === "old_alpha";
  });

  const loaders: { id: LoaderType; label: string; desc: string }[] = [
    { id: "fabric", label: "Fabric", desc: "Lightweight, modular & fast" },
    { id: "neoforge", label: "NeoForge", desc: "Modern community-driven Forge" },
    { id: "forge", label: "Forge", desc: "Classic heavyweight modloader" },
    { id: "quilt", label: "Quilt", desc: "Fabric fork with expanded tools" },
    { id: "vanilla", label: "Vanilla", desc: "Official unmodified Minecraft" },
  ];

  const gcPresets = [
    { id: "fps_boost", name: "⚡ Оптимизация JVM (Рекомендуется)", desc: "Настройки JVM для более стабильной работы; прирост FPS зависит от ПК и настроек графики" },
    { id: "aikar", name: "Aikar's Flags (G1GC)", desc: "Оптимально для сбалансированной игры" },
    { id: "shenandoah", name: "Shenandoah GC", desc: "Ультранизкие задержки для больших объемов ОЗУ" },
    { id: "zgc", name: "Generational ZGC", desc: "Минимальный latency сборщик (Java 21+)" },
    { id: "none", name: "Стандартная JVM", desc: "По умолчанию Java HotSpot" },
  ];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const newInst = await createInstance({
        name: name.trim() || `${loaderType} ${gameVersion}`,
        game_version: gameVersion,
        loader_type: loaderType,
        loader_version: loaderVersion || undefined,
        memory: {
          min_mb: Math.max(1024, Math.floor(maxRamMb / 2)),
          max_mb: maxRamMb,
        },
        gc_preset: gcPreset,
      });

      if (installFabricApi && (loaderType === "fabric" || loaderType === "quilt") && newInst?.id) {
        try {
          await invoke("install_modrinth_mod", {
            instanceId: newInst.id,
            projectId: "fabric-api",
            gameVersion,
            loader: loaderType,
          });
          const { fetchInstances } = useInstanceStore.getState();
          await fetchInstances();
        } catch (apiErr) {
          console.warn("Could not auto-install Fabric API:", apiErr);
        }
      }

      onClose();
    } catch (err: unknown) {
      setError(String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="glass-panel w-full max-w-2xl rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden max-h-[90vh]">
        {/* Modal Header */}
        <div className="h-14 px-6 flex items-center justify-between border-b border-white/[0.08] bg-[#0c0e17]/80 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Layers className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-xs font-bold text-white">Create New Instance</h2>
              <p className="text-[10px] text-slate-400 font-mono mt-0.5">
                Step {step} of 2: {step === 1 ? "Version & Modloader" : "RAM & JVM Optimizer"}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-5">
          {step === 1 ? (
            <>
              {/* Instance Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Instance Name
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Fabric 1.21.1"
                  className="w-full px-3 py-2 rounded-xl bg-white/[0.04] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-indigo-500 transition-colors"
                />
              </div>

              {/* Dynamic Minecraft Version Selector */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-300">
                      Версия Minecraft
                    </label>
                    <span className="text-[10px] text-slate-500 font-mono">
                      (Найдено: {filteredVersions.length})
                    </span>
                  </div>
                  {/* Category Filter Tabs */}
                  <div className="flex items-center gap-1 bg-white/[0.03] p-0.5 rounded-lg border border-white/[0.06]">
                    {[
                      { id: "release", label: "Релизы" },
                      { id: "all", label: "Все версии" },
                      { id: "snapshot", label: "Снапшоты" },
                      { id: "old", label: "Beta / Alpha" },
                    ].map((cat) => (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => setVersionCategory(cat.id as any)}
                        className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer ${
                          versionCategory === cat.id
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "text-slate-400 hover:text-slate-200"
                        }`}
                      >
                        {cat.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Popular Quick-Pick Versions */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1.5 mb-2 text-[11px]">
                  <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mr-1">Топ:</span>
                  {["1.21.4", "1.21.1", "1.20.4", "1.20.1", "1.19.4", "1.18.2", "1.16.5", "1.12.2", "1.7.10"].map((pv) => (
                    <button
                      key={pv}
                      type="button"
                      onClick={() => setGameVersion(pv)}
                      className={`px-2 py-0.5 rounded-md font-mono transition-all cursor-pointer ${
                        gameVersion === pv
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold"
                          : "bg-white/[0.03] hover:bg-white/[0.06] text-slate-400 hover:text-slate-200 border border-white/[0.06]"
                      }`}
                    >
                      {pv}
                    </button>
                  ))}
                </div>

                {/* Search input for versions */}
                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                  <input
                    type="text"
                    placeholder="Поиск по всем версиям (например: 1.21.1, 1.16.5, 1.7.10, b1.7.3)..."
                    value={versionSearch}
                    onChange={(e) => setVersionSearch(e.target.value)}
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white/[0.03] border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-indigo-500"
                  />
                </div>

                {/* Version List Grid - ALL VERSIONS */}
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1.5 max-h-48 overflow-y-auto p-1.5 border border-white/[0.06] rounded-xl bg-black/20">
                  {isLoadingVersions ? (
                    <div className="col-span-full py-6 flex items-center justify-center text-xs text-slate-500 gap-2">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-400" />
                      <span>Загрузка манифеста версий Mojang...</span>
                    </div>
                  ) : filteredVersions.length === 0 ? (
                    <div className="col-span-full py-6 text-center text-xs text-slate-500">
                      Версии не найдены. Попробуйте сменить фильтр или поисковый запрос.
                    </div>
                  ) : (
                    filteredVersions.map((v) => (
                      <button
                        type="button"
                        key={v.id}
                        onClick={() => setGameVersion(v.id)}
                        className={`py-1.5 px-2 rounded-lg text-xs font-mono font-medium border text-center transition-all cursor-pointer ${
                          gameVersion === v.id
                            ? "bg-indigo-600 text-white border-indigo-500 shadow-glow"
                            : "bg-white/[0.02] border-white/[0.05] text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]"
                        }`}
                      >
                        {v.id}
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Modloader Selection */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Modloader
                </label>
                <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                  {loaders.map((l) => (
                    <button
                      type="button"
                      key={l.id}
                      onClick={() => setLoaderType(l.id)}
                      className={`p-2 rounded-xl text-center border transition-all ${
                        loaderType === l.id
                          ? "bg-indigo-600/20 border-indigo-500/60 text-white shadow-glow"
                          : "bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05]"
                      }`}
                    >
                      <div className="text-xs font-bold">{l.label}</div>
                      <div className="text-[9px] text-slate-400 mt-0.5 truncate">{l.desc}</div>
                    </button>
                  ))}
                </div>
                {loaderType === "fabric" && fabricLoaders.length === 0 && !isLoadingLoaders && (
                  <div className="mt-2 p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] leading-relaxed">
                    💡 Для версии {gameVersion} загрузчик Fabric недоступен. Для старых версий (1.12.2, 1.7.10 и др.) выберите <b>Forge</b> или <b>Vanilla</b>.
                  </div>
                )}
              </div>

              {/* Dynamic Loader Version Dropdown */}
              {(loaderType === "fabric" || loaderType === "neoforge" || loaderType === "forge") && (
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-semibold text-slate-300">
                      {loaderType === "fabric" ? "Fabric Loader Version" : loaderType === "forge" ? "Forge Version" : "NeoForge Version"}
                    </label>
                    {isLoadingLoaders && (
                      <span className="text-[10px] text-indigo-400 flex items-center gap-1">
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        Загрузка версий...
                      </span>
                    )}
                  </div>

                  <select
                    value={loaderVersion}
                    onChange={(e) => setLoaderVersion(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-surface-card border border-white/[0.08] text-xs text-slate-200 focus:outline-none focus:border-indigo-500 font-mono"
                  >
                    {loaderType === "fabric" ? (
                      fabricLoaders.map((item) => (
                        <option key={item.loader.version} value={item.loader.version}>
                          {item.loader.version} {item.loader.stable ? "(Stable)" : "(Beta)"}
                        </option>
                      ))
                    ) : loaderType === "forge" ? (
                      forgeLoaders.map((ver) => (
                        <option key={ver} value={ver}>
                          {ver}
                        </option>
                      ))
                    ) : (
                      neoforgeLoaders.map((ver) => (
                        <option key={ver} value={ver}>
                          {ver}
                        </option>
                      ))
                    )}
                  </select>
                </div>
              )}

              {/* Fabric API Auto-Install Toggle */}
              {(loaderType === "fabric" || loaderType === "quilt") && (
                <div className="p-3 rounded-xl bg-indigo-500/10 border border-indigo-500/25 flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-300">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-white">Автоматически установить Fabric API</div>
                      <div className="text-[10px] text-slate-400">
                        Обязателен для нормальной работы 99% модов Fabric
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setInstallFabricApi(!installFabricApi)}
                    className={`relative inline-flex h-5 w-10 items-center rounded-full transition-colors cursor-pointer ${
                      installFabricApi ? "bg-indigo-600" : "bg-white/[0.1]"
                    }`}
                  >
                    <span
                      className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
                        installFabricApi ? "translate-x-5" : "translate-x-1"
                      }`}
                    />
                  </button>
                </div>
              )}
            </>
          ) : (
            <>
              {/* Step 2: RAM & JVM Optimization */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Cpu className="w-3.5 h-3.5 text-indigo-400" />
                    Allocated RAM: {Math.round(maxRamMb / 1024)} GB ({maxRamMb} MB)
                  </label>
                  {recommendedMemory && (
                    <button
                      type="button"
                      onClick={() => setMaxRamMb(recommendedMemory.max_mb)}
                      className="text-[11px] text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors"
                    >
                      <Sparkles className="w-3 h-3" />
                      Auto-Recommend ({Math.round(recommendedMemory.max_mb / 1024)}GB)
                    </button>
                  )}
                </div>
                <input
                  type="range"
                  min={1024}
                  max={specs ? Math.max(8192, specs.total_ram_mb - 2048) : 16384}
                  step={512}
                  value={maxRamMb}
                  onChange={(e) => setMaxRamMb(Number(e.target.value))}
                  className="w-full h-1.5 bg-white/10 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                />
              </div>

              {/* JVM GC Presets */}
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-2">
                  JVM Garbage Collection Preset
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {gcPresets.map((p) => (
                    <button
                      type="button"
                      key={p.id}
                      onClick={() => setGcPreset(p.id)}
                      className={`p-3 rounded-xl text-left border transition-all ${
                        gcPreset === p.id
                          ? "bg-indigo-600/20 border-indigo-500/50 text-white"
                          : "bg-white/[0.02] border-white/[0.06] text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      <div className="text-xs font-semibold">{p.name}</div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Summary Overview Card */}
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/[0.06] space-y-2 text-xs">
                <div className="font-bold text-slate-200 mb-1">Configuration Overview</div>
                <div className="flex justify-between text-slate-400">
                  <span>Game Version:</span>
                  <span className="font-mono text-slate-200">{gameVersion}</span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Modloader:</span>
                  <span className="font-mono text-slate-200 capitalize">
                    {loaderType} {loaderVersion ? `(${loaderVersion})` : ""}
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Memory Allocation:</span>
                  <span className="font-mono text-slate-200">
                    {Math.max(1024, Math.floor(maxRamMb / 2))}MB - {maxRamMb}MB
                  </span>
                </div>
                <div className="flex justify-between text-slate-400">
                  <span>Isolation Path:</span>
                  <span className="font-mono text-slate-200">instances/&lt;uuid&gt;/</span>
                </div>
              </div>
            </>
          )}

          {/* Footer Navigation */}
          <div className="flex items-center justify-between pt-4 border-t border-white/[0.08]">
            {step === 2 ? (
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white flex items-center gap-1.5 transition-colors"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Back</span>
              </button>
            ) : (
              <div />
            )}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white transition-colors"
              >
                Cancel
              </button>

              {step === 1 ? (
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-5 py-2 rounded-xl btn-accent font-semibold text-xs transition-all flex items-center gap-1.5"
                >
                  <span>Next: Settings</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              ) : (
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 rounded-xl btn-accent font-semibold text-xs transition-all flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Check className="w-4 h-4" />
                  <span>{isSubmitting ? "Creating..." : "Create Instance"}</span>
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
