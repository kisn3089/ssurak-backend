import { Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

export const OPENAI_CLIENT = "OPENAI_CLIENT";

@Module({
  providers: [
    {
      provide: OPENAI_CLIENT,
      useFactory: (config: ConfigService) =>
        new OpenAI({
          apiKey: config.getOrThrow<string>("OPENAI_API_KEY"),
          // SDK 기본값은 2회 재시도다. 비전 호출은 한 번에 수십 초라
          // 기본값이면 최악의 경우 요청 타임아웃 예산을 3배로 넘긴다.
          // 재시도는 호출부의 AbortSignal 예산 안에서만 한 번.
          maxRetries: 1,
        }),
      inject: [ConfigService],
    },
  ],
  exports: [OPENAI_CLIENT],
})
export class OpenAiModule {}
