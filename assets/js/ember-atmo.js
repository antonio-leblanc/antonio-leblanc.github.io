/* Atmosfera das páginas ember em /alt/: fumaça procedural e fotos decorativas (canvas[data-src]) em dither ordenado,
   reveal no scroll e caixa de detecção entrando quando a moldura aparece. Foto que prova alguma coisa fica fora daqui, crua. */
(function () {
  var BAYER = [0, 32, 8, 40, 2, 34, 10, 42, 48, 16, 56, 24, 50, 18, 58, 26, 12, 44, 4, 36, 14, 46, 6, 38, 60, 28, 52, 20, 62, 30, 54, 22,
               3, 35, 11, 43, 1, 33, 9, 41, 51, 19, 59, 27, 49, 17, 57, 25, 15, 47, 7, 39, 13, 45, 5, 37, 63, 31, 55, 23, 61, 29, 53, 21];
  var PAL = [[60, 12, 0], [170, 46, 0], [242, 106, 27], [242, 181, 68], [246, 236, 222]];
  var skin = getComputedStyle(document.documentElement).getPropertyValue('--atmo').trim();
  if (skin) PAL = skin.split(',').map(function (c) { return c.trim().split(/\s+/).map(Number); });
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function hash(x, y) {
    var h = (x * 374761393 + y * 668265263) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function noise(x, y) {
    var xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
    var u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    var a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  function fbm(x, y) {
    var s = 0, amp = .5;
    for (var o = 0; o < 4; o++) { s += amp * noise(x, y); x *= 2.03; y *= 2.03; amp *= .5; }
    return s;
  }

  function Atmo(canvas) {
    this.c = canvas; this.ctx = canvas.getContext('2d'); this.t = 0; this.on = true; this.last = 0;
    this.fps = +(canvas.dataset.fps || 11);   // atmosfera padrão anda a ~11 qps; data-fps="24" deixa mais fluida
    this.sparks = canvas.hasAttribute('data-sparks') ? +(canvas.dataset.sparks || .55) : 0; this.parts = [];   // faíscas por quadro de 90 ms
    this.glow = +(canvas.dataset.glow || .55);   // força da brasa de baixo
    this.size();
  }
  Atmo.prototype.size = function () {
    var r = this.c.getBoundingClientRect(), scale = innerWidth < 820 ? 3 : 4;
    this.w = this.c.width = Math.max(40, Math.round(r.width / scale));
    this.h = this.c.height = Math.max(24, Math.round(r.height / scale));
    this.img = this.ctx.createImageData(this.w, this.h);
    this.k = 7 / Math.max(this.w, this.h);
  };
  Atmo.prototype.draw = function () {
    var w = this.w, h = this.h, d = this.img.data, k = this.k, t = this.t, n = PAL.length - 1;
    for (var y = 0; y < h; y++) {
      var fy = y / h;                       // 0 no topo, 1 embaixo
      var glow = Math.pow(fy, 1.8) * this.glow;   // brasa vindo de baixo
      for (var x = 0; x < w; x++) {
        var px = x * k, py = y * k + t;     // amostra desce = fumaça sobe
        var warp = fbm(px * .6 + 3.1, py * .6 - t * .3);
        var smoke = fbm(px + warp * 1.6, py);
        var v = glow + Math.max(0, smoke - .38) * (.35 + .9 * fy);
        var q = Math.min(n, Math.max(0, Math.floor(v * n + (BAYER[(y & 7) * 8 + (x & 7)] + .5) / 64)));
        var c = PAL[q], i = (y * w + x) * 4;
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
    }
    this.parts.forEach(function (p) {          // faísca: pixel solto, creme enquanto nova, depois o tom abaixo
      var x = Math.round(p.x), y = Math.round(p.y);
      if (x < 0 || x >= w || y < 0 || y >= h) return;
      var c = PAL[p.life > .55 ? n : n - 1], i = (y * w + x) * 4;
      d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2];
    });
    this.ctx.putImageData(this.img, 0, 0);
  };
  // dt em quadros de 90 ms: a fumaça sobe na mesma velocidade qualquer que seja o fps
  Atmo.prototype.step = function (dt) {
    this.t += .045 * dt;
    if (!this.sparks) return;
    var w = this.w, h = this.h;
    for (var r = this.sparks * dt; r > 0; r--) if (Math.random() < r) this.parts.push({ x: Math.random() * w, y: h - 1, vy: -(.5 + Math.random() * .9), ph: Math.random() * 6, life: 1, decay: .012 + Math.random() * .02 });
    this.parts = this.parts.filter(function (p) {
      p.y += p.vy * dt * 1.6; p.x += Math.sin(p.y * .15 + p.ph) * .35 * dt; p.life -= p.decay * dt;
      return p.life > 0 && p.y > 0;
    });
  };

  var scenes = [];
  document.querySelectorAll('canvas[data-atmo]').forEach(function (c) { var a = new Atmo(c); a.draw(); scenes.push(a); });

  if (!reduce && scenes.length) {
    var vis = new IntersectionObserver(function (es) {
      es.forEach(function (e) { scenes.forEach(function (a) { if (a.c === e.target) a.on = e.isIntersecting; }); });
    });
    scenes.forEach(function (a) { vis.observe(a.c); });
    (function loop(ts) {
      scenes.forEach(function (a) {
        if (ts - a.last < 1000 / a.fps) return;
        var dt = Math.min(3, (ts - a.last) / 90); a.last = ts;
        if (a.on && !document.hidden) { a.step(dt); a.draw(); }
      });
      requestAnimationFrame(loop);
    })(0);
  }
  /* foto usada só como atmosfera (canvas[data-src]): mesmo dither da home alternativa */
  var cache = {};
  function load(src) {
    if (!cache[src]) cache[src] = new Promise(function (ok) { var im = new Image(); im.onload = function () { ok(im); }; im.src = src; });
    return cache[src];
  }
  function ditherPhoto(canvas) {
    var r = canvas.getBoundingClientRect(), scale = innerWidth < 820 ? 3 : 4;
    var w = Math.max(40, Math.round(r.width / scale)), h = Math.max(24, Math.round(r.height / scale));
    load(canvas.dataset.src).then(function (im) {
      canvas.width = w; canvas.height = h;
      var ctx = canvas.getContext('2d');
      var s = Math.max(w / im.width, h / im.height), dw = im.width * s, dh = im.height * s;
      ctx.drawImage(im, (w - dw) / 2, (h - dh) / 2, dw, dh);
      var img = ctx.getImageData(0, 0, w, h), d = img.data, n = PAL.length - 1;
      for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
        var i = (y * w + x) * 4;
        var v = Math.pow((.299 * d[i] + .587 * d[i + 1] + .114 * d[i + 2]) / 255, .9);
        var c = PAL[Math.min(n, Math.max(0, Math.floor(v * n + (BAYER[(y & 7) * 8 + (x & 7)] + .5) / 64)))];
        d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    });
  }
  function photos() { document.querySelectorAll('canvas[data-src]').forEach(ditherPhoto); }
  photos();

  var rt; addEventListener('resize', function () {
    clearTimeout(rt); rt = setTimeout(function () { scenes.forEach(function (a) { a.size(); a.draw(); }); photos(); }, 150);
  });

  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } });
  }, { threshold: .2 });
  document.querySelectorAll('.reveal, [data-proof]').forEach(function (el) { io.observe(el); });
})();
