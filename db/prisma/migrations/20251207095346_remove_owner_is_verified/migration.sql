/*
  Warnings:

  - You are about to drop the column `is_verified` on the `owner` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `owner` DROP COLUMN `is_verified`,
    MODIFY `is_active` BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE `store` MODIFY `is_open` BOOLEAN NOT NULL DEFAULT false;
