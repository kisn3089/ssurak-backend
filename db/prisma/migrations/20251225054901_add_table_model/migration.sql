/*
  Warnings:

  - You are about to drop the column `table_num` on the `order` table. All the data in the column will be lost.
  - You are about to drop the column `table_num` on the `table_session` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[store_id,table_id,status]` on the table `table_session` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `table_id` to the `order` table without a default value. This is not possible if the table is not empty.
  - Added the required column `table_id` to the `table_session` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `table_session` DROP FOREIGN KEY `table_session_store_id_fkey`;

-- DropIndex
DROP INDEX `table_session_store_id_table_num_status_idx` ON `table_session`;

-- DropIndex
DROP INDEX `table_session_store_id_table_num_status_key` ON `table_session`;

-- AlterTable
ALTER TABLE `order` DROP COLUMN `table_num`,
    ADD COLUMN `table_id` BIGINT NOT NULL;

-- AlterTable
ALTER TABLE `table_session` DROP COLUMN `table_num`,
    ADD COLUMN `table_id` BIGINT NOT NULL;

-- CreateTable
CREATE TABLE `table` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(191) NOT NULL,
    `store_id` BIGINT NOT NULL,
    `table_num` INTEGER NOT NULL,
    `name` VARCHAR(191) NULL,
    `seats` INTEGER NOT NULL DEFAULT 4,
    `floor` INTEGER NULL,
    `section` VARCHAR(191) NULL,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `qr_code` VARCHAR(191) NULL,
    `description` VARCHAR(500) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `table_public_id_key`(`public_id`),
    UNIQUE INDEX `table_qr_code_key`(`qr_code`),
    INDEX `table_store_id_is_active_idx`(`store_id`, `is_active`),
    UNIQUE INDEX `table_store_id_table_num_key`(`store_id`, `table_num`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `order_table_id_idx` ON `order`(`table_id`);

-- CreateIndex
CREATE INDEX `table_session_store_id_table_id_status_idx` ON `table_session`(`store_id`, `table_id`, `status`);

-- CreateIndex
CREATE INDEX `table_session_table_id_idx` ON `table_session`(`table_id`);

-- CreateIndex
CREATE UNIQUE INDEX `table_session_store_id_table_id_status_key` ON `table_session`(`store_id`, `table_id`, `status`);

-- AddForeignKey
ALTER TABLE `table` ADD CONSTRAINT `table_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `order_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `table`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `table_session` ADD CONSTRAINT `table_session_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `table_session` ADD CONSTRAINT `table_session_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `table`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
