#!/usr/bin/env python3
"""檢查信用卡資料是否需要更新。

做三件事，結果寫成一份報告：
1. 逐一連線 SOURCES.md「來源一覽」的網址，看還在不在。
2. 把每個頁面目前的文字，跟查證日的快照（sources/snapshots/<查證日>/）比對，列出有變動的部分。
3. 讀 data.js 每張卡的 validUntil，列出已到期或快到期的卡。

用法（在專案根目錄）：
    python3 scripts/check_sources.py
報告與這次抓到的頁面文字存在 sources/checks/<今天>/，只留在本機，不會進 git。
"""
from __future__ import annotations

import html
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse as up
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCES_MD = ROOT / 'SOURCES.md'
DATA_JS = ROOT / 'data.js'
CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
TZ = timezone(timedelta(hours=8))
SOON_DAYS = 45          # 幾天內到期算「快到期」
MIN_TEXT = 300          # curl 抓到的文字少於這個長度，視為要靠 JavaScript 顯示，改用 Chrome
BLOCKED = {'202', '403', '406', '429'}  # curl 拿到這些狀態碼時，多半是防機器人頁面，改用 Chrome 再試
# 頁面變動中，含這些字的行比較可能跟回饋條件有關，報告優先列出
RELEVANT = re.compile(r'\d+(\.\d+)?\s*%|回饋|加碼|上限|登錄|期間|活動|點數|不適用|排除|不回饋|20\d\d/|11\d/')


def to_text(raw: str) -> str:
    raw = re.sub(r'(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>', ' ', raw)
    raw = re.sub(r'(?i)<br\s*/?>|</(p|div|li|tr|h[1-6]|section|table)>', '\n', raw)
    raw = html.unescape(re.sub(r'<[^>]+>', ' ', raw))
    lines = [re.sub(r'[ \t 　]+', ' ', l).strip() for l in raw.splitlines()]
    return '\n'.join(l for l in lines if l)


def safe_url(url: str) -> str:
    s = up.urlsplit(url)
    return up.urlunsplit((s.scheme, s.netloc, up.quote(s.path), s.query, s.fragment))


def fetch(url: str) -> tuple[str, str, str]:
    """回傳 (HTTP 狀態, 純文字, 擷取方式)。"""
    with tempfile.NamedTemporaryFile(suffix='.html') as tmp:
        r = subprocess.run(['curl', '-s', '-L', '--max-time', '30', '-A', 'Mozilla/5.0',
                            '-o', tmp.name, '-w', '%{http_code}', safe_url(url)],
                           capture_output=True, text=True)
        status = r.stdout.strip() or '連線失敗'
        text = to_text(Path(tmp.name).read_bytes().decode('utf-8', errors='ignore'))
    # 文字太少（要靠 JavaScript 顯示），或被擋下（202／403／406／429，常見於防機器人頁面）時，改用 Chrome
    blocked = status in BLOCKED
    if ((status == '200' and len(text) < MIN_TEXT) or blocked) and Path(CHROME).exists():
        profile = tempfile.mkdtemp(prefix='card-genie-chrome-')
        try:
            r = subprocess.run([CHROME, '--headless=new', '--disable-gpu', f'--user-data-dir={profile}',
                                '--virtual-time-budget=15000', '--dump-dom', safe_url(url)],
                               capture_output=True, timeout=120)
            chrome_text = to_text(r.stdout.decode('utf-8', errors='ignore'))
            if blocked:
                if len(chrome_text) < MIN_TEXT:
                    return status, text, 'curl（被擋，Chrome 也抓不到）'
                return '200', chrome_text, f'Chrome（curl 回 {status}）'
            return status, chrome_text, 'Chrome'
        except subprocess.TimeoutExpired:
            return status, text, 'curl（Chrome 逾時）'
        finally:
            shutil.rmtree(profile, ignore_errors=True)
    return status, text, 'curl'


def parse_sources() -> tuple[str, list[tuple[str, str, str]], dict[str, list[str]]]:
    """回傳 (查證日, [(來源ID, 說明, 網址)], {來源ID: [對應卡片]})。"""
    md = SOURCES_MD.read_text(encoding='utf-8')
    m = re.search(r'查證日：\*\*(\d{4}-\d{2}-\d{2})\*\*', md)
    if not m:
        sys.exit('SOURCES.md 找不到「查證日：**YYYY-MM-DD**」')
    sources = []
    for line in md.splitlines():
        cells = [c.strip() for c in line.strip().strip('|').split('|')]
        if len(cells) >= 3:
            link = re.search(r'\[連結\]\((\S+?)\)', cells[2])
            if link:
                sources.append((cells[0], cells[1], link.group(1)))
    used_by: dict[str, list[str]] = {}
    for sec in re.split(r'\n### ', md)[1:]:
        title = sec.splitlines()[0].strip()
        for sid in sorted(set(re.findall(r'〔([\w-]+)〕', sec))):
            used_by.setdefault(sid, []).append(title)
    return m.group(1), sources, used_by


