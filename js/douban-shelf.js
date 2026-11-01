/* Static snapshot first; refresh public Douban records without requiring a deploy. */
(() => {
  'use strict';
  const actions = ['collect', 'do', 'wish'];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const httpsUrl = value => {
    try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
  };
  const labels = { book: ['已读', '在读', '想读'], movie: ['已看', '在看', '想看'] };
  const ratings = { poor: '★☆☆☆☆ 很差', fair: '★★☆☆☆ 较差', good: '★★★☆☆ 还行', great: '★★★★☆ 推荐', best: '★★★★★ 力荐' };

  function displayItem(item, config) {
    const host = config.type === 'movie' ? 'movie' : 'book';
    const id = String(item.alt).match(new RegExp(`^https://${host}\\.douban\\.com/subject/(\\d+)/$`))?.[1];
    const correction = config.metadata_corrections?.[id];
    if (!correction) return item;
    let corrected = item;
    // Match fields independently: upstream may refresh the title before the date.
    if (item.title === correction.stale_title) corrected = { ...corrected, title: correction.title };
    const meta = String(item.meta || '').split(' / ');
    if (correction.stale_publish_date && meta[meta.length - 1] === correction.stale_publish_date) {
      meta[meta.length - 1] = correction.publish_date;
      corrected = { ...corrected, meta: meta.join(' / ') };
    }
    return corrected === item ? item : { ...corrected, correction_source: httpsUrl(correction.source) };
  }

  function normalizeResponse(response, type) {
    if (!response?.success || !Array.isArray(response.result?.comment)) throw new Error('Invalid Douban response');
    return response.result.comment.map(record => {
      const item = record.item;
      if (!item?.title || !/^\d+$/.test(String(item.douban_id))) throw new Error('Invalid Douban item');
      const meta = type === 'book'
        ? [item.author, item.translator, item.press, item.producer]
        : [item.style, item.director, item.writer, item.actor, item.publish_date];
      return {
        title: item.title,
        alt: `https://${type === 'book' ? 'book' : 'movie'}.douban.com/subject/${item.douban_id}/`,
        image: httpsUrl(item.thumbnail), meta: meta.filter(Boolean).join(' / '),
        mark: [record.mark_date, record.label].filter(Boolean).join(' / '),
        rate: ['', 'poor', 'fair', 'good', 'great', 'best'][record.rate] || '', comment: record.comment || '',
      };
    });
  }

  function renderShelf(config, action = 'collect', page = 1) {
    const group = config.data_list.find(group => group.action === action);
    const size = config.page_size || 10;
    const pages = Math.max(1, Math.ceil(group.items.length / size));
    page = Math.max(1, Math.min(page, pages));
    const tabs = config.data_list.map(group => `<button type="button" class="idouban-tab${group.action === action ? ' idouban-tab-active' : ''}" data-action="${group.action}" aria-pressed="${group.action === action}">${labels[config.type][actions.indexOf(group.action)]} (${group.items.length})</button>`).join('');
    const items = group.items.slice((page - 1) * size, page * size).map(item => displayItem(item, config)).map(item => `<article class="idouban-item"><div class="idouban-picture">${httpsUrl(item.image) ? `<img src="${escape(httpsUrl(item.image))}" alt="${escape(item.title)}封面" width="100" height="130" loading="lazy">` : ''}</div><div class="idouban-info"><h2><a href="${escape(httpsUrl(item.alt))}" target="_blank" rel="noopener noreferrer">${escape(item.title)}</a></h2><p class="idouban-meta">${escape(item.meta)}</p>${item.correction_source ? `<p class="idouban-meta">片名或上映日期已据<a href="${escape(item.correction_source)}" target="_blank" rel="noopener noreferrer">影片官网</a>校正</p>` : ''}<p class="idouban-rating">${escape(item.mark)}${ratings[item.rate] ? ' / ' + ratings[item.rate] : ''}</p>${item.comment ? `<p class="idouban-comment">${escape(item.comment)}</p>` : ''}</div></article>`).join('') || '<p class="douban-empty">这个分类还没有记录。</p>';
    const button = (label, target, disabled) => `<button type="button" class="idouban-button" data-page="${target}"${disabled ? ' disabled' : ''}>${label}</button>`;
    const pagination = `<nav class="idouban-pagination" aria-label="清单翻页">${button('首页', 1, page === 1)}${button('上一页', page - 1, page === 1)}<span class="idouban-page-num" role="status">${page} / ${pages}</span>${button('下一页', page + 1, page === pages)}${button('尾页', pages, page === pages)}</nav>`;
    return `<div class="idouban-tabs" role="group" aria-label="阅读或观看状态">${tabs}</div><div class="idouban-items">${items}</div>${pagination}`;
  }

  async function refreshData(config, fetcher = fetch, signal) {
    const base = 'https://mouban.mythsman.com/guest/';
    const request = async route => {
      const response = await fetcher(base + route, { signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
      if (!response.ok) throw new Error('Douban request failed');
      return response.json();
    };
    const user = await request(`check_user?id=${config.douban_id}`);
    if (!user.success) throw new Error('Douban sync unavailable');
    const groups = await Promise.all(actions.map(async action => ({ action, items: normalizeResponse(await request(`user_${config.type}?action=${action}&id=${config.douban_id}`), config.type) })));
    if (!groups[0].items.length) throw new Error('Empty collection response');
    return { ...config, data_list: groups };
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { normalizeResponse, renderShelf, refreshData };
  if (typeof document === 'undefined') return;
  const root = document.getElementById('idouban');
  const snapshot = document.getElementById('douban-snapshot');
  if (!root || !snapshot) return;
  let config = JSON.parse(snapshot.textContent), action = 'collect', page = 1;
  const status = document.getElementById('douban-update-status');
  const refresh = document.getElementById('douban-refresh');
  const render = () => { root.innerHTML = renderShelf(config, action, page); };
  root.addEventListener('click', event => {
    const control = event.target.closest('button');
    if (!control || control.disabled) return;
    const focusSelector = control.dataset.action ? `[data-action="${control.dataset.action}"]` : `[data-page="${control.dataset.page}"]`;
    if (control.dataset.action) { action = control.dataset.action; page = 1; }
    else if (control.dataset.page) page = Number(control.dataset.page);
    else return;
    render();
    // Keep keyboard focus in the controls after rebuilding this small list.
    const next = root.querySelector(focusSelector) || root.querySelector(`[data-action="${action}"]`);
    (next.disabled ? root.querySelector(`[data-action="${action}"]`) : next).focus({ preventScroll: true });
    root.scrollIntoView({ block: 'start', behavior: 'instant' });
  });
  async function update() {
    if (refresh.disabled) return;
    refresh.disabled = true;
    status.textContent = '正在检查更新…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const updated = await refreshData(config, fetch, controller.signal);
      const changed = JSON.stringify(updated.data_list) !== JSON.stringify(config.data_list);
      config = updated;
      page = Math.min(page, Math.max(1, Math.ceil(config.data_list.find(group => group.action === action).items.length / (config.page_size || 10))));
      if (changed) render();
      status.textContent = '已刷新 Mouban 同步清单；书影音资料不保证与豆瓣实时一致。';
    } catch {
      status.textContent = '暂时无法检查更新，已保存的清单仍可浏览。';
    } finally {
      clearTimeout(timeout);
      refresh.disabled = false;
    }
  }
  refresh.addEventListener('click', update);
  update();
})();
