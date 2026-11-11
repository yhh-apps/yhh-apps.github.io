/* 용돈 받아라 — Android 앱(Capacitor)에서만 쓰는 기능. 웹(GitHub Pages·크롬 설치 앱)에서는 아무것도 하지 않음
   - 광고(AdMob): 보호자 화면 중 통장·더보기 탭 아래쪽 작은 배너만. 조건은 app.js의 adsAllowed()
     (나이 확인된 보호자 + 플러스 안 삼 + 예시 아님). 자녀·조부모 화면에서는 광고 SDK를 아예 시작하지 않음
   - 공유: WebView에는 navigator.share가 없어서 앱의 공유 창(Share 플러그인)으로 대신
   - 백업 파일: Filesystem 플러그인으로 저장한 뒤 공유 창으로 보냄
   app.js보다 먼저 불러옴 — 함수만 정의 */
'use strict';

const NATIVE = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
function nativePlugin(name){ return NATIVE && window.Capacitor.Plugins ? window.Capacitor.Plugins[name] : null; }

/* ---------- 광고 ---------- */
// 지금은 Google 공식 「테스트 광고」 ID. AdMob 계정을 만들면 진짜 광고 단위 ID로 바꾸고 test:false (ADS_PLAN.md)
const ADS = { banner: 'ca-app-pub-3940256099942544/6300978111', test: true };
let adInitP = null, adShown = false;
function adInit(){
  if(!adInitP){
    const A = nativePlugin('AdMob');
    adInitP = !A ? Promise.resolve(false) : A.initialize({
      initializeForTesting: ADS.test,
      tagForChildDirectedTreatment: false, // 나이 확인된 어른에게만 요청하므로
      tagForUnderAgeOfConsent: false,
      maxAdContentRating: 'General'        // 그래도 광고 내용은 「모든 연령」 등급까지만
    }).then(() => true).catch(() => false);
  }
  return adInitP;
}
function adWanted(){
  return typeof adsAllowed === 'function' && adsAllowed()
    && (S.tab === 'ledger' || S.tab === 'manage')
    && !$('modal').classList.contains('on') && !S.locked && !$('tabs').classList.contains('hide');
}
/* 화면이 바뀔 때마다 부름: 광고를 보여야 하면 띄우고, 아니면 내림 */
function updateAd(){
  const A = nativePlugin('AdMob'); if(!A) return;
  if(adWanted()){
    if(adShown) return;
    adShown = true;
    adInit().then(ok => {
      if(!ok || !adWanted()){ adShown = false; return; }
      return A.showBanner({ adId: ADS.banner, adSize: 'ADAPTIVE_BANNER', position: 'BOTTOM_CENTER',
        margin: ($('tabs').offsetHeight || 64), isTesting: ADS.test, npa: true })
        .then(() => document.body.classList.add('withad'));
    }).catch(() => { adShown = false; });
  } else if(adShown){
    adShown = false; document.body.classList.remove('withad');
    A.removeBanner().catch(() => {});
  }
}

/* ---------- 휴대폰 뒤로가기 버튼 ----------
   앱에서는 웹의 popstate가 오지 않고 바로 앱이 닫혀 버려서, App 플러그인의 backButton으로 같은 순서를 직접 처리:
   창 닫기 → 첫 탭(실천 체크)으로 → 「한 번 더 누르면 닫혀요」 → 2초 안에 또 누르면 닫기 */
let nativeBackArmed = 0;
function nativeBack(){
  const A = nativePlugin('App'); if(!A) return;
  if($('modal').classList.contains('on')) return closeModal();
  if(!$('tabs').classList.contains('hide') && S.tab !== 'check') return setTab('check');
  if(Date.now() - nativeBackArmed < 2000) return A.exitApp();
  nativeBackArmed = Date.now();
  toast('뒤로 버튼을 한 번 더 누르면 앱이 닫혀요');
}
if(NATIVE){
  const A = nativePlugin('App');
  if(A) A.addListener('backButton', () => { try{ nativeBack(); }catch(e){} });
}

/* ---------- 바깥 앱·주소 열기 (카카오페이·토스 등) ----------
   앱 안 WebView에서는 location.href='supertoss://…' 같은 링크가 조용히 무시돼서, AppLauncher로 직접 엶. 웹에서는 그냥 이동 */
function openExternal(url){
  const L = nativePlugin('AppLauncher');
  if(!L){ location.href = url; return; }
  L.openUrl({ url: url }).then(r => { if(r && r.completed === false) toast('앱을 열 수 없어요. 설치되어 있는지 확인해 주세요'); })
    .catch(() => toast('앱을 열 수 없어요. 설치되어 있는지 확인해 주세요'));
}

/* ---------- 공유 ---------- */
if(NATIVE && !navigator.share){
  navigator.share = data => {
    const P = nativePlugin('Share'); if(!P) return Promise.reject(new Error('공유를 쓸 수 없어요'));
    return P.share({ text: data.text, title: data.title || '용돈 받아라', dialogTitle: '보내기' }).then(() => {})
      .catch(e => { // 공유 창을 그냥 닫은 경우는 웹과 같은 「취소(AbortError)」로 바꿔서 알림이 엉뚱하게 뜨지 않게
        if(/cancel/i.test(String(e && e.message))){ const a = new Error('취소'); a.name = 'AbortError'; throw a; }
        throw e;
      });
  };
}

/* ---------- 백업 파일 (앱에서는 파일로 저장 → 공유 창) ---------- */
/* 휴대폰 「문서/용돈받아라」 폴더에 바로 저장 → 'saved'. 앱을 지워도 파일은 남음.
   (아주 오래된 휴대폰 등 문서 폴더에 못 쓰면 예전처럼 공유 창으로 → 'shared') */
function nativeSaveBackup(name, text){
  const F = nativePlugin('Filesystem'), P = nativePlugin('Share');
  if(!F) return Promise.reject(new Error('백업 파일을 만들 수 없어요'));
  return F.writeFile({ path: '용돈받아라/' + name, data: text, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true })
    .then(() => 'saved')
    .catch(() => {
      if(!P) throw new Error('백업 파일을 저장할 수 없어요');
      return F.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' })
        .then(r => P.share({ title: '용돈 받아라 백업', files: [r.uri], dialogTitle: '백업 파일 보내기·저장하기' })).then(() => 'shared');
    });
}
