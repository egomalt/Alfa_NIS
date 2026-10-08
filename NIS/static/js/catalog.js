/* Публичный каталог (модуль alfa/catalog): фильтры и поиск выполняет сервер,
   страница получает карточки порциями по кнопке «Загрузить ещё».

   Первый запрос просит ?extras=1 — блоки, которые сервер считает по всему
   каталогу (теги, «популярное»): они не меняются от фильтров. */
import { api, byId, esc, toast } from 'alfa/core';

const SEARCH_DELAY_MS = 300;

export function catalog({ url, key, perPage, gridId, card, empty, params, onTotal, onExtras }) {
  const grid = byId(gridId);
  const loadMoreRow = byId('load-more-row');
  const loadMoreButton = byId('btn-load');
  let items = [];
  let page = 0;
  let request = 0;
  let extrasLoaded = false;

  async function load(reset) {
    const ticket = ++request;
    const query = new URLSearchParams({ page: reset ? 1 : page + 1, per_page: perPage });
    for (const [name, value] of Object.entries(params())) {
      if (value && value !== 'all') query.set(name, value);
    }
    if (!extrasLoaded) query.set('extras', '1');
    loadMoreButton.disabled = true;
    try {
      const data = await api.get(`${url}?${query}`);
      // Ответ на старый запрос пришёл позже нового — например, человек дописал поиск
      if (ticket !== request) return;
      if (data.extras) {
        extrasLoaded = true;
        onExtras?.(data.extras);
      }
      page = data.page;
      items = reset ? data[key] : items.concat(data[key]);
      grid.innerHTML = items.length ? items.map(card).join('') : `<div class="state-msg">${esc(empty())}</div>`;
      loadMoreRow.hidden = page >= data.pages;
      onTotal?.(data.total);
    } catch (error) {
      if (ticket !== request) return;
      if (reset) grid.innerHTML = `<div class="state-msg">${esc(error.message)}</div>`;
      else toast(error.message);
    } finally {
      loadMoreButton.disabled = false;
    }
  }

  let timer;
  loadMoreButton.addEventListener('click', () => load(false));

  return {
    /* Фильтр сменился — список с первой страницы */
    reload: () => load(true),
    /* Поиск: ждём паузы в наборе, чтобы не слать запрос на каждую букву */
    reloadSoon() {
      clearTimeout(timer);
      timer = setTimeout(() => load(true), SEARCH_DELAY_MS);
    },
  };
}

/* Фильтры в адресе, чтобы F5 и ссылка их сохраняли */
export function syncUrl(values) {
  const next = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    if (value && value !== 'all') next.set(name, value);
  }
  history.replaceState(null, '', `${location.pathname}${next.size ? `?${next}` : ''}`);
}
