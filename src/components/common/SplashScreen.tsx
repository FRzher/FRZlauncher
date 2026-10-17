import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Terminal, ShieldCheck, Zap } from "lucide-react";
import frzherAvatar from "../../assets/frzher_avatar.jpg";

interface SplashScreenProps {
  isVisible: boolean;
  message?: string;
}

export const SplashScreen: React.FC<SplashScreenProps> = ({
  isVisible,
  message = "Инициализация ядра лаунчера...",
}) => {
  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.02 }}
          transition={{ duration: 0.5, ease: "easeInOut" }}
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-[#070a0e] select-none overflow-hidden"
        >
          {/* Background Ambient Glows */}
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-emerald-500/15 rounded-full blur-[140px] pointer-events-none animate-pulse" />
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] bg-teal-500/10 rounded-full blur-[90px] pointer-events-none" />

          {/* Central Holographic Logo */}
          <motion.div
            initial={{ scale: 0.8, opacity: 0, y: 10 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="relative flex flex-col items-center z-10"
          >
            {/* Glowing Avatar Frame */}
            <div className="relative mb-6">
              <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-emerald-500 via-teal-400 to-cyan-400 p-1 shadow-[0_0_50px_rgba(0,230,118,0.5)] flex items-center justify-center">
                <div className="w-full h-full bg-[#090d14] rounded-[20px] overflow-hidden flex items-center justify-center">
                  <img src={frzherAvatar} alt="FRzher" className="w-full h-full object-cover" />
                </div>
              </div>
              <Sparkles className="w-5 h-5 text-emerald-300 absolute -top-2 -right-2 animate-bounce" />
            </div>

            {/* Launcher Title */}
            <h1 className="text-2xl font-black tracking-wider text-white flex items-center gap-2">
              <span className="bg-gradient-to-r from-emerald-400 via-teal-300 to-emerald-200 bg-clip-text text-transparent">
                FRzher
              </span>
              <span className="text-slate-100 font-extrabold tracking-normal">
                LAUNCHER
              </span>
            </h1>

            {/* Badges */}
            <div className="flex items-center gap-2 mt-2">
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 font-mono font-semibold flex items-center gap-1">
                <Zap className="w-3 h-3 text-emerald-400" />
                500+ FPS Boost
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.1] text-slate-300 font-mono font-semibold flex items-center gap-1">
                <ShieldCheck className="w-3 h-3 text-teal-400" />
                Auto-Java
              </span>
            </div>

            {/* Progress Bar & Status Text */}
            <div className="mt-8 flex flex-col items-center gap-2.5 w-64">
              <div className="w-full h-1 bg-white/[0.06] rounded-full overflow-hidden relative">
                <motion.div
                  initial={{ x: "-100%" }}
                  animate={{ x: "100%" }}
                  transition={{
                    repeat: Infinity,
                    duration: 1.2,
                    ease: "easeInOut",
                  }}
                  className="w-1/2 h-full bg-gradient-to-r from-emerald-400 to-teal-400 rounded-full"
                />
              </div>
              <span className="text-xs text-slate-400 font-medium tracking-wide flex items-center gap-1.5">
                <Terminal className="w-3 h-3 text-emerald-400 animate-pulse" />
                <span>{message}</span>
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
