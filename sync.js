/**
 * 가족 동기화 — Firebase(익명 로그인 + Firestore)
 * 서버 구조: families/{가족코드}  { members: [uid…], createdAt }
 *            families/{가족코드}/{kids|items|records|spends}/{id}  { ...내용, u: 서버시각, del?: true }
 * - 각 휴대폰은 자기 기기 저장소를 그대로 쓰고, 바뀐 건만 주고받습니다.
 * - 지운 것은 del:true 표시로 남겨 다른 휴대폰도 지우게 합니다.
 * - 처음 쓸 때만 Firebase 파일(vendor/)을 불러옵니다.
 */
(function () {
  'use strict';
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // 헷갈리는 0·O·1·I 제외
  const MAX_BATCH = 400;
  const OVERLAP_MS = 60 * 1000;

  let sdkPromise = null, fb = null, db = null, uid = null;
  let familyId = null, unsubs = [], status = 'off';

  const Sync = window.Sync = {
    available: () => !!window.FIREBASE_CONFIG,
    status: () => status,
    code: () => familyId,
    onStatus: null,      // (status) => void
    onFamilyGone: null,  // () => void — 다른 부모가 가족 데이터를 지웠을 때
    create, join, resume, leave, destroyFamily, shareCode: formatCode
  };

  function setStatus(s) { if (status !== s) { status = s; if (Sync.onStatus) Sync.onStatus(s); } }
  function formatCode(c) { c = c || familyId || ''; return c.length === 8 ? c.slice(0, 4) + '-' + c.slice(4) : c; }
  function normCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, ''); }
  function newCode() {
    const a = new Uint32Array(8); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, n => CODE_CHARS[n % CODE_CHARS.length]).join('');
  }
  function friendly(e) {
    const c = e && e.code || '';
    if (c.indexOf('unavailable') >= 0 || !navigator.onLine) return new Error('인터넷 연결을 확인해 주세요.');
    if (c.indexOf('permission-denied') >= 0) return new Error('가족 코드를 확인해 주세요. (권한이 없어요)');
    if (c.indexOf('operation-not-allowed') >= 0) return new Error('서버 설정이 끝나지 않았어요. (익명 로그인 사용 설정 필요)');
    return e instanceof Error ? e : new Error(String(e));
  }

  /* ---------- Firebase 불러오기 ---------- */
  function loadScript(src) {
    return new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = src; s.onload = res;
      s.onerror = () => rej(new Error('동기화 파일을 불러오지 못했어요.'));
      document.head.appendChild(s);
    });
  }
  function ready() {
    if (!Sync.available()) return Promise.reject(new Error('가족 동기화 서버가 아직 설정되지 않았어요.'));
    if (!sdkPromise) {
      sdkPromise = (async () => {
        if (!window.firebase) {
          await loadScript('vendor/firebase-app-compat.js');
          await loadScript('vendor/firebase-auth-compat.js');
          await loadScript('vendor/firebase-firestore-compat.js');
        }
        fb = window.firebase;
        if (!fb.apps.length) fb.initializeApp(window.FIREBASE_CONFIG);
        db = fb.firestore();
        try { await db.enablePersistence({ synchronizeTabs: true }); } catch (e) { /* 이미 켜졌거나 미지원 */ }
        const auth = fb.auth();
        const user = await new Promise(res => { const off = auth.onAuthStateChanged(u => { off(); res(u); }); });
        uid = user ? user.uid : (await auth.signInAnonymously()).user.uid;
      })().catch(e => { sdkPromise = null; throw friendly(e); });
    }
    return sdkPromise;
  }
  const famRef = id => db.collection('families').doc(id);

  /* ---------- 보내기 ---------- */
  async function push(changes) {
    if (!familyId || !db) return;
    const ts = fb.firestore.FieldValue.serverTimestamp();
    const ops = [];
    Object.keys(changes).forEach(col => {
      const ref = famRef(familyId).collection(col);
      changes[col].up.forEach(e => { const d = Object.assign({}, e, { u: ts }); delete d.del; ops.push([ref.doc(e.id), d]); });
      changes[col].del.forEach(id => ops.push([ref.doc(id), { del: true, u: ts }]));
    });
    for (let i = 0; i < ops.length; i += MAX_BATCH) {
      const b = db.batch();
      ops.slice(i, i + MAX_BATCH).forEach(o => b.set(o[0], o[1]));
      b.commit().catch(e => { console.warn('sync push', e); setStatus('error'); });
      // 오프라인이면 Firestore가 기기에 모아 두었다가 연결되면 보냅니다 (await 하지 않음)
    }
  }
  Store.onLocalChange = push;

  /* ---------- 받기 ---------- */
  function stop() { unsubs.forEach(f => f()); unsubs = []; }

  /** 가족 코드의 4가지 기록을 듣기 시작. 모든 종류가 서버에서 한 번씩 오면 resolve */
  function listen(sync) {
    stop();
    familyId = sync.familyId;
    setStatus('connecting');
    const last = sync.last || {};
    const firstFromServer = new Set();
    let resolveFirst;
    const first = new Promise(r => { resolveFirst = r; });

    unsubs.push(famRef(familyId).onSnapshot(snap => {
      if (snap.metadata.fromCache) return;
      if (!snap.exists || (snap.data().members || []).indexOf(uid) < 0) {
        stop(); familyId = null; setStatus('off');
        Store.detach().then(() => { if (Sync.onFamilyGone) Sync.onFamilyGone(); });
      }
    }, () => { }));

    Store.COLS.forEach(col => {
      const since = fb.firestore.Timestamp.fromMillis(Math.max(0, (last[col] || 0) - OVERLAP_MS));
      const q = famRef(familyId).collection(col).where('u', '>', since);
      unsubs.push(q.onSnapshot({ includeMetadataChanges: true }, snap => {
        const docs = snap.docChanges().filter(ch => ch.type !== 'removed').map(ch => ({ id: ch.doc.id, data: ch.doc.data() }));
        if (docs.length) Store.applyRemote(col, docs);
        if (!snap.metadata.fromCache) {
          let max = 0;
          snap.docs.forEach(d => { const u = d.get('u'); if (u && u.toMillis) max = Math.max(max, u.toMillis()); });
          if (max) Store.setLast(col, max);
          firstFromServer.add(col);
          if (firstFromServer.size === Store.COLS.length) resolveFirst();
          setStatus('online');
        } else if (!navigator.onLine) setStatus('offline');
      }, e => { console.warn('sync listen', col, e); setStatus('error'); }));
    });
    return first;
  }
  window.addEventListener('online', () => { if (familyId) setStatus('connecting'); });
  window.addEventListener('offline', () => { if (familyId) setStatus('offline'); });

  /* ---------- 가족 만들기 / 참여 / 나가기 / 삭제 ---------- */

  /** 이 휴대폰의 기록으로 새 가족 만들기 → 가족 코드 */
  async function create() {
    const snap = await Store.snapshot();
    if (!snap || !snap.ready) throw new Error('먼저 아이를 등록해 주세요.');
    if (snap.demo) throw new Error('예시 자료로는 가족을 만들 수 없어요. 「내 아이로 시작하기」 후 해 주세요.');
    if (snap.sync) throw new Error('이미 가족과 연결되어 있어요.');
    await ready();
    let code = null;
    try {
      for (let i = 0; i < 5 && !code; i++) {
        const c = newCode();
        const ex = await famRef(c).get();
        if (!ex.exists) {
          await famRef(c).set({ members: [uid], createdAt: fb.firestore.FieldValue.serverTimestamp(), v: 1 });
          code = c;
        }
      }
      if (!code) throw new Error('가족 코드를 만들지 못했어요. 다시 시도해 주세요.');
      // 지금까지의 기록 올리기
      const ts = fb.firestore.FieldValue.serverTimestamp(), ops = [];
      Store.COLS.forEach(col => snap.data[col].forEach(e => ops.push([famRef(code).collection(col).doc(e.id), Object.assign({}, e, { u: ts })])));
      for (let i = 0; i < ops.length; i += MAX_BATCH) {
        const b = db.batch(); ops.slice(i, i + MAX_BATCH).forEach(o => b.set(o[0], o[1])); await b.commit();
      }
    } catch (e) { throw friendly(e); }
    const sync = { familyId: code, last: {}, joinedAt: Date.now() };
    await Store.setSync(sync);
    listen(sync);
    return formatCode(code);
  }

  /** 가족 코드로 참여 — 이 휴대폰의 기존 기록은 가족 기록으로 바뀜 */
  async function join(codeInput) {
    const code = normCode(codeInput);
    if (code.length !== 8) throw new Error('가족 코드 8자리를 확인해 주세요.');
    const snap = await Store.snapshot();
    if (snap && snap.sync) throw new Error('이미 가족과 연결되어 있어요.');
    await ready();
    try {
      const doc = await famRef(code).get();
      if (!doc.exists) throw new Error('이 가족 코드를 찾을 수 없어요.');
      const members = doc.data().members || [];
      if (members.indexOf(uid) < 0) {
        if (members.length >= 10) throw new Error('이 가족은 인원이 가득 찼어요. (최대 10대)');
        await famRef(code).update({ members: fb.firestore.FieldValue.arrayUnion(uid) });
      }
    } catch (e) { throw friendly(e); }
    const sync = { familyId: code, last: {}, joinedAt: Date.now() };
    await Store.setSync(sync, { clear: true });
    const first = listen(sync);
    await Promise.race([first, new Promise(r => setTimeout(r, 20000))]);
    return formatCode(code);
  }

  /** 앱을 켤 때: 연결된 가족이 있으면 다시 듣기 */
  async function resume() {
    const snap = await Store.snapshot();
    if (!snap || !snap.sync || !snap.sync.familyId) return;
    familyId = snap.sync.familyId;
    if (!Sync.available()) { setStatus('error'); return; }
    setStatus('connecting');
    try { await ready(); listen(snap.sync); }
    catch (e) { setStatus(navigator.onLine ? 'error' : 'offline'); setTimeout(() => { if (familyId && status !== 'online') resume(); }, 30000); }
  }

  /** 이 휴대폰만 가족에서 빠짐 (기록은 이 휴대폰에 그대로 남음) */
  async function leave() {
    const snap = await Store.snapshot();
    if (!snap || !snap.sync) return;
    const code = snap.sync.familyId;
    try { await ready(); stop(); await famRef(code).update({ members: fb.firestore.FieldValue.arrayRemove(uid) }); }
    catch (e) { /* 서버에 못 알려도 이 기기는 연결을 끊음 */ }
    stop(); familyId = null; setStatus('off');
    await Store.detach();
  }

  /** 서버의 가족 데이터 전부 삭제 + 이 휴대폰도 비우기 */
  async function destroyFamily() {
    const snap = await Store.snapshot();
    if (!snap || !snap.sync) throw new Error('연결된 가족이 없어요.');
    const code = snap.sync.familyId;
    await ready();
    stop();
    try {
      for (const col of Store.COLS) {
        const all = await famRef(code).collection(col).get();
        for (let i = 0; i < all.docs.length; i += MAX_BATCH) {
          const b = db.batch(); all.docs.slice(i, i + MAX_BATCH).forEach(d => b.delete(d.ref)); await b.commit();
        }
      }
      await famRef(code).delete();
    } catch (e) { listen(snap.sync); throw friendly(e); }
    familyId = null; setStatus('off');
    await Store.wipe();
  }
})();
