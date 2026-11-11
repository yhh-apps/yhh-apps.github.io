/* 용돈 받아라 플러스 — 엄마·아빠 은행 이자, 세 개의 통장, 용돈 계약서, 성장 앨범, 조부모 초대
   (app.js보다 먼저 불러옴 — 함수만 정의하고, 실행은 app.js의 boot() 이후. 데이터는 store.js의 call()) */
'use strict';

/* ---------- 플러스 상태·안내 ---------- */
// 플러스 표시: 체험 중이거나 아직 안 산 사람에게는 보이고, 구매하면 사라짐
function plusTag(){return S.plus&&S.plus.purchased?'':'<span class="plustag">⭐ 플러스</span>'}
function plusStar(){return S.plus&&S.plus.purchased?'':' <span class="plusstar">⭐</span>'}
function promoText(){
  const p=S.plus||{};
  if(p.purchased) return p.family?'✅ 우리 가족 모두 플러스를 쓰고 있어요 (구매 완료)':'✅ 플러스 구매 완료 · 추가 결제 없이 계속 써요';
  if(p.promo) return '🎉 출시 기념 무료 체험 중'+(p.promoEnd?` (${Number(p.promoEnd.slice(5,7))}월 ${Number(p.promoEnd.slice(8))}일까지)`:'');
  return '체험 기간이 끝났어요 · 한 번 구매 '+(p.price||'');
}
/** 플러스가 아니면 소개 화면을 띄우고 false */
function requirePlus(){ if(S.plus&&S.plus.active) return true; openPlusPage(); return false; }

function plusCardHtml(){
  return `<div class="pluscard" onclick="openPlusPage()">
    <div class="row"><div class="jua" style="font-size:19px">⭐ 용돈 받아라 플러스</div><span class="muted">자세히 ›</span></div>
    <div style="margin-top:2px">습관은 용돈이 되고, 용돈은 경제 공부가 돼요</div>
    <div class="promo">${promoText()}</div>
  </div>`;
}
const PLUS_FEATURES=[
  ['🏦','엄마·아빠 은행 이자','모아 둔 돈에 매달 이자가 붙어요. "쓰지 않고 모으면 돈이 불어난다"는 걸 자녀가 직접 느껴요.'],
  ['🫙','세 개의 통장','들어온 용돈을 쓰기·저축·나눔으로 자동으로 나눠요. 돈을 목적에 맞게 나누는 습관이 생겨요.'],
  ['📜','용돈 계약서','실천 약속·벌금·용돈 쓰는 규칙을 자녀와 함께 정하고, 손가락으로 서명해 출력해요.'],
  ['🎖️','성장 앨범','한 달·한 해 동안의 실천 횟수, 최장 연속 기록, 저축·나눔을 예쁜 카드로 남겨요.'],
  ['👵','할머니·할아버지 초대','조부모님이 손주의 습관을 보고 응원 메시지와 용돈을 보내요. 카카오페이·토스 송금 화면이 바로 열려요.'],
  ['🧒','자녀가 직접 참여','자녀가 실천하고 사진과 함께 「했어요!」를 보내면 엄마·아빠가 승인해요. 저축·소비 목표도 자녀가 정해요.']
];
function openPlusPage(){
  const p=S.plus||{};
  openModal(`<div class="plushero">
      <div class="jua" style="font-size:24px">⭐ 용돈 받아라 플러스</div>
      <div style="margin-top:4px;font-weight:700">습관은 용돈이 되고, 용돈은 경제 공부가 돼요</div>
      <div class="muted" style="margin-top:4px">무료로 습관과 용돈을 기록하고, 플러스로 이자·저축·나눔까지 진짜 경제교육을 시작하세요.</div>
    </div>
    ${PLUS_FEATURES.map(f=>`<div class="pfeat"><div class="pico">${f[0]}</div><div><b>${f[1]}</b><div class="muted">${f[2]}</div></div></div>`).join('')}
    <div class="promo big">${promoText()}</div>
    ${p.purchased?'':p.promo
      ?`<div class="muted center" style="margin-top:6px">체험 기간에는 모든 플러스 기능을 무료로 쓸 수 있어요.${p.price?` 체험이 끝나면 한 번 구매(${esc(p.price)})로 추가 결제 없이 계속 쓸 수 있어요.`:''}</div>`
      :`<button class="btn full" style="background:#7C5CE0" onclick="buyPlus()">플러스 시작하기 · ${esc(p.price||'')}</button>
        <div class="muted center" style="margin-top:6px">한 번 결제로 계속 써요. 가족이 함께 쓰는 휴대폰에도 적용돼요.</div>`}
    <button class="btn full ghost" onclick="closeModal()">닫기</button>`);
}
function buyPlus(){
  // Play 결제(Digital Goods API)는 Play 스토어 출시 때 연결 예정
  toast('결제는 Play 스토어 출시와 함께 열려요');
}

