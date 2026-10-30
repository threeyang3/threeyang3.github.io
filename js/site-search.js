/* Metadata-aware local search. Shared ranking functions are exercised in Node. */
(function () {
  const tokenize = query => [...new Set(query.trim().toLowerCase().split(/[\s\-]+/).filter(Boolean))];
  const lower = value => String(value || '').toLowerCase();
  function rankEntries(entries, query) {
    const words = tokenize(query);
    if (!words.length) return [];
    return entries.map(entry => {
      const title = lower(entry.title), tags = [...entry.tags, ...(entry.aliases || [])].map(lower), categories = entry.categories.map(lower);
      const summary = lower(entry.summary), content = lower(entry.content);
      let score = 0, reason = '';
      for (const word of words) {
        if (title.includes(word)) { score += title === word ? 150 : 100; reason ||= '标题匹配'; }
        else if (tags.some(tag => tag.includes(word))) { score += tags.includes(word) ? 80 : 60; reason ||= '标签匹配'; }
        else if (categories.some(category => category.includes(word))) { score += 50; reason ||= '分类匹配'; }
        else if (summary.includes(word)) { score += 25; reason ||= '摘要匹配'; }
        else if (content.includes(word)) { score += 10; reason ||= '正文匹配'; }
        else return null;
      }
      return { entry, score, reason };
    }).filter(Boolean).sort((a, b) => b.score - a.score || b.entry.date.localeCompare(a.entry.date) || a.entry.title.localeCompare(b.entry.title, 'zh-CN'));
  }
  function snippet(entry, query) {
    const content = entry.content || '';
    const word = tokenize(query).find(word => lower(content).includes(word));
    if (!word) return entry.summary;
    const index = lower(content).indexOf(word);
    const start = Math.max(0, index - 25);
    return (start ? '…' : '') + content.slice(start, start + 110) + (content.length > start + 110 ? '…' : '');
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = { tokenize, rankEntries, snippet };
  if (typeof window === 'undefined') return;

  window.addEventListener('load', () => {
    const root = document.getElementById('local-search');
    if (!root) return;
    const dialog = root.querySelector('.search-dialog');
    const input = root.querySelector('input');
    const results = document.getElementById('local-search-results');
    const stats = document.getElementById('local-search-stats');
    const loading = document.getElementById('loading-database');
    const mask = document.getElementById('search-mask');
    const closeButton = root.querySelector('.search-close-button');
    const spinner = document.getElementById('loading-status');
    let entries = null, pending = null, previousFocus = null, shown = 10, timer;
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', '搜索文章');
    input.setAttribute('aria-label', '搜索文章、分类或标签');
    input.setAttribute('placeholder', '输入书名、文章名或主题');
    input.setAttribute('aria-controls', 'local-search-results');
    input.setAttribute('type', 'search');
    closeButton.setAttribute('aria-label', '关闭搜索');
    stats.setAttribute('role', 'status');
    stats.setAttribute('aria-live', 'polite');
    loading.hidden = true;

    const el = (tag, className, value) => {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (value) node.textContent = value;
      return node;
    };
    function highlight(node, value, query) {
      const words = tokenize(query).sort((a, b) => b.length - a.length);
      const pattern = words.map(word => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
      if (!pattern) { node.textContent = value; return; }
      const regex = new RegExp(pattern, 'gi');
      let start = 0;
      for (const match of value.matchAll(regex)) {
        node.append(document.createTextNode(value.slice(start, match.index)), el('mark', 'search-keyword', match[0]));
        start = match.index + match[0].length;
      }
      node.append(document.createTextNode(value.slice(start)));
    }
    function guidance(message) {
      results.replaceChildren();
      const box = el('div', 'discovery-search-empty');
      box.append(el('p', '', message));
      for (const word of ['科幻', '成长', '写作']) {
        const button = el('button', '', word);
        button.type = 'button';
        button.addEventListener('click', () => { input.value = word; shown = 10; render(); input.focus(); });
        box.append(button);
      }
      const paragraph = el('p');
      const link = el('a', '', '也可以按主题、分类或时间浏览');
      link.href = '/articles/'; paragraph.append(link); box.append(paragraph); results.append(box);
    }
    function render() {
      const query = input.value.trim();
      if (!query) { guidance('可以搜索文章标题、正文、分类和标签。试试下面的主题：'); stats.textContent = ''; return; }
      if (!entries) return;
      const ranked = rankEntries(entries, query);
      if (!ranked.length) { guidance(`没有找到“${query}”。可以缩短关键词，或换一个主题。`); stats.textContent = '0 篇文章'; return; }
      const list = el('ol', 'discovery-search-results');
      ranked.slice(0, shown).forEach(({ entry, reason }) => {
        const item = el('li'), link = el('a'), title = el('h3'), excerpt = el('p');
        link.href = entry.url;
        highlight(title, entry.title, query);
        highlight(excerpt, snippet(entry, query), query);
        link.append(title, el('div', 'discovery-search-meta', `${entry.categories.join(' / ')}　${entry.date}　${reason}${entry.locked ? ' · 需密码' : ''}`), excerpt);
        item.append(link); list.append(item);
      });
      results.replaceChildren(list);
      if (ranked.length > shown) {
        const more = el('button', 'discovery-search-more', '显示更多结果'); more.type = 'button';
        more.addEventListener('click', () => { const next = shown; shown += 10; render(); results.querySelectorAll('li a')[next]?.focus(); });
        results.append(more);
      }
      stats.textContent = `找到 ${ranked.length} 篇文章，已显示 ${Math.min(shown, ranked.length)} 篇`;
    }
    async function load() {
      if (entries) return;
      if (pending) return pending;
      loading.hidden = false;
      loading.textContent = '正在加载文章索引…';
      pending = (async () => {
        try {
          const response = await fetch('/search-discovery.json');
          if (!response.ok) throw new Error('index unavailable');
          entries = await response.json();
          loading.hidden = true;
          render();
        } catch {
          loading.hidden = true;
          results.replaceChildren(el('p', 'discovery-search-empty', '文章索引暂时未能加载，请重试或前往文章索引页。'));
          const retry = el('button', 'discovery-search-more', '重新加载'); retry.type = 'button';
          retry.addEventListener('click', () => load()); results.append(retry);
          const link = el('a', '', '浏览文章索引'); link.href = '/articles/'; results.append(link);
          stats.textContent = '搜索暂时不可用';
        } finally { pending = null; }
      })();
      return pending;
    }
    function close() {
      dialog.style.display = 'none'; mask.style.display = 'none';
      window.btf.overflowPaddingR.remove();
      document.removeEventListener('keydown', keyboard);
      previousFocus?.focus();
    }
    function keyboard(event) {
      if (event.key === 'Escape') { event.preventDefault(); close(); }
      if (event.key === 'Tab') {
        const focusable = [...dialog.querySelectorAll('a, button, input')].filter(node => !node.hidden && node.getClientRects().length);
        const first = focusable[0], last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
      }
    }
    function open() {
      previousFocus = document.activeElement;
      window.btf.overflowPaddingR.add();
      dialog.style.display = 'flex'; mask.style.display = 'block';
      dialog.style.opacity = '1'; mask.style.opacity = '1';
      render(); input.focus(); load();
      document.addEventListener('keydown', keyboard);
    }
    function bind() {
      const button = document.querySelector('#search-button .search');
      if (button && !button.dataset.searchBound) { button.dataset.searchBound = 'true'; button.addEventListener('click', open); }
    }
    closeButton.addEventListener('click', close);
    mask.addEventListener('click', close);
    input.addEventListener('input', () => { clearTimeout(timer); shown = 10; timer = setTimeout(render, 150); });
    input.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        clearTimeout(timer);
        render();
        results.querySelector('li a')?.click();
      }
    });
    spinner.hidden = true;
    bind(); document.addEventListener('pjax:complete', bind);
  });
})();

