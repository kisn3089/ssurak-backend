/*
  Warnings:

  - You are about to drop the column `category` on the `menu` table. All the data in the column will be lost.
  - You are about to drop the column `store_id` on the `menu` table. All the data in the column will be lost.
  - Added the required column `category_id` to the `menu` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `menu` DROP FOREIGN KEY `menu_store_id_fkey`;

-- DropIndex
DROP INDEX `menu_store_id_fkey` ON `menu`;

-- AlterTable
ALTER TABLE `menu` DROP COLUMN `category`,
    DROP COLUMN `store_id`,
    ADD COLUMN `category_id` BIGINT NOT NULL;

-- CreateTable
CREATE TABLE `category` (
    `id` BIGINT NOT NULL AUTO_INCREMENT,
    `public_id` VARCHAR(191) NOT NULL,
    `store_id` BIGINT NOT NULL,
    `name` VARCHAR(191) NOT NULL,
    `sort_order` INTEGER NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `category_public_id_key`(`public_id`),
    UNIQUE INDEX `category_store_id_name_key`(`store_id`, `name`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `menu_category_id_sort_order_idx` ON `menu`(`category_id`, `sort_order`);

-- AddForeignKey
ALTER TABLE `category` ADD CONSTRAINT `category_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `menu` ADD CONSTRAINT `menu_category_id_fkey` FOREIGN KEY (`category_id`) REFERENCES `category`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
