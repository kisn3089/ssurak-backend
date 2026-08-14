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
          maxRetries: 1,
        }),
      inject: [ConfigService],
    },
  ],
  exports: [OPENAI_CLIENT],
})
export class OpenAiModule {}
