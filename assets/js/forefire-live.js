// Incêndio ao vivo na página do ForeFire: o simulador compilado pra WebAssembly
// roda num worker (assets/forefire/live-worker.js) e esta página só desenha,
// sobre a imagem de satélite da Esri de Ostriconi, Córsega. Começa quando o
// quadro aparece na tela e pausa quando sai. Com prefers-reduced-motion,
// mostra o fogo já terminado, sem animar.

(() => {
  const fig = document.querySelector('[data-forefire-live]');
  if (!fig || !('WebAssembly' in window) || !('Worker' in window)) return;

  const canvas = fig.querySelector('canvas');
  const ctx = canvas.getContext('2d');
  const readout = fig.querySelector('[data-readout]');
  const counter = fig.querySelector('[data-counter]');
  const pt = document.documentElement.lang.startsWith('pt');
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const T = pt
    ? { loading: 'Carregando o simulador…', wind: 'vento', fire: 'fogo nº', fail: 'O simulador não carregou neste navegador',
        end: { edge: 'saiu do quadro', out: 'apagou', stalled: 'parou', limit: '' } }
    : { loading: 'Loading the simulator…', wind: 'wind', fire: 'fire no.', fail: 'The simulator did not load in this browser',
        end: { edge: 'left the frame', out: 'burnt out', stalled: 'stalled', limit: '' } };

  // Mesmo domínio de assets/forefire/live-core.js (3,2 × 1,8 km).
  const BBOX = { w: 9.050452725402764, s: 42.65991519942508, e: 9.089547274597237, n: 42.67608480057492 };
  const NX = 240, NY = 135;
  const TILES = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

  const FPS = 14;           // passos de simulação por segundo de tela
  const HOLD = 2600;        // ms parado no fim antes do próximo
  const FADE = 700;
  const ISO_EVERY = 10;     // uma isócrona a cada N passos (5 min)

  let worker = null, run = null, next = null, waiting = false;
  let frame = 0, phase = 'idle', phaseAt = 0, visible = false, raf = 0, count = 0;
  let base = null, sat = null, satZoom = 0, land = null, seed = (Math.random() * 1e9) | 0;
  let dpr = 1;

  function size() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    if (canvas.width > 1000 && satZoom && satZoom < 16) loadImagery(16);
    base = paintBase();
    draw();
  }

  // ---- fundo ----

  function tileXY(lat, lon, z) {
    const n = 2 ** z, r = (lat * Math.PI) / 180;
    return [((lon + 180) / 360) * n, ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n];
  }

  // Mosaico de tiles da Esri recortado no domínio. z15 tem ~3,5 m/px, o
  // bastante pro quadro na coluna; tela larga ou retina pede z16.
  function loadImagery(z) {
    satZoom = z;
    const [x0, y0] = tileXY(BBOX.n, BBOX.w, z);
    const [x1, y1] = tileXY(BBOX.s, BBOX.e, z);
    const out = document.createElement('canvas');
    out.width = Math.round((x1 - x0) * 256);
    out.height = Math.round((y1 - y0) * 256);
    const o = out.getContext('2d');
    const jobs = [];
    for (let tx = Math.floor(x0); tx <= Math.floor(x1); tx++) {
      for (let ty = Math.floor(y0); ty <= Math.floor(y1); ty++) {
        jobs.push(new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => { o.drawImage(img, (tx - x0) * 256, (ty - y0) * 256); resolve(); };
          img.onerror = reject;
          img.src = `${TILES}/${z}/${ty}/${tx}`;
        }));
      }
    }
    Promise.all(jobs).then(() => {
      if (z !== satZoom) return;
      sat = out;
      base = paintBase();
      draw();
    }, () => {}); // sem satélite fica o relevo sombreado
  }

  // Sem satélite (offline, bloqueado): relevo sombreado sobre a cor do
  // combustível, a partir do mesmo arquivo que a simulação usa.
  function hillshade() {
    const img = new ImageData(NX, NY);
    const colors = { 5: [28, 54, 30], 4: [58, 62, 34], 0: [10, 22, 30] };
    const cell = 3200 / NX, a = land.altitude;
    for (let y = 0; y < NY; y++) {
      for (let x = 0; x < NX; x++) {
        const dzx = (a[y * NX + Math.min(NX - 1, x + 1)] - a[y * NX + Math.max(0, x - 1)]) / (2 * cell);
        const dzy = (a[Math.min(NY - 1, y + 1) * NX + x] - a[Math.max(0, y - 1) * NX + x]) / (2 * cell);
        const shade = Math.max(0.35, Math.min(1.4, 1 + 2.2 * (-dzx * 0.7 + dzy * 0.7)));
        const c = colors[land.fuel[y * NX + x]] || colors[0];
        const o = ((NY - 1 - y) * NX + x) * 4;
        img.data[o] = c[0] * shade; img.data[o + 1] = c[1] * shade; img.data[o + 2] = c[2] * shade; img.data[o + 3] = 255;
      }
    }
    const small = document.createElement('canvas');
    small.width = NX; small.height = NY;
    small.getContext('2d').putImageData(img, 0, 0);
    return small;
  }

  function paintBase() {
    const src = sat || (land && hillshade());
    if (!src || !canvas.width) return null;
    const big = document.createElement('canvas');
    big.width = canvas.width; big.height = canvas.height;
    const b = big.getContext('2d');
    b.imageSmoothingEnabled = true;
    b.imageSmoothingQuality = 'high';
    b.drawImage(src, 0, 0, big.width, big.height);
    // Escurece um pouco pra a frente de fogo ser o que mais brilha, e assenta
    // a foto no verde-noite da página.
    b.fillStyle = 'rgba(7, 11, 8, .32)';
    b.fillRect(0, 0, big.width, big.height);
    const g = b.createRadialGradient(big.width / 2, big.height / 2, big.height * 0.35, big.width / 2, big.height / 2, big.width * 0.7);
    g.addColorStop(0, 'rgba(7,11,8,0)');
    g.addColorStop(1, 'rgba(7,11,8,.5)');
    b.fillStyle = g;
    b.fillRect(0, 0, big.width, big.height);
    return big;
  }

  // ---- fogo ----

  function path(fronts, sx, sy, H) {
    const p = new Path2D();
    for (const f of fronts) {
      p.moveTo(f[0] * sx, (H - f[1]) * sy);
      for (let k = 2; k < f.length; k += 2) p.lineTo(f[k] * sx, (H - f[k + 1]) * sy);
      p.closePath();
    }
    return p;
  }

  function draw(alpha = 1) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#070b08';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (base) ctx.drawImage(base, 0, 0);
    if (!run) return;
    ctx.globalAlpha = alpha;

    const { frames, W, H } = run;
    const sx = canvas.width / W, sy = canvas.height / H;
    const cur = frames[Math.min(frame, frames.length - 1)];
    if (!cur) { ctx.globalAlpha = 1; return; }

    // Área queimada.
    const now = path(cur.fronts, sx, sy, H);
    ctx.fillStyle = 'rgba(22, 9, 4, .72)';
    ctx.fill(now, 'evenodd');

    // Isócronas: onde a frente estava a cada 5 min, do ouro (recente) pra
    // brasa escura (antigo).
    ctx.lineJoin = 'round';
    for (let k = ISO_EVERY; k < frame; k += ISO_EVERY) {
      const age = (frame - k) / Math.max(1, frame);
      ctx.strokeStyle = `rgba(${Math.round(242 - 110 * age)}, ${Math.round(160 - 115 * age)}, ${Math.round(70 - 45 * age)}, ${0.6 - 0.3 * age})`;
      ctx.lineWidth = 1 * dpr;
      ctx.stroke(path(frames[k - 1].fronts, sx, sy, H));
    }

    // Frente ativa com brilho.
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = 'rgba(242, 106, 27, .9)';
    ctx.shadowBlur = 10 * dpr;
    ctx.strokeStyle = 'rgba(242, 106, 27, .95)';
    ctx.lineWidth = 2 * dpr;
    ctx.stroke(now);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 214, 140, .8)';
    ctx.lineWidth = 0.8 * dpr;
    ctx.stroke(now);
    ctx.restore();

    // Ponto de ignição.
    const [ix, iy] = run.sc.ignition;
    const px = ix * sx, py = (H - iy) * sy, s = 4 * dpr;
    ctx.strokeStyle = 'rgba(200, 220, 122, .9)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.moveTo(px - s, py); ctx.lineTo(px + s, py);
    ctx.moveTo(px, py - s); ctx.lineTo(px, py + s);
    ctx.stroke();

    windRose(cur);
    ctx.globalAlpha = 1;
  }

  function windRose(cur) {
    const r = 16 * dpr, cx = canvas.width - 28 * dpr, cy = 28 * dpr;
    const rad = (cur.windDeg * Math.PI) / 180;
    const dx = Math.cos(rad), dy = -Math.sin(rad);
    ctx.save();
    ctx.fillStyle = 'rgba(7, 11, 8, .45)';
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(237, 240, 228, .35)';
    ctx.lineWidth = 1.2 * dpr;
    ctx.stroke();
    ctx.strokeStyle = 'rgba(237, 240, 228, .85)';
    ctx.fillStyle = 'rgba(237, 240, 228, .85)';
    ctx.beginPath();
    ctx.moveTo(cx - dx * r * 0.7, cy - dy * r * 0.7);
    ctx.lineTo(cx + dx * r * 0.45, cy + dy * r * 0.45);
    ctx.stroke();
    ctx.beginPath();
    const hx = cx + dx * r * 0.75, hy = cy + dy * r * 0.75;
    ctx.moveTo(hx, hy);
    ctx.lineTo(hx - dx * 7 * dpr - dy * 4 * dpr, hy - dy * 7 * dpr + dx * 4 * dpr);
    ctx.lineTo(hx - dx * 7 * dpr + dy * 4 * dpr, hy - dy * 7 * dpr - dx * 4 * dpr);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function text() {
    if (!run) return;
    const cur = run.frames[Math.min(frame, run.frames.length - 1)];
    if (!cur) return;
    const min = Math.round(cur.t / 60);
    const ha = cur.area / 1e4;
    const t = min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
    const ended = phase === 'hold' && T.end[run.end] ? ` · ${T.end[run.end]}` : '';
    readout.textContent = `t ${t} · ${ha.toFixed(ha < 10 ? 1 : 0)} ha · ${T.wind} ${Math.round(cur.speed * 3.6)} km/h${ended}`;
    counter.textContent = `${T.fire} ${count}`;
  }

  // ---- ciclo ----

  function request() {
    if (waiting || next) return;
    waiting = true;
    worker.postMessage({ type: 'run', seed: seed++ });
  }

  function begin(r) {
    run = r; count++;
    frame = still ? r.frames.length - 1 : 0;
    phase = still ? 'hold' : 'play';
    phaseAt = performance.now();
    text(); draw();
    if (!still) request();
  }

  function tick(now) {
    raf = 0;
    if (!visible || !run) return;
    if (phase === 'play') {
      const f = Math.floor(((now - phaseAt) / 1000) * FPS);
      if (f !== frame) { frame = Math.min(f, run.frames.length - 1); text(); draw(); }
      if (frame >= run.frames.length - 1) { phase = 'hold'; phaseAt = now; text(); }
    } else if (phase === 'hold' && now - phaseAt > HOLD && next) {
      phase = 'fade'; phaseAt = now;
    } else if (phase === 'fade') {
      const a = 1 - (now - phaseAt) / FADE;
      if (a <= 0) { const r = next; next = null; begin(r); }
      else draw(a);
    }
    raf = requestAnimationFrame(tick);
  }

  function resume() {
    if (phase === 'play') phaseAt = performance.now() - (frame / FPS) * 1000;
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function boot() {
    readout.textContent = T.loading;
    loadImagery(canvas.width > 1000 ? 16 : 15);
    fetch('/assets/forefire/ostriconi.bin').then((r) => r.arrayBuffer()).then((b) => {
      const n = NX * NY;
      land = { fuel: new Uint8Array(b, 0, n), altitude: new Int16Array(b.slice(n, n * 3)) };
      if (!sat) { base = paintBase(); draw(); }
    }, () => {});
    worker = new Worker('/assets/forefire/live-worker.js', { type: 'module' });
    worker.onmessage = ({ data }) => {
      if (data.type === 'ready') request();
      else if (data.type === 'run') {
        waiting = false;
        if (!run) begin(data); else next = data;
        if (visible) resume();
      } else if (data.type === 'error') {
        readout.textContent = T.fail;
        console.warn('forefire-live:', data.message);
      }
    };
    worker.onerror = (e) => { readout.textContent = T.fail; console.warn('forefire-live:', e.message); };
  }

  new ResizeObserver(size).observe(canvas);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !worker) boot();
    if (visible) resume();
  }, { rootMargin: '200px 0px' }).observe(fig);
})();
