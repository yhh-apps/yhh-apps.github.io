/* 용돈 받아라 플러스 설정
   - promoEnd: 출시 기념 무료 체험이 끝나는 날 ('yyyy-mm-dd'). null이면 아직 출시 전이라 모두 체험 중.
     Play 스토어 출시일이 정해지면 예: '2027-03-31' 처럼 넣고 sw.js의 CACHE 숫자를 올려 배포하세요.
   - price: 플러스 한 번 구매 가격 (구독 아님. 「평생」이라는 말은 쓰지 않기로 함) (화면 안내용. 실제 가격은 Play Console 상품에서 정함) */
window.PLUS_CONFIG = {
  promoEnd: null,
  price: '4,900원'
};
