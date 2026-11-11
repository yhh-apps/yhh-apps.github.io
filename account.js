/* 용돈 받아라 — 🔐 Google 계정 연결 (부모가 선택). 휴대폰을 바꿔도 가족 기록을 되찾게 해 줌
   app.js보다 먼저 불러옴 — 함수만 정의. 서버 일은 sync.js의 Sync.linkGoogle 등 */
'use strict';

/* Android 앱(Capacitor)에서는 팝업 Google 로그인이 막혀서, 앱용 로그인을 만들 때까지 잠시 「준비 중」 (웹은 그대로) */
const GOOGLE_NATIVE_READY=false;
function googleOk(){return !(typeof NATIVE!=='undefined'&&NATIVE&&!GOOGLE_NATIVE_READY)}
const GOOGLE_SOON='Android 앱에서는 Google 계정 연결을 곧 쓸 수 있어요. 그동안은 가족의 다른 휴대폰에서 「가족 초대 보내기」 링크로 새 휴대폰을 연결할 수 있어요.';

/* 가족 화면에서: 아직 Google 연결을 안 했으면 「기록 지키기」 권하기 */
function keepRecordsHtml(){
  if(!Sync.available()||S.demo||viewOnly()||S.account||!googleOk()) return '';
  return '<div class="keepbox"><div><b>🔐 휴대폰을 바꿔도 기록이 돌아오게</b><br><span class="muted">Google 계정을 연결해 두면 새 휴대폰에서 로그인만 하면 돼요.</span></div>'+
    '<button class="btn sm" onclick="doLinkGoogle()">연결하기</button></div>';
}

function accountCardHtml(){
  if(!Sync.available()||S.demo||viewOnly()) return '';
  if(!googleOk()) return '<div class="card"><div class="jua" style="font-size:18px">🔐 Google 계정</div><div class="muted" style="margin-top:4px">'+GOOGLE_SOON+'</div></div>';
  if(S.account) return `<div class="card"><div class="jua" style="font-size:18px">🔐 Google 계정</div>
    <div style="margin-top:6px">✅ <b>${esc(S.account)}</b> 연결됨</div>
    <div class="muted" style="margin-top:4px">휴대폰을 바꾸거나 앱을 지워도, 새 휴대폰에서 이 Google 계정으로 로그인하면 가족과 기록이 그대로 돌아와요.</div>
    <button class="btn full ghost" onclick="askUnlinkGoogle()">연결 끊기 (계정 정보 삭제)</button></div>`;
  return `<div class="card"><div class="jua" style="font-size:18px">🔐 Google 계정으로 기록 지키기 <span class="muted" style="font-size:13px">(선택)</span></div>
    <div class="muted" style="margin-top:4px">지금은 회원가입 없이 쓰고 있어요. Google 계정을 연결해 두면 <b>휴대폰을 바꾸거나 앱을 지워도</b> 로그인만 하면 가족과 기록이 돌아와요.
    이메일 주소만 연결용으로 쓰여요.</div>
    <button class="btn full" style="background:#fff;color:#3B2F2A;border:2px solid var(--line)" onclick="askLinkGoogle()"><span class="gmark">G</span> Google 계정 연결하기</button></div>`;
}

