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

/* ---------- 공유 ---------- */
if(NATIVE && !navigator.share){
  navigator.share = data => {
    const P = nativePlugin('Share'); if(!P) return Promise.reject(new Error('공유를 쓸 수 없어요'));
    return P.share({ text: data.text, title: data.title || '용돈 받아라', dialogTitle: '보내기' }).then(() => {});
  };
}

/* ---------- 백업 파일 (앱에서는 파일로 저장 → 공유 창) ---------- */
function nativeSaveBackup(name, text){
  const F = nativePlugin('Filesystem'), P = nativePlugin('Share');
  if(!F || !P) return Promise.reject(new Error('백업 파일을 만들 수 없어요'));
  return F.writeFile({ path: name, data: text, directory: 'CACHE', encoding: 'utf8' })
    .then(r => P.share({ title: '용돈 받아라 백업', files: [r.uri], dialogTitle: '백업 파일 보내기·저장하기' }));
}
