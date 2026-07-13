/*
  Warnings:

  - You are about to drop the column `ordered_at` on the `order` table. All the data in the column will be lost.
  - You are about to drop the column `store_id` on the `table_session` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE `order` DROP FOREIGN KEY `order_table_id_fkey`;

-- DropForeignKey
ALTER TABLE `order` DROP FOREIGN KEY `order_table_session_id_fkey`;

-- DropForeignKey
ALTER TABLE `table_session` DROP FOREIGN KEY `table_session_store_id_fkey`;

-- DropIndex
DROP INDEX `order_table_id_idx` ON `order`;

-- DropIndex
DROP INDEX `table_session_store_id_status_idx` ON `table_session`;

-- AlterTable
ALTER TABLE `order` DROP COLUMN `ordered_at`,
    ALTER COLUMN `total_price` DROP DEFAULT,
    MODIFY `table_session_id` BIGINT NULL,
    MODIFY `table_id` BIGINT NULL;

-- AlterTable
ALTER TABLE `table_session` DROP COLUMN `store_id`;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `order_table_id_fkey` FOREIGN KEY (`table_id`) REFERENCES `table`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `order_table_session_id_fkey` FOREIGN KEY (`table_session_id`) REFERENCES `table_session`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
