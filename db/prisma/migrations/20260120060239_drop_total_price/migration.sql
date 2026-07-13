/*
  Warnings:

  - You are about to drop the column `total_price` on the `order` table. All the data in the column will be lost.
  - You are about to drop the column `total_amount` on the `table_session` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `order` DROP COLUMN `total_price`;

-- AlterTable
ALTER TABLE `table_session` DROP COLUMN `total_amount`;
