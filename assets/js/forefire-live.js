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
  const ISO_MAX = 6;        // no máximo tantas isócronas por incêndio

  // Tempo de chegada, do carvão (cedo) à brasa clara (tarde): o chão que
  // acabou de pegar fogo é o mais claro. Mesma escala da demo do ForeFire.
  const ARRIVAL = [[42, 15, 46], [138, 28, 60], [226, 71, 12], [255, 166, 43]];

  let worker = null, run = null, next = null, waiting = false;
  let frame = 0, phase = 'idle', phaseAt = 0, visible = false, raf = 0, count = 0;
  let base = null, sat = null, satZoom = 0, land = null, seed = (Math.random() * 1e9) | 0;
  let dpr = 1, failed = false;
  let burn = null, burnTo = -1, labelFont = 'monospace';

  function size() {
    const r = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    if (canvas.width > 1000 && satZoom && satZoom < 16) loadImagery(16);
    base = paintBase();
    burnTo = -1;
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

  function rgb(stops, t) {
    const x = Math.max(0, Math.min(1, t)) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(x)), f = x - i;
    return `rgb(${stops[i].map((v, k) => Math.round(v + (stops[i + 1][k] - v) * f))})`;
  }

  function clock(s) {
    const min = Math.round(s / 60);
    return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`;
  }

  // Uma vez por incêndio: o caminho de cada frame em metros do domínio, a
  // duração (o worker entrega o incêndio inteiro, então a escala de cor já
  // nasce certa) e as isócronas num intervalo redondo.
  function prepare(r) {
    r.paths = r.frames.map((f) => {
      const p = new Path2D();
      for (const c of f.fronts) {
        p.moveTo(c[0], c[1]);
        for (let k = 2; k < c.length; k += 2) p.lineTo(c[k], c[k + 1]);
        p.closePath();
      }
      return p;
    });
    r.tEnd = Math.max(1, r.frames[r.frames.length - 1].t);
    const every = 60 * ([5, 10, 15, 30, 60, 120].find((m) => r.tEnd / (60 * m) <= ISO_MAX) || 240);
    r.isos = [];
    for (let t = every; t < r.tEnd; t += every) {
      const k = r.frames.findIndex((f) => f.t >= t);
      if (k < 0 || !r.frames[k].fronts.length) continue;
      // Rótulo no nó mais ao norte, que raramente fica embaixo de outra linha.
      let top = [0, -Infinity];
      for (const c of r.frames[k].fronts)
        for (let i = 0; i < c.length; i += 2) if (c[i + 1] > top[1]) top = [c[i], c[i + 1]];
      r.isos.push({ frame: k, at: top, text: clock(t) });
    }
    return r;
  }

  // De metros do domínio pra pixels do canvas (o y do domínio cresce pra cima).
  function inMetres(c, sx, sy, H) { c.setTransform(sx, 0, 0, -sy, 0, H * sy); }

  // Área queimada colorida pelo frame em que cada ponto pegou fogo, numa
  // camada à parte. Cada frame novo é pintado por baixo do que já está lá
  // (destination-over), então cada ponto guarda a cor do primeiro frame que o
  // conteve, e a camada inteira entra com uma transparência só.
  function paintBurn(sx, sy, H) {
    if (!burn || burn.width !== canvas.width || burn.height !== canvas.height) {
      burn = document.createElement('canvas');
      burn.width = canvas.width; burn.height = canvas.height;
      burnTo = -1;
    }
    const b = burn.getContext('2d');
    if (frame < burnTo || burnTo < 0) { b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, burn.width, burn.height); burnTo = -1; }
    if (burnTo >= frame) return;
    b.save();
    inMetres(b, sx, sy, H);
    b.globalCompositeOperation = 'destination-over';
    for (let k = burnTo + 1; k <= frame; k++) {
      b.fillStyle = rgb(ARRIVAL, run.frames[k].t / run.tEnd);
      b.fill(run.paths[k], 'evenodd');
    }
    b.restore();
    burnTo = frame;
  }

  function draw(alpha = 1) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    // Antes do primeiro incêndio chegar (ou se o simulador falhou), o canvas fica
    // transparente e aparece o pôster do CSS: um incêndio já terminado.
    if (failed || !run) { ctx.clearRect(0, 0, canvas.width, canvas.height); return; }
    ctx.fillStyle = '#070b08';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (base) ctx.drawImage(base, 0, 0);
    ctx.globalAlpha = alpha;

    const { frames, W, H } = run;
    const sx = canvas.width / W, sy = canvas.height / H;
    const cur = frames[Math.min(frame, frames.length - 1)];
    if (!cur) { ctx.globalAlpha = 1; return; }
    const now = run.paths[frame];

    // Área queimada pelo tempo de chegada.
    paintBurn(sx, sy, H);
    ctx.globalAlpha = 0.62 * alpha;
    ctx.drawImage(burn, 0, 0);
    ctx.globalAlpha = alpha;

    // Isócronas: onde a frente estava em cada horário redondo.
    ctx.save();
    inMetres(ctx, sx, sy, H);
    ctx.lineJoin = 'round';
    ctx.lineWidth = dpr / sx;
    ctx.strokeStyle = 'rgba(255, 255, 255, .5)';
    for (const iso of run.isos) if (iso.frame <= frame) ctx.stroke(run.paths[iso.frame]);

    // Frente ativa com brilho.
    ctx.globalCompositeOperation = 'lighter';
    ctx.shadowColor = 'rgba(242, 106, 27, .9)';
    ctx.shadowBlur = 10 * dpr;
    ctx.strokeStyle = 'rgba(242, 106, 27, .95)';
    ctx.lineWidth = (2 * dpr) / sx;
    ctx.stroke(now);
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 214, 140, .8)';
    ctx.lineWidth = (0.8 * dpr) / sx;
    ctx.stroke(now);
    ctx.restore();

    isoLabels(sx, sy, H);

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

  // Horário de cada isócrona, da mais recente pra mais antiga, sem rótulo em
  // cima de outro nem da rosa dos ventos. Quando o fogo encosta na borda,
  // linhas seguidas dividem o ponto mais ao norte e só a mais recente fica
  // com o rótulo.
  function isoLabels(sx, sy, H) {
    const size = 10.5 * dpr, pad = 6 * dpr;
    const rose = [canvas.width - 52 * dpr, 52 * dpr];
    ctx.save();
    ctx.font = `500 ${size}px ${labelFont}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 3 * dpr;
    ctx.strokeStyle = 'rgba(7, 11, 8, .85)';
    ctx.fillStyle = 'rgba(237, 240, 228, .95)';
    const placed = [];
    for (let i = run.isos.length - 1; i >= 0; i--) {
      const iso = run.isos[i];
      if (iso.frame > frame) continue;
      const w = ctx.measureText(iso.text).width;
      const x = Math.max(w / 2 + pad, Math.min(canvas.width - w / 2 - pad, iso.at[0] * sx));
      let y = (H - iso.at[1]) * sy - 4 * dpr;
      if (y < size + pad) y += size + 8 * dpr; // colado no topo: rótulo por dentro
      if (x + w / 2 > rose[0] && y - size < rose[1]) continue;
      if (placed.some(([px, py, pw]) => Math.abs(px - x) < (pw + w) / 2 + 4 * dpr && Math.abs(py - y) < size + 2 * dpr)) continue;
      placed.push([x, y, w]);
      ctx.strokeText(iso.text, x, y);
      ctx.fillText(iso.text, x, y);
    }
    ctx.restore();
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
    const ha = cur.area / 1e4;
    const t = clock(cur.t);
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
    run = prepare(r); count++;
    burnTo = -1;
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
    labelFont = getComputedStyle(readout).fontFamily || labelFont;
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
      } else if (data.type === 'error') fail(data.message);
    };
    worker.onerror = (e) => fail(e.message);
  }

  function fail(message) {
    failed = true;
    readout.textContent = T.fail;
    console.warn('forefire-live:', message);
    draw();
  }

  new ResizeObserver(size).observe(canvas);
  new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible && !worker) boot();
    if (visible) resume();
  }, { rootMargin: '200px 0px' }).observe(fig);
})();