/* ---------- 자녀별 플러스 설정 (이자·세 개의 통장) ---------- */
const JAR_PRESETS=[[60,30,10],[50,40,10],[70,20,10],[40,50,10]];
function kidPlusFields(k){
  const on=!!(S.plus&&S.plus.active), r=Number(k.interestRate)||0, j=k.jars&&k.jars.on?k.jars:null;
  const jv=j||{spend:60,save:30,give:10};
  return `<div class="plusbox">
    <div class="row"><b>${S.plus&&S.plus.purchased?'💰 이자 · 세 개의 통장':'⭐ 플러스 기능'}</b>${on?'':'<button class="del" onclick="openPlusPage()">플러스 알아보기</button>'}</div>
    <label class="f">🏦 엄마·아빠 은행 이자 (매달 1일, 지난달 말 ${j?'저축 통장':'잔액'} 기준)</label>
    <select id="kRate" ${on?'':'disabled'} onchange="ratePreview()">${[0,1,2,3,5].map(x=>`<option value="${x}" ${r===x?'selected':''}>${x?('월 '+x+'%'):'끄기'}</option>`).join('')}</select>
    <div class="muted" id="ratePv" style="margin-top:4px">${ratePreviewText(r)}</div>
    <label class="ck"><input type="checkbox" id="kJarOn" ${j?'checked':''} ${on?'':'disabled'} onchange="$('jarBox').classList.toggle('hide',!this.checked)"> 🫙 세 개의 통장 쓰기 (쓰기·저축·나눔)</label>
    <div id="jarBox" class="${j?'':'hide'}">
      <div class="row" style="gap:8px;margin-top:6px">
        <div style="flex:1"><label class="f">🛍️ 쓰기 %</label><input id="kJs" type="number" value="${jv.spend}"></div>
        <div style="flex:1"><label class="f">🫙 저축 %</label><input id="kJv" type="number" value="${jv.save}"></div>
        <div style="flex:1"><label class="f">💝 나눔 %</label><input id="kJg" type="number" value="${jv.give}"></div>
      </div>
      <div class="chips" style="margin-top:6px">${JAR_PRESETS.map(p=>`<button type="button" onclick="setJars(${p})">${p.join(' / ')}</button>`).join('')}</div>
      <div class="muted">들어오는 용돈(실천·보너스)이 이 비율로 나뉘어요. 이자는 저축 통장으로, 실물 통장 이체는 저축 통장에서 빠져요.</div>
    </div>
  </div>`;
}
function ratePreviewText(r){
  if(!r) return '켜면 모아 둔 돈에 매달 이자가 붙어요.';
  const y=Math.round(10000*Math.pow(1+r/100,12));
  return `예: 1만 원을 쓰지 않고 1년 두면 → 약 ${won(y)} (복리)`;
}
function ratePreview(){ $('ratePv').textContent=ratePreviewText(Number($('kRate').value)); }
function setJars(a,b,c){$('kJs').value=a;$('kJv').value=b;$('kJg').value=c}
function readKidPlusFields(){
  if(!$('kRate')||!(S.plus&&S.plus.active)) return {};
  const on=$('kJarOn').checked;
  return {interestRate:Number($('kRate').value), jars:{on:on, spend:Number($('kJs').value), save:Number($('kJv').value), give:Number($('kJg').value)}};
}
function kidPlusBadges(k){
  const b=[];
  if(Number(k.interestRate)>0) b.push(`<span class="badge">🏦 이자 월 ${k.interestRate}%</span>`);
  if(k.jars&&k.jars.on) b.push(`<span class="badge">🫙 ${k.jars.spend}/${k.jars.save}/${k.jars.give}</span>`);
  // 줄 전체를 누르면 자녀 수정 창이 열리므로, 바로가기 칩은 그 클릭이 위로 전달되지 않게 막음
  return `${b.length?`<div style="margin-top:4px">${b.join('')}</div>`:''}
    <div class="kchips">
    <button class="kchip" onclick="event.stopPropagation();openContract('${k.id}')">📜 계약서${plusStar()}</button>
    <button class="kchip" onclick="event.stopPropagation();openAlbum('${k.id}')">🎖️ 앨범${plusStar()}</button>
    <button class="kchip" onclick="event.stopPropagation();openKidAccess('${k.id}')">🧒 자녀 화면${plusStar()}</button></div>`;
}

