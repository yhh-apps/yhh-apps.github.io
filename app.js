/* 용돈 받아라 — 화면 (부모용). 데이터 호출은 store.js의 call() */
'use strict';
const S = { kids:[], items:[], kinds:[], methods:[], kidId:null, date:null, today:null, month:null, tab:'check', day:null, ledger:null, hasPin:false, locked:false };
const WEEK = ['일','월','화','수','목','금','토'];
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
let toastT;
function toast(msg){const t=$('toast');t.textContent=msg;t.classList.add('on');clearTimeout(toastT);toastT=setTimeout(()=>t.classList.remove('on'),1800)}
function openModal(html){$('sheet').innerHTML=html;$('modal').classList.add('on')}
function closeModal(){$('modal').classList.remove('on');if(pendingRefresh){pendingRefresh=false;if(!S.locked&&S.kids.length){renderKids();render()}}}
function store(k,v){try{localStorage.setItem(k,v)}catch(e){}}
function load(k){try{return localStorage.getItem(k)}catch(e){return null}}
function showErr(e){$('view').innerHTML='<div class="card warn">'+esc(errMsg(e))+'</div>'}

/* ---------- 시작 ---------- */
document.querySelectorAll('.tab').forEach(b=>b.onclick=()=>setTab(b.dataset.tab));

/* 카톡 외 다른 앱 안의 브라우저(네이버·인스타·페북·라인 등)로 열렸으면 안내 */
if(/NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|KAKAOTALK|DaumApps|everytimeApp|; wv\)/i.test(navigator.userAgent)) $('inappBar').classList.remove('hide');

