/* 용돈 받아라 — 👧 아이 참여(아이 화면·인증 요청·승인)와 💸 조부모 용돈 송금 연결 (플러스)
   app.js보다 먼저 불러옴 — 함수만 정의. 데이터는 store.js의 call() */
'use strict';

function isKid(){return S.role==='kid'}
function viewOnly(){return S.role==='gp'||S.role==='kid'}

/* ---------- 탭 이름: 역할에 따라 ---------- */
function setTabLabels(){
  const L=isKid()?{check:['✅','오늘 할 일'],ledger:['📒','내 통장'],manage:['🎯','내 목표']}
    :{check:['✅','실천 체크'],ledger:['📒','통장'],items:['🧩','아이·항목'],manage:['⚙️','설정']};
  if(viewOnly()){ delete L.items; if(S.tab==='items') S.tab='manage'; }
  document.querySelectorAll('.tab').forEach(b=>{
    const l=L[b.dataset.tab]; b.classList.toggle('hide',!l);
    if(l) b.innerHTML=`<b>${l[0]}</b>${l[1]}`;
    b.classList.toggle('on',b.dataset.tab===S.tab);
  });
}

/* ================= 👧 아이 화면 ================= */
function renderKidDay(){
  const d=S.day, k=kid();
  const items=d.items.filter(i=>i.amount>=0), fines=d.items.filter(i=>i.amount<0);
  const pend=id=>d.requests.filter(r=>r.itemId===id&&r.status==='pending').length;
  const rejected=d.requests.filter(r=>r.status==='rejected');
  let h=`<div class="card kidhead">
    <div class="jua" style="font-size:22px">${esc(k.emoji)} ${esc(k.name)}의 통장</div>
    <div class="bal ${d.balance<0?'minus':''}">${won(d.balance)}</div>
    ${jarsHtml(d.jars)}${interestHtml(d)}${goalHtml(k,d.balance)}${spendGoalHtml(d.spendGoal)}
  </div>`;
  if(rejected.length) h+=rejected.map(r=>`<div class="card kidnote">😢 <b>${esc(r.itemName)}</b>는 다시 해 볼까요?
      ${r.reason?`<div class="muted">엄마·아빠: ${esc(r.reason)}</div>`:''}
      <button class="btn sm ghost" onclick="call('dismissRequest','${r.id}').then(loadDay)">알겠어요</button></div>`).join('');
  h+=`<div class="sec">✅ 오늘 할 일 <span class="muted">(하고 나서 「했어요!」를 눌러요)</span></div>`;
  h+=items.map(i=>{
    const p=pend(i.id), left=i.maxCount-i.count-p, per=i.period==='매일'?'오늘':'이번 주';
    return `<div class="item ${i.count>=i.maxCount?'full':i.count>0?'some':''}">
      <div class="row"><div><div class="n">${esc(i.name)}</div><div class="m">${esc(i.meaning)}</div></div>
        <div class="amt">+${won(i.amount)}</div></div>
      <div class="row" style="margin-top:8px">
        <div class="muted">${per} ${i.count}/${i.maxCount}번 ${'⭐'.repeat(i.count)}${p?` · ⏳ 확인 중 ${p}`:''}</div>
        ${left>0?`<button class="btn sm" style="background:var(--green)" onclick="openDidIt('${i.id}')">📸 했어요!</button>`:`<span class="badge need">${p?'확인 기다려요':'다 했어요 🎉'}</span>`}
      </div></div>`;
  }).join('')||'<div class="card muted">아직 할 일이 없어요.</div>';
  if(fines.length) h+=`<div class="sec">⚠️ 지켜야 할 약속</div><div class="card">${fines.map(i=>`<div class="est"><span>${esc(i.name)}</span><span class="out">${won(i.amount)}</span></div>`).join('')}</div>`;
  const got=(d.cheers||[]).map(c=>`<div>💌 ${esc(c.name)}</div>`).concat(d.bonuses.map(b=>`<div>🎁 ${esc(b.name)} <b class="bonus">+${won(b.amount)}</b></div>`))
    .concat((d.interests||[]).map(x=>`<div>🏦 ${esc(x.name)} <b class="bonus">+${won(x.amount)}</b></div>`));
  if(got.length) h+=`<div class="sec">💌 오늘 받은 응원·용돈</div><div class="bcard">${got.join('')}</div>`;
  if(!S.plus.active) h+=`<div class="card muted">「했어요!」 보내기는 플러스 기능이에요. 엄마·아빠에게 물어봐요.</div>`;
  $('view').innerHTML=h;
}
function spendGoalHtml(g){
  if(!g) return '';
  const p=Math.min(100,Math.round(g.used/g.limit*100)), over=g.used>g.limit;
  return `<div style="margin-top:12px"><div class="row"><span>🛍️ 이번 달 갖고 싶은 것 목표: <b>${won(g.limit)}까지</b></span><span class="muted">${won(g.used)}</span></div>
    <div class="bar"><i style="width:${p}%;${over?'background:var(--red)':''}"></i></div>
    <div class="muted">${over?'목표보다 '+won(g.used-g.limit)+' 더 썼어요. 다음 달엔 조금 아껴 볼까요?':'앞으로 '+won(g.limit-g.used)+' 남았어요'}</div></div>`;
}

