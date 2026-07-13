/*
  Warnings:

  - A unique constraint covering the columns `[idempotency_key]` on the table `order` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE `order` ADD COLUMN `idempotency_key` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `order_idempotency_key_key` ON `order`(`idempotency_key`);
