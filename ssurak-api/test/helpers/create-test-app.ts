import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import { AppModule } from "src/app/app.module";

// main.ts와 동일한 BigInt 직렬화 (Prisma BigInt id 대응)
(BigInt.prototype as unknown as { toJSON(): string }).toJSON = function (
  this: bigint
) {
  return this.toString();
};

/**
 * 실제 AppModule 전체를 부트스트랩한 테스트 앱.
 * 사전 조건: docker compose -f ../docker-compose.dev.yml up -d mysql redis
 */
export async function createTestApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.use(cookieParser());
  await app.init();
  return app;
}
