/* Подключается блокирующим скриптом в <head>: тема ставится до отрисовки, без вспышки светлой. */
(() => {
  let theme = null;
  try {
    theme = localStorage.getItem('alfa_theme');
  } catch {
    /* хранилище недоступно */
  }
  if (theme !== 'dark' && theme !== 'light') {
    theme = window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  document.documentElement.dataset.theme = theme;
})();
