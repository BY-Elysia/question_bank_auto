import { useEffect, type RefObject } from 'react';

type Particle = { x: number; y: number; vx: number; vy: number; radius: number; phase: number };
type Spark = { x: number; y: number; vx: number; vy: number; life: number };

/** Decorative rendering stays off the React render path and stops when it cannot be seen. */
export function useParticleField(canvasRef: RefObject<HTMLCanvasElement | null>, enabled: boolean) {
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    const coarse = window.matchMedia('(pointer: coarse)');
    let width = 0,
      height = 0,
      frame = 0,
      previous = 0,
      clock = 0;
    let particles: Particle[] = [],
      sparks: Spark[] = [];
    const pointer = { x: -1000, y: -1000 };
    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const count = Math.min(width < 760 ? 26 : 64, Math.floor((width * height) / 20000));
      particles = Array.from({ length: count }, (_, i) => ({
        x: ((i * 0.6180339) % 1) * width,
        y: ((i * 0.4142135) % 1) * height,
        vx: Math.sin(i * 2.3) * 0.14,
        vy: -0.1 - (i % 4) * 0.025,
        radius: i % 7 === 0 ? 1.8 : 0.8 + (i % 3) * 0.25,
        phase: i * 1.7,
      }));
      sparks = [];
    };
    const draw = (now: number) => {
      frame = requestAnimationFrame(draw);
      if (now - previous < 32) return; // Cap decorative work at roughly 30 fps.
      const delta = Math.min((now - previous) / 33.33, 2);
      previous = now;
      clock += delta * 0.015;
      ctx.clearRect(0, 0, width, height);
      for (const p of particles) {
        const dx = p.x - pointer.x,
          dy = p.y - pointer.y,
          distance = Math.hypot(dx, dy);
        if (distance > 0 && distance < 130) {
          const push = (1 - distance / 130) * 0.45 * delta;
          p.x += (dx / distance) * push;
          p.y += (dy / distance) * push;
        }
        p.x = (p.x + (p.vx + Math.sin(clock + p.phase) * 0.06) * delta + width) % width;
        p.y = (p.y + p.vy * delta + height) % height;
        const alpha = 0.18 + (Math.sin(clock + p.phase) + 1) * 0.12;
        ctx.fillStyle = `rgba(179, 164, 228, ${alpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
        ctx.fill();
        if (distance < 150) {
          ctx.strokeStyle = `rgba(155, 135, 215, ${(1 - distance / 150) * 0.13})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(pointer.x, pointer.y);
          ctx.stroke();
        }
      }
      sparks = sparks.filter((s) => s.life > 0);
      for (const s of sparks) {
        s.x += s.vx * delta;
        s.y += s.vy * delta;
        s.life -= delta * 0.025;
        ctx.fillStyle = `rgba(191, 172, 242, ${Math.max(0, s.life) * 0.5})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    };
    const sync = () => {
      cancelAnimationFrame(frame);
      previous = performance.now();
      const state = !enabled
        ? 'disabled'
        : reduced.matches
          ? 'reduced'
          : document.hidden
            ? 'paused'
            : 'running';
      canvas.dataset.state = state;
      canvas.hidden = state !== 'running';
      if (state === 'running') frame = requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, width, height);
    };
    const move = (event: PointerEvent) => {
      if (coarse.matches) return;
      pointer.x = event.clientX;
      pointer.y = event.clientY;
    };
    const leave = () => {
      pointer.x = pointer.y = -1000;
    };
    const burst = (event: PointerEvent) => {
      if (canvas.dataset.state !== 'running' || coarse.matches) return;
      if (!(event.target instanceof Element) || !event.target.closest('button')) return;
      // Bound simultaneous bursts, even when controls are clicked repeatedly.
      sparks = sparks.slice(-32);
      for (let i = 0; i < 8; i++) {
        const angle = (i * Math.PI) / 4;
        sparks.push({
          x: event.clientX,
          y: event.clientY,
          vx: Math.cos(angle) * 1.6,
          vy: Math.sin(angle) * 1.6,
          life: 1,
        });
      }
    };
    resize();
    sync();
    window.addEventListener('resize', resize);
    window.addEventListener('pointermove', move, { passive: true });
    window.addEventListener('pointerdown', burst, { passive: true });
    window.addEventListener('blur', leave);
    document.documentElement.addEventListener('pointerleave', leave);
    document.addEventListener('visibilitychange', sync);
    reduced.addEventListener('change', sync);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerdown', burst);
      window.removeEventListener('blur', leave);
      document.documentElement.removeEventListener('pointerleave', leave);
      document.removeEventListener('visibilitychange', sync);
      reduced.removeEventListener('change', sync);
      ctx.clearRect(0, 0, width, height);
    };
  }, [canvasRef, enabled]);
}
