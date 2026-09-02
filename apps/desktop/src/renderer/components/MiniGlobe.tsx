import { useEffect, useRef } from 'react';

// Wireframe share-globe for the sidebar, ported from the GOStratum admin globe
// (canvas, dependency-free). Adaptations for AxeOS: the accent color is read
// from the active theme (--color-accent-rgb) instead of hardcoded cyan; miners
// have no real geolocation on a LAN, so each device is placed at a deterministic
// pseudo-position seeded from its id; particles stream from each online miner to
// a central POOL hub, emitted in proportion to freshly-accepted shares (with a
// little ambient traffic so it always feels alive).

interface DeviceLike {
  id: string;
  name: string;
  isOnline: boolean;
  latestMetrics?: { sharesAccepted?: number | null } | null;
}

interface Node {
  id: string;
  name: string;
  online: boolean;
  lat: number;
  lng: number;
}

interface Particle {
  ni: number; // node index
  t: number;
  spd: number;
}

// POOL hub location (arbitrary — North America, a nod to the original).
const HUB_LAT = 45,
  HUB_LNG = -100;

// Deterministic lat/lng from a device id so miners scatter stably across the globe.
function seededLatLng(id: string): { lat: number; lng: number } {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const a = (h >>> 0) / 0xffffffff;
  h = Math.imul(h ^ (h >>> 13), 16777619);
  const b = (h >>> 0) / 0xffffffff;
  return { lat: -55 + a * 110, lng: -180 + b * 360 };
}

