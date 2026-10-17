import React, { useState, useEffect, useRef } from "react";
import { Sparkles } from "lucide-react";
import { Account } from "../../types";

interface PlayerAvatarProps {
  account?: Account | null;
  size?: number;
  className?: string;
  showProviderBadge?: boolean;
}

/**
 * High-reliability Minecraft head avatar with multiple fallbacks
 * Supports Ely.by, Microsoft, and Offline profiles
 */
export const PlayerAvatar: React.FC<PlayerAvatarProps> = ({
  account,
  size = 28,
  className = "",
  showProviderBadge = false,
}) => {
  const [imgError, setImgError] = useState(false);
  const [fallbackIndex, setFallbackIndex] = useState(0);

  const username = account?.username || "Steve";
  const provider = account?.provider || "offline";
  const uuid = account?.uuid;

  // Ordered fallback URLs based on provider
  const getSources = (): string[] => {
    // If account has an avatar URL (ends with avatar or contains /avatars/), use it
    if (account?.skin_url && (account.skin_url.includes("/avatar") || account.skin_url.includes("/avatars/"))) {
      return [
        account.skin_url,
        `https://mc-heads.net/avatar/${username}/${size}`,
        `https://minotar.net/helm/${username}/${size}.png`,
      ];
    }

    if (provider === "elyby") {
      return [
        `https://skin.ely.by/avatars/${username}`,
        `https://mc-heads.net/avatar/${username}/${size}`,
        `https://minotar.net/helm/${username}/${size}.png`,
        `https://minotar.net/avatar/${username}/${size}.png`,
      ];
    }

    if (provider === "microsoft") {
      const primaryId = uuid || username;
      return [
        `https://mc-heads.net/avatar/${primaryId}/${size}`,
        `https://minotar.net/helm/${username}/${size}.png`,
        `https://minotar.net/avatar/${username}/${size}.png`,
      ];
    }

    // Offline profile
    return [
      `https://mc-heads.net/avatar/${username}/${size}`,
      `https://minotar.net/helm/${username}/${size}.png`,
      `https://minotar.net/avatar/${username}/${size}.png`,
      `https://skin.ely.by/avatars/${username}`,
    ];
  };

  const sources = getSources();
  const currentSrc = sources[fallbackIndex] || null;

  useEffect(() => {
    setImgError(false);
    setFallbackIndex(0);
  }, [account?.username, account?.provider, account?.skin_url]);

  const handleError = () => {
    if (fallbackIndex + 1 < sources.length) {
      setFallbackIndex((prev) => prev + 1);
    } else {
      setImgError(true);
    }
  };

  return (
    <div
      className={`relative inline-flex items-center justify-center flex-shrink-0 rounded-lg overflow-hidden bg-black/40 border border-white/10 ${className}`}
      style={{ width: size, height: size }}
    >
      {!imgError && currentSrc ? (
        <img
          src={currentSrc}
          alt={username}
          onError={handleError}
          className="w-full h-full object-cover pixelated select-none"
          loading="lazy"
        />
      ) : (
        <div className="w-full h-full flex items-center justify-center bg-gradient-to-tr from-emerald-900/60 to-slate-800 text-emerald-300 font-bold font-mono text-[10px] uppercase">
          {username.slice(0, 2)}
        </div>
      )}

      {showProviderBadge && (
        <span
          className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border border-black ${
            provider === "elyby"
              ? "bg-cyan-400"
              : provider === "microsoft"
              ? "bg-emerald-400"
              : "bg-slate-400"
          }`}
          title={provider.toUpperCase()}
        />
      )}
    </div>
  );
};

interface FullSkinPreviewProps {
  account: Account;
  className?: string;
}

/**
 * Full Minecraft character model & skin viewer with 2D Canvas skin texture parsing,
 * 3D isometric render fallback, bust preview, and cape detection.
 */
export const FullSkinPreview: React.FC<FullSkinPreviewProps> = ({ account, className = "" }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [viewMode, setViewMode] = useState<"render" | "bust" | "canvas" | "texture">(() =>
    account.provider === "elyby" ? "canvas" : "render"
  );
  const [renderError, setRenderError] = useState(false);
  const [bustError, setBustError] = useState(false);
  const [capeAvailable, setCapeAvailable] = useState<boolean | null>(null);

  const { username, provider, uuid } = account;

  const primaryId = uuid || username;
  const minotarBodyUrl = `https://minotar.net/armor/body/${username}/220.png`;
  const mcHeadsBodyUrl = `https://mc-heads.net/body/${primaryId}/right`;
  const minotarBustUrl = `https://minotar.net/armor/bust/${username}/220.png`;
  const mcHeadsBustUrl = `https://mc-heads.net/head/${primaryId}/220`;

  const skinTextureUrl =
    provider === "elyby"
      ? `https://skin.ely.by/skins/${username}.png`
      : account.skin_url || `https://minotar.net/skin/${username}.png`;

  const capeUrl =
    provider === "elyby"
      ? `https://skin.ely.by/cloaks/${username}.png`
      : null;

  // Check cape availability for Ely.by
  useEffect(() => {
    if (provider === "elyby" && capeUrl) {
      const img = new Image();
      img.onload = () => setCapeAvailable(true);
      img.onerror = () => setCapeAvailable(false);
      img.src = capeUrl;
    } else {
      setCapeAvailable(false);
    }
  }, [provider, username, capeUrl]);

  // Render 2D Front character model on HTML5 Canvas with complete outer layers
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;

    const img = new Image();
    img.crossOrigin = "anonymous";
    img.src = skinTextureUrl;

    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const scale = 5; // Pixel scale

      // Standard Minecraft front layout: 16px wide, 32px tall
      const offsetX = 20;
      const offsetY = 10;

      const drawPart = (
        sx: number,
        sy: number,
        sw: number,
        sh: number,
        dx: number,
        dy: number
      ) => {
        ctx.drawImage(
          img,
          sx,
          sy,
          sw,
          sh,
          offsetX + dx * scale,
          offsetY + dy * scale,
          sw * scale,
          sh * scale
        );
      };

      // 1. Head Base (8x8 from 8, 8)
      drawPart(8, 8, 8, 8, 4, 0);

      // 2. Head Hat/Overlay (8x8 from 40, 8)
      drawPart(40, 8, 8, 8, 4, 0);

      // 3. Torso Base (8x12 from 20, 20)
      drawPart(20, 20, 8, 12, 4, 8);

      // 4. Torso Jacket/Overlay (8x12 from 20, 36)
      if (img.height >= 64) {
        drawPart(20, 36, 8, 12, 4, 8);
      }

      // 5. Right Arm Base (4x12 from 44, 20)
      drawPart(44, 20, 4, 12, 0, 8);

      // 5b. Right Arm Sleeve (4x12 from 44, 36)
      if (img.height >= 64) {
        drawPart(44, 36, 4, 12, 0, 8);
      }

      // 6. Left Arm Base (4x12 from 36, 52 or mirrored from 44, 20)
      if (img.height >= 64) {
        drawPart(36, 52, 4, 12, 12, 8);
        // 6b. Left Arm Sleeve (4x12 from 52, 52)
        drawPart(52, 52, 4, 12, 12, 8);
      } else {
        drawPart(44, 20, 4, 12, 12, 8);
      }

      // 7. Right Leg Base (4x12 from 4, 20)
      drawPart(4, 20, 4, 12, 4, 20);

      // 7b. Right Leg Pants (4x12 from 4, 36)
      if (img.height >= 64) {
        drawPart(4, 36, 4, 12, 4, 20);
      }

      // 8. Left Leg Base (4x12 from 20, 52 or 4, 20)
      if (img.height >= 64) {
        drawPart(20, 52, 4, 12, 8, 20);
        // 8b. Left Leg Pants (4x12 from 4, 52)
        drawPart(4, 52, 4, 12, 8, 20);
      } else {
        drawPart(4, 20, 4, 12, 8, 20);
      }
    };

    img.onerror = () => {
      // Fallback: try minotar skin texture
      if (skinTextureUrl !== `https://minotar.net/skin/${username}.png`) {
        img.src = `https://minotar.net/skin/${username}.png`;
      }
    };
  }, [skinTextureUrl, username]);

  return (
    <div
      className={`p-4 rounded-2xl bg-gradient-to-b from-[#131726]/90 to-[#0a0d14]/90 border border-white/10 flex flex-col items-center select-none shadow-xl ${className}`}
    >
      {/* View Switcher Pills */}
      <div className="flex items-center gap-1 p-1 rounded-xl bg-black/40 border border-white/10 mb-3 text-[10px] font-semibold">
        <button
          type="button"
          onClick={() => setViewMode("render")}
          className={`px-2.5 py-1 rounded-lg transition-all ${
            viewMode === "render"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
        >
          3D Скин
        </button>
        <button
          type="button"
          onClick={() => setViewMode("bust")}
          className={`px-2.5 py-1 rounded-lg transition-all ${
            viewMode === "bust"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Голова / Бюст
        </button>
        <button
          type="button"
          onClick={() => setViewMode("canvas")}
          className={`px-2.5 py-1 rounded-lg transition-all ${
            viewMode === "canvas"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
        >
          2D Модель
        </button>
        <button
          type="button"
          onClick={() => setViewMode("texture")}
          className={`px-2.5 py-1 rounded-lg transition-all ${
            viewMode === "texture"
              ? "bg-indigo-600 text-white shadow-sm"
              : "text-slate-400 hover:text-white"
          }`}
        >
          Текстура
        </button>
      </div>

      {/* Main Skin Display Area */}
      <div className="relative w-44 h-56 flex items-center justify-center rounded-xl bg-black/30 border border-white/5 overflow-hidden group">
        {viewMode === "render" && (
          <div className="w-full h-full flex items-center justify-center p-2">
            {!renderError ? (
              <img
                src={minotarBodyUrl}
                alt={username}
                onError={() => {
                  setRenderError(true);
                }}
                className="max-h-full object-contain pixelated drop-shadow-[0_10px_20px_rgba(0,0,0,0.7)]"
              />
            ) : (
              <img
                src={mcHeadsBodyUrl}
                alt={username}
                className="max-h-full object-contain pixelated drop-shadow-[0_10px_20px_rgba(0,0,0,0.7)]"
              />
            )}
          </div>
        )}

        {viewMode === "bust" && (
          <div className="w-full h-full flex items-center justify-center p-2">
            {!bustError ? (
              <img
                src={minotarBustUrl}
                alt={username}
                onError={() => setBustError(true)}
                className="max-h-full object-contain pixelated drop-shadow-[0_10px_20px_rgba(0,0,0,0.7)]"
              />
            ) : (
              <img
                src={mcHeadsBustUrl}
                alt={username}
                className="max-h-full object-contain pixelated drop-shadow-[0_10px_20px_rgba(0,0,0,0.7)]"
              />
            )}
          </div>
        )}

        {/* 2D Canvas Model */}
        <canvas
          ref={canvasRef}
          width={120}
          height={180}
          className={`pixelated drop-shadow-[0_10px_20px_rgba(0,0,0,0.8)] ${
            viewMode === "canvas" ? "block" : "hidden"
          }`}
        />

        {/* Raw Skin Texture */}
        {viewMode === "texture" && (
          <div className="flex flex-col items-center justify-center p-3 gap-2">
            <img
              src={skinTextureUrl}
              alt="Texture"
              className="w-28 h-28 object-contain pixelated border border-white/10 rounded bg-black/40 p-1"
            />
            <span className="text-[10px] text-slate-400 font-mono">64x64 PNG</span>
          </div>
        )}

        {/* Cape Pill Badge */}
        {capeAvailable && (
          <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-purple-600/30 border border-purple-500/40 text-purple-300 text-[9px] font-bold flex items-center gap-1 shadow-sm">
            <Sparkles className="w-2.5 h-2.5" />
            <span>Плащ</span>
          </div>
        )}
      </div>

      {/* Account Info Card */}
      <div className="w-full mt-3 pt-3 border-t border-white/[0.08] text-center">
        <div className="flex items-center justify-center gap-2">
          <span className="text-sm font-bold text-white tracking-wide">{username}</span>
          <span
            className={`text-[10px] px-2 py-0.5 rounded-full font-bold border ${
              provider === "elyby"
                ? "bg-cyan-500/15 text-cyan-300 border-cyan-500/30"
                : provider === "microsoft"
                ? "bg-emerald-500/15 text-emerald-300 border-emerald-500/30"
                : "bg-white/[0.06] text-slate-300 border-white/[0.08]"
            }`}
          >
            {provider === "elyby"
              ? "Ely.by"
              : provider === "microsoft"
              ? "Microsoft"
              : "Оффлайн"}
          </span>
        </div>

        <div className="text-[11px] text-slate-400 font-mono mt-1 truncate" title={uuid}>
          UUID: {uuid.slice(0, 14)}...
        </div>

        {/* Cape status */}
        <div className="mt-2 text-[10px] flex items-center justify-center gap-1.5 text-slate-400">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              capeAvailable ? "bg-purple-400 animate-pulse" : "bg-slate-600"
            }`}
          />
          <span>
            {capeAvailable
              ? "Плащ Ely.by активен"
              : provider === "elyby"
              ? "Плащ не установлен"
              : "Скин синхронизирован"}
          </span>
        </div>
      </div>
    </div>
  );
};
