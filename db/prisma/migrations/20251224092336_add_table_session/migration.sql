-- AlterTable
ALTER TABLE `menu` ADD COLUMN `custom_options` JSON NULL,
    ADD COLUMN `required_options` JSON NULL;

-- AlterTable
ALTER TABLE `order` ADD COLUMN `table_session_id` BIGINT NULL;

-- CreateTable
CREATE TABLE `table_session` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(191) NOT NULL,
    `store_id` BIGINT NOT NULL,
    `table_num` INTEGER NOT NULL,
    `status` ENUM('ACTIVE', 'PAYMENT_PENDING', 'CLOSED') NOT NULL DEFAULT 'ACTIVE',
    `session_token` VARCHAR(191) NOT NULL,
    `activated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `expires_at` DATETIME(3) NULL,
    `closed_at` DATETIME(3) NULL,
    `total_amount` INTEGER NOT NULL DEFAULT 0,
    `paid_amount` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `table_session_public_id_key`(`public_id`),
    UNIQUE INDEX `table_session_session_token_key`(`session_token`),
    INDEX `table_session_session_token_idx`(`session_token`),
    INDEX `table_session_store_id_table_num_status_idx`(`store_id`, `table_num`, `status`),
    UNIQUE INDEX `table_session_store_id_table_num_status_key`(`store_id`, `table_num`, `status`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `order_table_session_id_idx` ON `order`(`table_session_id`);

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `order_table_session_id_fkey` FOREIGN KEY (`table_session_id`) REFERENCES `table_session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `table_session` ADD CONSTRAINT `table_session_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