export function MiniGlobe({ devices }: { devices: DeviceLike[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const devRef = useRef(devices);
  devRef.current = devices;

  // Mutable animation state kept out of React so the RAF loop never restarts.
  const st = useRef({
    nodes: [] as Node[],
    particles: [] as Particle[],
    landRings: [] as { lat: number; lng: number }[][],
    rotY: 2.4,
    rotX: 0.42,
    dragging: false,
    lastDragX: 0,
    pendingEmit: 0,
    lastShares: -1,
    hubFlash: 0, // 0..1, spikes when a share-comet reaches the pool, then decays
  });

  // Sync nodes from devices + turn newly-accepted shares into pending particles.
  useEffect(() => {
    st.current.nodes = devices.map((d) => {
      const p = seededLatLng(d.id);
      return { id: d.id, name: d.name, online: d.isOnline, lat: p.lat, lng: p.lng };
    });
    const total = devices.reduce(
      (s, d) => s + (d.isOnline ? Number(d.latestMetrics?.sharesAccepted) || 0 : 0),
      0
    );
    if (st.current.lastShares >= 0 && total > st.current.lastShares) {
      st.current.pendingEmit = Math.min(40, st.current.pendingEmit + (total - st.current.lastShares));
    }
    st.current.lastShares = total;
  }, [devices]);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let W = 0,
      H = 0,
      R = 0,
      CX = 0,
      CY = 0;

    const accent =
      getComputedStyle(document.documentElement).getPropertyValue('--color-accent-rgb').trim() || '0,200,255';
    const danger = '255,68,85';
    const gold = '255,215,0';
    const beam = '90,255,130'; // green share-comet (front)
    // Comets are greyed on the far hemisphere and warm to green as they rotate
    // to the front. mixBeam(depth): depth 0 (back) → grey, depth 1 (front) → green.
    const greyRgbArr = [120, 132, 120];
    const beamRgbArr = [90, 255, 130];
    const mixBeam = (t: number) => {
      const k = Math.max(0, Math.min(1, t));
      const c = (i: number) => Math.round(greyRgbArr[i] + (beamRgbArr[i] - greyRgbArr[i]) * k);
      return `${c(0)},${c(1)},${c(2)}`;
    };

    function resize() {
      W = wrap.clientWidth;
      H = wrap.clientHeight;
      canvas.width = W;
      canvas.height = H;
      R = Math.min(W, H) * 0.4;
      CX = W / 2;
      CY = H / 2;
    }

    function proj(lat: number, lng: number) {
      const φ = (lat * Math.PI) / 180,
        λ = (lng * Math.PI) / 180;
      const x = Math.cos(φ) * Math.cos(λ),
        y = Math.sin(φ),
        z = Math.cos(φ) * Math.sin(λ);
      const cy = Math.cos(st.current.rotY),
        sy = Math.sin(st.current.rotY);
      const x1 = x * cy + z * sy,
        z1 = -x * sy + z * cy;
      const cx = Math.cos(st.current.rotX),
        sx = Math.sin(st.current.rotX);
      const y1 = y * cx - z1 * sx,
        z2 = y * sx + z1 * cx;
      return { px: CX - x1 * R, py: CY - y1 * R, z: z2, depth: (z2 + 1) * 0.5 };
    }

    function drawRings(
      rings: { lat: number; lng: number }[][],
      rgb: string,
      backAlpha: number,
      frontAlpha: number,
      lw: number
    ) {
      for (const front of [false, true]) {
        ctx.strokeStyle = `rgba(${rgb},${front ? frontAlpha : backAlpha})`;
        ctx.lineWidth = lw;
        for (const ring of rings) {
          ctx.beginPath();
          let f = true,
            prevFront: boolean | null = null;
          for (const pt of ring) {
            const p = proj(pt.lat, pt.lng);
            const isFront = p.z >= 0;
            if (prevFront !== null && prevFront !== isFront) {
              ctx.stroke();
              ctx.beginPath();
              f = true;
            }
            if (isFront !== front) {
              prevFront = isFront;
              f = true;
              continue;
            }
            f ? ctx.moveTo(p.px, p.py) : ctx.lineTo(p.px, p.py);
            f = false;
            prevFront = isFront;
          }
          ctx.stroke();
        }
      }
    }

    function slerp(la1: number, lo1: number, la2: number, lo2: number, t: number) {
      const r = (d: number) => (d * Math.PI) / 180;
      const a = [Math.cos(r(la1)) * Math.cos(r(lo1)), Math.sin(r(la1)), Math.cos(r(la1)) * Math.sin(r(lo1))];
      const b = [Math.cos(r(la2)) * Math.cos(r(lo2)), Math.sin(r(la2)), Math.cos(r(la2)) * Math.sin(r(lo2))];
      const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
      const angle = Math.acos(dot);
      if (angle < 1e-6) return { lat: la1, lng: lo1 };
      const s = Math.sin(angle);
      const fa = Math.sin((1 - t) * angle) / s,
        fb = Math.sin(t * angle) / s;
      const px = fa * a[0] + fb * b[0],
        py = fa * a[1] + fb * b[1],
        pz = fa * a[2] + fb * b[2];
      return {
        lat: (Math.atan2(py, Math.sqrt(px * px + pz * pz)) * 180) / Math.PI,
        lng: (Math.atan2(pz, px) * 180) / Math.PI,
      };
    }

    // Latitude / longitude grid (built once).
    const latLines: { lat: number; lng: number }[][] = [];
    const lngLines: { lat: number; lng: number }[][] = [];
    for (let la = -60; la <= 60; la += 30) {
      const r = [];
      for (let lo = -180; lo <= 180; lo += 6) r.push({ lat: la, lng: lo });
      latLines.push(r);
    }
    for (let lo = -180; lo < 180; lo += 30) {
      const r = [];
      for (let la = -85; la <= 85; la += 6) r.push({ lat: la, lng: lo });
      lngLines.push(r);
    }

    function draw(now: number) {
      ctx.clearRect(0, 0, W, H);

      // Globe fill
      const g = ctx.createRadialGradient(CX - R * 0.2, CY - R * 0.2, 0, CX, CY, R);
      g.addColorStop(0, `rgba(${accent},0.10)`);
      g.addColorStop(1, 'rgba(4,10,6,0.55)');
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, Math.PI * 2);
      ctx.fillStyle = g;
      ctx.fill();

      // Atmosphere
      const ag = ctx.createRadialGradient(CX, CY, R * 0.92, CX, CY, R * 1.14);
      ag.addColorStop(0, `rgba(${accent},0.12)`);
      ag.addColorStop(1, 'transparent');
      ctx.beginPath();
      ctx.arc(CX, CY, R * 1.14, 0, Math.PI * 2);
      ctx.fillStyle = ag;
      ctx.fill();

      // Rim
      ctx.beginPath();
      ctx.arc(CX, CY, R, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${accent},0.28)`;
      ctx.lineWidth = 1;
      ctx.stroke();

      drawRings(latLines, accent, 0.03, 0.07, 0.3);
      drawRings(lngLines, accent, 0.03, 0.07, 0.3);
      if (st.current.landRings.length) drawRings(st.current.landRings, accent, 0.08, 0.24, 0.5);

      const nodes = st.current.nodes;

      // Share-comets (miner -> pool hub): a thin green beam with a fading trail
      // and a bright glowing head, riding the great-circle arc.
      const TRAIL = 0.55; // trail length in t-units
      const STEPS = 20;
      ctx.save();
      ctx.lineCap = 'round';
      for (const pt of st.current.particles) {
        const nd = nodes[pt.ni];
        if (!nd) continue;
        const pts: { px: number; py: number; depth: number; frac: number }[] = [];
        for (let s = 0; s <= STEPS; s++) {
          const tt = pt.t - TRAIL * (1 - s / STEPS); // tail (s=0) → head (s=STEPS)
          if (tt < 0) continue;
          const sp = slerp(nd.lat, nd.lng, HUB_LAT, HUB_LNG, tt);
          const p = proj(sp.lat, sp.lng);
          pts.push({ px: p.px, py: p.py, depth: p.depth, frac: s / STEPS });
        }
        if (pts.length < 2) continue;
        // Trail: brighter + thicker toward the head; grey on the far side,
        // green on the near side.
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i];
          const depthFactor = 0.35 + 0.65 * a.depth;
          const alpha = a.frac * a.frac * depthFactor;
          ctx.beginPath();
          ctx.moveTo(pts[i - 1].px, pts[i - 1].py);
          ctx.lineTo(a.px, a.py);
          ctx.strokeStyle = `rgba(${mixBeam(a.depth)},${alpha.toFixed(2)})`;
          ctx.lineWidth = 0.25 + a.frac * 0.75;
          ctx.stroke();
        }
        // Comet head glow (also depth-tinted).
        const head = pts[pts.length - 1];
        const hd = 0.25 + 0.75 * head.depth;
        const headCol = mixBeam(head.depth);
        ctx.beginPath();
        ctx.arc(head.px, head.py, 1.4 * hd, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${headCol},${hd.toFixed(2)})`;
        ctx.shadowColor = `rgb(${headCol})`;
        ctx.shadowBlur = head.depth > 0.5 ? 9 * hd : 2;
        ctx.fill();
      }
      ctx.restore();
      ctx.shadowBlur = 0;

      // Miner dots + labels
      for (const nd of nodes) {
        const p = proj(nd.lat, nd.lng);
        const rgb = nd.online ? accent : danger;
        const label = nd.name.length > 12 ? nd.name.slice(0, 11) + '…' : nd.name;
        if (p.depth >= 0.5) {
          const pulse = nd.online ? 0.7 + 0.3 * Math.sin(now / 900) : 1;
          ctx.beginPath();
          ctx.arc(p.px, p.py, 6 * pulse, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${rgb},0.1)`;
          ctx.fill();
          ctx.beginPath();
          ctx.arc(p.px, p.py, 2.6, 0, Math.PI * 2);
          ctx.fillStyle = `rgb(${rgb})`;
          ctx.shadowColor = `rgb(${rgb})`;
          ctx.shadowBlur = 10;
          ctx.fill();
          ctx.shadowBlur = 0;
          ctx.font = '9px "JetBrains Mono", monospace';
          ctx.fillStyle = `rgba(${rgb},0.9)`;
          ctx.fillText(label, p.px + 6, p.py + 3);
        } else {
          ctx.beginPath();
          ctx.arc(p.px, p.py, 1.6, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${rgb},0.22)`;
          ctx.fill();
          ctx.font = '8px "JetBrains Mono", monospace';
          ctx.fillStyle = `rgba(${rgb},0.28)`;
          ctx.fillText(label, p.px + 5, p.py + 3);
        }
      }

      // Pool hub — flashes when a share-comet lands (hubFlash spike).
      const flash = st.current.hubFlash;
      const fp = proj(HUB_LAT, HUB_LNG);
      const fpD = 0.15 + 0.85 * fp.depth,
        fpP = 0.7 + 0.3 * Math.sin(now / 600);
      // Expanding flash ring
      if (flash > 0.01) {
        ctx.beginPath();
        ctx.arc(fp.px, fp.py, (8 + (1 - flash) * 22) * fpD, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(${beam},${(flash * 0.5 * fp.depth).toFixed(2)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.arc(fp.px, fp.py, (10 + flash * 14) * fpP * fpD, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${gold},${((0.08 + flash * 0.22) * fp.depth).toFixed(2)})`;
      ctx.fill();
      ctx.beginPath();
      ctx.arc(fp.px, fp.py, (4 + flash * 2.5) * fpD, 0, Math.PI * 2);
      ctx.fillStyle = flash > 0.6 ? '#ffffff' : `rgb(${gold})`;
      ctx.shadowColor = flash > 0.4 ? `rgb(${beam})` : `rgb(${gold})`;
      ctx.shadowBlur = (16 + flash * 22) * fp.depth;
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    function tick(dt: number) {
      if (!st.current.dragging) st.current.rotY += 0.02 * dt;
      for (const p of st.current.particles) p.t += p.spd * dt;
      // A comet reaching the hub (t >= 1) triggers the pool flash.
      if (st.current.particles.some((p) => p.t >= 1)) st.current.hubFlash = 1;
      st.current.hubFlash = Math.max(0, st.current.hubFlash - dt * 2.2);
      st.current.particles = st.current.particles.filter((p) => p.t > 0 && p.t < 1);

      const nodes = st.current.nodes;
      const onlineIdx = nodes.map((n, i) => (n.online ? i : -1)).filter((i) => i >= 0);
      if (onlineIdx.length) {
        // Consume pending share-driven emissions, plus a trickle of ambient traffic.
        let emit = 0;
        if (st.current.pendingEmit > 0) {
          emit = Math.min(3, Math.ceil(st.current.pendingEmit));
          st.current.pendingEmit -= emit;
        } else if (Math.random() < 0.08) {
          emit = 1;
        }
        for (let k = 0; k < emit && st.current.particles.length < 120; k++) {
          const ni = onlineIdx[Math.floor(Math.random() * onlineIdx.length)];
          st.current.particles.push({ ni, t: 0.01, spd: 0.35 + Math.random() * 0.25 });
        }
      }
    }

    let last = 0;
    function loop(now: number) {
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      tick(dt);
      draw(now);
      raf = requestAnimationFrame(loop);
    }

    // Inline topojson decoder (from the GOStratum globe) → land outline rings.
    function topoRings(topo: any, objName: string) {
      const {
        scale: [sx, sy],
        translate: [tx, ty],
      } = topo.transform;
      const arcs = topo.arcs.map((arc: number[][]) => {
        let x = 0,
          y = 0;
        return arc.map(([dx, dy]) => {
          x += dx;
          y += dy;
          return [x * sx + tx, y * sy + ty];
        });
      });
      const rings: { lat: number; lng: number }[][] = [];
      const arcPts = (ref: number) => (ref >= 0 ? arcs[ref] : [...arcs[~ref]].reverse());
      const addPoly = (arcRefs: number[][]) => {
        for (const refs of arcRefs) {
          const ring: number[][] = [];
          for (const ref of refs) {
            const pts = arcPts(ref);
            ring.push(...(ring.length ? pts.slice(1) : pts));
          }
          rings.push(ring.map(([lng, lat]) => ({ lat, lng })));
        }
      };
      const walkLand = (g: any) => {
        if (!g) return;
        if (g.type === 'Polygon') addPoly(g.arcs);
        else if (g.type === 'MultiPolygon') for (const poly of g.arcs) addPoly(poly);
        else if (g.type === 'GeometryCollection') g.geometries.forEach(walkLand);
      };
      walkLand(topo.objects[objName]);
      return rings;
    }

    (async () => {
      try {
        const topo = await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2/land-110m.json').then((r) => r.json());
        st.current.landRings = topoRings(topo, 'land');
      } catch (e) {
        console.warn('MiniGlobe: land map load failed:', e);
      }
    })();

    const onDown = (e: MouseEvent) => {
      st.current.dragging = true;
      st.current.lastDragX = e.clientX;
    };
    const onUp = () => {
      st.current.dragging = false;
    };
    const onMove = (e: MouseEvent) => {
      if (!st.current.dragging) return;
      st.current.rotY -= (e.clientX - st.current.lastDragX) * 0.006;
      st.current.lastDragX = e.clientX;
    };
    canvas.addEventListener('mousedown', onDown);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('mousemove', onMove);
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    resize();
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener('mousedown', onDown);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('mousemove', onMove);
      ro.disconnect();
    };
  }, []);

  return (
    <div ref={wrapRef} className="relative w-full h-full min-h-[150px]" title="Fleet share activity">
      <canvas ref={canvasRef} className="block w-full h-full cursor-grab active:cursor-grabbing" />
      <div className="absolute top-1.5 left-0 right-0 text-center text-[9px] text-text-secondary uppercase tracking-widest pointer-events-none">
        Share Uplink
      </div>
    </div>
  );
}
