/*
  Warnings:

  - Made the column `image_url` on table `menu` required. This step will fail if there are existing NULL values in that column.
  - Made the column `table_session_id` on table `order` required. This step will fail if there are existing NULL values in that column.
  - Made the column `expires_at` on table `table_session` required. This step will fail if there are existing NULL values in that column.

*/
-- DropForeignKey
ALTER TABLE `order` DROP FOREIGN KEY `order_table_session_id_fkey`;

-- AlterTable
ALTER TABLE `menu` MODIFY `image_url` VARCHAR(500) NOT NULL;

-- AlterTable
ALTER TABLE `order` MODIFY `table_session_id` BIGINT NOT NULL;

-- AlterTable
ALTER TABLE `table_session` MODIFY `expires_at` DATETIME(3) NOT NULL;

-- AddForeignKey
ALTER TABLE `order` ADD CONSTRAINT `order_table_session_id_fkey` FOREIGN KEY (`table_session_id`) REFERENCES `table_session`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
