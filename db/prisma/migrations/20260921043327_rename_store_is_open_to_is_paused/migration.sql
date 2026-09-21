-- `store.is_open`을 `store.is_paused`로 바꾸고 값의 극성을 뒤집는다.
--
-- 계산 결과인 StoreOpenState.isOpen과 이름이 같아, 고객 store-context 응답에서
-- 두 불리언이 나란히 놓이면서도 서로 다른 값을 가질 수 있었다
-- (브레이크타임: store.isOpen=true, openState.isOpen=false).
-- 프론트가 틀린 쪽을 읽는 것을 이름 단계에서 막는다.
--
-- migrate diff는 이 변경을 DROP + ADD로 만들어 값이 날아간다.
-- CHANGE로 컬럼을 보존한 채 이름만 바꾸고, 기존 행의 극성을 뒤집는다.
ALTER TABLE `store` CHANGE `is_open` `is_paused` BOOLEAN NOT NULL DEFAULT false;

-- is_open=true(영업)였던 행은 is_paused=false(중지 아님)가 되어야 한다.
UPDATE `store` SET `is_paused` = NOT `is_paused`;
