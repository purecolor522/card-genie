'use strict';

const CARDS = window.CARDS;
const SCENARIOS = window.SCENARIOS;
const EFFORT_LABEL = window.EFFORT_LABEL;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

/* ===== 畫面切換 =====
 * 每次換頁都 pushState，讓 Android 實體返回鍵／瀏覽器上一頁能回到前一個畫面，
 * 而不是直接離開 app。state 形如 { view, scene?, card?, scrollY? }。
 */
const HOME = { view: 'view-home' };

function showView(id, scrollY = 0) {
  $$('.view').forEach(v => v.classList.remove('view-active'));
  const v = document.getElementById(id);
  if (v) {
    v.classList.add('view-active');
    window.scrollTo({ top: scrollY, behavior: 'instant' });
  }
}

function isValidState(s) {
  if (!s || !s.view) return false;
  if (s.view === 'view-scene') return SCENARIOS.some(x => x.id === s.scene);
  if (s.view === 'view-card') return CARDS.some(x => x.id === s.card);
  return s.view === 'view-all' || s.view === 'view-home';
}

// force=true：主動點進來的新頁面一律重繪；返回時（force=false）沿用既有畫面
function render(state, force = false) {
  const s = isValidState(state) ? state : HOME;
  if (s.view === 'view-scene') renderScene(s.scene, force);
  else if (s.view === 'view-all') renderAll();
  else if (s.view === 'view-card') renderCard(s.card, force);
  showView(s.view, s.scrollY || 0);
}

function navigate(state) {
  // 離開前記住目前捲動位置，返回時還原
  history.replaceState({ ...(history.state || HOME), scrollY: window.scrollY }, '');
  history.pushState(state, '');
  render(state, true);
}

function back() {
  if (history.state && history.state.view !== 'view-home') history.back();
  else render(HOME);
}

function openScene(sceneId) { navigate({ view: 'view-scene', scene: sceneId }); }
function openAll() { navigate({ view: 'view-all' }); }
function openCard(id) { navigate({ view: 'view-card', card: id }); }

/* ===== 資料過期提醒 =====
 * 每張卡的 validUntil 是計入回饋率的條件中最早到期的日期；過了這天就提醒資料可能不準。
 * 預覽用：網址加上 ?today=2027-01-05 可以模擬日期。
 */
