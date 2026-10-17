import React, { useEffect, useRef } from "react";
import { useCustomizationStore, ACCENT_PRESETS } from "../../store/customizationStore";

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  maxAlpha: number;
  pulseSpeed: number;
}

interface Star {
  x: number;
  y: number;
  z: number;
  pz: number;
}

interface MatrixDrop {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  charIndex: number;
  updateTimer: number;
}

export const AnimatedBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationEffect = useCustomizationStore((s) => s.animationEffect);
  const accent = useCustomizationStore((s) => s.accent);
  const customAccentHex = useCustomizationStore((s) => s.customAccentHex);

  const mousePos = useRef({ x: -1000, y: -1000 });

  useEffect(() => {
    if (animationEffect === "none") return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let animId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener("resize", handleResize);

    const handleMouseMove = (e: MouseEvent) => {
      mousePos.current = { x: e.clientX, y: e.clientY };
    };
    window.addEventListener("mousemove", handleMouseMove);

    // Accent color RGB values
    let r = 16, g = 185, b = 129;
    if (customAccentHex && customAccentHex.startsWith("#") && customAccentHex.length === 7) {
      r = parseInt(customAccentHex.slice(1, 3), 16) || 16;
      g = parseInt(customAccentHex.slice(3, 5), 16) || 185;
      b = parseInt(customAccentHex.slice(5, 7), 16) || 129;
    } else {
      const def = ACCENT_PRESETS[accent] || ACCENT_PRESETS.emerald;
      const parts = def.rgb.split(",").map((s) => parseInt(s.trim()));
      if (parts.length === 3) {
        r = parts[0];
        g = parts[1];
        b = parts[2];
      }
    }

    // Effect: STARS
    const NUM_STARS = 120;
    const stars: Star[] = [];
    if (animationEffect === "stars") {
      for (let i = 0; i < NUM_STARS; i++) {
        stars.push({
          x: (Math.random() - 0.5) * width * 2,
          y: (Math.random() - 0.5) * height * 2,
          z: Math.random() * width,
          pz: 0,
        });
        stars[i].pz = stars[i].z;
      }
    }

    // Effect: PARTICLES / EMBER SPURTS
    const NUM_PARTICLES = 65;
    const particles: Particle[] = [];
    if (animationEffect === "particles") {
      for (let i = 0; i < NUM_PARTICLES; i++) {
        particles.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.6,
          vy: -Math.random() * 0.8 - 0.2, // float upward
          size: Math.random() * 2.8 + 1.2,
          alpha: Math.random() * 0.5 + 0.1,
          maxAlpha: Math.random() * 0.6 + 0.2,
          pulseSpeed: Math.random() * 0.02 + 0.005,
        });
      }
    }

    // Effect: FIREFLIES
    const NUM_FIREFLIES = 35;
    const fireflies: Particle[] = [];
    if (animationEffect === "fireflies") {
      for (let i = 0; i < NUM_FIREFLIES; i++) {
        fireflies.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.5,
          vy: (Math.random() - 0.5) * 0.5,
          size: Math.random() * 3.5 + 2.0,
          alpha: 0.1,
          maxAlpha: Math.random() * 0.8 + 0.2,
          pulseSpeed: Math.random() * 0.03 + 0.01,
        });
      }
    }

    // Effect: MATRIX
    const matrixChars = "0123456789ABCDEFλπΩ⚡FRZ<>/{}+*";
    const matrixDrops: MatrixDrop[] = [];
    if (animationEffect === "matrix") {
      const cols = Math.floor(width / 24);
      for (let i = 0; i < cols; i++) {
        matrixDrops.push({
          x: i * 24,
          y: Math.random() * -height,
          speed: Math.random() * 2 + 1.5,
          chars: Array.from({ length: 8 }, () => matrixChars[Math.floor(Math.random() * matrixChars.length)]),
          charIndex: 0,
          updateTimer: 0,
        });
      }
    }

    // Render loop
    const render = () => {
      ctx.clearRect(0, 0, width, height);

      if (animationEffect === "stars") {
        const cx = width / 2;
        const cy = height / 2;
        const mx = (mousePos.current.x - cx) * 0.05;
        const my = (mousePos.current.y - cy) * 0.05;

        for (let i = 0; i < stars.length; i++) {
          const s = stars[i];
          s.z -= 1.2;
          if (s.z <= 0) {
            s.z = width;
            s.x = (Math.random() - 0.5) * width * 2;
            s.y = (Math.random() - 0.5) * height * 2;
            s.pz = s.z;
          }

          const k = 180 / s.z;
          const px = s.x * k + cx + mx;
          const py = s.y * k + cy + my;

          const pk = 180 / s.pz;
          const ppx = s.x * pk + cx + mx;
          const ppy = s.y * pk + cy + my;

          s.pz = s.z;

          if (px >= 0 && px <= width && py >= 0 && py <= height) {
            const alpha = Math.min(1, (1 - s.z / width) * 0.85);
            ctx.beginPath();
            ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha * 0.7})`;
            ctx.lineWidth = Math.min(2.5, (1 - s.z / width) * 2.5);
            ctx.moveTo(ppx, ppy);
            ctx.lineTo(px, py);
            ctx.stroke();

            // Star head glow
            ctx.beginPath();
            ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.9})`;
            ctx.arc(px, py, Math.min(1.8, (1 - s.z / width) * 1.8), 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else if (animationEffect === "particles") {
        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];
          p.x += p.vx;
          p.y += p.vy;

          // Mouse gentle repulsion
          const dx = p.x - mousePos.current.x;
          const dy = p.y - mousePos.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 120 && dist > 0) {
            const force = (120 - dist) / 120;
            p.x += (dx / dist) * force * 1.5;
            p.y += (dy / dist) * force * 1.5;
          }

          p.alpha += p.pulseSpeed;
          if (p.alpha > p.maxAlpha || p.alpha < 0.05) {
            p.pulseSpeed = -p.pulseSpeed;
          }

          if (p.y < -10) {
            p.y = height + 10;
            p.x = Math.random() * width;
          }
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;

          ctx.beginPath();
          ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${Math.max(0, p.alpha * 0.55)})`;
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fill();

          // Particle central core
          ctx.beginPath();
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, p.alpha * 0.35)})`;
          ctx.arc(p.x, p.y, p.size * 0.45, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (animationEffect === "fireflies") {
        for (let i = 0; i < fireflies.length; i++) {
          const f = fireflies[i];
          f.x += f.vx + Math.sin(Date.now() * 0.001 + i) * 0.3;
          f.y += f.vy + Math.cos(Date.now() * 0.001 + i) * 0.3;

          f.alpha += f.pulseSpeed;
          if (f.alpha > f.maxAlpha || f.alpha < 0.05) {
            f.pulseSpeed = -f.pulseSpeed;
          }

          if (f.y < -20) f.y = height + 20;
          if (f.y > height + 20) f.y = -20;
          if (f.x < -20) f.x = width + 20;
          if (f.x > width + 20) f.x = -20;

          // Outer halo
          const glowGrad = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.size * 4);
          glowGrad.addColorStop(0, `rgba(${r}, ${g}, ${b}, ${Math.max(0, f.alpha * 0.6)})`);
          glowGrad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);
          ctx.fillStyle = glowGrad;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.size * 4, 0, Math.PI * 2);
          ctx.fill();

          // Core
          ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, f.alpha * 0.85)})`;
          ctx.beginPath();
          ctx.arc(f.x, f.y, f.size * 0.6, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if (animationEffect === "matrix") {
        ctx.font = "12px monospace";
        for (let i = 0; i < matrixDrops.length; i++) {
          const drop = matrixDrops[i];
          drop.y += drop.speed;
          drop.updateTimer++;
          if (drop.updateTimer % 12 === 0) {
            drop.charIndex = (drop.charIndex + 1) % drop.chars.length;
          }

          for (let c = 0; c < drop.chars.length; c++) {
            const charY = drop.y - c * 16;
            if (charY > -20 && charY < height + 20) {
              const alpha = (1 - c / drop.chars.length) * 0.45;
              if (c === 0) {
                ctx.fillStyle = `rgba(255, 255, 255, 0.8)`;
              } else {
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
              }
              ctx.fillText(drop.chars[(drop.charIndex + c) % drop.chars.length], drop.x, charY);
            }
          }

          if (drop.y - drop.chars.length * 16 > height) {
            drop.y = Math.random() * -100;
            drop.speed = Math.random() * 2 + 1.5;
          }
        }
      }

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [animationEffect, accent, customAccentHex]);

  if (animationEffect === "none") return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none z-[1] w-full h-full opacity-85 transition-opacity duration-700"
    />
  );
};
