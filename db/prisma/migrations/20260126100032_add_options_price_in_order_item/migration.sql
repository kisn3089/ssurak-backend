/*
  Warnings:

  - You are about to drop the column `options` on the `order_item` table. All the data in the column will be lost.
  - You are about to drop the column `price` on the `order_item` table. All the data in the column will be lost.
  - You are about to drop the column `table_count` on the `store` table. All the data in the column will be lost.
  - Added the required column `base_price` to the `order_item` table without a default value. This is not possible if the table is not empty.
  - Added the required column `unit_price` to the `order_item` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE `order_item` DROP COLUMN `options`,
    DROP COLUMN `price`,
    ADD COLUMN `base_price` INTEGER NOT NULL,
    ADD COLUMN `options_price` INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN `options_snapshot` JSON NULL,
    ADD COLUMN `unit_price` INTEGER NOT NULL;

-- AlterTable
ALTER TABLE `store` DROP COLUMN `table_count`;

-- RenameIndex
ALTER TABLE `order_item` RENAME INDEX `order_item_menu_id_fkey` TO `order_item_menu_id_idx`;

-- RenameIndex
ALTER TABLE `order_item` RENAME INDEX `order_item_order_id_fkey` TO `order_item_order_id_idx`;