function localToday() {
  const q = new URLSearchParams(location.search).get('today');
  if (q && /^\d{4}-\d{2}-\d{2}$/.test(q)) return q;
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const TODAY = localToday();
const fmtDate = (s) => (s || '').replace(/-/g, '/');
const isExpired = (card) => Boolean(card.validUntil) && card.validUntil < TODAY;

function renderFreshness() {
  const verifiedAt = (window.DATA_META || {}).verifiedAt;
  const expired = CARDS.filter(isExpired);
  const earliest = CARDS.map(c => c.validUntil).filter(Boolean).sort()[0];

  const foot = $('#data-freshness');
  if (foot && verifiedAt) {
    foot.textContent = `資料查證：${fmtDate(verifiedAt)}` +
      (expired.length === CARDS.length ? '（權益已過期）'
        : expired.length ? '（部分權益已過期）'
        : earliest ? `（權益至 ${fmtDate(earliest)}）` : '');
  }

  const banner = $('#stale-banner');
  if (!banner) return;
  if (!expired.length) { banner.hidden = true; return; }
  const dates = [...new Set(expired.map(c => c.validUntil))].sort().map(fmtDate).join('、');
  const who = expired.length === CARDS.length
    ? `全部 ${CARDS.length} 張卡`
    : `${expired.length} 張卡（${expired.map(c => c.bankShort + ' ' + c.name).join('、')}）`;
  banner.innerHTML = `
    <strong>⚠ 資料可能已過期</strong>
    <p>${who}的權益已於 ${dates} 到期${verifiedAt ? `，資料查證於 ${fmtDate(verifiedAt)}` : ''}。排名可能不準，刷卡前請以銀行最新公告為準。</p>
  `;
  banner.hidden = false;
}

/* ===== 卡面樣式 ===== */
function cardFaceStyle(card) {
  const c = card.palette || [card.accent, card.accent];
  const c1 = c[0];
  const c2 = c[c.length - 1] || c[0];
  return `--c1:${c1};--c2:${c2}; background: linear-gradient(135deg, ${c1}, ${c2});`;
}

/* ===== 排名：回饋率高者優先，同分時操作越少越前面 =====
 * 首頁「最高 X%」與情境排名頁共用同一套規則，避免兩邊顯示不同張卡。
 */
function rankCardsFor(sceneId) {
  return CARDS
    .map(c => ({ card: c, s: c.scenarios[sceneId] }))
    .sort((a, b) => {
      if (b.s.rate !== a.s.rate) return b.s.rate - a.s.rate;
      return a.s.effort - b.s.effort;
    });
}

/* ===== 渲染：情境格 ===== */
function renderSceneCard(s) {
  const best = rankCardsFor(s.id)[0];
  return `
    <button class="scene-card" data-scene="${s.id}">
      <span class="scene-emoji">${s.emoji}</span>
      <div class="scene-label">${s.label}</div>
      <div class="scene-desc">${s.desc}</div>
      <div class="scene-best">最高 <b>${best.s.rate}%</b> · ${best.card.bankShort}${best.card.name}</div>
    </button>
  `;
}
function renderSceneGrid() {
  const mode = SCENARIOS.filter(s => s.category === 'mode');
  const platform = SCENARIOS.filter(s => s.category === 'platform');
  const modeEl = $('#scene-grid-mode');
  const platformEl = $('#scene-grid-platform');
  if (modeEl) modeEl.innerHTML = mode.map(renderSceneCard).join('');
  if (platformEl) platformEl.innerHTML = platform.map(renderSceneCard).join('');
  $$('.scene-card').forEach(el => {
    el.addEventListener('click', () => openScene(el.dataset.scene));
  });
}

/* ===== 渲染：水平 mini 卡牌 ===== */
function miniCardHtml(card) {
  return `
    <button class="mini-card" data-id="${card.id}">
      <div class="mini-card-visual" style="${cardFaceStyle(card)}">
        <div class="mini-card-chip"></div>
        <div class="mini-card-bankname">${card.bankShort.toUpperCase()}</div>
      </div>
      <div class="mini-card-name">${card.name}</div>
      <div class="mini-card-bank">${card.bank}</div>
    </button>
  `;
}
function renderCardRail() {
  $('#card-rail').innerHTML = CARDS.map(miniCardHtml).join('');
  $$('#card-rail .mini-card').forEach(el => {
    el.addEventListener('click', () => openCard(el.dataset.id));
  });
}

/* ===== 情境結果頁 ===== */
// 記住目前已渲染的內容；按返回回到同一頁時不重繪，展開中的卡片會維持原狀
let renderedScene = null;
let renderedAll = false;
let renderedCard = null;

function renderScene(sceneId, force = false) {
  if (!force && renderedScene === sceneId) return;
  renderedScene = sceneId;
  const scene = SCENARIOS.find(s => s.id === sceneId);
  $('#scene-title').textContent = `${scene.emoji} ${scene.label}`;
  $('#scene-desc').textContent = scene.desc + ' · 依回饋率排序';

  const ranked = rankCardsFor(sceneId);

  $('#rank-list').innerHTML = ranked.map((item, i) => {
    const { card, s } = item;
    const effort = EFFORT_LABEL[s.effort];
    const isBest = i === 0 && s.rate > 0;
    const isDanger = s.rate === 0;
    const showPlan = card.requiresSwitch && s.rate > 0 && s.plan && !s.plan.startsWith('❌');
    return `
      <div class="rank-card ${isBest ? 'best' : ''} ${isDanger ? 'danger' : ''}" data-id="${card.id}">
        <div class="rank-num">${i + 1}</div>
        <div class="rank-info">
          <div class="rank-name">${card.name}</div>
          <div class="rank-bank">${card.bank}</div>
          <div class="rank-meta">
            ${isExpired(card) ? '<span class="tag tag-stale">⚠ 權益已過期</span>' : ''}
            <span class="tag tag-effort" style="background:${effort.color}">${effort.text}</span>
            ${showPlan ? `<span class="tag tag-plan">${s.plan}</span>` : ''}
            <span class="tag tag-cap">${s.cap}</span>
          </div>
        </div>
        <div class="rank-rate">
          <div><span class="rank-rate-num">${s.rate}</span><span class="rank-rate-suffix">%</span></div>
          <div class="rank-rate-label">基本 ${s.basic}%</div>
        </div>
        <div class="rank-detail">
          <div class="rank-detail-row"><span class="lbl">方案</span><strong>${s.plan}</strong></div>
          <div class="rank-detail-row"><span class="lbl">條件</span>${s.condition}</div>
          <div class="rank-detail-row"><span class="lbl">切換</span>${card.switchHow}</div>
          ${card.extraNote ? `<div class="rank-detail-row"><span class="lbl">備註</span>${card.extraNote}</div>` : ''}
          <div class="rank-detail-row"><span class="lbl">查看卡片</span><a href="#" data-go-card="${card.id}" style="color:var(--tea-deep);font-weight:600;">完整資訊 →</a></div>
        </div>
      </div>
    `;
  }).join('');

  $$('#rank-list .rank-card').forEach(el => {
    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-go-card]')) {
        e.preventDefault();
        openCard(e.target.dataset.goCard);
        return;
      }
      el.classList.toggle('open');
    });
  });
}

