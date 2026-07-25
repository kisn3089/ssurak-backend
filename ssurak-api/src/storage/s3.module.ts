import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { S3Client } from "@aws-sdk/client-s3";

export const S3_CLIENT = "S3_CLIENT";

@Global()
@Module({
  providers: [
    {
      provide: S3_CLIENT,
      // 자격증명을 명시하지 않는다. SDK 기본 체인이 AWS_PROFILE + 마운트된
      // ~/.aws 를 집는다(compose 에서 주입). 코드에 키가 들어올 여지를 없앤다.
      useFactory: (config: ConfigService) =>
        new S3Client({ region: config.getOrThrow<string>("AWS_REGION") }),
      inject: [ConfigService],
    },
  ],
  exports: [S3_CLIENT],
})
export class S3Module {}