/* ---------- 📜 용돈 계약서 ---------- */
let pads={};
function contractParts(kidId){
  const k=S.kids.find(x=>x.id===kidId)||kid();
  const its=S.items.filter(i=>i.active&&(i.target==='ALL'||i.target===kidId));
  const good=its.filter(i=>i.amount>0), bad=its.filter(i=>i.amount<0);
  const rules=[];
  rules.push('용돈을 쓰면 무엇을 샀는지, 꼭 필요한 것인지 갖고 싶은 것인지 함께 기록해요.');
  if(k.jars&&k.jars.on) rules.push(`들어온 용돈은 쓰기 ${k.jars.spend}% · 저축 ${k.jars.save}% · 나눔 ${k.jars.give}%로 나눠요.`);
  if(Number(k.interestRate)>0) rules.push(`엄마·아빠 은행에 모아 둔 돈에는 매달 ${k.interestRate}%의 이자를 줘요.`);
  if(k.goalName) rules.push(`저축 목표: ${k.goalName}${k.goalAmount?' ('+won(k.goalAmount)+')':''}`);
  return {kidId:kidId,k:k,good:good,bad:bad,rules:rules};
}
function openContract(kidId){
  if(!(S.plus&&S.plus.active)){
    // 플러스가 끝나도 이미 서명한 계약서는 보고 인쇄할 수 있음 (새로 쓰거나 고치기만 플러스)
    call('getContract',kidId).then(c=>{
      if(!c) return openPlusPage();
      const x=S.contract=contractParts(kidId); S.contract.saved=c;
      openModal(`<h3>📜 ${esc(callName(x.k.name))}의 용돈 계약서</h3>
        <div class="contract" id="contractBody">${contractHtml(x.k,x.good,x.bad,x.rules,c,false)}</div>
        <div class="muted" style="margin-top:6px">계약서를 고치거나 새로 쓰려면 ⭐ 플러스가 필요해요.</div>
        <button class="btn full ghost" onclick="printSavedContract()">🖨️ 인쇄 · PDF로 저장</button>
        <button class="btn full ghost" onclick="closeModal();openPlusPage()">⭐ 플러스 알아보기</button>
        <button class="btn full ghost" onclick="closeModal()">닫기</button>`);
    }).catch(e=>toast(errMsg(e)));
    return;
  }
  call('getContract',kidId).then(c=>{
    c=c||{};
    const x=S.contract=contractParts(kidId), k=x.k, good=x.good, bad=x.bad, rules=x.rules;
    openModal(`<h3>📜 ${esc(callName(k.name))}의 용돈 계약서</h3>
      <div class="contract" id="contractBody">${contractHtml(k,good,bad,rules,c,true)}</div>
      <label class="f">💰 용돈 정산일</label><input id="cPay" value="${esc(c.payday||'매주 일요일 저녁')}" placeholder="예: 매주 일요일 저녁">
      <label class="f">🤝 특별 약속 (선택)</label><textarea id="cSpecial" placeholder="예: 게임은 숙제를 끝낸 뒤 30분만 해요">${esc(c.special||'')}</textarea>
      <div class="row" style="gap:10px;margin-top:10px">
        <div style="flex:1"><label class="f">✍️ ${esc(k.name)} 서명</label><canvas class="sign" id="signChild" width="300" height="120"></canvas><button type="button" class="del" onclick="clearPad('signChild')">다시 쓰기</button></div>
        <div style="flex:1"><label class="f">✍️ 엄마·아빠 서명</label><canvas class="sign" id="signParent" width="300" height="120"></canvas><button type="button" class="del" onclick="clearPad('signParent')">다시 쓰기</button></div>
      </div>
      <button class="btn full" onclick="saveContractNow()">계약서 저장하기</button>
      <button class="btn full ghost" onclick="printContract()">🖨️ 인쇄 · PDF로 저장</button>
      <button class="btn full ghost" onclick="closeModal()">닫기</button>`);
    pads={};
    initPad('signChild',c.childSign); initPad('signParent',c.parentSign);
  }).catch(e=>toast(errMsg(e)));
}
function contractHtml(k,good,bad,rules,c,editing){
  const list=a=>a.map(i=>`<li>${esc(i.name)} — 1번에 ${won(Math.abs(i.amount))} (${i.period==='매일'?'하루':'한 주'} 최대 ${i.maxCount}번)</li>`).join('');
  return `<div class="ctitle">용돈 계약서</div>
    <p>나 <b>${esc(k.name)}</b>(은)는 엄마·아빠와 아래와 같이 약속합니다.</p>
    <div class="csec">1. 실천하면 받는 용돈</div><ul>${list(good)||'<li>(실천 항목 없음)</li>'}</ul>
    ${bad.length?`<div class="csec">2. 약속을 지키지 못하면</div><ul>${list(bad)}</ul>`:''}
    <div class="csec">${bad.length?3:2}. 용돈 쓰는 약속</div><ul>${rules.map(r=>`<li>${esc(r)}</li>`).join('')}</ul>
    ${editing?'':`<div class="csec">${bad.length?4:3}. 용돈 정산일</div><p>${esc(c.payday||'')}</p>
    ${c.special?`<div class="csec">${bad.length?5:4}. 특별 약속</div><p>${esc(c.special)}</p>`:''}
    <p style="margin-top:14px">${esc(c.date||S.today)}</p>
    <div class="csigns"><div>${esc(k.name)}<br>${c.childSign?`<img src="${c.childSign}">`:'<span class="sline"></span>'}</div>
      <div>엄마·아빠<br>${c.parentSign?`<img src="${c.parentSign}">`:'<span class="sline"></span>'}</div></div>`}`;
}
function initPad(id,data){
  const cv=$(id), ctx=cv.getContext('2d'); let drawing=false, dirty=!!data;
  ctx.lineWidth=3; ctx.lineCap='round'; ctx.strokeStyle='#3B2F2A';
  if(data){const img=new Image();img.onload=()=>ctx.drawImage(img,0,0,cv.width,cv.height);img.src=data;}
  const pos=e=>{const r=cv.getBoundingClientRect();return [(e.clientX-r.left)*cv.width/r.width,(e.clientY-r.top)*cv.height/r.height]};
  cv.onpointerdown=e=>{drawing=true;dirty=true;cv.setPointerCapture(e.pointerId);const p=pos(e);ctx.beginPath();ctx.moveTo(p[0],p[1])};
  cv.onpointermove=e=>{if(!drawing)return;const p=pos(e);ctx.lineTo(p[0],p[1]);ctx.stroke()};
  cv.onpointerup=cv.onpointercancel=()=>{drawing=false};
  pads[id]={cv:cv,isDirty:()=>dirty,reset:()=>{dirty=false}};
}
function clearPad(id){const p=pads[id];p.cv.getContext('2d').clearRect(0,0,p.cv.width,p.cv.height);p.reset()}
function padData(id){const p=pads[id];return p&&p.isDirty()?p.cv.toDataURL('image/png'):''}
function saveContractNow(){
  const c={payday:$('cPay').value,special:$('cSpecial').value,childSign:padData('signChild'),parentSign:padData('signParent')};
  return call('saveContract',S.contract.kidId,c).then(saved=>{toast('📜 계약서를 저장했어요');return saved}).catch(e=>{toast(errMsg(e));throw e});
}
function printContract(){
  saveContractNow().then(c=>{
    const x=S.contract;
    printHtml(`<div class="contract print">${contractHtml(x.k,x.good,x.bad,x.rules,c,false)}</div>`);
  }).catch(()=>{});
}
function printSavedContract(){
  const x=S.contract;
  printHtml(`<div class="contract print">${contractHtml(x.k,x.good,x.bad,x.rules,x.saved,false)}</div>`);
}
function printHtml(html){
  $('printArea').innerHTML=html;
  setTimeout(()=>window.print(),300); // 이미지(서명)가 그려질 시간
}

