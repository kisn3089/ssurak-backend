import { Controller, Get } from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { AppService } from "./app.service";
import { healthCheckDocs } from "src/docs/healthCheck";

@ApiTags("Health")
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({ summary: healthCheckDocs.summary })
  @ApiResponse(healthCheckDocs.response)
  healthCheck(): { status: string; timestamp: string } {
    return this.appService.healthCheck();
  }
}