/* Progressive enhancements; every reading route also works without JavaScript. */
(() => {
  if (typeof document === 'undefined') return;
  const setup = () => {
    const nav = document.getElementById('nav');
    if (nav) {
      const current = decodeURI(location.pathname);
      document.querySelectorAll('#nav .menus_items a, #sidebar-menus .menus_items a').forEach(link => {
        const target = decodeURI(link.pathname);
        link.removeAttribute('aria-current');
        const section = target !== '/' && current.startsWith(target);
        const indexSection = target === '/articles/' && /^\/(topics|tags|archives|categories)\//.test(current) && !/^\/categories\/(随笔|评论|技术|笔记)\//.test(current);
        if (current === target || section || indexSection) link.setAttribute('aria-current', current === target ? 'page' : 'location');
      });
      for (const [selector, label] of [['#search-button .search', '搜索文章'], ['#toggle-menu .site-page', '打开导航菜单']]) {
        const control = nav.querySelector(selector);
        if (!control || control.dataset.accessible) continue;
        control.dataset.accessible = 'true';
        control.setAttribute('role', 'button');
        control.setAttribute('tabindex', '0');
        control.setAttribute('aria-label', label);
        if (selector.includes('toggle-menu')) control.setAttribute('aria-controls', 'sidebar-menus');
        control.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); control.click(); }
        });
      }
      nav.querySelectorAll('.menus_item > .group').forEach(control => {
        if (control.dataset.accessible) return;
        control.dataset.accessible = 'true';
        control.setAttribute('tabindex', '0');
        control.setAttribute('role', 'button');
        control.setAttribute('aria-expanded', 'false');
        const item = control.parentElement;
        const toggle = open => {
          item.classList.toggle('discovery-menu-open', open);
          control.setAttribute('aria-expanded', String(open));
        };
        control.addEventListener('click', () => toggle(!item.classList.contains('discovery-menu-open')));
        control.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); control.click(); }
          if (event.key === 'Escape') toggle(false);
        });
        item.addEventListener('focusout', event => { if (!item.contains(event.relatedTarget)) toggle(false); });
      });
    }
    const filter = document.getElementById('tag-filter');
    if (filter && !filter.dataset.ready) {
      filter.dataset.ready = 'true';
      filter.addEventListener('input', () => {
        const query = filter.value.trim().toLowerCase();
        let count = 0;
        document.querySelectorAll('#discovery-tags [data-tag]').forEach(link => {
          link.hidden = !link.dataset.tag.includes(query);
          if (!link.hidden) count++;
        });
        document.querySelectorAll('#discovery-tags .discovery-tag-group').forEach(group => { group.hidden = ![...group.querySelectorAll('[data-tag]')].some(link => !link.hidden); });
        const extra = document.querySelector('#discovery-tags details');
        if (extra) { extra.open = Boolean(query); extra.hidden = ![...extra.querySelectorAll('[data-tag]')].some(link => !link.hidden); }
        document.getElementById('tag-filter-status').textContent = query ? (count ? `找到 ${count} 个标签` : '没有匹配标签，可以缩短关键词或浏览精选主题。') : '';
      });
    }
  };
  document.addEventListener('DOMContentLoaded', setup);
  document.addEventListener('pjax:complete', setup);
})();
