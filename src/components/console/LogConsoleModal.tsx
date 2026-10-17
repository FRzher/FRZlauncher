import React, { useEffect, useRef, useState } from "react";
import { X, Terminal, Copy, Trash2, AlertTriangle, Check, ArrowDown } from "lucide-react";
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
  } = useLaunchStore();

  const instances = useInstanceStore((s) => s.instances);
  const [autoScroll, setAutoScroll] = useState(true);
  const [copied, setCopied] = useState(false);
  const logContainerRef = useRef<HTMLDivElement>(null);

  const activeInstance = instances.find((i) => i.id === activeConsoleInstanceId);
  const currentLogs = activeConsoleInstanceId ? logs[activeConsoleInstanceId] || [] : [];
  const currentStatus = activeConsoleInstanceId ? statuses[activeConsoleInstanceId] : undefined;

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
                        : currentStatus.state === "crashed"
                        ? "bg-red-500/15 text-red-400 border-red-500/30 animate-pulse"
                        : "bg-indigo-500/15 text-indigo-400 border-indigo-500/30"
                    }`}
                  >
                    {currentStatus.state}
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                {currentStatus?.message || "Streaming live process output..."}
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
              title="Toggle auto-scroll"
            >
              <ArrowDown className="w-3.5 h-3.5" />
              <span>Auto-scroll</span>
            </button>

            <button
              onClick={handleCopyLog}
              className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-slate-300 border border-white/[0.08] text-xs font-medium flex items-center gap-1.5 transition-colors"
              title="Copy all logs"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? "Copied" : "Copy Log"}</span>
            </button>

            <button
              onClick={() => clearLogs(activeConsoleInstanceId)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/[0.08] border border-white/[0.08] transition-colors"
              title="Clear logs"
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

        {/* Crash Diagnostic Banner */}
        {currentStatus?.state === "crashed" && (
          <div className="bg-red-500/15 border-b border-red-500/30 p-3.5 flex items-start gap-3 text-xs flex-shrink-0 animate-in slide-in-from-top duration-200">
            <AlertTriangle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div className="flex-1">
              <div className="font-bold text-red-300 mb-0.5">Game Process Terminated</div>
              <div className="text-red-200/90 font-mono text-[11px] leading-relaxed">
                {currentStatus.message}
              </div>
              <div className="text-[10px] text-red-300/70 mt-1">
                Tip: If this is a Java version error, check the Settings tab or verify your JDK configuration.
              </div>
            </div>
          </div>
        )}

        {/* Log Viewer Terminal Body */}
        <div
          ref={logContainerRef}
          className="flex-1 p-4 overflow-y-auto font-mono text-xs leading-relaxed bg-[#080a10] text-slate-300 select-text"
        >
          {currentLogs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-600 italic">
              Waiting for process output...
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
