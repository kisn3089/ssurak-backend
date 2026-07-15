-- PAYMENT_PENDING 값 제거 전 데이터 보정: 결제 대기 중이던 세션은 종료 처리한다
UPDATE `table_session` SET `status` = 'CLOSED', `closed_at` = NOW(3) WHERE `status` = 'PAYMENT_PENDING';

-- AlterTable
ALTER TABLE `admin` DROP COLUMN `refresh_token`;

-- AlterTable
ALTER TABLE `owner` DROP COLUMN `refresh_token`;

-- AlterTable
ALTER TABLE `table` MODIFY `seats` INTEGER NULL;

-- AlterTable
ALTER TABLE `table_session` MODIFY `status` ENUM('WAITING_ORDER', 'ACTIVE', 'CLOSED') NOT NULL DEFAULT 'WAITING_ORDER';

-- CreateTable
CREATE TABLE `refresh_token` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `role` VARCHAR(16) NOT NULL,
    `user_id` BIGINT NOT NULL,
    `token_hash` VARCHAR(191) NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `refresh_token_role_user_id_idx`(`role`, `user_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
