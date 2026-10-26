(() => {
  'use strict';

  const phrases = [
    '今日事，今日毕',
    '路虽远，行则将至',
    '不积跬步，无以至千里',
    '博观而约取，厚积而薄发',
    '但行好事，莫问前程',
    '纸上得来终觉浅，绝知此事要躬行',
    '长风破浪会有时，直挂云帆济沧海',
    '山重水复疑无路，柳暗花明又一村',
    '行到水穷处，坐看云起时',
    '千里之行，始于足下',
    '知不足而奋进，望远山而前行',
    '日日行，不怕千万里',
    '功不唐捐，玉汝于成',
    '心有所向，素履以往',
    '读书不觉已春深，一寸光阴一寸金',
    '沉舟侧畔千帆过，病树前头万木春',
  ];

  function shanghaiDayNumber(now = new Date()) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    }).formatToParts(now);
    const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
    return Math.floor(Date.UTC(
      Number(values.year),
      Number(values.month) - 1,
      Number(values.day),
    ) / 86400000);
  }

  function renderDailySubtitle() {
    const subtitle = document.getElementById('subtitle');
    if (!subtitle) return;
    subtitle.textContent = phrases[shanghaiDayNumber() % phrases.length];
  }

  renderDailySubtitle();
  document.addEventListener('DOMContentLoaded', renderDailySubtitle, { once: true });
  document.addEventListener('pjax:complete', renderDailySubtitle);
})();