def parse_cards() -> list[tuple[str, str]]:
    """回傳 [(卡名, validUntil)]。"""
    cards, name = [], None
    for line in DATA_JS.read_text(encoding='utf-8').splitlines():
        if (m := re.match(r"\s*name: '(.+)',", line)):
            name = m.group(1)
        elif (m := re.match(r"\s*bankShort: '(.+)',", line)) and name:
            name = f'{m.group(1)} {name}'
        elif (m := re.match(r"\s*validUntil: '(\d{4}-\d{2}-\d{2})'", line)) and name:
            cards.append((name, m.group(1)))
            name = None
    return cards


def body_lines(text: str) -> list[str]:
    lines = text.splitlines()
    # 快照開頭有「來源／擷取時間／擷取方式」三行與一個空行
    if lines and lines[0].startswith('來源：'):
        lines = lines[4:]
    return [l for l in lines if l.strip()]


def clip(s: str, n: int = 140) -> str:
    return s if len(s) <= n else s[:n] + '…'


def main() -> None:
    today = datetime.now(TZ).date()
    verified, sources, used_by = parse_sources()
    base_dir = ROOT / 'sources' / 'snapshots' / verified
    out_dir = ROOT / 'sources' / 'checks' / today.isoformat()
    out_dir.mkdir(parents=True, exist_ok=True)

    rows, details = [], []
    for sid, desc, url in sources:
        status, text, how = fetch(url)
        (out_dir / f'{sid}.txt').write_text(f'來源：{url}\n擷取時間：{datetime.now(TZ):%Y-%m-%d %H:%M}\n擷取方式：{how}\n\n{text}\n', encoding='utf-8')
        cards = '、'.join(used_by.get(sid, [])) or '—'
        base = base_dir / f'{sid}.txt'
        if status != '200':
            verdict, change = '⚠️ 網址失效', f'HTTP {status}'
        elif len(text) < MIN_TEXT:
            verdict, change = '⚠️ 抓不到內容', f'只有 {len(text)} 字'
        elif not base.exists():
            verdict, change = '— 無基準快照', '—'
        else:
            old, new = body_lines(base.read_text(encoding='utf-8')), body_lines(text)
            old_set, new_set = set(old), set(new)
            added = [l for l in new if l not in old_set]
            removed = [l for l in old if l not in new_set]
            rel_added = [l for l in added if RELEVANT.search(l)]
            rel_removed = [l for l in removed if RELEVANT.search(l)]
            change = f'+{len(added)} / −{len(removed)} 行（相關 +{len(rel_added)} / −{len(rel_removed)}）'
            if rel_added or rel_removed:
                verdict = '🔶 條件相關內容有變動'
                det = [f'#### {sid}（{cards}）', '', f'{url}', '']
                if rel_added:
                    det += ['新增：', *[f'- {clip(l)}' for l in rel_added[:20]]]
                    if len(rel_added) > 20:
                        det.append(f'- …另有 {len(rel_added) - 20} 行')
                if rel_removed:
                    det += ['', '刪除：', *[f'- {clip(l)}' for l in rel_removed[:12]]]
                    if len(rel_removed) > 12:
                        det.append(f'- …另有 {len(rel_removed) - 12} 行')
                details.append('\n'.join(det))
            elif added or removed:
                verdict = '🔹 只有一般文字變動'
            else:
                verdict = '✅ 沒有變動'
        rows.append(f'| {sid} | {cards} | {verdict} | {change} |')
        print(f'{verdict:<16} {sid}', flush=True)

    by_date: dict[str, list[str]] = {}
    for name, until in parse_cards():
        by_date.setdefault(until, []).append(name)
    expired, soon = [], []
    for until, names in sorted(by_date.items()):
        d = date.fromisoformat(until)
        if d < today:
            expired.append(f'- **{until} 已到期**（{len(names)} 張）：{"、".join(names)}')
        elif d <= today + timedelta(days=SOON_DAYS):
            soon.append(f'- {until} 到期，剩 {(d - today).days} 天（{len(names)} 張）：{"、".join(names)}')

    report = [
        f'# 信用卡資料檢查報告 {today.isoformat()}',
        '',
        f'- 資料查證日：{verified}（比對基準：`sources/snapshots/{verified}/`）',
        f'- 檢查日：{today.isoformat()}',
        f'- 檢查來源：{len(sources)} 個',
        '',
        '## 權益到期狀況（依 data.js 的 validUntil）',
        '',
        *(expired or ['- 沒有已到期的卡']),
        *(soon or [f'- {SOON_DAYS} 天內沒有要到期的卡']),
        '',
        '## 各來源狀態',
        '',
        '| 來源 | 對應卡片 | 判斷 | 變動 |',
        '|---|---|---|---|',
        *rows,
        '',
        '## 條件相關的變動內容',
        '',
        '以下是頁面上新增或刪除、且看起來跟回饋條件有關的行。頁面改版、輪播文案也可能被列進來，需要人工判讀。',
        '',
        *(details or ['沒有偵測到條件相關的變動。']),
        '',
    ]
    path = out_dir / 'REPORT.md'
    path.write_text('\n'.join(report), encoding='utf-8')
    print(f'\n報告：{path}')


if __name__ == '__main__':
    main()
