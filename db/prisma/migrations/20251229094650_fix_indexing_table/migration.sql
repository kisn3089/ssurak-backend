/*
  Warnings:

  - Made the column `qr_code` on table `table` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `table_session` DROP FOREIGN KEY `table_session_store_id_fkey`;

-- DropIndex
DROP INDEX `table_store_id_is_active_idx` ON `table`;

-- DropIndex
DROP INDEX `table_session_store_id_table_id_status_idx` ON `table_session`;

-- DropIndex
DROP INDEX `table_session_store_id_table_id_status_key` ON `table_session`;

-- AlterTable
ALTER TABLE `table` MODIFY `qr_code` VARCHAR(191) NOT NULL;

-- CreateIndex
CREATE INDEX `table_session_table_id_activated_at_idx` ON `table_session`(`table_id`, `activated_at`);

-- CreateIndex
CREATE INDEX `table_session_store_id_status_idx` ON `table_session`(`store_id`, `status`);

-- AddForeignKey
ALTER TABLE `table` ADD CONSTRAINT `table_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
