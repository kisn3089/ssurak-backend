-- 기존 JSON 옵션(menu.required_options / menu.custom_options)은 관계 테이블로 백필하지 않는다.
-- 실데이터가 시드(db/prisma/data/menus.ts)뿐이고 그 파일 자체를 새 구조로 다시 쓰므로,
-- 시드 재실행이 곧 백필이다. 백필 스크립트의 유지비가 얻는 것보다 크다.

-- 기존 주문의 옵션 스냅샷은 옛 shape(그룹명 → 옵션값 레코드)라 새 shape로 복원할 수 없다.
-- 컨트롤러가 반환값에 publicOrderItemSchema.parse를 걸기 때문에 한 줄만 남아도
-- 주문 조회 전체가 500이 된다. 선택적 정리가 아니라 필수다.
UPDATE `order_item` SET `options_snapshot` = NULL WHERE `options_snapshot` IS NOT NULL;

-- CreateTable
CREATE TABLE `menu_option_group` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(191) NOT NULL,
    `menu_id` BIGINT NOT NULL,
    `name` VARCHAR(30) NOT NULL,
    `selection_type` ENUM('SINGLE', 'MULTIPLE') NOT NULL DEFAULT 'SINGLE',
    `required` BOOLEAN NOT NULL DEFAULT false,
    `min_select` INTEGER NOT NULL DEFAULT 0,
    `max_select` INTEGER NOT NULL DEFAULT 1,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `trigger_rules` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `menu_option_group_public_id_key`(`public_id`),
    INDEX `menu_option_group_menu_id_sort_order_idx`(`menu_id`, `sort_order`),
    UNIQUE INDEX `menu_option_group_menu_id_name_key`(`menu_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `menu_option_choice` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(191) NOT NULL,
    `option_group_id` BIGINT NOT NULL,
    `name` VARCHAR(30) NOT NULL,
    `price_delta` INTEGER NOT NULL DEFAULT 0,
    `quantity_enabled` BOOLEAN NOT NULL DEFAULT false,
    `max_quantity` INTEGER NOT NULL DEFAULT 1,
    `is_default` BOOLEAN NOT NULL DEFAULT false,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `state` ENUM('AVAILABLE', 'SOLD_OUT', 'HIDDEN') NOT NULL DEFAULT 'AVAILABLE',
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `menu_option_choice_public_id_key`(`public_id`),
    INDEX `menu_option_choice_option_group_id_sort_order_idx`(`option_group_id`, `sort_order`),
    UNIQUE INDEX `menu_option_choice_option_group_id_name_key`(`option_group_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `menu_option_group` ADD CONSTRAINT `menu_option_group_menu_id_fkey` FOREIGN KEY (`menu_id`) REFERENCES `menu`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu_option_choice` ADD CONSTRAINT `menu_option_choice_option_group_id_fkey` FOREIGN KEY (`option_group_id`) REFERENCES `menu_option_group`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
-- JSON 옵션 컬럼 제거는 관계 테이블을 만든 뒤에 둔다(롤백 시 순서가 자연스럽다).
ALTER TABLE `menu` DROP COLUMN `custom_options`,
    DROP COLUMN `required_options`;
