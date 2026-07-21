-- 기존 값은 전부 외부 절대 URL(unsplash 등)이라 S3 object key로 변환할 수 없다.
-- 재업로드가 유일한 경로이므로 먼저 비운다.
-- VARCHAR(500) → VARCHAR(255) 축소보다 먼저 실행해야 잘림 경고가 나지 않는다.
UPDATE `menu` SET `image_url` = NULL WHERE `image_url` IS NOT NULL;

-- CHANGE COLUMN으로 리네임한다.
-- `prisma migrate diff`가 생성하는 DROP + ADD는 컬럼을 통째로 날린다.
ALTER TABLE `menu` CHANGE COLUMN `image_url` `image_key` VARCHAR(255) NULL;
