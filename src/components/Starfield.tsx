import React, { useEffect, useRef } from 'react';

// 軽量なキャンバス星空。リサイズ対応・非同期描画（requestAnimationFrame）。
// 負荷を抑えるためパーティクル数を小さめにし、移動も緩やか。
const Starfield: React.FC<{ density?: number }>= ({ density = 120 }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const starsRef = useRef<Array<{ x: number; y: number; z: number; s: number }>>([]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
    };
    resize();

    const count = Math.floor(density * (canvas.width * canvas.height) / (1920 * 1080));
    const stars: Array<{ x: number; y: number; z: number; s: number }> = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        z: Math.random() * 0.8 + 0.2, // depth 0.2..1.0
        s: Math.random() * 0.8 + 0.2,  // size 0.2..1.0
      });
    }
    starsRef.current = stars;

    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(50, now - last); // clamp
      last = now;
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = '#0b1020';
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'white';
      for (const st of starsRef.current) {
        // 緩やかな流れ星風漂い: z に応じて少しずつ左下へ移動
        st.x -= 0.02 * st.z * dt; // px/ms 比例
        st.y += 0.01 * st.z * dt;
        if (st.x < -2 || st.y > h + 2) {
          st.x = w + Math.random() * 20;
          st.y = Math.random() * h * 0.2;
          st.z = Math.random() * 0.8 + 0.2;
          st.s = Math.random() * 0.8 + 0.2;
        }
        const size = st.s * dpr;
        ctx.globalAlpha = 0.6 * st.z + 0.2;
        ctx.fillRect(st.x, st.y, size, size);
      }
      ctx.globalAlpha = 1;
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    const onResize = () => {
      cancelAnimationFrame(rafRef.current!);
      resize();
      rafRef.current = requestAnimationFrame(loop);
    };
    window.addEventListener('resize', onResize);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      window.removeEventListener('resize', onResize);
    };
  }, [density]);

  return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', background: 'transparent' }} />;
};

export default Starfield;
