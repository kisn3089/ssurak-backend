-- `store.is_open`의 기본값을 false → true로 바꾼다.
--
-- 이 컬럼은 직전 마이그레이션(영업시간 도입) 전까지 저장만 되고 어디에도 쓰이지 않았다.
-- 이제 영업 판정의 1순위가 되므로, 기본값이 false면 매장을 만들자마자 모든 고객 주문이
-- STORE_CLOSED로 거절된다. "영업시간 미설정 = 항상 영업"과도 어긋난다.
ALTER TABLE `store` MODIFY `is_open` BOOLEAN NOT NULL DEFAULT true;

-- 기존 false 행도 되돌린다.
-- 판정에 쓰이기 전에 만들어진 행이라 false는 "점주가 일시 중지했다"는 뜻이 아니라
-- 옛 기본값이 남은 것일 뿐이다. 그대로 두면 기존 매장이 조용히 주문을 못 받는다.
UPDATE `store` SET `is_open` = true WHERE `is_open` = false;