/* ===== 全部卡片頁 ===== */
function renderAll() {
  if (renderedAll) return;
  renderedAll = true;
  $('#all-grid').innerHTML = CARDS.map(c => `
    <button class="full-card" data-id="${c.id}">
      <div class="mini-card-visual" style="${cardFaceStyle(c)}">
        <div class="mini-card-chip"></div>
        <div class="mini-card-bankname">${c.bankShort.toUpperCase()}</div>
      </div>
      <div class="full-card-name">${c.name}</div>
      <div class="full-card-bank">${c.bank}</div>
      <div class="full-card-tagline">${c.tagline}</div>
    </button>
  `).join('');
  $$('#all-grid .full-card').forEach(el => {
    el.addEventListener('click', () => openCard(el.dataset.id));
  });
}

/* ===== 卡片詳情頁 ===== */
function renderCard(id, force = false) {
  if (!force && renderedCard === id) return;
  const c = CARDS.find(x => x.id === id);
  if (!c) return;
  renderedCard = id;
  $('#card-title').textContent = c.name;
  $('#card-bank').textContent = `${c.bank} · ${c.tagline}`;

  const scenes = SCENARIOS.map(s => {
    const data = c.scenarios[s.id];
    const effort = EFFORT_LABEL[data.effort];
    return `
      <div class="detail-scene">
        <div class="detail-scene-head">
          <div class="detail-scene-title">${s.emoji} ${s.label}</div>
          <div class="detail-scene-rate">${data.rate}%</div>
        </div>
        <div class="rank-meta" style="margin-bottom:8px">
          <span class="tag tag-effort" style="background:${effort.color}">${effort.text}</span>
          <span class="tag">${data.plan}</span>
          <span class="tag tag-cap">上限 ${data.cap}</span>
        </div>
        <div class="detail-scene-cond"><strong>條件：</strong>${data.condition}</div>
      </div>
    `;
  }).join('');

  $('#card-detail').innerHTML = `
    <div class="detail-visual" style="${cardFaceStyle(c)}">
      <div class="detail-chip"></div>
      <div class="detail-bankname">${c.bankShort.toUpperCase()}</div>
      <div class="detail-name">${c.name}</div>
    </div>
    <div class="detail-meta">
      <div class="detail-meta-row"><div class="k">年費</div><div class="v">${c.annualFee}</div></div>
      ${c.validUntil ? `<div class="detail-meta-row"><div class="k">權益有效至</div><div class="v${isExpired(c) ? ' is-stale' : ''}">${fmtDate(c.validUntil)}${isExpired(c) ? '（已過期，資料可能不準）' : ''}</div></div>` : ''}
      <div class="detail-meta-row"><div class="k">需切換</div><div class="v">${c.requiresSwitch ? '是（每日／每月於 App 切換）' : '免切換'}</div></div>
      <div class="detail-meta-row"><div class="k">操作方式</div><div class="v">${c.switchHow}</div></div>
      ${c.extraNote ? `<div class="detail-meta-row"><div class="k">特別注意</div><div class="v">${c.extraNote}</div></div>` : ''}
    </div>
    <div class="detail-scenarios">${scenes}</div>
  `;
}

/* ===== 事件初始化 ===== */
function init() {
  $$('[data-card-count]').forEach(el => { el.textContent = CARDS.length; });
  renderFreshness();
  renderSceneGrid();
  renderCardRail();
  $('#btn-all').addEventListener('click', openAll);
  $('#btn-all-2').addEventListener('click', openAll);
  $$('[data-back]').forEach(b => b.addEventListener('click', back));

  // 返回時由我們自己還原捲動位置
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  window.addEventListener('popstate', (e) => render(e.state));
  // 首次開啟標記為首頁；重新整理時則還原到原本所在的畫面
  if (!history.state) history.replaceState(HOME, '');
  else render(history.state);

  // PWA Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
