import { Global, Module } from "@nestjs/common";
import { SessionCoreService } from "./services/session-core.service";
import { SessionClient } from "./clients/session.client";

@Global()
@Module({
  providers: [SessionCoreService, SessionClient],
  exports: [SessionCoreService, SessionClient],
})
export class InternalModule {}
