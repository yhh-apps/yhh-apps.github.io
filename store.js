/**
 * 용돈 받아라 — 기기 저장소(IndexedDB) 버전의 '서버' 로직
 * 예전 Code.gs(앱스스크립트)의 함수들을 그대로 옮겨, 화면에서는 call('함수명', ...)으로 부릅니다.
 * 모든 데이터는 이 기기 안에만 저장되며 어디로도 전송되지 않습니다.
 */
(function () {
  'use strict';

  const DB_NAME = 'allowance';
  const DB_STORE = 'kv';
  const DB_KEY = 'data';
  const VERSION = 1;
  const DEFAULT_MAX = 3;
  const KINDS = ['꼭 필요한 것', '갖고 싶은 것'];
  const METHODS = ['카드', '현금'];
  const TRANSFER = '통장 이체';
  const BONUS = 'BONUS';

  let D = null;          // 메모리에 올린 전체 데이터
  let idb = null;
  let fallback = false;  // IndexedDB를 못 쓰면 localStorage 사용

  /* ===================== 저장소 ===================== */

  function openIdb() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) return rej(new Error('no idb'));
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(DB_STORE);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
  }
  function idbGet() {
    return new Promise((res, rej) => {
      const tx = idb.transaction(DB_STORE, 'readonly');
      const r = tx.objectStore(DB_STORE).get(DB_KEY);
      r.onsuccess = () => res(r.result || null);
      r.onerror = () => rej(r.error);
    });
  }
  function idbPut(val) {
    return new Promise((res, rej) => {
      const tx = idb.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(val, DB_KEY);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
  }

  async function init() {
    if (D) return;
    try { idb = await openIdb(); D = await idbGet(); }
    catch (e) {
      fallback = true;
      try { D = JSON.parse(localStorage.getItem('allowance.' + DB_KEY) || 'null'); } catch (e2) { D = null; }
    }
    if (D) migrate_(D);
    // 브라우저가 저장 공간을 마음대로 비우지 않도록 요청 (지원하는 경우)
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
  }

  async function persist() {
    D.savedAt = now_();
    if (fallback) { localStorage.setItem('allowance.' + DB_KEY, JSON.stringify(D)); return; }
    await idbPut(D);
  }

  function migrate_(d) {
    d.settings = d.settings || {};
    ['kids', 'items', 'records', 'spends'].forEach(k => { if (!Array.isArray(d[k])) d[k] = []; });
    d.v = VERSION;
  }

  /* ===================== 공통 도우미 ===================== */

  function str_(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function num_(v) { const n = Number(v); return isNaN(n) ? 0 : n; }
  function sum_(arr) { return arr.reduce((s, x) => s + x.amount, 0); }
  function pad_(n) { return (n < 10 ? '0' : '') + n; }
  function today_() { const d = new Date(); return d.getFullYear() + '-' + pad_(d.getMonth() + 1) + '-' + pad_(d.getDate()); }
  function now_() { const d = new Date(); return today_() + ' ' + pad_(d.getHours()) + ':' + pad_(d.getMinutes()) + ':' + pad_(d.getSeconds()); }
  function newId_(p) { return p + Date.now().toString(36) + Math.floor(Math.random() * 46656).toString(36); }
  function isDate_(s) { return /^\d{4}-\d{2}-\d{2}$/.test(s || ''); }
  function clampMax_(v) { const n = Math.floor(num_(v)); return n >= 1 && n <= 5 ? n : DEFAULT_MAX; }
  function weekStart_(s) { // 월요일 시작
    const p = s.split('-').map(Number);
    const dt = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    dt.setUTCDate(dt.getUTCDate() - ((dt.getUTCDay() + 6) % 7));
    return dt.toISOString().slice(0, 10);
  }
  function need_() { if (!D) throw new Error('먼저 시작 설정을 해 주세요.'); }
  function kids_() { return D.kids.slice().sort((a, b) => a.order - b.order); }
  function items_() { return D.items.slice().sort((a, b) => a.order - b.order); }
  function balanceOf_(kidId) {
    return sum_(D.records.filter(r => r.kidId === kidId)) - sum_(D.spends.filter(s => s.kidId === kidId));
  }
  function matcher_(item, kidId, dateStr) {
    const wk = weekStart_(dateStr);
    return r => r.kidId === kidId && r.itemId === item.id &&
      (item.period === '매일' ? r.date === dateStr : weekStart_(r.date) === wk);
  }
  function hasKid_(id) { return D.kids.some(k => k.id === id); }
  function checkPin_(pin) {
    if (D.settings.pin && str_(pin) !== D.settings.pin) throw new Error('비밀번호가 맞지 않아요.');
  }

  /* ===================== 처음 설정 ===================== */

  const DEFAULT_ITEMS = [
    ['스스로 일어나 이불 개기', '하루를 스스로 시작하는 자기관리 습관', 50, '매일'],
    ['놀고 난 뒤 제자리 정리', '내 물건을 소중히 여기고 스스로 책임지는 태도', 50, '매일'],
    ['책 읽기', '매일 읽는 습관이 문해력과 생각하는 힘을 키워요', 100, '매일'],
    ['숙제·할 일 스스로 끝내기', '할 일을 스스로 계획하고 끝까지 해내는 힘', 50, '매일'],
    ['편식 없이 골고루 먹기', '건강한 몸과 음식에 감사하는 마음', 50, '매일'],
    ['집안일 돕기(빨래 개기·수저 놓기·분리수거)', '가족의 한 사람으로 함께 일하며, 일한 만큼 번다는 것을 배워요', 300, '매주'],
    ['용돈기입장 쓰기', '들어온 돈과 쓴 돈을 기록하며 돈의 흐름을 이해해요', 300, '매주'],
    ['약속한 시간보다 영상·게임 더 하기', '스스로 정한 약속을 지키는 힘을 길러요', -100, '매일'],
    ['형제·친구에게 거친 말 하기', '말에도 책임이 있다는 걸 배워요', -50, '매일']
  ];
  const EMOJIS = ['🐯', '🐰', '🐻', '🦊', '🐼'];

  /** 첫 실행: 아이 이름들로 시작 (기본 항목은 모든 아이 공통) */
  function setupApp(kidNames) {
    if (D && D.kids.length && !D.demo) throw new Error('이미 시작했어요.');
    return setupApp_(kidNames);
  }
  function setupApp_(kidNames) {
    const names = (kidNames || []).map(str_).filter(Boolean).slice(0, 10);
    if (!names.length) throw new Error('아이 이름을 한 명 이상 입력해 주세요.');
    D = { v: VERSION, settings: { pin: '' }, kids: [], items: [], records: [], spends: [], createdAt: now_() };
    names.forEach((n, i) => D.kids.push({ id: newId_('k'), name: n, desc: '', emoji: EMOJIS[i % EMOJIS.length], goalName: '', goalAmount: 0, order: i + 1 }));
    DEFAULT_ITEMS.forEach((r, i) => D.items.push({ id: newId_('i'), name: r[0], meaning: r[1], amount: r[2], period: r[3], target: 'ALL', active: true, order: i + 1, maxCount: DEFAULT_MAX }));
    return getInitData();
  }

  /* ===================== 예시 자료 (둘러보기) ===================== */

  function addDays_(s, n) {
    const p = s.split('-').map(Number);
    const d = new Date(Date.UTC(p[0], p[1] - 1, p[2] + n));
    return d.toISOString().slice(0, 10);
  }
  function rng_(seed) { // 매번 같은 예시가 나오도록 고정된 난수
    return function () {
      seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /** 예시 아이 2명 + 최근 4주 기록으로 둘러보기 (D.demo = true) */
  function loadDemo() {
    if (D && D.kids.length && !D.demo) throw new Error('이미 사용 중인 기록이 있어요.');
    setupApp_(['하준', '서아']);
    D.demo = true;
    const k1 = D.kids[0], k2 = D.kids[1];
    Object.assign(k1, { desc: '초등학교 2학년', goalName: '레고 자동차', goalAmount: 30000 });
    Object.assign(k2, { desc: '유치원 (7살)', goalName: '토끼 인형', goalAmount: 15000 });
    const rnd = rng_(20261109);
    const today = today_();
    const rec = (date, kidId, it, n) => {
      if (date > today) return;
      for (let i = 0; i < n; i++) D.records.push({ id: newId_('r'), date: date, kidId: kidId, itemId: it.id, itemName: it.name, amount: it.amount, ts: date + ' 20:00:0' + i });
    };
    const pick = probs => { let r = rnd(), i = 0; while (i < probs.length - 1 && r >= probs[i]) { r -= probs[i]; i++; } return i; };
    [k1, k2].forEach(k => {
      for (let back = 27; back >= 0; back--) {
        const date = addDays_(today, -back);
        D.items.forEach(it => {
          if (it.period === '매일' && it.amount >= 0) rec(date, k.id, it, back === 0 ? pick([0.4, 0.4, 0.2]) : pick([0.15, 0.4, 0.3, 0.15]));
          if (it.amount < 0 && back > 0 && rnd() < 0.08) rec(date, k.id, it, 1);
          if (it.period === '매주' && it.amount >= 0 && weekStart_(date) === date && back > 0) {
            const n = pick([0.2, 0.5, 0.3]);
            for (let i = 0; i < n; i++) rec(addDays_(date, 2 + i * 3), k.id, it, 1);
          }
        });
      }
    });
    const bonus = (back, k, from, amt) => D.records.push({ id: newId_('b'), date: addDays_(today, -back), kidId: k.id, itemId: BONUS, itemName: from, amount: amt, ts: addDays_(today, -back) + ' 12:00:00' });
    const spend = (back, k, name, amt, kind, method, memo) => D.spends.push({ id: newId_('s'), date: addDays_(today, -back), kidId: k.id, name: name, amount: amt, kind: kind, memo: memo || '', ts: addDays_(today, -back) + ' 18:00:00', method: method });
    bonus(20, k1, '할머니 · 주말 방문', 10000);
    bonus(20, k2, '할머니 · 주말 방문', 5000);
    bonus(6, k1, '칭찬 보너스 · 받아쓰기 100점', 1000);
    spend(17, k1, '색연필', 2500, KINDS[0], '카드', '문구점');
    spend(12, k1, '포켓몬 카드', 5000, KINDS[1], '카드', '');
    spend(4, k1, '아이스크림', 1500, KINDS[1], '현금', '친구랑');
    spend(15, k2, '머리끈', 1500, KINDS[0], '카드', '');
    spend(9, k2, '스티커', 2000, KINDS[1], '현금', '');
    D.spends.push({ id: newId_('t'), date: addDays_(today, -7), kidId: k1.id, name: '실물 통장으로 이체', amount: 10000, kind: '', memo: '어린이 저축통장', ts: addDays_(today, -7) + ' 19:00:00', method: TRANSFER });
    D.spends.push({ id: newId_('t'), date: addDays_(today, -7), kidId: k2.id, name: '실물 통장으로 이체', amount: 5000, kind: '', memo: '어린이 저축통장', ts: addDays_(today, -7) + ' 19:00:00', method: TRANSFER });
    return getInitData();
  }

  /* ===================== 화면용 API ===================== */

  function getInitData() {
    return {
      ready: !!(D && D.kids.length),
      demo: !!(D && D.demo),
      family: D && D.sync ? D.sync.familyId : null,
      today: today_(),
      kids: D ? kids_() : [],
      items: D ? items_() : [],
      kinds: KINDS,
      methods: METHODS,
      hasPin: !!(D && D.settings.pin)
    };
  }

  function getDay(kidId, dateStr) {
    need_();
    dateStr = isDate_(dateStr) ? dateStr : today_();
    const items = items_().filter(it => it.active && (it.target === 'ALL' || it.target === kidId));
    const recs = D.records.filter(r => r.kidId === kidId);
    const spends = D.spends.filter(s => s.kidId === kidId);
    const month = dateStr.slice(0, 7);
    const list = items.map(it => ({
      id: it.id, name: it.name, meaning: it.meaning, amount: it.amount,
      period: it.period, maxCount: it.maxCount,
      count: Math.min(it.maxCount, recs.filter(matcher_(it, kidId, dateStr)).length)
    }));
    const earned = sum_(recs), out = sum_(spends);
    const realSpends = spends.filter(s => s.method !== TRANSFER);
    return {
      date: dateStr, today: today_(), items: list,
      bonuses: recs.filter(r => r.itemId === BONUS && r.date === dateStr)
        .map(r => ({ id: r.id, name: r.itemName, amount: r.amount })),
      daySpends: spends.filter(s => s.date === dateStr)
        .map(s => ({ name: s.name, amount: s.amount, method: s.method, kind: s.kind })),
      dayCounts: (() => { // 이 날짜에 체크한 횟수 (매주 항목도 이 날 체크한 것만)
        const o = {};
        recs.filter(r => r.date === dateStr && r.itemId !== BONUS).forEach(r => { o[r.itemId] = (o[r.itemId] || 0) + 1; });
        return o;
      })(),
      balance: earned - out, totalEarned: earned,
      monthEarned: sum_(recs.filter(r => r.date.slice(0, 7) === month)),
      monthSpent: sum_(realSpends.filter(s => s.date.slice(0, 7) === month)),
      dayEarned: sum_(recs.filter(r => r.date === dateStr))
    };
  }

  function setCount(kidId, itemId, dateStr, count) {
    need_();
    if (!isDate_(dateStr)) throw new Error('날짜가 올바르지 않아요.');
    if (dateStr > today_()) throw new Error('미래 날짜는 체크할 수 없어요.');
    const item = D.items.find(i => i.id === itemId);
    if (!item) throw new Error('항목을 찾을 수 없어요.');
    const n = Math.max(0, Math.min(item.maxCount, Math.floor(num_(count))));
    const hits = D.records.filter(matcher_(item, kidId, dateStr));
    if (hits.length > n) {
      // 같은 날짜 기록을 먼저, 나중에 넣은 것부터 지우기
      const idx = r => D.records.indexOf(r);
      hits.sort((a, b) => (a.date === dateStr) === (b.date === dateStr) ? idx(b) - idx(a) : (a.date === dateStr ? -1 : 1));
      const drop = new Set(hits.slice(0, hits.length - n));
      D.records = D.records.filter(r => !drop.has(r));
    } else {
      for (let i = hits.length; i < n; i++) {
        D.records.push({ id: newId_('r'), date: dateStr, kidId: kidId, itemId: itemId, itemName: item.name, amount: item.amount, ts: now_() });
      }
    }
    return getDay(kidId, dateStr);
  }

  function addSpend(kidId, sp, viewDate) {
    need_();
    const name = str_(sp.name);
    const amount = Math.floor(num_(sp.amount));
    const date = isDate_(sp.date) ? sp.date : today_();
    if (!name) throw new Error('무엇을 샀는지 입력해 주세요.');
    if (amount <= 0) throw new Error('금액을 확인해 주세요.');
    if (date > today_()) throw new Error('미래 날짜로는 기록할 수 없어요.');
    if (!hasKid_(kidId)) throw new Error('아이를 확인해 주세요.');
    const kind = KINDS.indexOf(sp.kind) >= 0 ? sp.kind : '';
    const method = METHODS.indexOf(sp.method) >= 0 ? sp.method : '카드';
    D.spends.push({ id: newId_('s'), date: date, kidId: kidId, name: name, amount: amount, kind: kind, memo: str_(sp.memo), ts: now_(), method: method });
    return getDay(kidId, viewDate);
  }

  function addBonus(kidId, b, viewDate) {
    need_();
    const from = str_(b.from);
    const amount = Math.floor(num_(b.amount));
    const date = isDate_(b.date) ? b.date : today_();
    if (!from) throw new Error('누구에게 받았는지 입력해 주세요.');
    if (amount <= 0) throw new Error('금액을 확인해 주세요.');
    if (date > today_()) throw new Error('미래 날짜로는 기록할 수 없어요.');
    if (!hasKid_(kidId)) throw new Error('아이를 확인해 주세요.');
    const name = from + (str_(b.memo) ? ' · ' + str_(b.memo) : '');
    D.records.push({ id: newId_('b'), date: date, kidId: kidId, itemId: BONUS, itemName: name, amount: amount, ts: now_() });
    return getDay(kidId, viewDate);
  }

  function deleteBonus(id, kidId, viewDate) {
    need_();
    D.records = D.records.filter(r => !(r.id === id && r.itemId === BONUS));
    return kidId ? getDay(kidId, viewDate) : true;
  }

  function addTransfer(kidId, t) {
    need_();
    const amount = Math.floor(num_(t.amount));
    const date = isDate_(t.date) ? t.date : today_();
    if (amount <= 0) throw new Error('금액을 확인해 주세요.');
    if (date > today_()) throw new Error('미래 날짜로는 기록할 수 없어요.');
    const bal = balanceOf_(kidId);
    if (amount > bal) throw new Error('잔액(' + bal.toLocaleString() + '원)보다 많이 이체할 수 없어요.');
    D.spends.push({ id: newId_('t'), date: date, kidId: kidId, name: '실물 통장으로 이체', amount: amount, kind: '', memo: str_(t.memo), ts: now_(), method: TRANSFER });
    return true;
  }

  function deleteSpend(id) {
    need_();
    D.spends = D.spends.filter(s => s.id !== id);
    return true;
  }

  function getLedger(kidId, month) {
    need_();
    const recs = D.records.filter(r => r.kidId === kidId);
    const spends = D.spends.filter(s => s.kidId === kidId);
    const work = recs.filter(r => r.itemId !== BONUS && r.amount >= 0);
    const fines = recs.filter(r => r.itemId !== BONUS && r.amount < 0);
    const byDate = {};
    work.concat(fines).forEach(r => {
      const key = r.date + (r.amount < 0 ? '-' : '+');
      if (!byDate[key]) byDate[key] = { date: r.date, fine: r.amount < 0, amount: 0, count: 0, map: {} };
      const d = byDate[key];
      d.amount += Math.abs(r.amount); d.count++;
      d.map[r.itemName] = (d.map[r.itemName] || 0) + 1;
    });
    const lines = Object.keys(byDate).map(k => {
      const d = byDate[k];
      return {
        date: d.date, type: d.fine ? 'fine' : 'in', amount: d.amount, count: d.count, ord: d.fine ? 3 : 0,
        detail: Object.keys(d.map).map(n => d.map[n] > 1 ? n + '×' + d.map[n] : n).join(', ')
      };
    }).concat(recs.filter(r => r.itemId === BONUS).map(r => ({
      id: r.id, date: r.date, type: 'bonus', amount: r.amount, name: r.itemName, ord: 1
    }))).concat(spends.map(s => ({
      id: s.id, date: s.date, type: s.method === TRANSFER ? 'save' : 'out', amount: s.amount,
      name: s.name, kind: s.kind, method: s.method, memo: s.memo, ts: s.ts, ord: 2
    })));
    lines.sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 :
      a.ord !== b.ord ? a.ord - b.ord : String(a.ts || '').localeCompare(String(b.ts || '')));
    let bal = 0;
    lines.forEach(l => { bal += (l.type === 'in' || l.type === 'bonus') ? l.amount : -l.amount; l.balance = bal; });

    const inMonth = lines.filter(l => l.date.slice(0, 7) === month);
    const sumType = t => inMonth.filter(l => l.type === t).reduce((s, l) => s + l.amount, 0);
    const stats = {};
    work.filter(r => r.date.slice(0, 7) === month).forEach(r => {
      if (!stats[r.itemName]) stats[r.itemName] = { name: r.itemName, count: 0, amount: 0 };
      stats[r.itemName].count++;
      stats[r.itemName].amount += r.amount;
    });
    const outs = inMonth.filter(l => l.type === 'out');
    const kindSum = {}, methodSum = {};
    KINDS.forEach(k => { kindSum[k] = outs.filter(o => o.kind === k).reduce((s, o) => s + o.amount, 0); });
    METHODS.forEach(m => { methodSum[m] = outs.filter(o => o.method === m).reduce((s, o) => s + o.amount, 0); });
    return {
      month: month,
      lines: inMonth.reverse(),
      monthIn: sumType('in'), monthBonus: sumType('bonus'),
      monthOut: sumType('out'), monthSaved: sumType('save'), monthFine: sumType('fine'),
      totalSaved: spends.filter(s => s.method === TRANSFER).reduce((s, x) => s + x.amount, 0),
      kindSum: kindSum, methodSum: methodSum,
      balance: bal,
      stats: Object.keys(stats).map(k => stats[k]).sort((a, b) => b.count - a.count)
    };
  }

  /* ===================== 설정 API ===================== */

  /** 앱 잠금 비밀번호 확인 (비밀번호가 없으면 항상 통과) */
  function verifyPin(pin) { need_(); checkPin_(pin); return true; }

  /** 앱 잠금 비밀번호 설정/변경/해제 (newPin이 빈 값이면 해제) */
  function setPin(oldPin, newPin) {
    need_();
    checkPin_(oldPin);
    newPin = str_(newPin);
    if (newPin && !/^\d{4,8}$/.test(newPin)) throw new Error('비밀번호는 숫자 4~8자리로 해 주세요.');
    D.settings.pin = newPin;
    return getInitData();
  }

  function saveItem(it) {
    need_();
    const name = str_(it.name);
    const amount = Math.floor(num_(it.amount));
    const period = it.period === '매주' ? '매주' : '매일';
    const target = str_(it.target) || 'ALL';
    const maxCount = clampMax_(it.maxCount);
    if (!name) throw new Error('항목 이름을 입력해 주세요.');
    if (amount < -100000 || amount > 100000) throw new Error('금액은 -100,000 ~ 100,000원 사이로 입력해 주세요. (벌금은 마이너스)');
    if (target !== 'ALL' && !hasKid_(target)) throw new Error('대상 아이를 확인해 주세요.');
    const active = it.active !== false;
    const cur = it.id ? D.items.find(x => x.id === it.id) : null;
    if (cur) {
      Object.assign(cur, { name: name, meaning: str_(it.meaning), amount: amount, period: period, target: target, active: active, maxCount: maxCount });
    } else {
      const order = D.items.reduce((m, x) => Math.max(m, x.order), 0) + 1;
      D.items.push({ id: newId_('i'), name: name, meaning: str_(it.meaning), amount: amount, period: period, target: target, active: active, order: order, maxCount: maxCount });
    }
    return getInitData();
  }

  function deleteItem(id) {
    need_();
    D.items = D.items.filter(x => x.id !== id); // 지난 기록은 그대로 남습니다
    return getInitData();
  }

  function saveKid(k) {
    need_();
    const name = str_(k.name);
    if (!name) throw new Error('이름을 입력해 주세요.');
    const goalAmount = Math.max(0, Math.floor(num_(k.goalAmount)));
    const cur = k.id ? D.kids.find(x => x.id === k.id) : null;
    const v = { name: name, desc: str_(k.desc), emoji: str_(k.emoji) || '🙂', goalName: str_(k.goalName), goalAmount: goalAmount };
    if (cur) Object.assign(cur, v);
    else {
      const order = D.kids.reduce((m, x) => Math.max(m, x.order), 0) + 1;
      D.kids.push(Object.assign({ id: newId_('k'), order: order }, v));
    }
    return getInitData();
  }

  /** 아이 삭제 — 그 아이 전용 항목과 모든 기록도 함께 지움 (기기 저장이라 남겨 둘 이유가 없음) */
  function deleteKid(id) {
    need_();
    if (D.kids.length <= 1) throw new Error('아이가 한 명은 있어야 해요.');
    D.items = D.items.filter(x => x.target !== id);
    D.kids = D.kids.filter(x => x.id !== id);
    D.records = D.records.filter(r => r.kidId !== id);
    D.spends = D.spends.filter(s => s.kidId !== id);
    return getInitData();
  }


  /* ===================== 백업 ===================== */

  function noSync_() { if (D && D.sync && D.sync.familyId) throw new Error('가족 연결 중에는 할 수 없어요. 설정에서 먼저 「이 휴대폰 연결 끊기」를 해 주세요.'); }

  function exportData() {
    need_();
    const copy = Object.assign({}, D); delete copy.sync;
    return JSON.stringify({ app: 'allowance', exportedAt: now_(), data: copy }, null, 1);
  }

  function importData(text) {
    noSync_();
    let obj;
    try { obj = JSON.parse(text); } catch (e) { throw new Error('백업 파일을 읽을 수 없어요.'); }
    const d = obj && obj.app === 'allowance' ? obj.data : null;
    if (!d || !Array.isArray(d.kids) || !Array.isArray(d.records)) throw new Error('이 앱의 백업 파일이 아니에요.');
    migrate_(d);
    delete d.sync;
    D = d;
    return getInitData();
  }

  function resetAll() {
    noSync_();
    D = null;
    return { ready: false };
  }

  /* ===================== 가족 동기화용 변경 추적 ===================== */
  // 아이·항목·기록·지출을 한 건씩 비교해, 바뀐 것만 서버로 보내고 서버에서 온 것만 반영합니다.

  const COLS = ['kids', 'items', 'records', 'spends'];
  let FP = null; // { col: Map(id → 내용 문자열) }

  function stable_(o) { return JSON.stringify(o, Object.keys(o).sort()); }
  function buildFP_() {
    FP = {};
    COLS.forEach(c => { FP[c] = new Map(); (D ? D[c] : []).forEach(e => FP[c].set(e.id, stable_(e))); });
  }
  /** 마지막 비교 이후 이 기기에서 바뀐 것: { col: { up: [엔티티], del: [id] } } */
  function diff_() {
    if (!FP) { buildFP_(); return null; }
    const out = {}; let any = false;
    COLS.forEach(c => {
      const now = new Map(), up = [], del = [];
      (D ? D[c] : []).forEach(e => { const s = stable_(e); now.set(e.id, s); if (FP[c].get(e.id) !== s) up.push(e); });
      FP[c].forEach((s, id) => { if (!now.has(id)) del.push(id); });
      FP[c] = now;
      if (up.length || del.length) { out[c] = { up: up, del: del }; any = true; }
    });
    return any ? out : null;
  }
  function syncing_() { return !!(D && D.sync && D.sync.familyId); }

  /** 서버에서 받은 문서 반영. docs: [{ id, data: {...엔티티, u, del} }] → 바뀐 건수 */
  function applyRemote_(col, docs) {
    if (!syncing_() || COLS.indexOf(col) < 0) return 0;
    if (!FP) buildFP_();
    let changed = 0;
    docs.forEach(d => {
      const e = Object.assign({}, d.data); const isDel = !!e.del; delete e.u; delete e.del; e.id = d.id;
      const arr = D[col], i = arr.findIndex(x => x.id === d.id);
      if (isDel) {
        if (i >= 0) { arr.splice(i, 1); changed++; }
        FP[col].delete(d.id);
      } else {
        const s = stable_(e);
        if (i < 0) { arr.push(e); changed++; }
        else if (stable_(arr[i]) !== s) { arr[i] = e; changed++; }
        FP[col].set(d.id, s);
      }
    });
    return changed;
  }

  /* ===================== 호출 창구 ===================== */

  const API = {
    getInitData, setupApp, loadDemo, getDay, setCount, addSpend, addBonus, deleteBonus, addTransfer, deleteSpend,
    getLedger, verifyPin, setPin, saveItem, deleteItem, saveKid, deleteKid, exportData, importData, resetAll
  };
  const READ_ONLY = { getInitData: 1, getDay: 1, getLedger: 1, verifyPin: 1, exportData: 1 };

  let queue = Promise.resolve();
  function enqueue_(job) {
    const run = queue.then(init).then(job);
    queue = run.catch(() => { });
    return run;
  }
  /** 화면에서 쓰는 비동기 호출: call('getDay', kidId, date) — 쓰기는 순서대로 처리하고 저장까지 기다림 */
  window.call = function (fn) {
    const args = Array.prototype.slice.call(arguments, 1);
    return enqueue_(async () => {
      if (!API[fn]) throw new Error('알 수 없는 기능: ' + fn);
      if (fn === 'setupApp' || fn === 'loadDemo') noSync_();
      const before = D;
      const out = API[fn].apply(null, args);
      if (!READ_ONLY[fn]) {
        if (fn === 'resetAll') { await clearStore(); }
        else if (D) await persist();
        else if (before) await clearStore();
        if (syncing_()) { const ch = diff_(); if (ch && Store.onLocalChange) Store.onLocalChange(ch); }
        else FP = null;
      }
      return out;
    });
  };

  /** 동기화 모듈(sync.js)이 쓰는 창구 */
  const Store = window.Store = {
    COLS: COLS,
    onLocalChange: null,   // (changes) => void  — 이 기기에서 바뀐 것 보내기
    onRemoteChange: null,  // () => void        — 화면 다시 그리기
    /** 지금 데이터 읽기 (동기화 정보, 전체 엔티티) */
    snapshot: () => enqueue_(() => D ? { sync: D.sync || null, demo: !!D.demo, ready: !!D.kids.length, data: COLS.reduce((o, c) => (o[c] = D[c].slice(), o), {}) } : null),
    /** 동기화 정보 저장 (가족 만들기·참여 후) — 참여할 때는 기존 기록을 비우고 서버 것으로 채움 */
    setSync: (sync, opts) => enqueue_(async () => {
      if (opts && opts.clear) {
        const pin = D && D.settings ? D.settings.pin : '';
        D = { v: VERSION, settings: { pin: pin || '' }, kids: [], items: [], records: [], spends: [], createdAt: now_() };
      }
      if (!D) throw new Error('먼저 시작 설정을 해 주세요.');
      if (sync) D.sync = sync; else delete D.sync;
      buildFP_();
      await persist();
    }),
    /** 마지막으로 받은 시각 기록 */
    setLast: (col, ms) => enqueue_(async () => {
      if (!syncing_()) return;
      D.sync.last = D.sync.last || {};
      if (!(D.sync.last[col] >= ms)) { D.sync.last[col] = ms; await persist(); }
    }),
    /** 서버에서 온 변경 반영 */
    applyRemote: (col, docs) => enqueue_(async () => {
      const n = applyRemote_(col, docs);
      if (n) { await persist(); if (Store.onRemoteChange) Store.onRemoteChange(); }
      return n;
    }),
    /** 가족 연결만 끊고 기록은 이 기기에 남김 */
    detach: () => enqueue_(async () => { if (D) { delete D.sync; FP = null; await persist(); } }),
    /** 가족 데이터 삭제 후 이 기기도 비우기 */
    wipe: () => enqueue_(async () => { D = null; FP = null; await clearStore(); })
  };

  async function clearStore() {
    if (fallback) { localStorage.removeItem('allowance.' + DB_KEY); return; }
    await new Promise((res, rej) => {
      const tx = idb.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(DB_KEY);
      tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error);
    });
  }
})();