function askLinkGoogle(){
  if(!googleOk()) return toast(GOOGLE_SOON);
  if(S.family) return doLinkGoogle();
  openModal(`<h3>🔐 Google 계정 연결</h3>
    <div>되찾을 수 있으려면 기록이 서버에 저장돼 있어야 해요. <b>「가족 만들기」</b>를 하고 Google 계정을 연결할까요?</div>
    <div class="tip">가족을 만들면 기록이 동기화 서버(Google Firebase)에 저장되고, 엄마·아빠 휴대폰도 같은 코드로 연결할 수 있어요.</div>
    <button class="btn full" style="background:var(--green)" id="lgBtn" onclick="createThenLink()">가족 만들고 연결하기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function createThenLink(){
  const b=$('lgBtn'); b.disabled=true; b.textContent='가족 만드는 중…';
  Sync.create().then(code=>{S.family=code.replace('-','');closeModal();doLinkGoogle()})
    .catch(e=>{b.disabled=false;b.textContent='가족 만들고 연결하기';toast(errMsg(e))});
}
function doLinkGoogle(){
  if(!googleOk()) return toast(GOOGLE_SOON);
  toast('Google 로그인 창을 여는 중…');
  Sync.linkGoogle().then(r=>{
    if(r.conflict) return askSwitchGoogle(r);
    return call('setAccount',r.email).then(d=>{applyInit(d);closeModal();renderManage();toast('🔐 Google 계정을 연결했어요')});
  }).catch(e=>toast(errMsg(e)));
}
let pendingCred=null;
function askSwitchGoogle(r){
  pendingCred=r.credential;
  openModal(`<h3>이미 쓰고 있는 계정이에요</h3>
    <div>${r.email?`<b>${esc(r.email)}</b>은(는) `:''}다른 휴대폰에서 이미 「용돈 받아라」에 연결된 Google 계정이에요.</div>
    <div class="tip">이 계정의 가족 기록으로 바꾸면, 이 휴대폰은 그 가족의 기록을 보여 줘요. 이 휴대폰의 지금 가족 기록은 서버에 그대로 남아요.</div>
    <button class="btn full" id="swBtn" onclick="doSwitchGoogle()">이 계정의 기록으로 바꾸기</button>
    <button class="btn full ghost" onclick="pendingCred=null;closeModal()">취소</button>`);
}
function doSwitchGoogle(){
  const b=$('swBtn'); b.disabled=true; b.textContent='바꾸는 중…';
  Sync.switchToGoogle(pendingCred).then(r=>finishGoogle(r,'🔐 Google 계정의 기록으로 바꿨어요'))
    .catch(e=>{b.disabled=false;b.textContent='이 계정의 기록으로 바꾸기';toast(errMsg(e))});
}
function finishGoogle(r,msg){
  pendingCred=null;
  return call('setAccount',r.email).then(d=>{
    applyInit(d); closeModal();
    if(!d.ready){renderSetup();return}
    S.tab='manage';S.date=null;S.month=null;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab==='manage'));
    startMain(); toast(msg);
  });
}
function askUnlinkGoogle(){
  openModal(`<h3>Google 연결 끊기</h3>
    <div>서버에 남긴 「이 계정의 가족」 표시를 지우고 Google 계정 연결을 해제해요.</div>
    <div class="muted" style="margin-top:6px">이 휴대폰의 기록과 가족 연결은 그대로예요. 대신 휴대폰을 바꾸면 Google 로그인으로 되찾을 수 없어요.
      가족 기록까지 지우려면 「더보기 → 가족 데이터 삭제」를 이용해 주세요.</div>
    <button class="btn full red" id="ulBtn" onclick="doUnlinkGoogle()">연결 끊기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function doUnlinkGoogle(){
  $('ulBtn').disabled=true;
  Sync.unlinkGoogle().then(()=>call('setAccount','')).then(d=>{applyInit(d);closeModal();renderManage();toast('Google 연결을 끊었어요')})
    .catch(e=>{$('ulBtn').disabled=false;toast(errMsg(e))});
}

/* 첫 화면: 휴대폰을 바꿨을 때 */
function restoreCardHtml(){
  if(!Sync.available()) return '';
  if(!googleOk()) return '<div class="card"><div class="jua" style="font-size:18px">📲 휴대폰을 바꾸셨나요?</div><div class="muted" style="margin-top:4px">'+GOOGLE_SOON+'</div></div>';
  return `<div class="card">
    <div class="jua" style="font-size:18px">📲 휴대폰을 바꾸셨나요?</div>
    <div class="muted" style="margin-top:4px">쓰던 휴대폰에서 Google 계정을 연결해 두었다면, 로그인만 하면 가족과 기록이 돌아와요.</div>
    <button class="btn full" style="background:#fff;color:#3B2F2A;border:2px solid var(--line)" id="rsBtn" onclick="doRestoreGoogle()"><span class="gmark">G</span> Google 계정으로 기록 되찾기</button>
  </div>`;
}
function doRestoreGoogle(){
  if(!googleOk()) return toast(GOOGLE_SOON);
  const b=$('rsBtn'); b.disabled=true; b.textContent='기록 찾는 중…';
  Sync.restoreWithGoogle().then(r=>finishGoogle(r,'📲 기록을 되찾았어요!'))
    .catch(e=>{b.disabled=false;b.innerHTML='<span class="gmark">G</span> Google 계정으로 기록 되찾기';toast(errMsg(e))});
}
