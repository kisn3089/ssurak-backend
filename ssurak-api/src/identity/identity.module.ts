import { Module } from "@nestjs/common";
import { AdminController } from "./admin/admin.controller";
import { AdminService } from "./admin/admin.service";
import { OwnerController } from "./owner/owner.controller";
import { OwnerService } from "./owner/owner.service";
import { MeController } from "./me/me.controller";

@Module({
  controllers: [AdminController, OwnerController, MeController],
  providers: [AdminService, OwnerService],
  exports: [AdminService, OwnerService],
})
export class IdentityModule {}
