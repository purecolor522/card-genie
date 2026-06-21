'use strict';

const CARDS = window.CARDS;
const SCENARIOS = window.SCENARIOS;
const EFFORT_LABEL = window.EFFORT_LABEL;

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const viewStack = ['view-home'];

function showView(id) {
  $$('.view').forEach(v => v.classList.remove('view-active'));
  const v = document.getElementById(id);
  if (v) {
    v.classList.add('view-active');
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}
function go(id) { viewStack.push(id); showView(id); }
function back() {
  if (viewStack.length > 1) viewStack.pop();
  showView(viewStack[viewStack.length - 1]);
}

/* ===== 卡面樣式 ===== */
function cardFaceStyle(card) {
  const c = card.palette || [card.accent, card.accent];
  const c1 = c[0];
  const c2 = c[c.length - 1] || c[0];
  return `--c1:${c1};--c2:${c2}; background: linear-gradient(135deg, ${c1}, ${c2});`;
}

/* ===== 渲染：情境格 ===== */
function renderSceneCard(s) {
  const best = bestCardFor(s.id);
  return `
    <button class="scene-card" data-scene="${s.id}">
      <span class="scene-emoji">${s.emoji}</span>
      <div class="scene-label">${s.label}</div>
      <div class="scene-desc">${s.desc}</div>
      <div class="scene-best">最高 <b>${best.rate}%</b> · ${best.card.bankShort}${best.card.name}</div>
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

function bestCardFor(sceneId) {
  let best = { rate: -1, card: null };
  CARDS.forEach(c => {
    const r = c.scenarios[sceneId].rate;
    if (r > best.rate) best = { rate: r, card: c };
  });
  return best;
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
function openScene(sceneId) {
  const scene = SCENARIOS.find(s => s.id === sceneId);
  $('#scene-title').textContent = `${scene.emoji} ${scene.label}`;
  $('#scene-desc').textContent = scene.desc + ' · 依回饋率排序';

  const ranked = CARDS
    .map(c => ({ card: c, s: c.scenarios[sceneId] }))
    .sort((a, b) => {
      if (b.s.rate !== a.s.rate) return b.s.rate - a.s.rate;
      return a.s.effort - b.s.effort;
    });

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

  go('view-scene');
}

/* ===== 全部卡片頁 ===== */
function openAll() {
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
  go('view-all');
}

/* ===== 卡片詳情頁 ===== */
function openCard(id) {
  const c = CARDS.find(x => x.id === id);
  if (!c) return;
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
      <div class="detail-meta-row"><div class="k">需切換</div><div class="v">${c.requiresSwitch ? '是（每日／每月於 App 切換）' : '免切換'}</div></div>
      <div class="detail-meta-row"><div class="k">操作方式</div><div class="v">${c.switchHow}</div></div>
      ${c.extraNote ? `<div class="detail-meta-row"><div class="k">特別注意</div><div class="v">${c.extraNote}</div></div>` : ''}
    </div>
    <div class="detail-scenarios">${scenes}</div>
  `;
  go('view-card');
}

/* ===== 事件初始化 ===== */
function init() {
  renderSceneGrid();
  renderCardRail();
  $('#btn-all').addEventListener('click', openAll);
  $('#btn-all-2').addEventListener('click', openAll);
  $$('[data-back]').forEach(b => b.addEventListener('click', back));

  // PWA Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    });
  }
}

document.addEventListener('DOMContentLoaded', init);
