// Rolagem com inércia (Lenis) e deslize das imagens [data-drift]. Desligado com prefers-reduced-motion.
(function () {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.Lenis) new Lenis({ lerp: .09, autoRaf: true, anchors: true });
  var drift = [].slice.call(document.querySelectorAll('[data-drift]')), queued = false;
  if (!drift.length) return;
  var place = function () {
    queued = false;
    var vh = innerHeight;
    drift.forEach(function (c) {
      var b = c.parentNode.getBoundingClientRect();
      if (b.bottom < 0 || b.top > vh) return;
      var n = Math.max(-1, Math.min(1, (b.top + b.height / 2 - vh / 2) / (vh / 2 + b.height / 2)));
      c.style.setProperty('--py', (-n * b.height * .09).toFixed(1) + 'px');
    });
  };
  addEventListener('scroll', function () { if (!queued) { queued = true; requestAnimationFrame(place); } }, { passive: true });
  addEventListener('resize', place);
  place();
})();
