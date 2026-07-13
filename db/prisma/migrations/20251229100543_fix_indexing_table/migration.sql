-- AddForeignKey
ALTER TABLE `table_session` ADD CONSTRAINT `table_session_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `store`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