/* ---------- 🎖️ 성장 앨범 ---------- */
function openAlbum(kidId,range){
  if(!requirePlus()) return;
  range=range||'month';
  const t=S.today, from=range==='month'?t.slice(0,7)+'-01':range==='year'?t.slice(0,4)+'-01-01':'2000-01-01';
  call('getAlbum',kidId,from,t).then(a=>{
    S.album={kidId:kidId,range:range,a:a};
    openModal(`<h3>🎖️ 성장 앨범</h3>
      <div class="seg">${[['month','이번 달'],['year','올해'],['all','전체']].map(r=>`<button type="button" class="${r[0]===range?'on':''}" onclick="openAlbum('${kidId}','${r[0]}')">${r[1]}</button>`).join('')}</div>
      <div id="albumCard" style="margin-top:12px">${albumHtml(a,range)}</div>
      <button class="btn full" style="background:var(--green)" onclick="shareAlbum()">💬 앨범 보내기</button>
      <button class="btn full ghost" onclick="printHtml($('albumCard').innerHTML)">🖨️ 인쇄 · PDF로 저장</button>
      <button class="btn full ghost" onclick="closeModal()">닫기</button>`);
  }).catch(e=>toast(errMsg(e)));
}
function rangeLabel(range){return range==='month'?Number(S.today.slice(5,7))+'월':range==='year'?S.today.slice(0,4)+'년':'지금까지'}
function albumHtml(a,range){
  const k=a.kid, stat=(ico,label,val)=>`<div class="astat"><div class="aico">${ico}</div><div class="aval">${val}</div><div class="alab">${label}</div></div>`;
  return `<div class="album">
    <div class="ahead"><div class="aemoji">${esc(k.emoji)}</div><div><div class="jua" style="font-size:22px">${esc(callName(k.name))}의 ${rangeLabel(range)} 성장 앨범</div>
      <div class="muted">${esc(a.from==='2000-01-01'?'처음부터':a.from)} ~ ${esc(a.to)}</div></div></div>
    <div class="agrid">
      ${stat('✅','실천',a.checks+'번')}${stat('📅','실천한 날',a.activeDays+'일')}${stat('🔥','최장 연속',a.bestStreak+'일')}
      ${stat('💰','실천으로 번 돈',won(a.earned))}${stat('🏦','이자',won(a.interest))}${stat('🎁','보너스',won(a.bonus))}
      ${stat('🫙','실물 통장 저축',won(a.saved))}${stat('💝','나눔',won(a.gave))}${stat('⚠️','벌금',a.fineCount+'번')}
    </div>
    ${a.top.length?`<div class="atop"><b>🏅 가장 많이 실천한 습관</b>${a.top.map((t,i)=>`<div>${['🥇','🥈','🥉'][i]} ${esc(t.name)} <span class="muted">${t.count}번</span></div>`).join('')}</div>`:''}
    ${k.goalName?`<div class="atop">🎯 저축 목표 <b>${esc(k.goalName)}</b> — ${a.goalDone?'달성했어요! 🏆':'지금 '+won(a.balance)+' / '+won(k.goalAmount)}</div>`:''}
    <div class="amsg">${albumMessage(a)}</div>
  </div>`;
}
function albumMessage(a){
  if(!a.checks) return '이제 시작이에요. 작은 실천부터 함께 해 볼까요? 😊';
  if(a.bestStreak>=7) return `${a.bestStreak}일 연속 실천! 꾸준함이 최고의 재능이에요 🔥`;
  if(a.gave>0) return '모은 돈으로 다른 사람을 도울 줄 아는 멋진 마음이에요 💝';
  if(a.saved+a.interest>0) return '차곡차곡 모으는 힘이 쑥쑥 자라고 있어요 🫙';
  return '스스로 해낸 하루하루가 모여 큰 힘이 됐어요 👏';
}
function shareAlbum(){
  const x=S.album, a=x.a, k=a.kid, L=[];
  L.push(`🎖️ ${k.emoji} ${callName(k.name)}의 ${rangeLabel(x.range)} 성장 앨범`,'');
  L.push(`✅ 실천 ${a.checks}번 · 📅 ${a.activeDays}일 · 🔥 최장 ${a.bestStreak}일 연속`);
  L.push(`💰 실천으로 번 돈 ${won(a.earned)}${a.interest?` · 🏦 이자 ${won(a.interest)}`:''}${a.bonus?` · 🎁 보너스 ${won(a.bonus)}`:''}`);
  if(a.saved||a.gave) L.push(`🫙 저축 ${won(a.saved)} · 💝 나눔 ${won(a.gave)}`);
  if(a.top.length){L.push('','🏅 가장 많이 실천한 습관');a.top.forEach((t,i)=>L.push(`${['🥇','🥈','🥉'][i]} ${t.name} ${t.count}번`))}
  L.push('',albumMessage(a));
  previewShare(L.join('\n'),'성장 앨범 보내기');
}

