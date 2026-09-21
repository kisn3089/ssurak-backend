-- 영업일·영업시간·휴무일 도입과 영업일 단위 주문번호.
--
-- `order`에 NOT NULL 컬럼 3개가 추가되므로 기존 행을 백필해야 한다.
-- 임시 DEFAULT를 걸고 → 값을 채우고 → DEFAULT를 떼는 순서로 진행한다.

-- AlterTable: store
ALTER TABLE `store` DROP COLUMN `business_hours`,
    ADD COLUMN `business_day_cutoff` INTEGER NOT NULL DEFAULT 300,
    ADD COLUMN `order_number_prefix` VARCHAR(4) NOT NULL DEFAULT 'A',
    ADD COLUMN `timezone` VARCHAR(40) NOT NULL DEFAULT 'Asia/Seoul';

-- AlterTable: order (임시 DEFAULT로 기존 행을 통과시킨다)
ALTER TABLE `order` ADD COLUMN `business_date` CHAR(10) NOT NULL DEFAULT '',
    ADD COLUMN `order_number` VARCHAR(12) NOT NULL DEFAULT '',
    ADD COLUMN `order_seq` INTEGER NOT NULL DEFAULT 0;

-- 백필 1: 영업일.
-- KST는 DST가 없어 고정 +9시간이면 정확하다. CONVERT_TZ는 tz 테이블 로드가 필요해 쓰지 않는다.
-- cutoff는 매장별 값이지만 마이그레이션 시점에는 모두 기본값(300)이다.
UPDATE `order`
SET `business_date` = DATE_FORMAT(
    DATE_SUB(DATE_ADD(`created_at`, INTERVAL 9 HOUR), INTERVAL 300 MINUTE),
    '%Y-%m-%d'
);

-- 백필 2: 매장·영업일별 순번과 표시용 번호.
UPDATE `order` `o`
JOIN (
    SELECT `id`, ROW_NUMBER() OVER (
        PARTITION BY `store_id`, `business_date` ORDER BY `created_at`, `id`
    ) AS `seq`
    FROM `order`
) `r` ON `r`.`id` = `o`.`id`
SET `o`.`order_seq` = `r`.`seq`,
    `o`.`order_number` = CONCAT('A-', LPAD(`r`.`seq`, 4, '0'));

-- 백필이 끝났으니 임시 DEFAULT를 뗀다 — 이후로는 애플리케이션이 반드시 값을 넣어야 한다.
ALTER TABLE `order` ALTER COLUMN `business_date` DROP DEFAULT,
    ALTER COLUMN `order_number` DROP DEFAULT,
    ALTER COLUMN `order_seq` DROP DEFAULT;

-- CreateTable
CREATE TABLE `store_business_hour` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `store_id` BIGINT NOT NULL,
    `day_of_week` TINYINT NOT NULL,
    `is_closed` BOOLEAN NOT NULL DEFAULT false,
    `open_minute` INTEGER NOT NULL,
    `close_minute` INTEGER NOT NULL,
    `break_start_minute` INTEGER NULL,
    `break_end_minute` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `store_business_hour_store_id_day_of_week_key`(`store_id`, `day_of_week`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `store_closure` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(191) NOT NULL,
    `store_id` BIGINT NOT NULL,
    `date` CHAR(10) NOT NULL,
    `reason` VARCHAR(100) NULL,
    `open_minute` INTEGER NULL,
    `close_minute` INTEGER NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `store_closure_public_id_key`(`public_id`),
    UNIQUE INDEX `store_closure_store_id_date_key`(`store_id`, `date`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE UNIQUE INDEX `order_store_id_business_date_order_seq_key` ON `order`(`store_id`, `business_date`, `order_seq`);

-- AddForeignKey
ALTER TABLE `store_business_hour` ADD CONSTRAINT `store_business_hour_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `store_closure` ADD CONSTRAINT `store_closure_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
