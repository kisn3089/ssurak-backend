/*
  Warnings:

  - You are about to drop the column `table_num` on the `table` table. All the data in the column will be lost.
  - A unique constraint covering the columns `[store_id,table_number]` on the table `table` will be added. If there are existing duplicate values, this will fail.
  - Added the required column `table_number` to the `table` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE `table` DROP FOREIGN KEY `table_store_id_fkey`;

-- DropIndex
DROP INDEX `table_store_id_table_num_key` ON `table`;

-- AlterTable
ALTER TABLE `table` DROP COLUMN `table_num`,
    ADD COLUMN `table_number` INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX `table_store_id_table_number_key` ON `table`(`store_id`, `table_number`);