/* ---------- 💌 응원·용돈 보내기 (조부모 화면) ---------- */
const CHEER_IDEAS=['꾸준히 실천하는 모습이 정말 멋지다!','할머니·할아버지가 많이 사랑해 ❤️','저금 목표까지 화이팅! 💪','오늘도 스스로 해냈구나, 최고야 👍'];
function openCheer(){
  const k=kid();
  openModal(`<h3>💌 ${esc(callName(k.name))}에게 응원 보내기</h3>
    <label class="f">보내는 사람</label><input id="chFrom" value="${esc(S.gpName||'')}" placeholder="예: 할머니">
    <label class="f">응원 메시지</label><textarea id="chMsg" placeholder="손주에게 하고 싶은 말"></textarea>
    <div class="chips" style="margin-top:6px">${CHEER_IDEAS.map((c,i)=>`<button type="button" onclick="$('chMsg').value=CHEER_IDEAS[${i}]">${esc(c)}</button>`).join('')}</div>
    <label class="f">용돈도 함께 보내기 (선택)</label>
    <div class="chips" id="chAmt">${[0,1000,5000,10000].map(v=>`<button type="button" class="${v?'':'on'}" onclick="pickCheerAmt(this,${v})">${v?won(v):'메시지만'}</button>`).join('')}</div>
    <div class="muted">용돈은 통장에 기록돼요. 실제 돈은 부모님께 전해 주세요.</div>
    <button class="btn full" style="background:#FFB020" id="chBtn" onclick="doCheer()">보내기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
  cheerAmt=0;
}
let cheerAmt=0;
function pickCheerAmt(btn,v){cheerAmt=v;document.querySelectorAll('#chAmt button').forEach(b=>b.classList.toggle('on',b===btn))}
function doCheer(){
  $('chBtn').disabled=true;
  call('addCheer',S.kidId,{from:$('chFrom').value,msg:$('chMsg').value,amount:cheerAmt},S.date||S.today).then(d=>{
    if(S.tab==='check') S.day=d; closeModal(); render(); toast(cheerAmt?'💌 응원과 용돈을 기록했어요':'💌 응원을 보냈어요');
    if(cheerAmt) setTimeout(()=>openPayFlow(cheerAmt),400);
  }).catch(e=>{$('chBtn').disabled=false;toast(errMsg(e))});
}

/* ---------- 👵 조부모 초대·화면 ---------- */
function shareGpInvite(){
  if(!requirePlus()) return;
  const names=S.kids.map(k=>k.name).join('·');
  previewShare(`[용돈 받아라] 할머니·할아버지 초대 👵👴
${callName(names)}의 습관 실천과 용돈 통장을 함께 보고, 응원 메시지와 용돈을 보내 주세요!

① 아래 링크를 눌러 앱을 열어 주세요
${appUrl()}?join=${S.family}&gp=1

② 크롬 메뉴(⋮) → 「앱 설치」(또는 「홈 화면에 추가」)를 누르면 휴대폰에 앱이 생겨요

③ 「손주 통장 보러 가기」를 누르면 끝!`,'할머니·할아버지 초대 보내기',true);
}
const GP_NAMES=['할머니','할아버지','외할머니','외할아버지'];
function renderGpSetup(code){
  $('tabs').classList.add('hide'); $('kids').innerHTML='';
  $('view').innerHTML=`<div class="card">
    <div class="jua" style="font-size:22px">👵 손주 통장 보러 왔어요</div>
    <div style="margin-top:6px">손주의 습관 실천과 용돈 통장을 함께 보고, <b>응원 메시지와 용돈</b>을 보낼 수 있어요.</div>
    <label class="f" style="margin-top:12px">손주가 부르는 이름</label>
    <div class="chips" id="gpChips">${GP_NAMES.map((n,i)=>`<button type="button" onclick="$('gpName').value=GP_NAMES[${i}];document.querySelectorAll('#gpChips button').forEach(b=>b.classList.toggle('on',b===this))">${n}</button>`).join('')}</div>
    <input id="gpName" placeholder="직접 입력 (예: 큰할머니)">
    <div class="muted" style="margin-top:8px">가족 코드: <b>${esc(Sync.shareCode(code))}</b></div>
    <button class="btn full" style="background:#B07CE8" id="gpBtn" onclick="doGpJoin('${code}')">손주 통장 보러 가기</button>
  </div>
  <div class="card muted">부모님이시라면 <a href="#" onclick="INVITE='${code}';INVITE_GP=false;renderSetup();applyInvite();return false">부모로 참여하기</a></div>`;
}
function doGpJoin(code){
  const name=$('gpName').value.trim();
  if(!name){toast('손주가 부르는 이름을 골라 주세요');return}
  const btn=$('gpBtn'); btn.disabled=true; btn.textContent='손주 통장 받는 중…';
  Sync.join(code).then(()=>call('setRole','gp',name)).then(d=>{
    applyInit(d);
    if(!d.ready){toast('아직 등록된 자녀가 없어요');btn.disabled=false;return}
    S.tab='check';S.date=null;S.month=null;
    document.querySelectorAll('.tab').forEach(b=>b.classList.toggle('on',b.dataset.tab==='check'));
    startMain(); toast(`${name}, 환영해요! 👵`);
  }).catch(e=>{btn.disabled=false;btn.textContent='다시 시도';toast(errMsg(e))});
}
function renderGpManage(){
  $('view').innerHTML=`<div class="card"><div class="jua" style="font-size:18px">👵 ${esc(S.gpName||'조부모')} 화면</div>
      <div class="muted" style="margin-top:4px">손주의 실천과 통장을 볼 수 있고, 「실천 체크」 탭의 <b>💌 응원·용돈 보내기</b>로 마음을 전할 수 있어요. 체크와 지출 기록은 부모님이 해요.</div>
      <label class="f">손주가 부르는 이름</label><input id="gpNameEdit" value="${esc(S.gpName)}">
      <button class="btn full ghost" onclick="call('setRole','gp',$('gpNameEdit').value).then(d=>{applyInit(d);toast('바꿨어요')})">이름 바꾸기</button></div>
    ${familyCardHtml()}
    <div class="card"><div class="jua" style="font-size:18px">ℹ️ 앱 정보</div>
      <div style="margin-top:8px"><a href="privacy.html" target="_blank" rel="noopener">개인정보처리방침</a></div>
      <button class="btn full ghost" onclick="askBeParent()">이 휴대폰을 부모 모드로 바꾸기</button></div>`;
}
function askBeParent(){
  openModal(`<h3>부모 모드로 바꾸기</h3><div>체크·지출 기록과 설정을 모두 할 수 있게 돼요. 부모님 휴대폰일 때만 바꿔 주세요.</div>
    <button class="btn full" onclick="call('setRole','parent','').then(d=>{applyInit(d);closeModal();renderKids();render();toast('부모 모드로 바꿨어요')})">바꾸기</button>
    <button class="btn full ghost" onclick="closeModal()">취소</button>`);
}

/* ---------- 통장 탭에 계약서·앨범 바로가기 ---------- */
function plusShortcutsHtml(){
  if(viewOnly()) return '';
  const k=kid();
  return `<div class="row" style="gap:8px;margin-top:12px">
    <button class="btn ghost" style="flex:1" onclick="openContract('${k.id}')">📜 용돈 계약서${plusStar()}</button>
    <button class="btn ghost" style="flex:1" onclick="openAlbum('${k.id}')">🎖️ 성장 앨범${plusStar()}</button></div>`;
}
