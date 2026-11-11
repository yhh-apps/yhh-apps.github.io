/* 용돈 받아라 — 화면 (부모용). 데이터 호출은 store.js의 call() */
'use strict';
const S = { kids:[], items:[], kinds:[], methods:[], kidId:null, date:null, today:null, month:null, tab:'check', day:null, ledger:null, hasPin:false, locked:false };
const WEEK = ['일','월','화','수','목','금','토'];
const APP_VERSION = '1.0.0'; // 더보기에 보임. 배포할 때 sw.js CACHE 숫자와 함께 올리기
const LOCK_AFTER_MS = 5*60*1000; // 백그라운드에 5분 넘게 있으면 다시 잠금

/* ---------- 공통 ---------- */
function esc(s){return String(s==null?'':s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function won(n){n=Number(n||0);return (n<0?'-':'')+Math.abs(n).toLocaleString('ko-KR')+'원'}
function $(id){return document.getElementById(id)}
function parse(s){const p=s.split('-').map(Number);return new Date(Date.UTC(p[0],p[1]-1,p[2]))}
function fmt(d){return d.toISOString().slice(0,10)}
function addDays(s,n){const d=parse(s);d.setUTCDate(d.getUTCDate()+n);return fmt(d)}
function prettyDate(s){const d=parse(s);return (d.getUTCMonth()+1)+'월 '+d.getUTCDate()+'일 ('+WEEK[d.getUTCDay()]+')'}
function shortDate(s){const d=parse(s);return (d.getUTCMonth()+1)+'/'+d.getUTCDate()}
function addMonth(m,n){const p=m.split('-').map(Number);const d=new Date(Date.UTC(p[0],p[1]-1+n,1));return d.toISOString().slice(0,7)}
function prettyMonth(m){const p=m.split('-');return p[0]+'년 '+Number(p[1])+'월'}
function kid(){return S.kids.find(k=>k.id===S.kidId)||S.kids[0]}
function errMsg(e){return (e&&e.message?e.message:String(e)).replace(/^Error:\s*/,'')}
function kindBadge(k){return k?`<span class="badge ${k===S.kinds[0]?'need':'want'}">${esc(k)}</span>`:''}
/* 이름 뒤 조사: 받침이 있으면 「하준이의·하준이에게」, 없으면 「서아의·서아에게」 */
function hasJong(s){const c=String(s||'').trim().slice(-1).charCodeAt(0);return c>=0xAC00&&c<=0xD7A3&&(c-0xAC00)%28!==0}
function callName(n){n=String(n||'');return n+(hasJong(n)?'이':'')}
let toastT;
/* 알림: 글이 길수록 오래 보여 줌(2~7초), 누르면 바로 닫힘 */
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastT);
  toastT=setTimeout(()=>t.classList.remove('on'),Math.min(7000,Math.max(2200,String(msg).length*110)))}
function openModal(html){
  $('sheet').innerHTML=html;
  if(!$('modal').classList.contains('on')&&navState()!=='modal') pushNav('modal'); // 뒤로가기로 창만 닫히게
  $('modal').classList.add('on');
  updateAd();
}
function closeModal(fromBack){
  $('modal').classList.remove('on');
  if(!fromBack) setTimeout(()=>{ // 버튼으로 닫았으면 쌓아 둔 뒤로가기 한 칸을 정리 (바로 다른 창을 열었으면 그대로 씀)
    if(!$('modal').classList.contains('on')&&navState()==='modal') popNav();
  },0);
  if(pendingRefresh){pendingRefresh=false;if(!S.locked&&S.kids.length){renderKids();render()}}
  updateAd();
}

/* ---------- 휴대폰 뒤로가기 ----------
   창이 열려 있으면 창 닫기 → 다른 탭이면 첫 탭으로 → 첫 탭이면 「한 번 더 누르면 닫혀요」 → 2초 안에 또 누르면 앱 닫기.
   (그냥 두면 이전에 본 개인정보처리방침이나 앱 밖 주소로 넘어가 버림) */
let ignorePop=0, backArmed=0, navReady=false;
function navState(){return history.state&&history.state.nav}
function pushNav(kind){try{history.pushState({nav:kind},'')}catch(e){}}
function popNav(){ignorePop++;history.back()}
function initNav(){
  if(navReady) return; navReady=true;
  try{history.replaceState({nav:'root'},'');history.pushState({nav:'app'},'')}catch(e){}
}
window.addEventListener('popstate',()=>{
  if(!navReady) return;
  if(ignorePop>0){ignorePop--;return}
  if($('modal').classList.contains('on')){closeModal(true);return}
  if(navState()==='modal') return popNav(); // 닫힌 창의 남은 칸은 건너뜀
  if(!$('tabs').classList.contains('hide')&&S.tab!=='check'){setTab('check',true);return}
  if(navState()==='root'){
    if(Date.now()-backArmed<2000){ignorePop=0;history.back();return} // 앱 닫기
    backArmed=Date.now(); pushNav('app'); toast('뒤로 버튼을 한 번 더 누르면 앱이 닫혀요');
  }
});
function store(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function load(k){try{return localStorage.getItem(k)}catch(e){return null}}
function showErr(e){$('view').innerHTML='<div class="card warn">'+esc(errMsg(e))+'</div>'}

/* ---------- 시작 ---------- */
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));

/* 카톡 외 다른 앱 안의 브라우저(네이버·인스타·페북·라인 등)로 열렸으면 안내 */
if(/NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|KAKAOTALK|DaumApps|everytimeApp|; wv\)/i.test(navigator.userAgent)) $('inappBar').classList.remove('hide');