/* 가족 초대 링크: ?join=가족코드 로 열면 코드를 자동으로 넣어 줌 */
let INVITE=null, INVITE_GP=false;
try{
  const q=new URLSearchParams(location.search), j=(q.get('join')||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
  if(j.length===8){ INVITE=j; INVITE_GP=q.get('gp')==='1'; }
  if(q.has('join')) history.replaceState(null,'',location.pathname);
}catch(e){}
function applyInvite(){
  if(!INVITE||!Sync.available()) return;
  const c=INVITE; INVITE=null; const shown=Sync.shareCode(c);
  if(!S.kids.length&&INVITE_GP){ renderGpSetup(c); return; } // 조부모 초대
  if(!S.kids.length&&$('joinCode')){ // 첫 화면
    $('joinCode').value=shown; $('joinCode').scrollIntoView({block:'center'});
    toast('가족 코드가 입력됐어요. 「가족 코드로 참여하기」를 눌러 주세요');
    return;
  }
  if(S.family===c){toast('이미 이 가족과 연결되어 있어요');return}
  if(S.family){
    openModal(`<h3>다른 가족 초대예요</h3><div>이 휴대폰은 이미 다른 가족(${esc(Sync.shareCode(S.family))})과 연결되어 있어요.</div>
      <div class="muted" style="margin-top:6px">새 가족(${esc(shown)})에 참여하려면 「설정 → 이 휴대폰 연결 끊기」를 한 뒤 코드를 입력해 주세요.</div>
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
    if(d.hasPin){S.locked=true;return renderLock();}
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
  S.today=d.today;
  $('demoBar').classList.toggle('hide',!S.demo);
  if(!S.kids.some(k=>k.id===S.kidId)) S.kidId=S.kids[0]&&S.kids[0].id;
}
function startMain(){
  S.locked=false;
  S.date=S.date||S.today; S.month=S.month||S.today.slice(0,7);
  const saved=load('kidId');
  if(S.kids.some(k=>k.id===saved)) S.kidId=saved;
  $('tabs').classList.remove('hide');
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

/* ---------- 처음 시작 ---------- */
function renderSetup(){
  $('tabs').classList.add('hide'); $('kids').innerHTML=''; $('demoBar').classList.add('hide');
  $('view').innerHTML=`<div class="card">
    <div class="jua" style="font-size:21px">👋 환영해요!</div>
    <div style="margin-top:6px">아이가 집안일·좋은 습관을 실천하면 용돈이 쌓이고, 쓴 돈과 저축을 함께 기록하는 <b>부모용</b> 용돈 관리 앱이에요.</div>
    <div class="tip">🔒 회원가입이 없어요. 기록은 이 휴대폰에 저장되고, 엄마·아빠 휴대폰을 연결(가족 코드)할 때만 동기화 서버를 써요.</div>
    <label class="f" style="margin-top:14px">아이 이름 (별명도 좋아요)</label>
    <div id="setupKids"><div class="kidrow"><input class="skid" placeholder="예: 첫째"></div></div>
    <button class="btn sm ghost" style="margin-top:8px" onclick="addSetupKid()">+ 아이 더 추가</button>
    <div class="muted" style="margin-top:12px">기본 실천 항목(이불 개기, 책 읽기, 집안일 돕기 등)과 벌금 항목 2개가 들어가요. 설정 탭에서 언제든 바꿀 수 있어요.</div>
    <button class="btn full" id="setupBtn" onclick="doSetup()">시작하기</button>
  </div>
  ${Sync.available()?`<div class="card">
    <div class="jua" style="font-size:18px">👨‍👩‍👧 다른 부모님이 먼저 시작했나요?</div>
    <div class="muted" style="margin-top:4px">먼저 쓰고 있는 휴대폰의 「설정 → 가족과 함께 쓰기」에 나오는 가족 코드를 입력하면 같은 기록을 함께 써요.</div>
    <input id="joinCode" class="codein" placeholder="ABCD-EFGH" maxlength="9" autocomplete="off" style="margin-top:10px">
    <button class="btn full" style="background:var(--green)" id="joinBtn" onclick="doJoin()">가족 코드로 참여하기</button>
  </div>`:''}
  <div class="card">
    <div class="jua" style="font-size:18px">👀 어떻게 쓰는지 먼저 볼까요?</div>
    <div class="muted" style="margin-top:4px">예시 아이 2명의 4주치 기록(실천·벌금·보너스·지출·저축)으로 둘러볼 수 있어요. 언제든 내 아이로 새로 시작할 수 있어요.</div>
    <button class="btn full" style="background:var(--blue)" id="demoBtn" onclick="doDemo()">예시로 둘러보기</button>
    <button class="btn full ghost" onclick="$('importFile').click()">📂 백업 파일에서 불러오기</button>
  </div>`;
}
function doDemo(){
  $('demoBtn').disabled=true;
  call('loadDemo').then(d=>{applyInit(d);S.date=null;S.month=null;startMain();toast('예시 자료를 불러왔어요')})
    .catch(e=>{$('demoBtn').disabled=false;toast(errMsg(e))});
}
function askEndDemo(){
  openModal(`<h3>내 아이로 시작하기</h3>
    <div>예시 자료를 모두 지우고, 내 아이 이름으로 새로 시작해요.</div>
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
  if(S.hasPin&&!S.locked&&hiddenAt&&Date.now()-hiddenAt>LOCK_AFTER_MS){S.locked=true;renderLock()}
  else if(!S.locked&&S.kids.length){ // 날짜가 바뀌었으면 오늘로
    call('getInitData').then(d=>{ if(d.today!==S.today){const wasToday=S.date===S.today;S.today=d.today;if(wasToday)S.date=d.today;render();runAccrue()} });
  }
});

/* ---------- 탭 ---------- */
function renderKids(){
  $('kids').innerHTML = S.kids.map(k=>
    `<button class="kid ${k.id===S.kidId?'on':''}" onclick="pickKid('${k.id}')">${esc(k.emoji)} ${esc(k.name)}</button>`).join('');
  $('kids').style.display = (S.tab==='manage'||S.kids.length<2)?'none':'flex';
}
function pickKid(id){S.kidId=id;store('kidId',id);renderKids();render()}
function setTab(t){
  S.tab=t;
  document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab===t));
  renderKids();render();window.scrollTo(0,0);
}
function render(){
  if(S.locked) return;
  if(S.tab==='manage') return renderManage();
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
  const d=S.day, k=kid();
  const daily=d.items.filter(i=>i.period==='매일'&&i.amount>=0), weekly=d.items.filter(i=>i.period==='매주'&&i.amount>=0);
  const fineItems=d.items.filter(i=>i.amount<0);
  const dayMax = daily.reduce((s,i)=>s+i.amount*i.maxCount,0);
  let h = `
  <div class="card">
    <div class="bal-label">${esc(k.emoji)} ${esc(k.name)}의 통장 잔액</div>
    <div class="bal ${d.balance<0?'minus':''}">${won(d.balance)}</div>
    ${d.balance<0?'<div class="muted" style="color:var(--red)">마이너스예요. 실천으로 채워 가도록 이야기 나눠 보세요.</div>':''}
    ${jarsHtml(d.jars)}
    ${interestHtml(d)}
    ${isGp()?'':'<button class="btn full" onclick="openSpend()">🛒 쓴 돈 기록하기 (카드·현금)</button>'}
    ${goalHtml(k,d.balance)}
    <div class="mini"><div><span class="muted">이번 달 들어온 돈</span><b class="in">+${won(d.monthEarned)}</b></div>
      <div><span class="muted">이번 달 쓴 돈</span><b class="out">-${won(d.monthSpent)}</b></div></div>
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
  if(!d.items.length) h+='<div class="card muted">등록된 항목이 없어요. 설정 탭에서 항목을 추가해 주세요.</div>';
  const extras=(d.interests||[]).map(x=>`<div class="row" style="padding:4px 0"><span>🏦 ${esc(x.name)}</span><span class="bonus">+${won(x.amount)}</span></div>`).join('')
    +(d.cheers||[]).map(c=>`<div class="row" style="padding:4px 0"><span>💌 ${esc(c.name)}</span>${isGp()?'':`<button class="del" onclick="askDelBonus('${c.id}',0)">삭제</button>`}</div>`).join('');
  h+=`<div class="sec">🎁 특별 보너스 <span class="muted">(받은 용돈·칭찬·응원)</span></div>
    <div class="bcard">
      ${extras}
      ${d.bonuses.length?d.bonuses.map(b=>`<div class="row" style="padding:4px 0"><span>🎁 ${esc(b.name)}</span>
        <span><span class="bonus">+${won(b.amount)}</span> ${isGp()?'':`<button class="del" onclick="askDelBonus('${b.id}',${b.amount})">삭제</button>`}</span></div>`).join('')
        :(extras?'':'<div class="muted">할머니·할아버지, 친척, 지인에게 받은 용돈을 여기에 넣어요.(현금 실물은 부모님이 보관)</div>')}
      ${isGp()?`<button class="btn full" style="background:#FFB020" onclick="openCheer()">💌 응원·용돈 보내기</button>`
        :`<button class="btn full" style="background:#FFB020" onclick="openBonus()">+ 보너스 넣기</button>`}
    </div>
    <div class="sharecard ${isGp()?'hide':''}">
      <div class="jua" style="font-size:18px">💬 ${d.date===d.today?'오늘':shortDate(d.date)} 결과를 ${esc(k.name)}에게 보내 볼까요?</div>
      <div class="muted" style="margin-top:4px">한 일, 모은 돈, 잔액을 정리해서 카톡·문자로 보낼 수 있어요. 보내기 전에 내용을 보고 한마디 덧붙일 수 있어요.</div>
      <button class="btn full" style="background:var(--green)" onclick="shareDay()">${d.date===d.today?'오늘':prettyDate(d.date)} 결과 보내기</button>
    </div>`;
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
  const tot=i.amount*i.count, per=i.period==='매일'?'하루':'한 주';
  return `<div class="item ${cls}" id="it_${i.id}">
    <div class="n">${esc(i.name)}</div><div class="m">${esc(i.meaning)}</div>
    <div class="boxes">${boxes}
      <div class="info"><div class="amt">${tot>=0?'+':''}${won(tot)}</div><div class="muted">1번에 ${i.amount>=0?'+':''}${won(i.amount)} · ${per} ${i.count}/${i.maxCount}</div></div>
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

/* ---------- 아이에게 보내기 (카톡·문자 등 공유) ---------- */
function plus(n){return (n>=0?'+':'')+won(n)}
function goalLine(k,bal){
  if(!k.goalName||!k.goalAmount) return '';
  return bal>=k.goalAmount?`🎯 ${k.goalName} 목표 금액을 다 모았어! 🏆`:`🎯 ${k.goalName}까지 ${won(k.goalAmount-Math.max(0,bal))} 남았어!`;
}
function buildDayMsg(){
  const d=S.day, k=kid(), L=[];
  L.push(`${k.emoji} ${k.name}의 ${d.date===d.today?'오늘':''} 실천 (${prettyDate(d.date)})`.replace('  ',' '));
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
  L.push(`${k.emoji} ${k.name}의 ${m}월 용돈 통장`);
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
// 보내기 전 미리보기: 내용을 고치거나 한마디 덧붙인 뒤 보내기/복사
function previewShare(text,title,noCheer){
  const canShare=!!navigator.share;
  openModal(`<h3>💬 ${esc(title)}</h3>
    <div class="muted">보낼 내용이에요. 고치거나 한마디 덧붙여도 돼요.</div>
    <textarea id="shareTxt" style="min-height:240px;font-size:14px;margin-top:8px">${esc(text)}</textarea>
    <div class="chips ${noCheer?'hide':''}" style="margin-top:8px">${CHEERS.map((c,i)=>`<button type="button" onclick="addCheer(${i})">${esc(c)}</button>`).join('')}</div>
    ${canShare?`<button class="btn full" style="background:var(--green)" onclick="sendShare()">카톡·문자로 보내기</button>`:''}
    <button class="btn full ${canShare?'ghost':''}" onclick="copyShare()">복사하기</button>
    ${canShare?'':'<div class="muted" style="margin-top:6px">복사한 뒤 카카오톡 등에 붙여 넣어 보내세요.</div>'}
    <button class="btn full ghost" onclick="closeModal()">닫기</button>`);
}
const CHEERS=['사랑해 ❤️','자랑스러워 👍','내일도 화이팅 💪','저금 목표까지 조금만 더! 🎯'];
function addCheer(i){const t=$('shareTxt');t.value=t.value.replace(/\s*$/,'')+'\n'+CHEERS[i];t.scrollTop=t.scrollHeight}
async function sendShare(){
  const text=$('shareTxt').value;
  try{await navigator.share({text:text});closeModal();toast('보냈어요 💬')}
  catch(e){if(!(e&&e.name==='AbortError'))toast('보내기를 못 했어요. 복사해서 보내 주세요.')}
}
async function shareText(text){ // 가족 코드 보내기 등 바로 보내기
  if(navigator.share){
    try{await navigator.share({text:text});return}
    catch(e){if(e&&e.name==='AbortError')return}
  }
  previewShare(text,'보낼 내용');
}
function copyShare(){
  const t=$('shareTxt');
  (navigator.clipboard?navigator.clipboard.writeText(t.value):Promise.reject()).then(()=>toast('복사했어요'))
    .catch(()=>{t.select();try{document.execCommand('copy');toast('복사했어요')}catch(e){toast('직접 길게 눌러 복사해 주세요')}});
}

/* ---------- 특별 보너스 ---------- */
const BONUS_FROM=['할머니','할아버지','외할머니','외할아버지','친척','지인','칭찬 보너스'];
function openBonus(){
  const k=kid();
  openModal(`<h3>🎁 특별 보너스 넣기</h3>
    <div class="muted">${esc(k.emoji)} ${esc(k.name)}의 통장에 더해져요.</div>
    <label class="f">누구에게 받았나요?</label>
    <div class="chips" id="bChips">${BONUS_FROM.map((x,i)=>`<button type="button" onclick="pickFrom(this,${i})">${x}</button>`).join('')}</div>
    <input id="bFrom" placeholder="직접 입력 (예: 큰이모)">
    <label class="f">금액(원)</label><input id="bAmt" type="number" inputmode="numeric" step="1000">
    <label class="f">날짜</label><input id="bDate" type="date" value="${S.date}" max="${S.today}">
    <label class="f">메모 (선택)</label><input id="bMemo" placeholder="예: 추석, 생일 축하">
    <div class="tip">💡 받은 돈 중 얼마를 실물 통장에 저축할지 아이와 함께 정해 보세요.</div>
    <button class="btn full" id="bBtn" onclick="doBonus()">통장에 넣기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function pickFrom(btn,i){$('bFrom').value=BONUS_FROM[i];document.querySelectorAll('#bChips button').forEach(b=>b.classList.toggle('on',b===btn))}
function doBonus(){
  const b={from:$('bFrom').value,amount:Number($('bAmt').value),date:$('bDate').value,memo:$('bMemo').value};
  $('bBtn').disabled=true;
  call('addBonus',S.kidId,b,S.date).then(d=>{
    S.day=d; closeModal(); renderDay(); toast('🎁 '+won(b.amount)+' 보너스를 넣었어요!');
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
  call('deleteBonus',id,S.kidId,S.date).then(d=>{
    closeModal(); toast('삭제했어요');
    if(fromLedger) loadLedger(); else {S.day=d; renderDay();}
  }).catch(e=>{$('dbBtn').disabled=false;toast(errMsg(e))});
}

/* ---------- 지출 (카드·현금) ---------- */
let spendKind='', spendMethod='카드', spendJar='spend';
function openSpend(){
  const k=kid(), j=S.day.jars; spendKind=''; spendMethod=S.methods[0]||'카드'; spendJar='spend';
  openModal(`<h3>🛒 쓴 돈 기록하기</h3>
    <div class="muted">${esc(k.emoji)} ${esc(k.name)}의 지금 잔액: <b>${won(S.day.balance)}</b></div>
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
    <div class="bal-label">${esc(k.emoji)} ${esc(k.name)}의 앱 통장 잔액</div>
    <div class="bal ${L.balance<0?'minus':''}">${won(L.balance)}</div>
    ${jarsHtml(L.jars)}
    <div class="muted" style="margin-top:6px">🏦 지금까지 실물 통장으로 옮긴 돈: <b style="color:var(--blue)">${won(L.totalSaved)}</b></div>
    ${isGp()?'':'<button class="btn full" style="background:var(--blue)" onclick="openTransfer()">🏦 실물 통장으로 이체하기</button>'}
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
    h+=`<div class="card"><div class="jua" style="font-size:18px;margin-bottom:6px">🧺 이번 달 어디에 썼을까?</div>
      <div class="est"><span>${kindBadge(S.kinds[0])}</span><b>${won(need)}</b></div>
      <div class="est"><span>${kindBadge(S.kinds[1])}</span><b>${won(want)}</b></div>
      ${etc>0?`<div class="est"><span class="badge">구분 안 함</span><b>${won(etc)}</b></div>`:''}
      <div class="muted" style="margin-top:6px">${S.methods.map(m=>(m==='현금'?'💵 ':'💳 ')+m+' '+won((L.methodSum||{})[m]||0)).join(' · ')}</div></div>`;
  }
  if(L.stats.length){
    h+=`<div class="card"><div class="jua" style="font-size:18px;margin-bottom:6px">🏅 이번 달 많이 실천한 것</div>`+
      L.stats.slice(0,5).map((s,i)=>`<div class="est"><span>${['🥇','🥈','🥉','④','⑤'][i]} ${esc(s.name)}</span><span class="muted r">${s.count}번 · ${won(s.amount)}</span></div>`).join('')+`</div>`;
  }
  h+=`<div class="card"><div class="jua" style="font-size:18px">📒 ${esc(k.name)}의 통장 내역</div>`;
  if(!L.lines.length) h+='<div class="muted" style="padding:14px 0">이 달의 거래가 없어요.</div>';
  h+=L.lines.map(l=>{
    let left, amt;
    if(l.type==='in'){
      left=`<div><b>${shortDate(l.date)}</b> 실천 ${l.count}번 적립</div><div class="names">${esc(l.detail)}</div>`;
      amt=`<div class="in">+${won(l.amount)}</div>`;
    }else if(l.type==='fine'){
      left=`<div><b>${shortDate(l.date)}</b> ⚠️ 벌금 ${l.count}번</div><div class="names">${esc(l.detail)}</div>`;
      amt=`<div class="out">-${won(l.amount)}</div>`;
    }else if(l.type==='bonus'){
      left=`<div><b>${shortDate(l.date)}</b> 🎁 ${esc(l.name)}</div><div class="names"><span class="badge">특별 보너스</span>${isGp()?'':`<button class="del" onclick="askDelBonus('${l.id}',${l.amount},true)">삭제</button>`}</div>`;
      amt=`<div class="bonus">+${won(l.amount)}</div>`;
    }else if(l.type==='interest'){
      left=`<div><b>${shortDate(l.date)}</b> 🏦 엄마·아빠 은행 ${esc(l.name)}</div><div class="names"><span class="badge">이자</span></div>`;
      amt=`<div class="bonus">+${won(l.amount)}</div>`;
    }else if(l.type==='cheer'){
      left=`<div><b>${shortDate(l.date)}</b> 💌 ${esc(l.name)}</div><div class="names"><span class="badge">응원 메시지</span>${isGp()?'':`<button class="del" onclick="askDelBonus('${l.id}',0,true)">삭제</button>`}</div>`;
      amt=`<div class="muted">💌</div>`;
    }else if(l.type==='save'){
      left=`<div><b>${shortDate(l.date)}</b> 🏦 실물 통장으로 이체</div><div class="names">${esc(l.memo)} <button class="del" onclick="askDelSpend('${l.id}')">삭제</button></div>`;
      amt=`<div class="save">-${won(l.amount)}</div>`;
    }else{
      left=`<div><b>${shortDate(l.date)}</b> ${l.method==='현금'?'💵':'💳'} ${esc(l.name)}</div>
        <div class="names">${L.jars&&l.jar!=='spend'?`<span class="badge">${JAR_LABEL[l.jar][0]} ${JAR_LABEL[l.jar][1]} 통장</span>`:''}${kindBadge(l.kind)}${esc(l.memo)} ${isGp()?'':`<button class="del" onclick="askDelSpend('${l.id}')">삭제</button>`}</div>`;
      amt=`<div class="out">-${won(l.amount)}</div>`;
    }
    return `<div class="line"><div class="l">${left}</div><div class="r">${amt}<div class="muted">잔액 ${won(l.balance)}</div></div></div>`;
  }).join('');
  const mm=Number(L.month.slice(5));
  h+=`</div>
    ${plusShortcutsHtml()}
    <div class="sharecard ${isGp()?'hide':''}">
      <div class="jua" style="font-size:18px">💬 ${mm}월 통장을 ${esc(k.name)}에게 보내 볼까요?</div>
      <div class="muted" style="margin-top:4px">번 돈, 쓴 돈, 저축, 많이 실천한 것을 정리해서 카톡·문자로 보낼 수 있어요. 보내기 전에 내용을 보고 한마디 덧붙일 수 있어요.</div>
      <button class="btn full" style="background:var(--green)" onclick="shareMonth()">${mm}월 통장 보내기</button>
    </div>
    <div class="tip">💡 아이와 통장 보며 이야기 나누기: "이번 달 산 것 중 꼭 필요했던 건 뭐였니?", "얼마를 진짜 통장에 저축해 둘까?"</div>`;
  $('view').innerHTML=h;
}

/* ---------- 실물 통장 이체 ---------- */
function openTransfer(){
  const k=kid(), j=S.ledger&&S.ledger.jars, bal=j?Math.min(j.save,S.ledger.balance):(S.ledger?S.ledger.balance:0);
  if(bal<=0){toast(j?'저축 통장에 이체할 돈이 없어요':'이체할 잔액이 없어요');return}
  openModal(`<h3>🏦 실물 통장으로 이체하기</h3>
    <div class="muted">${esc(k.emoji)} ${esc(k.name)}의 앱 잔액: <b>${won(bal)}</b><br>실제 은행 통장에 넣은 금액만큼 앱 잔액에서 빼요.</div>
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

/* ---------- 설정 ---------- */
function renderManage(){
  if(isGp()) return renderGpManage();
  const est =S.kids.map(k=>{
    const its=S.items.filter(i=>i.active&&i.amount>0&&(i.target==='ALL'||i.target===k.id));
    const calc=f=>{
      const d=its.filter(i=>i.period==='매일').reduce((s,i)=>s+i.amount*f(i),0);
      const w=its.filter(i=>i.period==='매주').reduce((s,i)=>s+i.amount*f(i),0);
      return Math.round((d*30+w*52/12)/10)*10;
    };
    return `<div class="est"><span>${esc(k.emoji)} ${esc(k.name)}</span>
      <span class="r"><b>1번씩: 약 ${won(calc(()=>1))}</b><br><span class="muted">최대 횟수까지: 약 ${won(calc(i=>i.maxCount))}</span></span></div>`;
  }).join('');
  const kidName=id=>id==='ALL'?'모두':((S.kids.find(k=>k.id===id)||{}).name||'(삭제된 아이)');
  let h=plusCardHtml();
  h+=`<div class="card"><div class="jua" style="font-size:18px">📊 한 달 예상 용돈</div>${est}
      <div class="muted" style="margin-top:6px">매일 항목 × 30일 + 매주 항목 × 4.3주 기준(벌금 제외)</div></div>`;
  h+=`<div class="card"><div class="row"><div class="jua" style="font-size:18px">✅ 실천 항목</div><button class="btn sm" onclick="editItem()">+ 항목 추가</button></div>`+
    (S.items.length?S.items.map(i=>`<div class="mitem ${i.active?'':'off'}"><div class="t">
      <div><b>${esc(i.name)}</b></div>
      <div style="margin-top:3px"><span class="badge">${i.period==='매일'?'하루':'한 주'} ${i.maxCount}번</span><span class="badge">${esc(kidName(i.target))}</span>${i.amount<0?'<span class="badge want">벌금</span>':''}${i.active?'':'<span class="badge off">쉬는 중</span>'}<span class="amt" style="font-size:15px">${won(i.amount)}</span></div></div>
      <button class="btn sm ghost" onclick="editItem('${i.id}')">수정</button>
      <button class="btn sm ghost" onclick="askDelItem('${i.id}')">삭제</button></div>`).join(''):'<div class="muted">항목이 없어요</div>')+`</div>`;
  h+=`<div class="card"><div class="row"><div class="jua" style="font-size:18px">👧 아이</div><button class="btn sm" onclick="editKid()">+ 아이 추가</button></div>`+
    S.kids.map(k=>`<div class="mitem"><div class="t"><b>${esc(k.emoji)} ${esc(k.name)}</b> <span class="muted">${esc(k.desc)}</span>
      ${k.goalName?`<div class="muted">목표 ${esc(k.goalName)} ${won(k.goalAmount)}</div>`:''}
      ${kidPlusBadges(k)}</div>
      <button class="btn sm ghost" onclick="editKid('${k.id}')">수정</button>
      <button class="btn sm ghost" onclick="askDelKid('${k.id}')">삭제</button></div>`).join('')+`</div>`;
  h+=familyCardHtml();
  h+=`<div class="card"><div class="jua" style="font-size:18px">🔒 앱 잠금</div>
      <div class="muted" style="margin-top:4px">${S.hasPin?'앱을 열 때 비밀번호를 물어봐요. (5분 넘게 나갔다 오면 다시 잠겨요)':'지금은 잠금이 꺼져 있어요. 아이가 마음대로 고치지 못하게 하려면 비밀번호를 정해 주세요.'}</div>
      <button class="btn full ghost" onclick="openPin()">${S.hasPin?'비밀번호 바꾸기 / 끄기':'비밀번호 정하기'}</button></div>`;
  h+=`<div class="card"><div class="jua" style="font-size:18px">💾 백업</div>
      <div class="muted" style="margin-top:4px">기록은 이 휴대폰에만 있어요. 휴대폰을 바꾸거나 앱을 지우면 사라지니, 가끔 백업 파일을 저장해 두세요.</div>
      <button class="btn full ghost" onclick="doExport()">📤 백업 파일 저장하기</button>
      <button class="btn full ghost" onclick="askImport()">📂 백업 파일 불러오기</button></div>
    <div class="card"><div class="jua" style="font-size:18px">ℹ️ 앱 정보</div>
      <div class="muted" style="margin-top:4px">회원가입 없이 기록을 이 기기에 저장해요. 가족과 연결하면 동기화 서버에도 저장돼요.</div>
      <div style="margin-top:8px"><a href="privacy.html">개인정보처리방침</a></div>
      <button class="btn full ghost" style="color:var(--red)" onclick="askReset()">모든 기록 지우고 처음부터</button></div>`;
  $('view').innerHTML=h;
}
function afterSave(d,msg){applyInit(d);closeModal();renderKids();renderManage();toast(msg)}

function editItem(id){
  const it=S.items.find(i=>i.id===id)||{name:'',meaning:'',amount:50,period:'매일',target:'ALL',active:true,maxCount:3};
  const opts=[['ALL','모두']].concat(S.kids.map(k=>[k.id,k.emoji+' '+k.name]))
    .map(o=>`<option value="${esc(o[0])}" ${it.target===o[0]?'selected':''}>${esc(o[1])}</option>`).join('');
  const maxOpts=[1,2,3,4,5].map(n=>`<option value="${n}" ${it.maxCount===n?'selected':''}>${n}번</option>`).join('');
  openModal(`<h3>${id?'항목 수정':'새 항목'}</h3>
    <label class="f">항목 이름</label><input id="fName" value="${esc(it.name)}" placeholder="예: 신발 정리하기">
    <label class="f">교육 의미 (아이에게 들려줄 설명)</label><textarea id="fMean" placeholder="왜 하는지 아이 눈높이로">${esc(it.meaning)}</textarea>
    <div class="row" style="gap:10px">
      <div style="flex:1"><label class="f">1번 금액(원)</label><input id="fAmt" type="number" step="10" value="${it.amount}"></div>
      <div style="flex:1"><label class="f">주기</label><select id="fPer"><option ${it.period==='매일'?'selected':''}>매일</option><option ${it.period==='매주'?'selected':''}>매주</option></select></div>
      <div style="flex:1"><label class="f">최대 횟수</label><select id="fMax">${maxOpts}</select></div>
    </div>
    <div class="muted" style="margin-top:6px">⚠️ 벌금 항목은 금액 앞에 <b>-</b>를 붙여요 (예: -100). <button type="button" class="del" onclick="const a=$('fAmt');a.value=-Math.abs(Number(a.value)||0)">마이너스로 바꾸기</button></div>
    <label class="f">대상</label><select id="fTgt">${opts}</select>
    <label class="ck"><input type="checkbox" id="fAct" ${it.active?'checked':''}> 사용하기 (끄면 체크 화면에서 숨겨져요)</label>
    <button class="btn full" id="fBtn" onclick="doSaveItem('${id||''}')">저장</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
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
function editKid(id){
  const k=S.kids.find(x=>x.id===id)||{name:'',desc:'',emoji:'🙂',goalName:'',goalAmount:''};
  openModal(`<h3>${id?'아이 정보 수정':'아이 추가'}</h3>
    <div class="row" style="gap:10px">
      <div style="flex:0 0 80px"><label class="f">이모지</label><input id="kEmo" value="${esc(k.emoji)}" style="text-align:center"></div>
      <div style="flex:1"><label class="f">이름 (별명도 좋아요)</label><input id="kName" value="${esc(k.name)}"></div></div>
    <label class="f">설명</label><input id="kDesc" value="${esc(k.desc)}" placeholder="예: 초등학교 2학년">
    <label class="f">저축 목표 (선택)</label><input id="kGoal" value="${esc(k.goalName)}" placeholder="예: 레고 자동차">
    <label class="f">목표 금액(원)</label><input id="kGoalAmt" type="number" inputmode="numeric" step="1000" value="${k.goalAmount||''}">
    ${kidPlusFields(k)}
    <button class="btn full" id="kBtn" onclick="doSaveKid('${id||''}')">저장</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function doSaveKid(id){
  const k=Object.assign({id:id,name:$('kName').value,desc:$('kDesc').value,emoji:$('kEmo').value,
    goalName:$('kGoal').value,goalAmount:Number($('kGoalAmt').value)}, readKidPlusFields());
  $('kBtn').disabled=true;
  call('saveKid',k).then(d=>afterSave(d,'저장했어요')).catch(e=>{$('kBtn').disabled=false;toast(errMsg(e))});
}
function askDelKid(id){
  const k=S.kids.find(x=>x.id===id);
  openModal(`<h3>아이 삭제</h3><div>${esc(k.emoji)} ${esc(k.name)}을(를) 삭제할까요?</div>
    <div class="warn">이 아이의 통장 기록과 전용 항목이 모두 지워지고 되돌릴 수 없어요.</div>
    <button class="btn full red" onclick="this.disabled=true;call('deleteKid','${id}').then(d=>afterSave(d,'삭제했어요')).catch(e=>{this.disabled=false;toast(errMsg(e))})">삭제</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}

/* ---------- 가족과 함께 쓰기 ---------- */
function familyCardHtml(){
  let h=`<div class="card"><div class="jua" style="font-size:18px">👨‍👩‍👧 가족과 함께 쓰기</div>`;
  if(!Sync.available()) return h+`<div class="muted" style="margin-top:4px">가족 동기화는 준비 중이에요.</div></div>`;
  if(S.demo) return h+`<div class="muted" style="margin-top:4px">예시 자료에서는 쓸 수 없어요. 「내 아이로 시작하기」 후에 엄마·아빠 휴대폰을 연결해 보세요.</div></div>`;
  if(!S.family) return h+`<div class="muted" style="margin-top:4px">엄마·아빠 휴대폰을 연결하면 누가 체크하든 같은 통장을 함께 봐요. 이 휴대폰에서 가족을 만들고, 나온 코드를 다른 휴대폰에 입력하세요.</div>
    <button class="btn full" style="background:var(--green)" onclick="askCreateFamily()">가족 만들기 (코드 받기)</button>
    <button class="btn full ghost" onclick="askJoinFamily()">다른 휴대폰의 가족 코드 입력하기</button></div>`;
  return h+`<div class="muted" style="margin-top:4px">이 코드를 다른 부모님 휴대폰의 앱에 입력하면 함께 쓸 수 있어요.</div>
    <div class="code">${esc(Sync.shareCode(S.family))}</div>
    <div class="muted" id="syncStatus">${statusHtml()}</div>
    <button class="btn full" style="background:var(--green)" onclick="shareFamilyCode()">💬 가족 초대 보내기 (앱 설치 링크 포함)</button>
    <button class="btn full" style="background:#B07CE8" onclick="shareGpInvite()">👵 할머니·할아버지 초대하기 ${plusTag()}</button>
    <button class="btn full ghost" onclick="askLeaveFamily()">이 휴대폰 연결 끊기</button>
    <button class="btn full ghost" style="color:var(--red)" onclick="askDestroyFamily()">가족 데이터 서버에서 모두 삭제</button></div>`;
}
function askCreateFamily(){
  openModal(`<h3>👨‍👩‍👧 가족 만들기</h3>
    <div>이 휴대폰의 아이·항목·통장 기록을 동기화 서버(Google Firebase)에 올리고 가족 코드를 만들어요.</div>
    <div class="tip">가족 코드를 아는 휴대폰만 기록을 볼 수 있어요. 코드는 가족끼리만 나눠 주세요. 아이 이름은 별명으로 써도 돼요.</div>
    <button class="btn full" style="background:var(--green)" id="cfBtn" onclick="doCreateFamily()">가족 만들기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function doCreateFamily(){
  $('cfBtn').disabled=true; $('cfBtn').textContent='만드는 중…';
  Sync.create().then(code=>{S.family=code.replace('-','');closeModal();renderManage();toast('가족을 만들었어요! 이제 초대를 보내 보세요');
      setTimeout(shareFamilyCode,600)})
    .catch(e=>{$('cfBtn').disabled=false;$('cfBtn').textContent='가족 만들기';toast(errMsg(e))});
}
function askJoinFamily(){
  openModal(`<h3>가족 코드 입력하기</h3>
    <div class="warn">참여하면 <b>이 휴대폰의 지금 기록은 가족 기록으로 바뀌어요.</b> 필요하면 먼저 설정의 백업을 저장해 두세요.</div>
    <input id="joinCode" class="codein" placeholder="ABCD-EFGH" maxlength="9" autocomplete="off">
    <button class="btn full" style="background:var(--green)" id="joinBtn" onclick="doJoin()">참여하기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function doJoin(){
  const code=$('joinCode').value, btn=$('joinBtn');
  btn.disabled=true; btn.textContent='가족 기록 받는 중…';
  Sync.join(code).then(c=>call('getInitData')).then(d=>{
    closeModal(); applyInit(d);
    if(!d.ready){toast('가족에 아직 아이가 없어요');return renderSetup()}
    S.tab='manage';S.date=null;S.month=null;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab==='manage'));
    startMain(); toast('가족과 연결됐어요! 👨‍👩‍👧');
  }).catch(e=>{btn.disabled=false;btn.textContent='다시 시도';toast(errMsg(e))});
}
function appUrl(){return location.origin+location.pathname.replace(/[^/]*$/,'')}
function inviteMsg(){
  const code=Sync.shareCode(S.family);
  return `[용돈 받아라] 가족 초대 👨‍👩‍👧
우리 아이 용돈 통장을 함께 써요!

① 아래 링크를 눌러 앱을 열어 주세요
${appUrl()}?join=${S.family}

② 크롬 메뉴(⋮) → 「앱 설치」(또는 「홈 화면에 추가」)를 누르면 휴대폰에 앱이 생겨요

③ 첫 화면에 가족 코드가 자동으로 들어가 있어요 → 「가족 코드로 참여하기」

가족 코드: ${code}
(자동으로 안 들어가면 직접 입력해 주세요)`;
}
function shareFamilyCode(){previewShare(inviteMsg(),'가족 초대 보내기',true)}
function askLeaveFamily(){
  openModal(`<h3>이 휴대폰 연결 끊기</h3>
    <div>이 휴대폰만 가족에서 빠져요. 다른 휴대폰과 서버의 기록은 그대로예요.</div>
    <div class="muted" style="margin-top:6px">지금까지의 기록은 이 휴대폰에 남지만, 앞으로는 서로 맞춰지지 않아요.</div>
    <button class="btn full red" id="lfBtn" onclick="this.disabled=true;Sync.leave().then(()=>call('getInitData')).then(d=>{applyInit(d);closeModal();renderManage();toast('연결을 끊었어요')}).catch(e=>{this.disabled=false;toast(errMsg(e))})">연결 끊기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function askDestroyFamily(){
  openModal(`<h3>가족 데이터 모두 삭제</h3>
    <div class="warn">서버에 있는 이 가족의 아이·항목·통장 기록이 <b>모두 지워지고 되돌릴 수 없어요.</b> 이 휴대폰의 기록도 지워지고, 다른 휴대폰은 연결이 끊겨요(그 휴대폰에 있던 기록은 남음).</div>
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
    <div class="warn">아이·항목·통장 기록이 모두 지워지고 되돌릴 수 없어요. 먼저 백업 파일을 저장해 두세요.</div>
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
if('serviceWorker' in navigator && location.protocol!=='file:'){
  window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));
}
