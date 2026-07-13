/*
  Warnings:

  - Made the column `category` on table `menu` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE `menu` MODIFY `category` VARCHAR(191) NOT NULL;