/* 가족 초대 링크: ?join=가족코드 로 열면 코드를 자동으로 넣어 줌 */
let INVITE=null, INVITE_GP=false, INVITE_KID='';
try{
  const q=new URLSearchParams(location.search), j=(q.get('join')||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(j.length===8){ INVITE=j; INVITE_GP=q.get('gp')==='1'; INVITE_KID=(q.get('kid')||'').replace(/[^a-z0-9]/g,'').slice(0,30); }
  if(q.has('join')) history.replaceState(null,'',location.pathname);
}catch(e){}
function applyInvite(){
  if(!INVITE||!Sync.available()) return;
  const c=INVITE; INVITE=null; const shown=Sync.shareCode(c);
  if(!S.kids.length&&INVITE_GP){ renderGpSetup(c); return; } // 조부모 초대
  if(!S.kids.length&&INVITE_KID){ renderKidSetup(c,INVITE_KID); return; } // 자녀 기기 초대
  if(!S.kids.length){ // 첫 화면: 코드를 넣은 참여 창을 바로 띄움
    openJoinSetup(shown);
    return;
  }
  if(S.family===c){toast('이미 이 가족과 연결되어 있어요');return}
  if(S.family){
    openModal(`<h3>다른 가족 초대예요</h3><div>이 휴대폰은 이미 다른 가족(${esc(Sync.shareCode(S.family))})과 연결되어 있어요.</div>
      <div class="muted" style="margin-top:6px">새 가족(${esc(shown)})에 참여하려면 「더보기 → 가족 연결 → 이 휴대폰 연결 끊기」를 한 뒤 코드를 입력해 주세요.</div>
      <button class="btn full" onclick="closeModal()">확인</button>`);
    return;
  }
  askJoinFamily(); $('joinCode').value=shown;
}

// 모든 스크립트(plus.js 등)를 다 불러온 뒤에 시작
function boot(){
  call('getInitData').then(d=>{
    applyInit(d);
    if(!d.ready){ renderSetup(); applyInvite(); return; }
    if(d.family) Sync.resume();
    if(d.hasPin&&d.role!=='kid'){S.locked=true;return renderLock();}
    startMain();
  }).catch(showErr);
}
if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();

/* ---------- 가족 동기화 연결 ---------- */
let remoteT=null, pendingRefresh=false;
Store.onRemoteChange=()=>{clearTimeout(remoteT);remoteT=setTimeout(refreshFromRemote,250)};
function refreshFromRemote(){
  call('getInitData').then(d=>{
    if(!d.ready) return;
    applyInit(d);
    if(S.locked||!$('tabs')||$('tabs').classList.contains('hide')) return;
    if($('modal').classList.contains('on')){pendingRefresh=true;return}
    renderKids(); render();
  });
}
Sync.onStatus=()=>{ const el=$('syncStatus'); if(el) el.innerHTML=statusHtml(); };
Sync.onFamilyGone=()=>{
  S.family=null;
  openModal(`<h3>가족 연결이 끊겼어요</h3><div>다른 부모님이 가족 데이터를 삭제했거나 이 휴대폰을 가족에서 뺐어요.</div>
    <div class="muted" style="margin-top:6px">지금까지의 기록은 이 휴대폰에 그대로 남아 있어요.</div>
    <button class="btn full" onclick="closeModal()">확인</button>`);
  if(S.tab==='manage') renderManage();
};
function statusHtml(){
  const s=Sync.status(), t={online:'연결됨 · 실시간으로 맞춰지고 있어요',connecting:'연결하는 중…',offline:'오프라인 · 인터넷이 연결되면 자동으로 맞춰요',error:'연결에 문제가 있어요 · 잠시 후 다시 시도해요',off:'연결 안 됨'}[s]||s;
  return `<span class="dot ${s}"></span>${t}`;
}

function applyInit(d){
  S.kids=d.kids;S.items=d.items;S.kinds=d.kinds;S.methods=d.methods;S.hasPin=d.hasPin;S.demo=!!d.demo;S.family=d.family||null;
  S.plus=d.plus||{active:false};S.role=d.role||'parent';S.gpName=d.gpName||'';
  const prevPend=S.pendingCount||0; S.pendingCount=d.pendingCount||0; S.pay=d.pay||null; S.kidRole=d.kidRole||null; S.account=d.account||'';
  if(S.role==='parent'&&S.pendingCount>prevPend&&S.kids.length&&prevPend>=0&&S.started) toast('📸 자녀가 실천 인증을 보냈어요!');
  if(S.kidRole) S.kidId=S.kidRole.kidId;
  setTabLabels();
  S.today=d.today;
  $('demoBar').classList.toggle('hide',!S.demo);
  if(!S.kids.some(k=>k.id===S.kidId)) S.kidId=S.kids[0]&&S.kids[0].id;
}
function startMain(){
  // 보호자 화면은 어른만: 이 휴대폰에서 나이 확인을 아직 안 했으면 먼저 확인 (자녀·조부모 화면은 건너뜀)
  if(S.role==='parent'&&!S.kidRole&&!adultOk()){ afterAge=startMain; return renderAgeGate(); }
  S.locked=false; S.started=true;
  S.date=S.date||S.today; S.month=S.month||S.today.slice(0,7);
  const saved=load('kidId');
  if(S.kids.some(k=>k.id===saved)&&!S.kidRole) S.kidId=saved;
  $('tabs').classList.remove('hide');
  initNav();
  $('demoBar').classList.toggle('hide',!S.demo);
  renderKids(); render();
  applyInvite();
  runAccrue();
}
// 엄마·아빠 은행: 지난달까지의 이자 붙이기 (부모 휴대폰에서만)
function runAccrue(){
  if(S.role==='gp'||!S.plus.active) return;
  call('accrueInterest').then(n=>{ if(n){ toast('🏦 엄마·아빠 은행 이자가 들어왔어요!'); render(); } }).catch(()=>{});
}
function isGp(){return S.role==='gp'}

/* ---------- 나이 확인 (가족 정책의 「중립적인 나이 확인」) ----------
   보호자 화면(어른용)을 열기 전에 태어난 해를 물어봄. 정답을 암시하지 않도록 빈칸에서 시작하고, 나이 기준도 화면에 쓰지 않음.
   만 19세 이상(연도 기준)이면 보호자 화면, 아니면 자녀 화면 시작(가족 코드)으로 안내. 결과는 이 기기에만 저장(태어난 해 자체는 저장 안 함) */
const ADULT_AGE=19;
let afterAge=null;
function adultOk(){return load('adultOk')==='1'}
function isKidDevice(){return load('ageKid')==='1'}
function adsAllowed(){ // 나중에 광고를 넣을 때 쓸 조건: 어른 확인된 보호자 화면 + 플러스 안 산 사람 + 예시 자료 아님. 자녀·조부모 화면은 절대 안 됨
  return S.role==='parent'&&!S.kidRole&&adultOk()&&!(S.plus&&S.plus.purchased)&&!S.demo;
}
function renderAgeGate(){
  $('tabs').classList.add('hide'); $('kids').innerHTML=''; $('demoBar').classList.add('hide'); closeModal();
  const y=new Date().getFullYear(), years=[];
  for(let i=y;i>=y-100;i--) years.push(i);
  $('view').innerHTML=`<div class="card setupcard">
    <div class="jua" style="font-size:21px">👋 반가워요!</div>
    <div style="margin-top:6px">시작하기 전에 태어난 해를 알려 주세요.</div>
    <select id="ageYear" style="margin-top:12px;font-size:17px;padding:12px"><option value="">태어난 해 고르기</option>${years.map(v=>`<option value="${v}">${v}년</option>`).join('')}</select>
    <button class="btn full big" onclick="checkAge()">다음</button>
    <div class="muted center" style="margin-top:8px">태어난 해는 저장하지 않아요</div>
  </div>`;
}
function checkAge(){
  const v=Number($('ageYear').value);
  if(!v){toast('태어난 해를 골라 주세요');return}
  if(new Date().getFullYear()-v>=ADULT_AGE){ store('adultOk','1'); const f=afterAge||renderSetup; afterAge=null; f(); }
  else { store('ageKid','1'); renderKidStart(); }
}
/* 자녀가 자기 휴대폰에서 처음 열었을 때: 가족 코드 → 내 이름 고르기 → 광고 없는 자녀 화면 */
function renderKidStart(){
  $('tabs').classList.add('hide'); $('kids').innerHTML=''; $('demoBar').classList.add('hide'); updateAd();
  $('view').innerHTML=`<div class="card setupcard center">
    <div style="font-size:54px">🧒</div>
    <div class="jua" style="font-size:22px">내 용돈 통장 시작!</div>
    <div style="margin-top:6px">엄마·아빠에게 <b>가족 코드</b>를 받아서 넣어 주세요.</div>
    <input id="kidCode" class="codein" placeholder="ABCD-EFGH" maxlength="9" autocomplete="off" style="margin-top:12px">
    <button class="btn full big" style="background:var(--green)" id="kidCodeBtn" onclick="doKidCodeJoin()">다음</button>
    <div class="muted" style="margin-top:8px">엄마·아빠 휴대폰의 「더보기 → 가족 연결」에 가족 코드가 있어요.</div>
  </div>`;
}
function doKidCodeJoin(){
  if(!Sync.available()){toast('지금은 가족 연결을 쓸 수 없어요');return}
  const b=$('kidCodeBtn'); b.disabled=true; b.textContent='찾는 중…';
  Sync.join($('kidCode').value).then(()=>call('getInitData')).then(d=>{
    applyInit(d);
    if(!d.kids.length){toast('가족에 아직 자녀가 없어요. 엄마·아빠에게 물어봐요');b.disabled=false;b.textContent='다음';return}
    $('view').innerHTML=`<div class="card setupcard center"><div class="jua" style="font-size:22px">누구예요?</div>
      <div class="list" style="margin-top:12px;text-align:left">${d.kids.map(k=>`<button class="lrow" onclick="doKidPick('${k.id}')"><span class="li">${esc(k.emoji)}</span><span class="lt">${esc(k.name)}</span><span class="chev">›</span></button>`).join('')}</div></div>`;
  }).catch(e=>{b.disabled=false;b.textContent='다시 시도';toast(errMsg(e))});
}
function doKidPick(kidId){
  call('setKidRole',kidId,false).then(d=>{applyInit(d);S.tab='check';S.date=null;S.month=null;startMain();toast('반가워요! 오늘도 화이팅 💪')})
    .catch(e=>toast(errMsg(e)));
}

/* ---------- 처음 시작 ---------- */
function renderSetup(){
  $('tabs').classList.add('hide'); $('kids').innerHTML=''; $('demoBar').classList.add('hide'); updateAd();
  if(!adultOk()){ if(isKidDevice()) return renderKidStart(); afterAge=renderSetup; return renderAgeGate(); }
  // 첫 화면은 「이름 넣고 시작하기」 하나만 크게, 나머지 시작 방법은 한 줄씩 (누르면 창으로 자세히)
  const sync=Sync.available();
  $('view').innerHTML=`<div class="card setupcard">
    <div class="jua" style="font-size:21px">👋 자녀 이름을 알려 주세요</div>
    <div id="setupKids"><div class="kidrow"><input class="skid" placeholder="예: 첫째 (별명도 좋아요)"></div></div>
    <button class="btn sm ghost" style="margin-top:8px" onclick="addSetupKid()">+ 자녀 더 추가</button>
    <button class="btn full big" id="setupBtn" onclick="doSetup()">시작하기</button>
    <div class="muted center" style="margin-top:8px">🔒 회원가입 없이 이 휴대폰에 저장돼요</div>
  </div>
  <div class="lhead">다른 방법으로 시작하기</div>
  <div class="list">
    <button class="lrow" id="demoBtn" onclick="doDemo()"><span class="li">👀</span><span class="lt">예시로 먼저 둘러보기</span><span class="chev">›</span></button>
    ${sync?`<button class="lrow" onclick="openJoinSetup()"><span class="li">👨‍👩‍👧</span><span class="lt">가족 코드로 참여하기</span><span class="chev">›</span></button>
    <button class="lrow" onclick="openRestoreSetup()"><span class="li">📲</span><span class="lt">Google 계정으로 기록 되찾기</span><span class="chev">›</span></button>`:''}
    <button class="lrow" onclick="$('importFile').click()"><span class="li">📂</span><span class="lt">백업 파일에서 불러오기</span><span class="chev">›</span></button>
  </div>
  <div class="muted center" style="margin-top:6px">기본 실천 항목이 들어가요. 시작한 뒤 언제든 바꿀 수 있어요.</div>`;
}
function openRestoreSetup(){openModal(restoreCardHtml()+'<button class="btn full ghost" onclick="closeModal()">닫기</button>')}
/* 첫 화면: 다른 부모님이 먼저 만든 가족에 참여 (code: 초대 링크로 열었을 때 미리 넣을 코드) */
function openJoinSetup(code){
  openModal(`<h3>👨‍👩‍👧 가족 코드로 참여하기</h3>
    <div class="muted">먼저 쓰고 있는 휴대폰의 「더보기 → 가족 연결」에 나오는 가족 코드를 넣어 주세요.</div>
    <input id="joinCode" class="codein" placeholder="ABCD-EFGH" maxlength="9" autocomplete="off" style="margin-top:10px" value="${esc(code||'')}">
    <button class="btn full" style="background:var(--green)" id="joinBtn" onclick="doJoin()">참여하기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function doDemo(){
  $('demoBtn').disabled=true;
  call('loadDemo').then(d=>{applyInit(d);S.date=null;S.month=null;startMain();toast('예시 자료를 불러왔어요')})
    .catch(e=>{$('demoBtn').disabled=false;toast(errMsg(e))});
}
function askEndDemo(){
  openModal(`<h3>내 자녀로 시작하기</h3>
    <div>예시 자료를 모두 지우고, 내 자녀 이름으로 새로 시작해요.</div>
    <button class="btn full" onclick="endDemo()">예시 지우고 시작하기</button>
    <button class="btn full ghost" onclick="closeModal()">계속 둘러보기</button>`);
}
function endDemo(){
  call('resetAll').then(()=>{closeModal();S.kids=[];S.hasPin=false;S.demo=false;S.tab='check';S.date=null;S.month=null;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab==='check'));
    $('demoBar').classList.add('hide');renderSetup();window.scrollTo(0,0)}).catch(e=>toast(errMsg(e)));
}
function addSetupKid(){
  const div=document.createElement('div'); div.className='kidrow';
  div.innerHTML='<input class="skid" placeholder="예: 둘째">';
  $('setupKids').appendChild(div); div.querySelector('input').focus();
}
function doSetup(){
  const names=[].map.call(document.querySelectorAll('.skid'),i=>i.value);
  $('setupBtn').disabled=true;
  call('setupApp',names).then(d=>{applyInit(d);startMain();toast('시작해 볼까요? 🎉')})
    .catch(e=>{$('setupBtn').disabled=false;toast(errMsg(e))});
}

/* ---------- 앱 잠금 ---------- */
function renderLock(){
  $('tabs').classList.add('hide'); $('kids').innerHTML=''; $('demoBar').classList.add('hide'); closeModal();
  $('view').innerHTML=`<div class="card center">
    <div class="jua" style="font-size:21px">🔒 잠겨 있어요</div>
    <div class="muted" style="margin-top:4px">부모 비밀번호를 입력해 주세요.</div>
    <input id="pinIn" type="password" inputmode="numeric" autocomplete="off" style="margin-top:12px;text-align:center;letter-spacing:6px" onkeydown="if(event.key==='Enter')unlock()">
    <button class="btn full" onclick="unlock()">열기</button></div>`;
  setTimeout(()=>{const p=$('pinIn');if(p)p.focus()},50);
}
function unlock(){
  call('verifyPin',$('pinIn').value).then(()=>startMain()).catch(e=>{toast(errMsg(e));$('pinIn').value=''});
}
let hiddenAt=0;
document.addEventListener('visibilitychange',()=>{
  if(document.hidden){hiddenAt=Date.now();return}
  if(S.hasPin&&!isKid()&&!S.locked&&hiddenAt&&Date.now()-hiddenAt>LOCK_AFTER_MS){S.locked=true;renderLock()}
  else if(!S.locked&&S.kids.length){ // 날짜가 바뀌었으면 오늘로
    call('getInitData').then(d=>{ if(d.today!==S.today){const wasToday=S.date===S.today;S.today=d.today;if(wasToday)S.date=d.today;render();runAccrue()} });
  }
});

/* ---------- 탭 ---------- */
function renderKids(){
  $('kids').innerHTML = S.kids.map(k=>
    `<button class="kid ${k.id===S.kidId?'on':''}" onclick="pickKid('${k.id}')">${esc(k.emoji)} ${esc(k.name)}</button>`).join('');
  $('kids').style.display = (S.tab==='manage'||S.tab==='items'||S.kids.length<2||isKid())?'none':'flex';
}
function pickKid(id){S.kidId=id;store('kidId',id);renderKids();render()}
function setTab(t,fromBack){
  if(!fromBack&&navReady){ // 첫 탭에서 다른 탭으로 가면 뒤로가기 한 칸, 첫 탭으로 돌아오면 그 칸 정리
    if(t!=='check'&&navState()==='app') pushNav('tab');
    else if(t==='check'&&navState()==='tab') popNav();
  }
  S.tab=t;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
  renderKids();render();window.scrollTo(0,0);
}
function render(){
  if(S.locked) return;
  updateAd();
  if(S.tab==='manage') return isKid()?renderKidGoals():renderManage();
  if(S.tab==='items') return renderItems();
  if(S.tab==='check') return loadDay();
  if(S.tab==='ledger') return loadLedger();
}

/* ---------- 실천 체크 ---------- */
function loadDay(){
  const kidId=S.kidId, date=S.date;
  call('getDay',kidId,date).then(d=>{ if(S.tab==='check'&&S.kidId===kidId){S.day=d;S.today=d.today;renderDay()} }).catch(showErr);
}
function moveDate(n){const nd=addDays(S.date,n); if(nd>S.today) return; S.date=nd; loadDay()}
function goToday(){S.date=S.today;loadDay()}

function renderDay(){
  if(isKid()) return renderKidDay();
  const d=S.day, k=kid();
  const daily=d.items.filter(i=>i.period==='매일'&&i.amount>=0), weekly=d.items.filter(i=>i.period==='매주'&&i.amount>=0);
  const fineItems=d.items.filter(i=>i.amount<0);
  const dayMax = daily.reduce((s,i)=>s+i.amount*i.maxCount,0);
  let h = `${pendingBannerHtml()}
  <div class="card balcard">
    <div class="row" style="align-items:flex-end">
      <div style="min-width:0"><div class="bal-label">${esc(k.emoji)} ${esc(callName(k.name))}의 통장 잔액</div>
        <div class="bal ${d.balance<0?'minus':''}">${won(d.balance)}</div></div>
      ${isGp()?'':'<button class="btn sm spendbtn" onclick="openSpend()">🛒 지출 기록</button>'}
    </div>
    ${d.balance<0?'<div class="muted" style="color:var(--red)">마이너스예요. 실천으로 채워 가도록 이야기 나눠 보세요.</div>':''}
    ${jarsHtml(d.jars)}
    ${goalMiniHtml(k,d.balance)}
  </div>
  <div class="datenav">
    <button class="nav" onclick="moveDate(-1)" aria-label="전날">◀</button>
    <div class="d">${d.date===d.today?'오늘 · ':''}${prettyDate(d.date)}</div>
    <button class="nav" onclick="moveDate(1)" aria-label="다음날" ${d.date>=d.today?'disabled':''}>▶</button>
  </div>
  ${d.date!==d.today?`<div style="text-align:center;margin:-4px 0 10px"><button class="btn sm ghost" onclick="goToday()">오늘로 가기</button></div>`:''}
  <div class="row" style="padding:0 4px"><span class="muted">이날 모은 돈</span><span class="amt">${won(d.dayEarned)}</span></div>`;
  if(daily.length) h+=`<div class="sec">☀️ 매일 실천 <span class="muted">(하루 최대 ${won(dayMax)})</span></div>`+daily.map(itemHtml).join('');
  if(weekly.length) h+=`<div class="sec">📅 이번 주 실천 <span class="muted">(월~일 한 주 동안)</span></div>`+weekly.map(itemHtml).join('');
  if(fineItems.length) h+=`<div class="sec">⚠️ 벌금 <span class="muted">(약속을 지키지 못했을 때)</span></div>`+fineItems.map(itemHtml).join('');
  if(!d.items.length) h+='<div class="card muted">등록된 항목이 없어요. 「자녀·항목」 탭에서 항목을 추가해 주세요.</div>';
  // 실천 체크 탭은 체크만. 특별 보너스 넣기·결과 보내기·응원은 통장 탭 잔액 카드에 있음
  $('view').innerHTML=h;
}
// 세 개의 통장 (플러스)
const JAR_LABEL={spend:['🛍️','쓰기'],save:['🫙','저축'],give:['💝','나눔']};
function jarsHtml(j){
  if(!j) return '';
  return `<div class="jars">${['spend','save','give'].map(x=>`<div class="jar ${x}"><span>${JAR_LABEL[x][0]} ${JAR_LABEL[x][1]} <small>${j.ratio[x]}%</small></span><b class="${j[x]<0?'out':''}">${won(j[x])}</b></div>`).join('')}</div>`;
}
// 엄마·아빠 은행 이자 안내 (플러스)
function interestHtml(d){
  if(!(d.interestRate>0)) return '';
  const base=d.jars?d.jars.save:d.balance, next=Math.max(0,Math.floor(base*d.interestRate/100));
  return `<div class="bankline">🏦 엄마·아빠 은행 이자 <b>월 ${d.interestRate}%</b> · 다음 달 1일 예상 <b>+${won(next)}</b>
    <div class="muted">${d.jars?'저축 통장':'통장'}에 그대로 두면 이자가 붙어요. 쓰지 않고 모을수록 더 많이!</div></div>`;
}
// 실천 탭용 한 줄 목표 (자세한 건 통장 탭)
function goalMiniHtml(k,bal){
  if(!k.goalName||!k.goalAmount) return '';
  const p=Math.max(0,Math.min(100,Math.round(bal/k.goalAmount*100)));
  return `<div class="goalmini"><span>🎯 ${esc(k.goalName)}</span><div class="bar"><i style="width:${p}%"></i></div><b>${p}%</b></div>`;
}
function goalHtml(k,bal){
  if(!k.goalName||!k.goalAmount) return '';
  const p=Math.max(0,Math.min(100,Math.round(bal/k.goalAmount*100)));
  return `<div style="margin-top:14px"><div class="row"><span>🎯 저축 목표: <b>${esc(k.goalName)}</b></span><span class="muted">${p}%</span></div>
    <div class="bar"><i style="width:${p}%"></i></div>
    <div class="muted">${bal>=k.goalAmount?'목표 금액을 모았어요! 🏆':'앞으로 '+won(k.goalAmount-Math.max(0,bal))+' 더 모으면 돼요'}</div></div>`;
}
function itemHtml(i){
  let boxes='';
  for(let n=1;n<=i.maxCount;n++){
    boxes+=`<button class="box ${n<=i.count?'on':''}" ${isGp()?'disabled':`onclick="tapBox('${i.id}',${n})"`} aria-label="${n}번째">${n<=i.count?'✓':''}</button>`;
  }
  const cls = (i.count>=i.maxCount?'full':(i.count>0?'some':''))+(i.amount<0?' fine':'');
  const tot=i.amount*i.count;
  const sign=v=>v>0?'+'+won(v):v<0?'−'+won(-v):won(0);
  return `<div class="item ${cls}" id="it_${i.id}">
    <div class="n">${esc(i.name)}</div><div class="m">${esc(i.meaning)}</div>
    <div class="boxes">${boxes}
      <div class="info"><div class="amt ${tot?'':'zero'}">${sign(tot)}</div><div class="muted">1번 ${sign(i.amount)} · ${i.count}/${i.maxCount}</div></div>
    </div></div>`;
}
// n번째 칸을 누르면: 비어 있으면 n개까지 채우고, 이미 채워진 칸이면 그 칸부터 지움
function tapBox(itemId,n){
  const item=S.day.items.find(i=>i.id===itemId); if(!item) return;
  const next = n<=item.count ? n-1 : n;
  const diff = next-item.count;
  const el=$('it_'+itemId); el.classList.add('busy');
  const kidId=S.kidId;
  call('setCount',kidId,itemId,S.date,next).then(d=>{
    if(S.kidId!==kidId||S.tab!=='check') return;
    S.day=d; renderDay();
    toast(diff<0?'체크를 취소했어요':item.amount<0?'벌금 '+won(item.amount*diff)+' 기록':'+'+won(item.amount*diff)+' 적립! 👏');
  }).catch(e=>{el.classList.remove('busy');toast(errMsg(e))});
}

/* ---------- 자녀에게 보내기 (카톡·문자 등 공유) ---------- */
function plus(n){return (n>=0?'+':'')+won(n)}
function goalLine(k,bal){
  if(!k.goalName||!k.goalAmount) return '';
  return bal>=k.goalAmount?`🎯 ${k.goalName} 목표 금액을 다 모았어! 🏆`:`🎯 ${k.goalName}까지 ${won(k.goalAmount-Math.max(0,bal))} 남았어!`;
}
function buildDayMsg(){
  const d=S.day, k=kid(), L=[];
  L.push(`${k.emoji} ${callName(k.name)}의 ${d.date===d.today?'오늘':''} 실천 (${prettyDate(d.date)})`.replace('  ',' '));
  const done=d.items.filter(i=>i.amount>=0&&d.dayCounts[i.id]), fines=d.items.filter(i=>i.amount<0&&d.dayCounts[i.id]);
  L.push('');
  if(done.length) done.forEach(i=>{const n=d.dayCounts[i.id];L.push(`✅ ${i.name}${n>1?' ×'+n:''}  ${plus(i.amount*n)}`)});
  else L.push('아직 체크한 실천이 없어요.');
  fines.forEach(i=>{const n=d.dayCounts[i.id];L.push(`⚠️ ${i.name}${n>1?' ×'+n:''}  ${won(i.amount*n)}`)});
  (d.interests||[]).forEach(x=>L.push(`🏦 엄마·아빠 은행 ${x.name}  ${plus(x.amount)}`));
  d.bonuses.forEach(b=>L.push(`🎁 ${b.name}  ${plus(b.amount)}`));
  (d.cheers||[]).forEach(c=>L.push(`💌 ${c.name}`));
  d.daySpends.filter(s=>s.method!=='통장 이체').forEach(s=>L.push(`${s.jar==='give'?'💝':'🛒'} ${s.name}  -${won(s.amount)}`));
  d.daySpends.filter(s=>s.method==='통장 이체').forEach(s=>L.push(`🏦 실물 통장에 저축  ${won(s.amount)}`));
  L.push('');
  L.push(`💰 이날 모은 돈: ${plus(d.dayEarned)}`);
  L.push(`📒 지금 통장 잔액: ${won(d.balance)}`);
  if(d.jars) L.push(`   └ 🛍️ 쓰기 ${won(d.jars.spend)} · 🫙 저축 ${won(d.jars.save)} · 💝 나눔 ${won(d.jars.give)}`);
  const g=goalLine(k,d.balance); if(g) L.push(g);
  L.push('');
  const isToday=d.date===d.today;
  L.push(fines.length?'약속은 다음에 꼭 지켜 보자! 그래도 수고했어 💪':done.length?(isToday?'오늘도 정말 잘했어! 👏':'정말 잘했어! 👏'):'내일은 함께 해 보자! 😊');
  return L.join('\n');
}
function buildMonthMsg(){
  const Lg=S.ledger, k=kid(), m=Number(Lg.month.slice(5)), L=[];
  L.push(`${k.emoji} ${callName(k.name)}의 ${m}월 용돈 통장`);
  L.push('');
  L.push(`✅ 실천으로 번 돈  +${won(Lg.monthIn)}`);
  if(Lg.monthBonus) L.push(`🎁 특별 보너스  +${won(Lg.monthBonus)}`);
  if(Lg.monthInterest) L.push(`🏦 엄마·아빠 은행 이자  +${won(Lg.monthInterest)}`);
  if(Lg.monthFine) L.push(`⚠️ 벌금  -${won(Lg.monthFine)}`);
  if(Lg.monthOut) L.push(`🛒 쓴 돈  -${won(Lg.monthOut)}`);
  if(Lg.monthSaved) L.push(`🏦 실물 통장에 저축  ${won(Lg.monthSaved)}`);
  if(Lg.monthOut){
    const need=Lg.kindSum[S.kinds[0]]||0, want=Lg.kindSum[S.kinds[1]]||0;
    L.push(`   └ 꼭 필요한 것 ${won(need)} · 갖고 싶은 것 ${won(want)}`);
  }
  if(Lg.stats.length){
    L.push('');
    L.push('🏅 가장 많이 실천한 것');
    Lg.stats.slice(0,3).forEach((s,i)=>L.push(`${['🥇','🥈','🥉'][i]} ${s.name} ${s.count}번`));
  }
  L.push('');
  L.push(`📒 지금 통장 잔액: ${won(Lg.balance)}`);
  if(Lg.jars) L.push(`   └ 🛍️ 쓰기 ${won(Lg.jars.spend)} · 🫙 저축 ${won(Lg.jars.save)} · 💝 나눔 ${won(Lg.jars.give)}`);
  if(Lg.totalSaved) L.push(`🏦 지금까지 저축한 돈: ${won(Lg.totalSaved)}`);
  const g=goalLine(k,Lg.balance); if(g) L.push(g);
  L.push('');
  L.push('한 달 동안 정말 수고했어! 👏');
  return L.join('\n');
}
function shareDay(){previewShare(buildDayMsg(),'하루 결과 보내기')}
function shareMonth(){previewShare(buildMonthMsg(),'한 달 통장 보내기')}
/* 통장 탭 잔액 카드의 버튼 줄: 보호자는 보너스 넣기·실물 통장 이체·결과 보내기, 조부모는 응원·용돈 보내기, 자녀는 없음 */
function ledgerActionsHtml(){
  if(isGp()) return '<div class="actrow"><button class="act" style="--c:#FFB020" onclick="openCheer()"><b>💌</b>응원·용돈 보내기</button></div>';
  if(viewOnly()) return '';
  return '<div class="actrow">'+
    '<button class="act" style="--c:#FFB020" onclick="openBonus()"><b>🎁</b>보너스 넣기</button>'+
    '<button class="act" style="--c:var(--blue)" onclick="openTransfer()"><b>🏦</b>통장 이체</button>'+
    '<button class="act" style="--c:var(--green)" onclick="openShare()"><b>💬</b>결과 보내기</button></div>';
}
/* 결과 보내기: 「그날 실천 결과 / 그달 통장」 중 골라서 보내기 */
function openShare(){
  const k=kid(), date=S.date||S.today, month=S.tab==='ledger'&&S.month?S.month:date.slice(0,7);
  S.shareMonth=month;
  openModal(`<h3>💬 ${esc(callName(k.name))}에게 보내기</h3>
    <div class="muted">카톡·문자로 보낼 내용을 골라 주세요. 보내기 전에 내용을 보고 한마디 덧붙일 수 있어요.</div>
    <div class="list" style="margin-top:10px">
      <button class="lrow" onclick="shareDayNow()"><span class="li">✅</span><span class="lt">${date===S.today?'오늘':prettyDate(date)} 실천 결과</span><span class="chev">›</span></button>
      <button class="lrow" onclick="shareMonthNow()"><span class="li">📒</span><span class="lt">${Number(month.slice(5))}월 통장</span><span class="chev">›</span></button>
    </div>
    <button class="btn full ghost" onclick="closeModal()">닫기</button>`);
}
function shareDayNow(){
  call('getDay',S.kidId,S.date||S.today).then(d=>{S.day=d;shareDay()}).catch(e=>toast(errMsg(e)));
}
function shareMonthNow(){
  call('getLedger',S.kidId,S.shareMonth).then(L=>{ // 통장 탭이 보고 있는 내역(S.ledger)은 건드리지 않음
    const keep=S.ledger;S.ledger=L;const t=buildMonthMsg();S.ledger=keep;previewShare(t,'한 달 통장 보내기')}).catch(e=>toast(errMsg(e)));
}
// 보내기 전 미리보기: 내용을 고치거나 한마디 덧붙인 뒤 보내기/복사
function previewShare(text,title,noCheer){
  openModal(`<h3>💬 ${esc(title)}</h3>
    <div class="muted">보낼 내용이에요. 고치거나 한마디 덧붙여도 돼요.</div>
    <textarea id="shareTxt" style="min-height:240px;font-size:14px;margin-top:8px">${esc(text)}</textarea>
    <div class="chips ${noCheer?'hide':''}" style="margin-top:8px">${CHEERS.map((c,i)=>`<button type="button" onclick="addCheer(${i})">${esc(c)}</button>`).join('')}</div>
    <button class="btn full big" style="background:var(--green)" onclick="sendShare()">📤 공유하기</button>
    <button class="btn full ghost" onclick="closeModal()">닫기</button>`);
}
const CHEERS=['사랑해 ❤️','자랑스러워 👍','내일도 화이팅 💪','저금 목표까지 조금만 더! 🎯'];
function addCheer(i){const t=$('shareTxt');t.value=t.value.replace(/\s*$/,'')+'\n'+CHEERS[i];t.scrollTop=t.scrollHeight}
/* 공유하기: 먼저 복사해 두고(공유 창에서 붙여 넣기도 되게) 휴대폰의 공유 창을 띄움. 공유 창이 없는 곳(컴퓨터 등)은 복사만 */
async function sendShare(){
  const text=$('shareTxt').value;
  const copied=copyText(text,$('shareTxt'));
  if(navigator.share){
    try{await navigator.share({text:text});closeModal();toast('보냈어요 💬');return}
    catch(e){if(e&&e.name==='AbortError'){copied.then(ok=>{if(ok)toast('복사해 두었어요. 필요하면 붙여 넣어 보내세요')});return}}
  }
  copied.then(ok=>toast(ok?'복사했어요. 카카오톡 등에 붙여 넣어 보내세요':'직접 길게 눌러 복사해 주세요'));
}
function copyText(text,ta){ // 복사 성공하면 true
  if(navigator.clipboard&&navigator.clipboard.writeText) return navigator.clipboard.writeText(text).then(()=>true).catch(()=>execCopy(text,ta));
  return Promise.resolve(execCopy(text,ta));
}
function execCopy(text,ta){
  try{ if(!ta){ta=document.createElement('textarea');ta.value=text;ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);}
    ta.select(); const ok=document.execCommand('copy'); if(!ta.id) ta.remove(); return ok; }catch(e){return false}
}
async function shareText(text){ // 가족 코드 보내기 등 바로 보내기 (복사도 같이)
  copyText(text);
  if(navigator.share){
    try{await navigator.share({text:text});return}
    catch(e){if(e&&e.name==='AbortError')return}
  }
  previewShare(text,'보낼 내용');
}
/* ---------- 특별 보너스 ---------- */
const BONUS_FROM=['할머니','할아버지','외할머니','외할아버지','친척','지인','칭찬 보너스'];
function openBonus(){
  const k=kid();
  openModal(`<h3>🎁 특별 보너스 넣기</h3>
    <div class="muted">${esc(k.emoji)} ${esc(callName(k.name))}의 통장에 더해져요.</div>
    <label class="f">누구에게 받았나요?</label>
    <div class="chips" id="bChips">${BONUS_FROM.map((x,i)=>`<button type="button" onclick="pickFrom(this,${i})">${x}</button>`).join('')}</div>
    <input id="bFrom" placeholder="직접 입력 (예: 큰이모)">
    <label class="f">금액(원)</label><input id="bAmt" type="number" inputmode="numeric" step="1000">
    <label class="f">날짜</label><input id="bDate" type="date" value="${S.date||S.today}" max="${S.today}">
    <label class="f">메모 (선택)</label><input id="bMemo" placeholder="예: 추석, 생일 축하">
    <button class="btn full" id="bBtn" onclick="doBonus()">통장에 넣기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function pickFrom(btn,i){$('bFrom').value=BONUS_FROM[i];document.querySelectorAll('#bChips button').forEach(b=>b.classList.toggle('on',b===btn))}
function doBonus(){
  const b={from:$('bFrom').value,amount:Number($('bAmt').value),date:$('bDate').value,memo:$('bMemo').value};
  $('bBtn').disabled=true;
  call('addBonus',S.kidId,b,S.date||S.today).then(d=>{
    if(S.tab==='check') S.day=d; closeModal(); render(); // 지금 보는 탭(통장 탭)을 새로 그림 toast('🎁 '+won(b.amount)+' 보너스를 넣었어요!');
  }).catch(e=>{$('bBtn').disabled=false;toast(errMsg(e))});
}
function askDelBonus(id,amt,fromLedger){
  openModal(`<h3>${amt?'보너스 기록 삭제':'응원 메시지 삭제'}</h3><div>${amt?won(amt)+' 보너스 기록을':'이 응원 메시지를'} 지울까요?</div>
    <div class="muted" style="margin-top:6px">${amt?'지우면 그 금액이 잔액에서 빠져요.':'잔액에는 영향이 없어요.'}</div>
    <button class="btn full red" id="dbBtn" onclick="doDelBonus('${id}',${fromLedger?1:0})">삭제</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function doDelBonus(id,fromLedger){
  $('dbBtn').disabled=true;
  call('deleteBonus',id,S.kidId,S.date||S.today).then(d=>{
    closeModal(); toast('삭제했어요');
    if(fromLedger) loadLedger(); else {S.day=d; renderDay();}
  }).catch(e=>{$('dbBtn').disabled=false;toast(errMsg(e))});
}

/* ---------- 지출 (카드·현금) ---------- */
let spendKind='', spendMethod='카드', spendJar='spend';
function openSpend(){
  const k=kid(), j=S.day.jars; spendKind=''; spendMethod=S.methods[0]||'카드'; spendJar='spend';
  openModal(`<h3>🛒 지출 기록하기</h3>
    <div class="muted">${esc(k.emoji)} ${esc(callName(k.name))}의 지금 잔액: <b>${won(S.day.balance)}</b></div>
    ${j?`<label class="f">어느 통장에서 쓸까요?</label>
    <div class="seg" id="sJar">${['spend','save','give'].map(x=>`<button type="button" class="${x==='spend'?'on':''}" onclick="pickJar(this,'${x}')">${JAR_LABEL[x][0]} ${JAR_LABEL[x][1]}<br><small>${won(j[x])}</small></button>`).join('')}</div>
    <div class="muted" style="margin-top:4px">💝 나눔 통장은 기부·선물처럼 남을 위해 쓸 때 골라요.</div>`:''}
    <label class="f">어떻게 줬나요?</label>
    <div class="seg" id="sMethod">${S.methods.map((x,i)=>`<button type="button" class="${x===spendMethod?'on':''}" onclick="pickMethod(this,${i})">${x==='현금'?'💵':'💳'} ${esc(x)}</button>`).join('')}</div>
    <label class="f">무엇을 샀나요? (현금은 쓸 곳)</label><input id="sName" placeholder="예: 색연필, 아이스크림, 현금 용돈">
    <label class="f">금액(원)</label><input id="sAmt" type="number" inputmode="numeric" oninput="spendWarn()">
    <label class="f">꼭 필요한 것인가요, 갖고 싶은 것인가요?</label>
    <div class="seg" id="sKind">${S.kinds.map((x,i)=>`<button type="button" onclick="pickKind(this,${i})">${esc(x)}</button>`).join('')}</div>
    <label class="f">날짜</label><input id="sDate" type="date" value="${S.today}" max="${S.today}">
    <label class="f">메모 (선택)</label><input id="sMemo" placeholder="예: 문구점, 생일 선물">
    <div id="sWarn"></div>
    <button class="btn full" id="sBtn" onclick="doSpend()">기록하고 잔액에서 빼기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function pickMethod(btn,i){spendMethod=S.methods[i];document.querySelectorAll('#sMethod button').forEach(b=>b.classList.toggle('on',b===btn))}
function pickJar(btn,x){spendJar=x;document.querySelectorAll('#sJar button').forEach(b=>b.classList.toggle('on',b===btn))}
function pickKind(btn,i){spendKind=S.kinds[i];document.querySelectorAll('#sKind button').forEach(b=>b.classList.toggle('on',b===btn))}
function spendWarn(){
  const amt=Number($('sAmt').value)||0, after=S.day.balance-amt;
  $('sWarn').innerHTML = amt>0 && after<0
    ? `<div class="warn">잔액보다 ${won(-after)} 더 써요. 기록하면 잔액이 <b>${won(after)}</b>(마이너스)이 돼요. 실천으로 갚아 가도록 이야기 나눠 보세요.</div>`
    : (amt>0?`<div class="muted" style="margin-top:8px">기록 후 잔액: <b>${won(after)}</b></div>`:'');
}
function doSpend(){
  const sp={method:spendMethod,name:$('sName').value,amount:Number($('sAmt').value),kind:spendKind,date:$('sDate').value,memo:$('sMemo').value,jar:spendJar};
  $('sBtn').disabled=true;
  call('addSpend',S.kidId,sp,S.date).then(d=>{
    S.day=d; closeModal(); renderDay(); toast((sp.method==='현금'?'💵 현금 ':'💳 카드 ')+won(sp.amount)+' 기록했어요');
  }).catch(e=>{$('sBtn').disabled=false;toast(errMsg(e))});
}
function askDelSpend(id){
  const l=(S.ledger&&S.ledger.lines||[]).find(x=>x.id===id); if(!l) return;
  const name=l.type==='save'?'실물 통장 이체':l.name;
  openModal(`<h3>지출 기록 삭제</h3><div>"${esc(name)}" ${won(l.amount)} 기록을 지울까요?</div>
    <div class="muted" style="margin-top:6px">지우면 그 금액이 잔액으로 돌아와요.</div>
    <button class="btn full red" id="dBtn" onclick="doDelSpend('${id}')">삭제</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function doDelSpend(id){
  $('dBtn').disabled=true;
  call('deleteSpend',id).then(()=>{closeModal();toast('삭제했어요');loadLedger()})
    .catch(e=>{$('dBtn').disabled=false;toast(errMsg(e))});
}

/* ---------- 통장 ---------- */
function loadLedger(){
  const kidId=S.kidId, month=S.month;
  call('getLedger',kidId,month).then(L=>{ if(S.tab==='ledger'&&S.kidId===kidId) renderLedger(L) }).catch(showErr);
}
function moveMonth(n){const m=addMonth(S.month,n); if(m>S.today.slice(0,7)) return; S.month=m; loadLedger()}
function renderLedger(L){
  const k=kid(), isNow=S.month>=S.today.slice(0,7);
  S.ledger=L;
  let h=`<div class="datenav">
    <button class="nav" onclick="moveMonth(-1)" aria-label="이전 달">◀</button><div class="d">${prettyMonth(L.month)}</div>
    <button class="nav" onclick="moveMonth(1)" aria-label="다음 달" ${isNow?'disabled':''}>▶</button></div>
  <div class="card">
    <div class="bal-label">${esc(k.emoji)} ${esc(callName(k.name))}의 앱 통장 잔액</div>
    <div class="bal ${L.balance<0?'minus':''}">${won(L.balance)}</div>
    ${jarsHtml(L.jars)}
    ${ledgerActionsHtml()}
    ${interestHtml(L)}
    ${goalHtml(k,L.balance)}${spendGoalHtml(L.spendGoal)}
    <div class="muted" style="margin-top:10px">🏦 지금까지 실물 통장으로 옮긴 돈: <b style="color:var(--blue)">${won(L.totalSaved)}</b></div>
    <div class="mini">
      <div><span class="muted">실천으로 번 돈</span><b class="in">+${won(L.monthIn)}</b></div>
      <div><span class="muted">특별 보너스${L.monthInterest?' · 이자':''}</span><b class="bonus">+${won(L.monthBonus+(L.monthInterest||0))}</b></div>
      <div><span class="muted">쓴 돈</span><b class="out">-${won(L.monthOut)}</b></div>
      <div><span class="muted">통장으로 이체</span><b class="save">-${won(L.monthSaved)}</b></div>
    </div>
    ${L.monthFine>0?`<div class="row" style="margin-top:8px"><span class="muted">⚠️ 이번 달 벌금</span><b class="out">-${won(L.monthFine)}</b></div>`:''}
  </div>`;
  if(L.monthOut>0){
    const need=L.kindSum[S.kinds[0]]||0, want=L.kindSum[S.kinds[1]]||0, etc=L.monthOut-need-want;
    h+=`<details class="fold"><summary>🧺 이번 달 어디에 썼을까?</summary><div class="fbody">
      <div class="est"><span>${kindBadge(S.kinds[0])}</span><b>${won(need)}</b></div>
      <div class="est"><span>${kindBadge(S.kinds[1])}</span><b>${won(want)}</b></div>
      ${etc>0?`<div class="est"><span class="badge">구분 안 함</span><b>${won(etc)}</b></div>`:''}
      <div class="muted" style="margin-top:6px">${S.methods.map(m=>(m==='현금'?'💵 ':'💳 ')+m+' '+won((L.methodSum||{})[m]||0)).join(' · ')}</div></div></details>`;
  }
  if(L.stats.length){
    h+=`<details class="fold"><summary>🏅 이번 달 많이 실천한 것</summary><div class="fbody">`+
      L.stats.slice(0,5).map((s,i)=>`<div class="est"><span>${['🥇','🥈','🥉','④','⑤'][i]} ${esc(s.name)}</span><span class="muted r">${s.count}번 · ${won(s.amount)}</span></div>`).join('')+`</div></details>`;
  }
  // 통장 내역도 접는 칸. 한 번 펼치면 앱을 쓰는 동안 펼친 채로 기억(지우기 등으로 다시 그려도 그대로)
  h+=`<details class="fold" ${S.histFoldOpen?'open':''} ontoggle="S.histFoldOpen=this.open"><summary>📒 ${esc(callName(k.name))}의 통장 내역</summary>
    <div class="fbody"><div id="histBox">${historyHtml(L)}</div></div></details>`;
  $('view').innerHTML=h;
  bindWeekSwipe();
}

/* 통장 내역: 한 주(월~일)씩 나눠 보여 주고, 아래 번호를 누르거나 옆으로 밀어서 넘김.
   6개월 넘게 지난 달은 은행 통장처럼 한 줄로 압축(「펼쳐 보기」로 다시 볼 수 있음) */
const COMPRESS_AFTER_MONTHS=6;
function ledgerWeeks(L){
  const first=L.month+'-01', last=addDays(addMonth(L.month,1)+'-01',-1);
  const dow=s=>(parse(s).getUTCDay()+6)%7; // 월=0 … 일=6
  const weeks=[];
  for(let s=addDays(first,-dow(first)); s<=last; s=addDays(s,7)){
    const a=s<first?first:s, e=addDays(s,6), b=e>last?last:e;
    weeks.push({from:a,to:b});
  }
  // 달 처음·끝에 하루이틀만 걸친 주는 옆 주에 붙임 (예: 1일이 일요일이면 1~8일을 1주로)
  const days=w=>(parse(w.to)-parse(w.from))/864e5+1;
  if(weeks.length>1&&days(weeks[0])<3){weeks[1].from=weeks[0].from;weeks.shift()}
  if(weeks.length>1&&days(weeks[weeks.length-1])<3){weeks[weeks.length-2].to=weeks[weeks.length-1].to;weeks.pop()}
  weeks.forEach(w=>{w.lines=L.lines.filter(l=>l.date>=w.from&&l.date<=w.to)});
  return weeks;
}
function monthsAgo(m){const a=S.today.slice(0,7).split('-').map(Number), b=m.split('-').map(Number);return (a[0]-b[0])*12+(a[1]-b[1])}
function historyHtml(L){
  if(!L.lines.length) return '<div class="muted" style="padding:14px 0">이 달의 거래가 없어요.</div>';
  const key=S.kidId+'|'+L.month;
  if(S.histKey!==key){ // 달이나 자녀가 바뀌면: 이번 달이면 오늘이 있는 주, 지난 달이면 마지막 주부터
    S.histKey=key; S.histOpen=false;
    const ws=ledgerWeeks(L), t=S.today;
    let i=ws.findIndex(w=>t>=w.from&&t<=w.to); if(i<0) i=ws.length-1;
    S.histWeek=i;
  }
  if(monthsAgo(L.month)>=COMPRESS_AFTER_MONTHS&&!S.histOpen){
    const inSum=L.monthIn+L.monthBonus+(L.monthInterest||0), outSum=L.monthOut+L.monthSaved+L.monthFine;
    const end=L.lines[0].balance; // 내역은 최신순이라 맨 앞이 그달 마지막 잔액
    return `<div class="line"><div class="l"><div><b>${Number(L.month.slice(5))}월</b> 📦 압축 기록</div>
        <div class="names">거래 ${L.lines.length}건을 한 줄로 모았어요</div></div>
      <div class="r"><div class="in">+${won(inSum)}</div><div class="out">-${won(outSum)}</div><div class="muted">잔액 ${won(end)}</div></div></div>
      <button class="btn full ghost" onclick="S.histOpen=true;$('histBox').innerHTML=historyHtml(S.ledger);bindWeekSwipe()">펼쳐 보기</button>`;
  }
  const ws=ledgerWeeks(L), w=ws[S.histWeek]||ws[ws.length-1];
  const range=w.from===w.to?prettyDate(w.from):prettyDate(w.from)+' ~ '+prettyDate(w.to).replace(/^\d+월 /,'');
  return `<div class="weekhead">${range}</div>
    <div id="weekPage" class="weekpage">${w.lines.length?w.lines.map(l=>lineHtml(l,L)).join(''):'<div class="muted" style="padding:14px 0;text-align:center">이 주에는 거래가 없어요</div>'}</div>
    <div class="pager">
      <button class="pg" onclick="goWeek(${S.histWeek-1})" ${S.histWeek<=0?'disabled':''} aria-label="이전 주">‹</button>
      ${ws.map((x,i)=>`<button class="pg num ${i===S.histWeek?'on':''} ${x.lines.length?'':'empty'}" onclick="goWeek(${i})">${i+1}주</button>`).join('')}
      <button class="pg" onclick="goWeek(${S.histWeek+1})" ${S.histWeek>=ws.length-1?'disabled':''} aria-label="다음 주">›</button>
    </div>`;
}
function goWeek(i){
  const n=ledgerWeeks(S.ledger).length; if(i<0||i>=n) return;
  S.histWeek=i; $('histBox').innerHTML=historyHtml(S.ledger); bindWeekSwipe();
}
function bindWeekSwipe(){
  const el=$('weekPage'); if(!el) return;
  let x0=null,y0=null;
  el.addEventListener('touchstart',e=>{x0=e.touches[0].clientX;y0=e.touches[0].clientY},{passive:true});
  el.addEventListener('touchend',e=>{
    if(x0===null) return;
    const dx=e.changedTouches[0].clientX-x0, dy=e.changedTouches[0].clientY-y0; x0=null;
    if(Math.abs(dx)>50&&Math.abs(dx)>Math.abs(dy)*1.5) goWeek(S.histWeek+(dx<0?1:-1)); // 왼쪽으로 밀면 다음 주
  });
}
function lineHtml(l,L){
    let left, amt;
    if(l.type==='in'){
      left=`<div><b>${shortDate(l.date)}</b> 실천 ${l.count}번 적립</div><div class="names">${esc(l.detail)}</div>`;
      amt=`<div class="in">+${won(l.amount)}</div>`;
    }else if(l.type==='fine'){
      left=`<div><b>${shortDate(l.date)}</b> ⚠️ 벌금 ${l.count}번</div><div class="names">${esc(l.detail)}</div>`;
      amt=`<div class="out">-${won(l.amount)}</div>`;
    }else if(l.type==='bonus'){
      left=`<div><b>${shortDate(l.date)}</b> 🎁 ${esc(l.name)}</div><div class="names"><span class="badge">특별 보너스</span>${viewOnly()?'':`<button class="del" onclick="askDelBonus('${l.id}',${l.amount},true)">삭제</button>`}</div>`;
      amt=`<div class="bonus">+${won(l.amount)}</div>`;
    }else if(l.type==='interest'){
      left=`<div><b>${shortDate(l.date)}</b> 🏦 엄마·아빠 은행 ${esc(l.name)}</div><div class="names"><span class="badge">이자</span></div>`;
      amt=`<div class="bonus">+${won(l.amount)}</div>`;
    }else if(l.type==='cheer'){
      left=`<div><b>${shortDate(l.date)}</b> 💌 ${esc(l.name)}</div><div class="names"><span class="badge">응원 메시지</span>${viewOnly()?'':`<button class="del" onclick="askDelBonus('${l.id}',0,true)">삭제</button>`}</div>`;
      amt=`<div class="muted">💌</div>`;
    }else if(l.type==='save'){
      left=`<div><b>${shortDate(l.date)}</b> 🏦 실물 통장으로 이체</div><div class="names">${esc(l.memo)} <button class="del" onclick="askDelSpend('${l.id}')">삭제</button></div>`;
      amt=`<div class="save">-${won(l.amount)}</div>`;
    }else{
      left=`<div><b>${shortDate(l.date)}</b> ${l.method==='현금'?'💵':'💳'} ${esc(l.name)}</div>
        <div class="names">${L.jars&&l.jar!=='spend'?`<span class="badge">${JAR_LABEL[l.jar][0]} ${JAR_LABEL[l.jar][1]} 통장</span>`:''}${kindBadge(l.kind)}${esc(l.memo)} ${viewOnly()?'':`<button class="del" onclick="askDelSpend('${l.id}')">삭제</button>`}</div>`;
      amt=`<div class="out">-${won(l.amount)}</div>`;
    }
    return `<div class="line"><div class="l">${left}</div><div class="r">${amt}<div class="muted">잔액 ${won(l.balance)}</div></div></div>`;
}

/* ---------- 실물 통장 이체 ---------- */
function openTransfer(){
  const k=kid(), j=S.ledger&&S.ledger.jars, bal=j?Math.min(j.save,S.ledger.balance):(S.ledger?S.ledger.balance:0);
  if(bal<=0){toast(j?'저축 통장에 이체할 돈이 없어요':'이체할 잔액이 없어요');return}
  openModal(`<h3>🏦 실물 통장으로 이체하기</h3>
    <div class="muted">${esc(k.emoji)} ${esc(callName(k.name))}의 앱 잔액: <b>${won(bal)}</b><br>실제 은행 통장에 넣은 금액만큼 앱 잔액에서 빼요.</div>
    ${S.ledger&&S.ledger.jars?`<div class="tip">🫙 저축 통장(${won(S.ledger.jars.save)})에서 빠져요.</div>`:''}
    <label class="f">이체한 금액(원)</label><input id="tAmt" type="number" inputmode="numeric" step="1000" value="${Math.floor(bal/1000)*1000||bal}">
    <div class="chips" style="margin-top:6px"><button type="button" onclick="$('tAmt').value=${bal}">전액 ${won(bal)}</button>
      <button type="button" onclick="$('tAmt').value=${Math.floor(bal/2/100)*100}">절반</button></div>
    <label class="f">날짜</label><input id="tDate" type="date" value="${S.today}" max="${S.today}">
    <label class="f">메모 (선택)</label><input id="tMemo" placeholder="예: 어린이 저축통장">
    <button class="btn full" style="background:var(--blue)" id="tBtn" onclick="doTransfer()">이체 기록하기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function doTransfer(){
  const t={amount:Number($('tAmt').value),date:$('tDate').value,memo:$('tMemo').value};
  $('tBtn').disabled=true;
  call('addTransfer',S.kidId,t).then(()=>{
    closeModal(); toast('🏦 '+won(t.amount)+' 저축 기록했어요'); loadLedger();
  }).catch(e=>{$('tBtn').disabled=false;toast(errMsg(e))});
}

/* ---------- 자녀·항목 ---------- */
function renderItems(){
  if(viewOnly()) return setTab('manage');
  const kidName=id=>id==='ALL'?'모두':((S.kids.find(k=>k.id===id)||{}).name||'(삭제된 자녀)');
  let h=`<div class="card"><div class="row"><div class="jua" style="font-size:18px">✅ 실천 항목</div><button class="btn sm" onclick="editItem()">+ 항목 추가</button></div>`+
    (S.items.length?S.items.map(i=>`<div class="mitem tap ${i.active?'':'off'}" onclick="editItem('${i.id}')"><div class="t">
      <div><b>${esc(i.name)}</b></div>
      <div style="margin-top:3px"><span class="badge">${i.period==='매일'?'하루':'한 주'} ${i.maxCount}번</span><span class="badge">${esc(kidName(i.target))}</span>${i.amount<0?'<span class="badge want">벌금</span>':''}${i.active?'':'<span class="badge off">쉬는 중</span>'}</div></div>
      <span class="amt ${i.amount<0?'out':''}" style="font-size:16px">${i.amount<0?'−'+won(-i.amount):won(i.amount)}</span><span class="chev">›</span></div>`).join(''):'<div class="muted">항목이 없어요</div>')+
    `<div class="muted" style="margin-top:8px">항목을 누르면 고치거나 지울 수 있어요.</div></div>`;
  h+=`<div class="card"><div class="row"><div class="jua" style="font-size:18px">👧 자녀</div><button class="btn sm" onclick="editKid()">+ 자녀 추가</button></div>`+
    S.kids.map(k=>`<div class="mitem tap" onclick="editKid('${k.id}')"><div class="t"><b>${esc(k.emoji)} ${esc(k.name)}</b> <span class="muted">${esc(k.desc)}</span>
      ${k.goalName?`<div class="muted">목표 ${esc(k.goalName)} ${won(k.goalAmount)}</div>`:''}
      ${kidPlusBadges(k)}</div><span class="chev">›</span></div>`).join('')+`</div>`;
  $('view').innerHTML=h;
}

/* ---------- 더보기: 기능을 아이콘으로 모아 두고, 누르면 창으로 자세히 ---------- */
function estHtml(){
  return S.kids.map(k=>{
    const its=S.items.filter(i=>i.active&&i.amount>0&&(i.target==='ALL'||i.target===k.id));
    const calc=f=>{
      const d=its.filter(i=>i.period==='매일').reduce((s,i)=>s+i.amount*f(i),0);
      const w=its.filter(i=>i.period==='매주').reduce((s,i)=>s+i.amount*f(i),0);
      return Math.round((d*30+w*52/12)/10)*10;
    };
    return `<div class="est"><span>${esc(k.emoji)} ${esc(k.name)}</span>
      <span class="r"><b>1번씩: 약 ${won(calc(()=>1))}</b><br><span class="muted">최대 횟수까지: 약 ${won(calc(i=>i.maxCount))}</span></span></div>`;
  }).join('');
}
function renderManage(){
  if(isGp()) return renderGpManage();
  const p=S.pay||{}, payOn=p.kakao||p.account, pl=S.plus||{};
  const tile=(ico,label,sub,click,plus)=>`<button class="mtile" onclick="${click}"><span class="mico">${ico}</span>
    <span class="mlab">${label}${plus?plusStar():''}</span>${sub?`<span class="msub">${sub}</span>`:''}</button>`;
  const h=`<div class="moregrid">
      ${tile('👨‍👩‍👧','가족 연결',S.family?'연결됨':'',"openMore('family')")}
      ${tile('🔐','Google 계정',S.account?'연결됨':'',"openMore('account')")}
      ${tile('🔒','앱 잠금',S.hasPin?'켜짐':'꺼짐','openPin()')}
      ${tile('📜','용돈 계약서','',"pickKidFor('openContract')",1)}
      ${tile('🎖️','성장 앨범','',"pickKidFor('openAlbum')",1)}
      ${tile('🧒','자녀 화면 전환','',"pickKidFor('askKidSwitch')",1)}
      ${tile('💸','용돈 받을 곳',payOn?'등록됨':'','openPaySettings()',1)}
      ${tile('📊','예상 용돈','',"openMore('est')")}
      ${tile('⭐','플러스',pl.purchased?'구매 완료':pl.promo?'무료 체험 중':'','openPlusPage()')}
      ${tile('💾','백업·초기화','',"openMore('backup')")}
      ${tile('📄','정보·문의','',"openMore('info')")}
      ${tile('🗑️','가족 데이터 삭제','','openDestroyFamily()')}
    </div>
    <div class="ver">용돈 받아라 ${APP_VERSION}</div>`;
  $('view').innerHTML=h;
}
/* 자녀가 여럿이면 먼저 고르고, 한 명이면 바로 열기 (fn: 'openContract' 같은 함수 이름) */
function pickKidFor(fn){
  const go=id=>window[fn](id);
  if(S.kids.length===1) return go(S.kids[0].id);
  const title={askKidSwitch:'🧒 자녀 화면 전환',openContract:'📜 용돈 계약서',openAlbum:'🎖️ 성장 앨범',openKidAccess:'🧒 자녀 화면'}[fn]||'';
  openModal(`<h3>${title}</h3><div class="muted">${fn==='askKidSwitch'?'어느 자녀 화면으로 바꿀까요?':'어느 자녀를 볼까요?'}</div>
    <div class="list" style="margin-top:10px">${S.kids.map(k=>`<button class="lrow" onclick="${fn}('${k.id}')"><span class="li">${esc(k.emoji)}</span><span class="lt">${esc(k.name)}</span><span class="chev">›</span></button>`).join('')}</div>
    <button class="btn full ghost" onclick="closeModal()">닫기</button>`);
}
function openMore(what){
  const close='<button class="btn full ghost" onclick="closeModal()">닫기</button>';
  if(what==='family') return openModal(familyCardHtml()+close);
  if(what==='account'){
    const a=accountCardHtml();
    return openModal((a||`<h3>🔐 Google 계정</h3><div class="muted">${S.demo?'예시 자료에서는 쓸 수 없어요. 「내 자녀로 시작하기」 후에 연결해 보세요.':'지금은 쓸 수 없어요.'}</div>`)+close);
  }
  if(what==='est') return openModal(`<h3>📊 한 달 예상 용돈</h3>${estHtml()}
    <div class="muted" style="margin-top:6px">매일 항목 × 30일 + 매주 항목 × 4.3주 기준(벌금 제외)</div>${close}`);
  if(what==='backup') return openModal(`<h3>💾 백업·초기화</h3>
    <div class="muted">기록은 이 휴대폰에 있어요. 가족 연결이나 Google 계정 없이 쓰고 있다면, 가끔 백업 파일을 저장해 두세요.</div>
    <div class="grid2">
      <button class="mtile" onclick="doExport()"><span class="mico">📤</span><span class="mlab">백업 저장</span></button>
      <button class="mtile" onclick="askImport()"><span class="mico">📂</span><span class="mlab">백업 불러오기</span></button>
      <button class="mtile" onclick="askReset()"><span class="mico">🧹</span><span class="mlab" style="color:var(--red)">모든 기록 지우기</span></button>
      <button class="mtile" onclick="closeModal()"><span class="mico">↩️</span><span class="mlab">닫기</span></button>
    </div>`);
  if(what==='info') return openModal(`<h3>📄 정보·문의</h3><div class="list">
      <a class="lrow" href="privacy.html" target="_blank" rel="noopener"><span class="li">📄</span><span class="lt">개인정보처리방침</span><span class="chev">›</span></a>
      <a class="lrow" href="mailto:yhh.apps.help@gmail.com"><span class="li">✉️</span><span class="lt">문의하기</span><span class="lv">yhh.apps.help@gmail.com</span></a>
      <div class="lrow" style="cursor:default"><span class="li">🏷️</span><span class="lt">버전</span><span class="lv">${APP_VERSION}</span></div>
    </div>
    <div class="muted" style="margin-top:8px">회원가입 없이 기록을 이 휴대폰에 저장해요. 가족과 연결하면 동기화 서버에도 저장돼요.</div>${close}`);
}
function afterSave(d,msg){applyInit(d);closeModal();renderKids();render();toast(msg)}

function editItem(id){
  const it=S.items.find(i=>i.id===id)||{name:'',meaning:'',amount:50,period:'매일',target:'ALL',active:true,maxCount:3};
  const opts=[['ALL','모두']].concat(S.kids.map(k=>[k.id,k.emoji+' '+k.name]))
    .map(o=>`<option value="${esc(o[0])}" ${it.target===o[0]?'selected':''}>${esc(o[1])}</option>`).join('');
  const maxOpts=[1,2,3,4,5].map(n=>`<option value="${n}" ${it.maxCount===n?'selected':''}>${n}번</option>`).join('');
  openModal(`<h3>${id?'항목 수정':'새 항목'}</h3>
    <label class="f">항목 이름</label><input id="fName" value="${esc(it.name)}" placeholder="예: 신발 정리하기">
    <label class="f">교육 의미 (자녀에게 들려줄 설명)</label><textarea id="fMean" placeholder="왜 하는지 자녀 눈높이로">${esc(it.meaning)}</textarea>
    <div class="row" style="gap:10px">
      <div style="flex:1"><label class="f">1번 금액(원)</label><input id="fAmt" type="number" step="10" value="${it.amount}"></div>
      <div style="flex:1"><label class="f">주기</label><select id="fPer"><option ${it.period==='매일'?'selected':''}>매일</option><option ${it.period==='매주'?'selected':''}>매주</option></select></div>
      <div style="flex:1"><label class="f">최대 횟수</label><select id="fMax">${maxOpts}</select></div>
    </div>
    <div class="muted" style="margin-top:6px">⚠️ 벌금 항목은 금액 앞에 <b>-</b>를 붙여요 (예: -100). <button type="button" class="del" onclick="const a=$('fAmt');a.value=-Math.abs(Number(a.value)||0)">마이너스로 바꾸기</button></div>
    <label class="f">대상</label><select id="fTgt">${opts}</select>
    <label class="ck"><input type="checkbox" id="fAct" ${it.active?'checked':''}> 사용하기 (끄면 체크 화면에서 숨겨져요)</label>
    <button class="btn full" id="fBtn" onclick="doSaveItem('${id||''}')">저장</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>
    ${id?`<button class="linkdel" onclick="askDelItem('${id}')">이 항목 삭제하기</button>`:''}`);
}
function doSaveItem(id){
  const it={id:id,name:$('fName').value,meaning:$('fMean').value,amount:Number($('fAmt').value),
    period:$('fPer').value,maxCount:Number($('fMax').value),target:$('fTgt').value,active:$('fAct').checked};
  $('fBtn').disabled=true;
  call('saveItem',it).then(d=>afterSave(d,'저장했어요')).catch(e=>{$('fBtn').disabled=false;toast(errMsg(e))});
}
function askDelItem(id){
  const it=S.items.find(i=>i.id===id);
  openModal(`<h3>항목 삭제</h3><div>"${esc(it.name)}" 항목을 삭제할까요?</div>
    <div class="muted" style="margin-top:6px">지금까지 모은 돈과 기록은 그대로 남아요. 잠시 쉬려면 '수정 → 사용하기 끄기'를 추천해요.</div>
    <button class="btn full red" onclick="this.disabled=true;call('deleteItem','${id}').then(d=>afterSave(d,'삭제했어요')).catch(e=>toast(errMsg(e)))">삭제</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
/* 자녀 이모지: 고를 수 있는 12개, 새 자녀는 아직 안 쓴 것 중 하나를 자동으로 */
const KID_EMOJIS=['🐯','🐰','🐻','🐶','🐱','🦊','🐼','🐨','🐥','🐸','🦁','🐹'];
function nextKidEmoji(){return KID_EMOJIS.find(e=>!S.kids.some(k=>k.emoji===e))||KID_EMOJIS[S.kids.length%KID_EMOJIS.length]}
function pickEmoji(e){$('kEmo').value=e;document.querySelectorAll('.emopick button').forEach(b=>b.classList.toggle('on',b.textContent===e))}
function editKid(id){
  const k=S.kids.find(x=>x.id===id)||{name:'',desc:'',emoji:nextKidEmoji(),goalName:'',goalAmount:''};
  const opts=KID_EMOJIS.indexOf(k.emoji)<0?[k.emoji].concat(KID_EMOJIS):KID_EMOJIS;
  openModal(`<h3>${id?'자녀 정보 수정':'자녀 추가'}</h3>
    <label class="f">이름 (별명도 좋아요)</label><input id="kName" value="${esc(k.name)}">
    <label class="f">이모지</label><input id="kEmo" type="hidden" value="${esc(k.emoji)}">
    <div class="emopick">${opts.map(e=>`<button type="button" class="${e===k.emoji?'on':''}" onclick="pickEmoji(this.textContent)">${esc(e)}</button>`).join('')}</div>
    <label class="f">설명</label><input id="kDesc" value="${esc(k.desc)}" placeholder="예: 초등학교 2학년">
    <label class="f">저축 목표 (선택)</label><input id="kGoal" value="${esc(k.goalName)}" placeholder="예: 레고 자동차">
    <label class="f">목표 금액(원)</label><input id="kGoalAmt" type="number" inputmode="numeric" step="1000" value="${k.goalAmount||''}">
    ${kidPlusFields(k)}
    <button class="btn full" id="kBtn" onclick="doSaveKid('${id||''}')">저장</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>
    ${id?`<button class="linkdel" onclick="askDelKid('${id}')">이 자녀 삭제하기</button>`:''}`);
}
function doSaveKid(id){
  const k=Object.assign({id:id,name:$('kName').value,desc:$('kDesc').value,emoji:$('kEmo').value,
    goalName:$('kGoal').value,goalAmount:Number($('kGoalAmt').value)}, readKidPlusFields());
  $('kBtn').disabled=true;
  call('saveKid',k).then(d=>afterSave(d,'저장했어요')).catch(e=>{$('kBtn').disabled=false;toast(errMsg(e))});
}
function askDelKid(id){
  const k=S.kids.find(x=>x.id===id);
  openModal(`<h3>자녀 삭제</h3><div>${esc(k.emoji)} ${esc(callName(k.name))}를 삭제할까요?</div>
    <div class="warn">이 자녀의 통장 기록과 전용 항목이 모두 지워지고 되돌릴 수 없어요.</div>
    <button class="btn full red" onclick="this.disabled=true;call('deleteKid','${id}').then(d=>afterSave(d,'삭제했어요')).catch(e=>{this.disabled=false;toast(errMsg(e))})">삭제</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}

/* ---------- 가족과 함께 쓰기 ---------- */
function familyCardHtml(){
  let h=`<div class="card"><div class="jua" style="font-size:18px">👨‍👩‍👧 가족과 함께 쓰기</div>`;
  if(!Sync.available()) return h+`<div class="muted" style="margin-top:4px">가족 동기화는 준비 중이에요.</div></div>`;
  if(S.demo) return h+`<div class="muted" style="margin-top:4px">예시 자료에서는 쓸 수 없어요. 「내 자녀로 시작하기」 후에 엄마·아빠 휴대폰을 연결해 보세요.</div></div>`;
  if(!S.family) return h+`<div class="muted" style="margin-top:4px">엄마·아빠·자녀·조부모 휴대폰을 가족 코드로 연결하면 누가 체크하든 같은 통장을 함께 봐요.</div>
    <div class="tip">가족을 만들면 이 휴대폰의 기록이 동기화 서버(Google Firebase)에 올라가요. 가족 코드를 아는 휴대폰만 볼 수 있으니 코드는 가족끼리만 나눠 주세요.</div>
    <button class="btn full" style="background:var(--green)" id="cfBtn" onclick="doCreateFamily()">가족 만들기 (코드 받기)</button>
    <button class="btn full ghost" onclick="askJoinFamily()">다른 휴대폰의 가족 코드 입력하기</button></div>`;
  return h+`<div class="muted" style="margin-top:4px">이 코드를 다른 가족 휴대폰의 앱에 입력하면 함께 쓸 수 있어요. 아래 버튼으로 초대 링크를 보내도 돼요.</div>
    <div class="code">${esc(Sync.shareCode(S.family))}</div>
    <div class="muted" id="syncStatus">${statusHtml()}</div>
    ${keepRecordsHtml()}
    <button class="btn full" style="background:var(--green)" onclick="shareFamilyCode()">💬 가족 초대 보내기 (앱 설치 링크 포함)</button>
    <div class="muted" style="margin-top:4px">📱 휴대폰을 바꿨다면: 가족의 다른 휴대폰에서 이 버튼으로 새 휴대폰에 링크를 보내면, 누르기만 해도 기록이 그대로 들어와요.</div>
    <button class="btn full" style="background:#4D96FF" onclick="pickKidFor('openKidAccess')">🧒 자녀 휴대폰 초대하기 ${plusTag()}</button>
    <div class="muted" style="margin-top:4px">자녀 휴대폰에는 광고 없는 자녀 화면(오늘 할 일·내 통장·내 목표)만 보여요. 링크 대신 위 가족 코드를 자녀 휴대폰 첫 화면에 넣어도 돼요.</div>
    <button class="btn full" style="background:#B07CE8" onclick="shareGpInvite()">👵 할머니·할아버지 초대하기 ${plusTag()}</button>
    <button class="btn full ghost" onclick="askLeaveFamily()">이 휴대폰 연결 끊기</button></div>`;
}
function doCreateFamily(){
  $('cfBtn').disabled=true; $('cfBtn').textContent='만드는 중…';
  Sync.create().then(code=>{S.family=code.replace('-','');renderManage();openMore('family');toast('가족을 만들었어요! 가족 코드를 알려 주거나 초대를 보내 보세요')})
    .catch(e=>{$('cfBtn').disabled=false;$('cfBtn').textContent='가족 만들기 (코드 받기)';toast(errMsg(e))});
}
function askJoinFamily(){
  openModal(`<h3>가족 코드 입력하기</h3>
    <div class="warn">참여하면 <b>이 휴대폰의 지금 기록은 가족 기록으로 바뀌어요.</b> 필요하면 먼저 「더보기 → 백업·초기화」에서 백업을 저장해 두세요.</div>
    <input id="joinCode" class="codein" placeholder="ABCD-EFGH" maxlength="9" autocomplete="off">
    <button class="btn full" style="background:var(--green)" id="joinBtn" onclick="doJoin()">참여하기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function doJoin(){
  const code=$('joinCode').value, btn=$('joinBtn');
  btn.disabled=true; btn.textContent='가족 기록 받는 중…';
  Sync.join(code).then(c=>call('getInitData')).then(d=>{
    closeModal(); applyInit(d);
    if(!d.ready){toast('가족에 아직 자녀가 없어요');return renderSetup()}
    S.tab='manage';S.date=null;S.month=null;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab==='manage'));
    startMain(); toast('가족과 연결됐어요! 👨‍👩‍👧');
  }).catch(e=>{btn.disabled=false;btn.textContent='다시 시도';toast(errMsg(e))});
}
function appUrl(){return location.origin+location.pathname.replace(/[^/]*$/,'')}
function inviteMsg(){
  const code=Sync.shareCode(S.family);
  return `[용돈 받아라] 가족 초대 👨‍👩‍👧
우리 자녀 용돈 통장을 함께 써요!

① 아래 링크를 눌러 앱을 열어 주세요
${appUrl()}?join=${S.family}

② 크롬 메뉴(⋮) → 「앱 설치」(또는 「홈 화면에 추가」)를 누르면 휴대폰에 앱이 생겨요

③ 첫 화면에 가족 코드가 자동으로 들어가 있어요 → 「가족 코드로 참여하기」

가족 코드: ${code}
(자동으로 안 들어가면 직접 입력해 주세요)`;
}
function shareFamilyCode(){previewShare(inviteMsg(),'가족 초대 보내기',true)}
function askLeaveFamily(){
  openModal(`<h3>이 휴대폰 연결 끊기</h3><div class="loading">가족 휴대폰 수를 확인하는 중…</div>`);
  Sync.memberCount().then(n=>{
    if(n<=1) return askLeaveLast();
    askLeaveNormal(n);
  }).catch(e=>{
    openModal(`<h3>이 휴대폰 연결 끊기</h3><div class="warn">인터넷에 연결되어 있어야 연결을 끊을 수 있어요. (${esc(errMsg(e))})</div>
      <button class="btn full ghost" onclick="closeModal()">닫기</button>`);
  });
}
/* 가족 중 마지막 휴대폰: 빠지고 나면 서버 기록을 아무도 지울 수 없으므로, 빠지기 전에 지움 */
function askLeaveLast(){
  openModal(`<h3>마지막 휴대폰이에요</h3>
    <div>이 가족에 연결된 휴대폰은 이것 하나뿐이에요. 연결을 끊으면 <b>서버에 있는 가족 기록도 함께 지워요.</b></div>
    <div class="tip">이 휴대폰의 기록은 그대로 남아서 계속 쓸 수 있어요. 나중에 다시 「가족 만들기」를 하면 새 가족 코드가 생겨요.</div>
    <button class="btn full red" id="llBtn" onclick="doLeaveLast()">서버 기록 지우고 연결 끊기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function doLeaveLast(){
  const b=$('llBtn'); b.disabled=true; b.textContent='지우는 중…';
  Sync.leaveAndDelete().then(()=>call('getInitData')).then(d=>{applyInit(d);closeModal();renderManage();toast('서버 기록을 지우고 연결을 끊었어요')})
    .catch(e=>{b.disabled=false;b.textContent='다시 시도';toast(errMsg(e))});
}
function askLeaveNormal(n){
  openModal(`<h3>이 휴대폰 연결 끊기</h3>
    <div class="muted">지금 이 가족에 휴대폰 ${n}대가 연결되어 있어요.</div>
    <div>이 휴대폰만 가족에서 빠져요. 다른 휴대폰과 서버의 기록은 그대로예요.</div>
    <div class="muted" style="margin-top:6px">지금까지의 기록은 이 휴대폰에 남지만, 앞으로는 서로 맞춰지지 않아요.</div>
    <button class="btn full red" id="lfBtn" onclick="this.disabled=true;Sync.leave().then(()=>call('getInitData')).then(d=>{applyInit(d);closeModal();renderManage();toast('연결을 끊었어요')}).catch(e=>{this.disabled=false;toast(errMsg(e))})">연결 끊기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
/* 더보기 「가족 데이터 삭제」: 가족 연결이 있을 때만 서버 삭제 창, 없으면 안내 */
function openDestroyFamily(){
  if(S.family) return askDestroyFamily();
  openModal(`<h3>🗑️ 가족 데이터 삭제</h3>
    <div>${S.demo?'예시 자료에서는 쓸 수 없어요.':'지금은 가족 연결이 없어서 서버에 저장된 가족 데이터가 없어요.'}</div>
    <div class="muted" style="margin-top:6px">이 휴대폰의 기록만 지우려면 「백업·초기화 → 모든 기록 지우고 처음부터」를 써 주세요.</div>
    <button class="btn full ghost" onclick="closeModal()">닫기</button>`);
}
function askDestroyFamily(){
  openModal(`<h3>가족 데이터 모두 삭제</h3>
    <div class="warn">서버에 있는 이 가족의 자녀·항목·통장 기록이 <b>모두 지워지고 되돌릴 수 없어요.</b> 이 휴대폰의 기록도 지워지고, 다른 휴대폰은 연결이 끊겨요(그 휴대폰에 있던 기록은 남음).</div>
    <label class="f">확인을 위해 <b>지우기</b> 라고 입력해 주세요</label><input id="dfConfirm">
    <button class="btn full red" id="dfBtn" onclick="doDestroyFamily()">모두 삭제</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function doDestroyFamily(){
  if($('dfConfirm').value.trim()!=='지우기'){toast("'지우기'라고 입력해 주세요");return}
  $('dfBtn').disabled=true;
  Sync.destroyFamily().then(()=>{closeModal();S.kids=[];S.family=null;S.hasPin=false;S.tab='check';S.date=null;S.month=null;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab==='check'));renderSetup();toast('가족 데이터를 모두 지웠어요')})
    .catch(e=>{$('dfBtn').disabled=false;toast(errMsg(e))});
}

/* ---------- 앱 잠금 비밀번호 ---------- */
function openPin(){
  openModal(`<h3>🔒 앱 잠금 비밀번호</h3>
    ${S.hasPin?'<label class="f">지금 비밀번호</label><input id="pOld" type="password" inputmode="numeric" autocomplete="off">':''}
    <label class="f">새 비밀번호 (숫자 4~8자리)</label><input id="pNew" type="password" inputmode="numeric" autocomplete="off">
    <label class="f">새 비밀번호 한 번 더</label><input id="pNew2" type="password" inputmode="numeric" autocomplete="off">
    <div class="tip">비밀번호를 잊으면 앱을 지우고 다시 설치해야 해요(기록이 사라짐). 백업 파일을 꼭 저장해 두세요.</div>
    <button class="btn full" onclick="doPin(false)">저장</button>
    ${S.hasPin?'<button class="btn full ghost" onclick="doPin(true)">잠금 끄기</button>':''}
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function doPin(off){
  const old=S.hasPin?$('pOld').value:'';
  let np='';
  if(!off){
    np=$('pNew').value;
    if(np!==$('pNew2').value){toast('새 비밀번호가 서로 달라요');return}
    if(!np){toast('새 비밀번호를 입력해 주세요');return}
  }
  call('setPin',old,np).then(d=>afterSave(d,off?'잠금을 껐어요':'비밀번호를 저장했어요')).catch(e=>toast(errMsg(e)));
}

/* ---------- 백업 ---------- */
function doExport(){
  call('exportData').then(async text=>{
    const name='용돈받아라_백업_'+S.today+'.json';
    if(NATIVE){ try{ await nativeSaveBackup(name,text); toast('백업 파일을 만들었어요'); }catch(e){ if(!/cancel/i.test(String(e&&e.message))) toast(errMsg(e)); } return; }
    const blob=new Blob([text],{type:'application/json'});
    try{
      const file=new File([blob],name,{type:'application/json'});
      if(navigator.canShare&&navigator.canShare({files:[file]})){
        await navigator.share({files:[file],title:'용돈 받아라 백업'}); toast('백업 파일을 보냈어요'); return;
      }
    }catch(e){ if(e&&e.name==='AbortError') return; }
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download=name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(()=>URL.revokeObjectURL(a.href),5000);
    toast('백업 파일을 저장했어요');
  }).catch(e=>toast(errMsg(e)));
}
function askImport(){
  openModal(`<h3>📂 백업 불러오기</h3>
    <div class="warn">지금 이 휴대폰에 있는 기록은 모두 백업 파일 내용으로 바뀌어요.</div>
    <button class="btn full" onclick="closeModal();$('importFile').click()">백업 파일 고르기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function doImport(input){
  const f=input.files&&input.files[0]; input.value=''; if(!f) return;
  f.text().then(text=>call('importData',text)).then(d=>{
    applyInit(d); S.date=S.today; S.month=S.today.slice(0,7); S.tab='check';
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab==='check'));
    startMain(); toast('백업을 불러왔어요');
  }).catch(e=>toast(errMsg(e)));
}
function askReset(){
  openModal(`<h3>모든 기록 지우기</h3>
    <div class="warn">자녀·항목·통장 기록이 모두 지워지고 되돌릴 수 없어요. 먼저 백업 파일을 저장해 두세요.</div>
    <label class="f">확인을 위해 <b>지우기</b> 라고 입력해 주세요</label><input id="rConfirm">
    <button class="btn full red" onclick="doReset()">모두 지우기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function doReset(){
  if($('rConfirm').value.trim()!=='지우기'){toast("'지우기'라고 입력해 주세요");return}
  call('resetAll').then(()=>{closeModal();S.kids=[];S.hasPin=false;S.tab='check';S.date=null;S.month=null;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab==='check'));
    renderSetup();toast('모두 지웠어요')}).catch(e=>toast(errMsg(e)));
}

/* ---------- 오프라인 (서비스 워커) ---------- */
if('serviceWorker' in navigator && location.protocol!=='file:' && !NATIVE){ // Android 앱은 파일이 앱 안에 있어서 오프라인 저장이 필요 없음
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}

/* 더보기 「자녀 화면 전환」: 부모 비밀번호를 넣으면 바로 이 휴대폰을 자녀 화면으로 (돌아올 때도 같은 비밀번호) */
function askKidSwitch(kidId){
  if(!requirePlus()) return;
  const k=S.kids.find(x=>x.id===kidId); if(!k) return;
  if(!S.hasPin) return openModal(`<h3>🧒 자녀 화면 전환</h3>
    <div>자녀 화면에서 부모 화면으로 돌아올 때 쓸 <b>앱 잠금 비밀번호</b>를 먼저 정해 주세요.</div>
    <button class="btn full" onclick="openPin()">비밀번호 정하기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
  openModal(`<h3>🧒 ${esc(callName(k.name))}의 화면으로 전환</h3>
    <div class="muted">부모 비밀번호를 넣으면 바로 바뀌어요. 돌아올 때도 같은 비밀번호를 써요.</div>
    <input id="ksPin" type="password" inputmode="numeric" autocomplete="off" style="margin-top:10px;text-align:center;letter-spacing:6px" onkeydown="if(event.key==='Enter')doKidSwitch('${kidId}')">
    <button class="btn full" id="ksBtn" onclick="doKidSwitch('${kidId}')">전환하기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
  setTimeout(()=>{const p=$('ksPin');if(p)p.focus()},50);
}
function doKidSwitch(kidId){
  const b=$('ksBtn'); if(b) b.disabled=true;
  call('verifyPin',$('ksPin').value).then(()=>call('setKidRole',kidId,true)).then(d=>{
    applyInit(d); closeModal(); setTab('check'); toast('자녀 화면이에요! 「했어요!」를 눌러 보세요');
  }).catch(e=>{ if(b) b.disabled=false; toast(errMsg(e)); const p=$('ksPin'); if(p) p.value=''; });
}
