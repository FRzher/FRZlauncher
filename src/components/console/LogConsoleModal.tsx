import React, { useEffect, useRef, useState } from "react";
import {
  X,
  Terminal,
  Copy,
  Trash2,
  AlertTriangle,
  Check,
  ArrowDown,
  Wrench,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { useLaunchStore } from "../../store/launchStore";
import { useInstanceStore } from "../../store/instanceStore";

export const LogConsoleModal: React.FC = () => {
  const {
    isConsoleOpen,
    activeConsoleInstanceId,
    closeConsole,
    logs,
    statuses,
    clearLogs,
    crashDiagnoses,
    isRepairing,
    autoRepairInstance,
  } = useLaunchStore();

  const instances = useInstanceStore((s) => s.instances);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const [repairResult, setRepairResult] = useState<string | null>(null);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const activeInstance = instances.find((i) => i.id === activeConsoleInstanceId);
  const currentLogs = activeConsoleInstanceId ? logs[activeConsoleInstanceId] || [] : [];
  const currentStatus = activeConsoleInstanceId ? statuses[activeConsoleInstanceId] : undefined;
  const currentDiagnosis = activeConsoleInstanceId ? crashDiagnoses[activeConsoleInstanceId] : undefined;
  const repairingThis = activeConsoleInstanceId ? isRepairing[activeConsoleInstanceId] : false;

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [currentLogs, autoScroll]);

  if (!isConsoleOpen || !activeConsoleInstanceId) return null;

  const handleCopyLog = async () => {
    const text = currentLogs.map((l) => `[${l.level}] ${l.line}`).join("\n");
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRepair = async () => {
    if (!activeConsoleInstanceId) return;
    setRepairResult(null);
    try {
      const res = await autoRepairInstance(activeConsoleInstanceId);
      setRepairResult(res.message);
    } catch (err: unknown) {
      setRepairResult(`Не удалось устранить ошибку: ${err}`);
    }
  };

  const getLogColor = (level: string) => {
    switch (level) {
      case "ERROR":
        return "text-red-400 bg-red-500/10";
      case "WARN":
        return "text-amber-400 bg-amber-500/10";
      case "DEBUG":
        return "text-blue-400 bg-blue-500/10";
      default:
        return "text-slate-300";
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in duration-150">
      <div className="glass-panel w-full max-w-4xl h-[85vh] rounded-2xl border border-white/10 shadow-2xl flex flex-col overflow-hidden">
        {/* Modal Header */}
        <div className="h-14 px-5 flex items-center justify-between border-b border-white/[0.08] bg-[#0c0e17]/80 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white flex items-center gap-2">
                <span>{activeInstance?.name || "Game Process Console"}</span>
                {currentStatus && (
                  <span
                    className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase font-bold border ${
                      currentStatus.state === "running"
                        ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
                        : currentStatus.state === "starting"
                        ? "bg-amber-500/15 text-amber-400 border-amber-500/30 animate-pulse"
                        : currentStatus.state === "crashed"
                        ? "bg-red-500/15 text-red-400 border-red-500/30"
                        : "bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
                    }`}
                  >
                    {currentStatus.state === "starting" ? "Загрузка" : currentStatus.state}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                {currentStatus?.message || "Потоковый вывод игрового процесса..."}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setAutoScroll(!autoScroll)}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition-colors ${
                autoScroll
                  ? "bg-indigo-500/15 text-indigo-300 border-indigo-500/30"
                  : "bg-white/[0.04] text-slate-400 border-white/[0.08] hover:text-white"
              }`}
              title="Переключить автопрокрутку"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Автоскролл</span>
            </button>

            <button
              onClick={handleCopyLog}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="Скопировать весь лог"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Скопировано" : "Копировать"}</span>
            </button>

            <button
              onClick={() => clearLogs(activeConsoleInstanceId)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
              title="Очистить консоль"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>

            <button
              onClick={closeConsole}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors ml-2"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Rich Crash Diagnostic Banner with 1-Click Auto Repair */}
        {currentStatus?.state === "crashed" && (
          <div className="bg-gradient-to-r from-red-950/80 via-[#180d12] to-[#120a14] border-b border-red-500/30 p-4 flex flex-col gap-2.5 text-xs flex-shrink-0 animate-in slide-in-from-top duration-200">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-red-500/20 border border-red-500/40 flex items-center justify-center text-red-400 shrink-0 mt-0.5">
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <div>
                  <div className="font-bold text-red-200 text-sm flex items-center gap-2">
                    <span>
                      {currentDiagnosis?.title || "Процесс игры аварийно завершился"}
                    </span>
                    {currentDiagnosis?.cause_type && (
                      <span className="text-[10px] px-2 py-0.5 rounded bg-red-500/20 text-red-300 font-mono uppercase">
                        {currentDiagnosis.cause_type}
                      </span>
                    )}
                  </div>
                  <div className="text-red-300/90 text-xs mt-1 leading-relaxed">
                    {currentDiagnosis?.description || currentStatus.message}
                  </div>
                  {currentDiagnosis?.suggested_fix && (
                    <div className="text-emerald-300/90 text-[11px] mt-1.5 flex items-center gap-1.5 bg-emerald-950/30 border border-emerald-500/20 px-2.5 py-1.5 rounded-lg">
                      <Sparkles className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span>{currentDiagnosis.suggested_fix}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Auto Repair Button */}
              <div className="shrink-0 flex flex-col items-end gap-1.5">
                <button
                  onClick={handleRepair}
                  disabled={repairingThis}
                  className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-500 hover:from-amber-400 hover:to-emerald-400 text-black font-black text-xs flex items-center gap-2 shadow-lg shadow-emerald-500/20 active:scale-95 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {repairingThis ? (
                    <span className="w-3.5 h-3.5 border-2 border-black/40 border-t-black rounded-full animate-spin" />
                  ) : (
                    <Wrench className="w-3.5 h-3.5 fill-current" />
                  )}
                  <span>{repairingThis ? "Устранение..." : "⚡ Устранить сбой"}</span>
                </button>
              </div>
            </div>

            {repairResult && (
              <div className="text-xs text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1.5 rounded-lg flex items-center gap-2 animate-fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{repairResult}</span>
              </div>
            )}
          </div>
        )}

        {/* Log Viewer Terminal Body */}
        <div
          ref={logContainerRef}
          className="flex-1 p-4 overflow-y-auto font-mono text-xs leading-relaxed bg-[#080a10] text-slate-300 select-text"
        >
          {currentLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-600 italic">
              Ожидание вывода процесса игры...
            </div>
          ) : (
            currentLogs.map((entry, idx) => (
              <div
                key={idx}
                className={`py-0.5 px-1 rounded hover:bg-white/[0.03] transition-colors flex items-start gap-2 ${getLogColor(
                  entry.level
                )}`}
              >
                <span className="text-slate-600 select-none text-[10px] w-12 flex-shrink-0">
                  {new Date(entry.timestamp).toLocaleTimeString()}
                </span>
                <span className="text-[10px] font-bold uppercase w-10 flex-shrink-0 opacity-80">
                  [{entry.level}]
                </span>
                <span className="break-all whitespace-pre-wrap flex-1">{entry.line}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
