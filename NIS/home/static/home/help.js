function revealGuide() {
  const target = document.getElementById(location.hash.slice(1));
  if (!target?.matches('details.hp-guide')) return;
  target.open = true;
  target.querySelector('summary').focus({ preventScroll: true });
}

addEventListener('hashchange', revealGuide);
revealGuide();
