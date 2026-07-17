import { NestFactory } from "@nestjs/core";
import { ConfigService } from "@nestjs/config";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { cleanupOpenApiDoc } from "nestjs-zod";
import cookieParser from "cookie-parser";
import { AppModule } from "./app/app.module";
import { COOKIE_TABLE } from "@ssurak/db/constants";
import { RedisIoAdapter } from "./realtime/redis-io.adapter";
import { PRIVATE_HOST_ORIGIN } from "./realtime/realtime.constants";

// BigInt serialization for JSON responses
BigInt.prototype.toJSON = function (this: bigint) {
  return this.toString();
};

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);
  const isDev = configService.get("NODE_ENV") !== "production";
  app.enableCors({
    origin: isDev
      ? (
          origin: string | undefined,
          callback: (err: Error | null, allow?: boolean) => void
        ) => {
          // 개발 환경: localhost 및 사설 IP(모바일 테스트)에서 오는 요청 허용
          if (!origin || PRIVATE_HOST_ORIGIN.test(origin)) {
            callback(null, true);
          } else {
            callback(new Error("CORS blocked"));
          }
        }
      : [
          configService.getOrThrow<string>("ORDER_APP_URL"),
          configService.getOrThrow<string>("CONSOLE_APP_URL"),
        ],
    methods: "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS",
    credentials: true,
  });

  app.use(cookieParser());

  const ioAdapter = new RedisIoAdapter(app);
  ioAdapter.connectToRedis();
  app.useWebSocketAdapter(ioAdapter);

  // Swagger 설정
  const config = new DocumentBuilder()
    .setTitle("ssurak API")
    .setDescription("ssurak 테이블 오더 시스템 API 문서")
    .setVersion("1.0")
    .addBearerAuth()
    .addCookieAuth(
      COOKIE_TABLE.REFRESH,
      {
        type: "apiKey",
        in: "cookie",
        name: COOKIE_TABLE.REFRESH,
      },
      COOKIE_TABLE.REFRESH
    )
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, cleanupOpenApiDoc(document), {
    swaggerOptions: {
      withCredentials: true,
    },
  });

  const port = configService.get<number>("PORT", 8080);

  await app.listen(port, "0.0.0.0");
  console.log(`Application is running on: http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/docs`);
}
void bootstrap();
