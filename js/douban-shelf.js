/* Published snapshot; collection updates run locally in Blog Control Room. */
(() => {
  'use strict';
  const actions = ['collect', 'do', 'wish'];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const httpsUrl = value => {
    try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
  };
  const imageUrl = value => /^\/img\/douban\/[a-f0-9]{64}\.jpg$/.test(value) ? value : httpsUrl(value);
  const labels = { book: ['已读', '在读', '想读'], movie: ['已看', '在看', '想看'] };
  const ratings = { poor: '★☆☆☆☆ 很差', fair: '★★☆☆☆ 较差', good: '★★★☆☆ 还行', great: '★★★★☆ 推荐', best: '★★★★★ 力荐' };

  function snapshotStatus(config) {
    if (config.source !== 'douban' || !config.synced_at) return '尚未完成豆瓣直连同步，暂时显示历史第三方快照，资料可能滞后。';
    const date = new Date(config.synced_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
    return `豆瓣公开清单快照 · 核对时间：${date}（北京时间）；非实时更新。`;
  }

  function renderShelf(config, action = 'collect', page = 1) {
    const group = config.data_list.find(group => group.action === action);
    const size = config.page_size || 10;
    const pages = Math.max(1, Math.ceil(group.items.length / size));
    page = Math.max(1, Math.min(page, pages));
    const tabs = config.data_list.map(group => `<button type="button" class="idouban-tab${group.action === action ? ' idouban-tab-active' : ''}" data-action="${group.action}" aria-pressed="${group.action === action}">${labels[config.type][actions.indexOf(group.action)]} (${group.items.length})</button>`).join('');
    const items = group.items.slice((page - 1) * size, page * size).map(item => `<article class="idouban-item"><div class="idouban-picture">${imageUrl(item.image) ? `<img src="${escape(imageUrl(item.image))}" alt="${escape(item.title)}封面" width="100" height="130" loading="lazy">` : ''}</div><div class="idouban-info"><h2><a href="${escape(httpsUrl(item.alt))}" target="_blank" rel="noopener noreferrer">${escape(item.title)}</a></h2><p class="idouban-meta">${escape(item.meta)}</p><p class="idouban-rating">${escape(item.mark)}${ratings[item.rate] ? ' / ' + ratings[item.rate] : ''}</p>${item.comment ? `<p class="idouban-comment">${escape(item.comment)}</p>` : ''}</div></article>`).join('') || '<p class="douban-empty">这个分类还没有记录。</p>';
    const button = (label, target, disabled) => `<button type="button" class="idouban-button" data-page="${target}"${disabled ? ' disabled' : ''}>${label}</button>`;
    const pagination = `<nav class="idouban-pagination" aria-label="清单翻页">${button('首页', 1, page === 1)}${button('上一页', page - 1, page === 1)}<span class="idouban-page-num" role="status">${page} / ${pages}</span>${button('下一页', page + 1, page === pages)}${button('尾页', pages, page === pages)}</nav>`;
    return `<div class="idouban-tabs" role="group" aria-label="阅读或观看状态">${tabs}</div><div class="idouban-items">${items}</div>${pagination}`;
  }

  if (typeof module !== 'undefined' && module.exports) module.exports = { renderShelf, snapshotStatus };
  if (typeof document === 'undefined') return;
  const root = document.getElementById('idouban');
  const snapshot = document.getElementById('douban-snapshot');
  if (!root || !snapshot) return;
  let config = JSON.parse(snapshot.textContent), action = 'collect', page = 1;
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
})();
