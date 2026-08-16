(function () {
  var KEY = 'al-lang-pref';
  var path = location.pathname;
  var here = (path === '/pt/' || path.indexOf('/pt/') === 0) ? 'pt' : 'en';
  var isHome = (path === '/' || path === '/pt/');

  document.querySelectorAll('.lang-link').forEach(function (a) {
    a.addEventListener('click', function () {
      var href = a.getAttribute('href') || '';
      var target = href.indexOf('/pt/') === 0 ? 'pt' : 'en';
      try { localStorage.setItem(KEY, target); } catch (e) {}
    });
  });

  if (!isHome) return;

  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) {}

  if (stored) {
    if (stored !== here) location.replace(stored === 'pt' ? '/pt/' : '/');
    return;
  }

  if (here === 'en' && navigator.language && navigator.language.toLowerCase().indexOf('pt') === 0) {
    location.replace('/pt/');
  }
})();