/* 「했어요!」 — 사진(선택) + 한마디 → 엄마·아빠에게 */
let didPhoto='';
function openDidIt(itemId){
  if(!S.plus.active){toast('플러스 기능이에요');return}
  const it=S.day.items.find(i=>i.id===itemId), k=kid(); didPhoto='';
  const canPhoto=!!k.consentAt;
  openModal(`<h3>📸 ${esc(it.name)}</h3>
    <div class="muted">했다는 걸 보여 주면 엄마·아빠가 확인하고 +${won(it.amount)}을 넣어 줘요.</div>
    ${canPhoto?`<label class="photobtn"><input type="file" accept="image/*" capture="environment" onchange="pickPhoto(this)">📷 사진 찍기</label>
    <img id="didPrev" class="didprev hide" alt="">
    <div class="muted" style="margin-top:4px">사진은 엄마·아빠가 확인하면 바로 지워져요.</div>`:'<div class="tip">사진 인증은 엄마·아빠가 허락하면 쓸 수 있어요. 지금은 「했어요!」만 보낼게요.</div>'}
    <label class="f">한마디 (선택)</label><input id="didMemo" placeholder="예: 혼자서 다 했어요!">
    <button class="btn full" style="background:var(--green)" id="didBtn" onclick="sendDidIt('${itemId}')">엄마·아빠에게 보내기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
function pickPhoto(input){
  const f=input.files&&input.files[0]; if(!f) return;
  shrinkPhoto(f).then(url=>{didPhoto=url;const im=$('didPrev');im.src=url;im.classList.remove('hide')}).catch(()=>toast('사진을 불러오지 못했어요'));
}
/** 사진을 작게 줄이기 (긴 변 720px, JPEG) — 서버에는 이 작은 사진만 잠깐 올라감 */
function shrinkPhoto(file){
  return new Promise((res,rej)=>{
    const img=new Image(), url=URL.createObjectURL(file);
    img.onload=()=>{
      const max=720, sc=Math.min(1,max/Math.max(img.width,img.height));
      const cv=document.createElement('canvas'); cv.width=Math.round(img.width*sc); cv.height=Math.round(img.height*sc);
      cv.getContext('2d').drawImage(img,0,0,cv.width,cv.height); URL.revokeObjectURL(url);
      let q=0.7, out=cv.toDataURL('image/jpeg',q);
      while(out.length>300000&&q>0.3){q-=0.1;out=cv.toDataURL('image/jpeg',q)}
      res(out);
    };
    img.onerror=()=>{URL.revokeObjectURL(url);rej()};
    img.src=url;
  });
}
function sendDidIt(itemId){
  $('didBtn').disabled=true;
  call('submitRequest',S.kidId,itemId,didPhoto,$('didMemo').value).then(d=>{
    S.day=d; closeModal(); renderKidDay(); toast('엄마·아빠에게 보냈어요! 확인을 기다려요 ⏳');
  }).catch(e=>{$('didBtn').disabled=false;toast(errMsg(e))});
}

/* 아이: 내 목표 */
function renderKidGoals(){
  const k=kid();
  $('view').innerHTML=`<div class="card"><div class="jua" style="font-size:20px">🎯 내 목표 정하기</div>
      <label class="f">🫙 모으고 싶은 것</label><input id="gName" value="${esc(k.goalName||'')}" placeholder="예: 레고 자동차">
      <label class="f">얼마가 필요할까요? (원)</label><input id="gAmt" type="number" inputmode="numeric" step="1000" value="${k.goalAmount||''}">
      <label class="f">🛍️ 이번 달 갖고 싶은 것은 얼마까지만 쓸까요? (원)</label>
      <input id="gSpend" type="number" inputmode="numeric" step="500" value="${k.spendGoalMonth===S.today.slice(0,7)&&k.spendGoal||''}" placeholder="예: 5000">
      <div class="muted" style="margin-top:4px">꼭 필요한 것은 빼고, 갖고 싶은 것에 쓰는 돈만 세요.</div>
      <button class="btn full" style="background:var(--green)" id="gBtn" onclick="saveKidGoals()">목표 저장하기</button></div>
    <div class="tip">💡 목표를 정하면 통장 화면에 얼마나 모았는지, 얼마나 썼는지 막대로 보여 줘요.</div>
    ${S.kidRole&&S.kidRole.fromParent?`<div class="card"><button class="btn full ghost" onclick="askExitKid()">👨‍👩‍👧 부모 화면으로 돌아가기</button></div>`:''}`;
}
function saveKidGoals(){
  $('gBtn').disabled=true;
  call('setKidGoals',S.kidId,{goalName:$('gName').value,goalAmount:Number($('gAmt').value),spendGoal:Number($('gSpend').value)})
    .then(d=>{applyInit(d);toast('🎯 목표를 정했어요! 화이팅');$('gBtn').disabled=false}).catch(e=>{$('gBtn').disabled=false;toast(errMsg(e))});
}
function askExitKid(){
  openModal(`<h3>부모 화면으로 돌아가기</h3><div class="muted">앱 잠금 비밀번호를 입력해 주세요.</div>
    <input id="exPin" type="password" inputmode="numeric" autocomplete="off" style="margin-top:10px;text-align:center;letter-spacing:6px">
    <button class="btn full" onclick="call('exitKidRole',$('exPin').value).then(d=>{applyInit(d);closeModal();setTab('check');toast('부모 화면이에요')}).catch(e=>toast(errMsg(e)))">돌아가기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}

/* ================= 👨‍👩‍👧 부모: 승인 ================= */
function pendingBannerHtml(){
  if(isKid()||isGp()||!S.pendingCount) return '';
  return `<div class="pendbar" onclick="openApprovals()">📸 아이가 보낸 실천 인증 <b>${S.pendingCount}건</b> — 확인하기 ›</div>`;
}
const PHOTO_OK=/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/;
function openApprovals(){
  call('listRequests').then(list=>{
    const p=list.filter(r=>r.status==='pending');
    openModal(`<h3>📸 실천 인증 확인</h3>
      ${p.length?p.map(r=>`<div class="reqcard">
        <div class="row"><b>${esc(r.kidEmoji)} ${esc(r.kidName)} · ${esc(r.itemName)}</b><span class="bonus">+${won(r.amount)}</span></div>
        <div class="muted">${prettyDate(r.date)}${r.memo?' · “'+esc(r.memo)+'”':''}</div>
        ${PHOTO_OK.test(r.photo||'')?`<img class="reqimg" src="${r.photo}" alt="실천 사진">`:'<div class="muted" style="padding:8px 0">(사진 없음)</div>'}
        <div class="row" style="gap:8px">
          <button class="btn" style="flex:1;background:var(--green)" onclick="approveReq('${r.id}')">✅ 승인</button>
          <button class="btn ghost" style="flex:1" onclick="askReject('${r.id}')">다시 해 보자</button></div>
      </div>`).join(''):'<div class="muted" style="padding:14px 0">기다리는 인증이 없어요.</div>'}
      <div class="muted center">승인하거나 「다시 해 보자」를 누르면 사진은 바로 지워져요.</div>
      <button class="btn full ghost" onclick="closeModal()">닫기</button>`);
  }).catch(e=>toast(errMsg(e)));
}
function approveReq(id){
  call('approveRequest',id).then(()=>{toast('✅ 승인했어요! 용돈이 들어갔어요');refreshCounts().then(openApprovals);render()}).catch(e=>toast(errMsg(e)));
}
const REJECT_REASONS=['사진이 잘 안 보여요','아직 덜 했어요','함께 다시 해 보자'];
function askReject(id){
  openModal(`<h3>다시 해 보자</h3><div class="muted">아이에게 보여 줄 이유를 골라 주세요.</div>
    <div class="chips" style="margin-top:8px">${REJECT_REASONS.map((x,i)=>`<button type="button" onclick="$('rjWhy').value=REJECT_REASONS[${i}]">${esc(x)}</button>`).join('')}</div>
    <input id="rjWhy" placeholder="직접 쓰기">
    <button class="btn full" onclick="call('rejectRequest','${id}',$('rjWhy').value).then(()=>{toast('아이에게 알려 줬어요');refreshCounts().then(openApprovals)}).catch(e=>toast(errMsg(e)))">보내기</button>
    <button class="btn full ghost" onclick="openApprovals()">뒤로</button>`);
}
function refreshCounts(){return call('getInitData').then(d=>{applyInit(d)})}

/* 부모: 아이 화면 설정 (동의 → 아이 기기 초대 / 이 폰을 아이 모드로) */
function openKidAccess(kidId){
  if(!requirePlus()) return;
  const k=S.kids.find(x=>x.id===kidId);
  openModal(`<h3>🧒 ${esc(k.name)}의 아이 화면</h3>
    <div>아이가 직접 실천하고 「📸 했어요!」를 보내면, 엄마·아빠가 확인하고 승인해요. 저축·소비 목표도 아이가 정할 수 있어요.</div>
    ${k.consentAt?`<div class="tip">✅ 보호자 동의 완료 (${esc(k.consentAt)})</div>`:`<div class="warn">
      <b>보호자 동의</b><br>아이가 찍은 실천 사진은 작게 줄여 가족 서버(Google Firebase)를 거쳐 부모 휴대폰에 보이고, <b>승인하거나 반려하면 바로 지워져요.</b>
      사진은 다른 목적으로 쓰지 않아요. 만 14세 미만 아이의 사진이라 법정대리인인 보호자의 동의가 필요해요.
      <label class="ck"><input type="checkbox" id="kcOk"> 보호자로서 위 내용에 동의해요</label></div>`}
    <button class="btn full" style="background:var(--green)" onclick="kidInvite('${kidId}')">📱 아이 휴대폰·태블릿 초대 링크 보내기</button>
    <button class="btn full ghost" onclick="kidModeHere('${kidId}')">이 휴대폰을 아이 모드로 바꾸기</button>
    <div class="muted" style="margin-top:6px">아이 모드에서 부모 화면으로 돌아올 때는 앱 잠금 비밀번호를 입력해요.</div>
    <button class="btn full ghost" onclick="closeModal()">닫기</button>`);
}
function ensureConsent(kidId){
  const k=S.kids.find(x=>x.id===kidId);
  if(k.consentAt) return Promise.resolve();
  if(!$('kcOk')||!$('kcOk').checked){toast('보호자 동의에 체크해 주세요');return Promise.reject()}
  return call('setKidConsent',kidId).then(d=>applyInit(d));
}
function kidInvite(kidId){
  ensureConsent(kidId).then(()=>{
    if(!S.family){toast('먼저 설정에서 「가족 만들기」를 해 주세요');return}
    const k=S.kids.find(x=>x.id===kidId);
    previewShare(`[용돈 받아라] ${k.name}의 아이 화면 🧒
${k.name}(이)가 스스로 실천하고 「했어요!」를 보내는 화면이에요.

① 아이 휴대폰·태블릿에서 아래 링크를 열어 주세요
${appUrl()}?join=${S.family}&kid=${kidId}

② 크롬 메뉴(⋮) → 「앱 설치」를 누르면 아이 기기에 앱이 생겨요

③ 「${k.name} 화면 시작하기」를 누르면 끝!`,'아이 기기 초대 보내기',true);
  }).catch(()=>{});
}
function kidModeHere(kidId){
  ensureConsent(kidId).then(()=>call('setKidRole',kidId,true)).then(d=>{
    applyInit(d); closeModal(); setTab('check'); toast('아이 모드예요! 「했어요!」를 눌러 보세요');
  }).catch(e=>{if(e)toast(errMsg(e))});
}
/* 아이 기기: 초대 링크로 처음 열었을 때 */
function renderKidSetup(code,kidId){
  $('tabs').classList.add('hide'); $('kids').innerHTML='';
  $('view').innerHTML=`<div class="card center">
    <div style="font-size:54px">🧒</div>
    <div class="jua" style="font-size:22px">내 용돈 통장 시작!</div>
    <div style="margin-top:6px">좋은 습관을 실천하고 「📸 했어요!」를 보내면,<br>엄마·아빠가 확인하고 용돈을 넣어 줘요.</div>
    <button class="btn full" style="background:var(--green)" id="kidGo" onclick="doKidJoin('${code}','${kidId}')">내 화면 시작하기</button>
  </div>`;
}
function doKidJoin(code,kidId){
  const b=$('kidGo'); b.disabled=true; b.textContent='준비하는 중…';
  Sync.join(code).then(()=>call('setKidRole',kidId,false)).then(d=>{
    applyInit(d); S.tab='check'; S.date=null; S.month=null; startMain(); toast('반가워요! 오늘도 화이팅 💪');
  }).catch(e=>{b.disabled=false;b.textContent='다시 시도';toast(errMsg(e))});
}

/* ================= 💸 조부모 용돈 → 송금 앱 연결 ================= */
function payCardHtml(){
  if(isKid()||isGp()) return '';
  const p=S.pay||{};
  const set=p.kakao||p.account;
  return `<div class="card"><div class="jua" style="font-size:18px">💸 할머니·할아버지 용돈 받을 곳 ${plusTag()}</div>
    <div class="muted" style="margin-top:4px">조부모님이 앱에서 용돈을 보내면 여기 등록한 곳으로 송금 화면이 바로 열려요. 가족 휴대폰에만 보여요.</div>
    ${set?`<div style="margin-top:8px">${p.kakao?'<span class="badge">카카오페이 링크</span>':''}${p.account?`<span class="badge">${esc(p.bank)} ${esc(p.account)}</span>`:''}</div>`:''}
    <button class="btn full ghost" onclick="openPaySettings()">${set?'바꾸기':'등록하기'}</button></div>`;
}
function openPaySettings(){
  if(!requirePlus()) return;
  const p=S.pay||{};
  openModal(`<h3>💸 용돈 받을 곳</h3>
    <label class="f">카카오페이 송금받기 링크</label><input id="pyK" value="${esc(p.kakao)}" placeholder="https://qr.kakaopay.com/...">
    <div class="muted">카카오페이 앱 → 송금 → 「송금받기」(또는 내 QR) → 링크 복사</div>
    <label class="f">은행 (토스·계좌 복사용)</label><input id="pyB" value="${esc(p.bank)}" placeholder="예: 카카오뱅크">
    <label class="f">계좌번호</label><input id="pyA" value="${esc(p.account)}" inputmode="numeric" placeholder="숫자만">
    <label class="f">예금주</label><input id="pyH" value="${esc(p.holder)}" placeholder="예: 홍길동">
    <div class="tip">계좌번호는 같은 가족 코드로 연결된 휴대폰(엄마·아빠·조부모·아이)에만 저장돼요.</div>
    <button class="btn full" onclick="call('setPay',{kakao:$('pyK').value,bank:$('pyB').value,account:$('pyA').value,holder:$('pyH').value}).then(d=>{applyInit(d);closeModal();renderManage();toast('저장했어요')}).catch(e=>toast(errMsg(e)))">저장</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}
/** 조부모가 용돈을 보낸 뒤: 송금 앱 열기 */
function openPayFlow(amount){
  const p=S.pay||{}, has=p.kakao||p.account;
  const toss=p.account&&p.bank?`supertoss://send?amount=${amount}&bank=${encodeURIComponent(p.bank)}&accountNo=${encodeURIComponent(p.account.replace(/-/g,''))}`:'';
  S.payTossUrl=toss;
  openModal(`<h3>💸 ${won(amount)} 보내기</h3>
    <div>통장에 기록했어요! 이제 실제 돈을 부모님께 보내 주세요.</div>
    ${has?'':'<div class="warn">부모님이 아직 받을 곳을 등록하지 않았어요. 부모님께 직접 전해 주세요.</div>'}
    ${p.kakao?`<button class="btn full" style="background:#FEE500;color:#3C1E1E" onclick="location.href=S.pay.kakao">카카오페이로 보내기</button>
      <div class="muted">카카오페이가 열리면 금액 ${won(amount)}을 확인하고 보내 주세요.</div>`:''}
    ${toss?`<button class="btn full" style="background:#0064FF" onclick="location.href=S.payTossUrl">토스로 보내기</button>`:''}
    ${p.account?`<button class="btn full ghost" onclick="copyPay(${amount})">계좌번호 복사 (${esc(p.bank)} ${esc(p.account)})</button>`:''}
    <button class="btn full ghost" onclick="closeModal()">나중에 보낼게요</button>`);
}
function copyPay(amount){
  const p=S.pay, t=`${p.bank} ${p.account} ${p.holder} (${won(amount)})`;
  (navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(()=>toast('계좌번호를 복사했어요. 은행 앱에 붙여 넣어 주세요')).catch(()=>toast(t));
}
