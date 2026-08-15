import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { menuExtractionSchema, type MenuExtraction } from "@ssurak/schema";
import { OPENAI_CLIENT } from "src/common/ai/openai.module";
import type { OcrImage } from "src/storage/image-ocr";
import {
  MENU_VISION_SYSTEM_PROMPT,
  buildMenuVisionPrompt,
} from "./menu-vision.prompt";

/**
 * 한 요청에 허용하는 총 시간.
 *
 * 메뉴 40개짜리 메뉴판이 20~40초 걸린다. ALB/nginx의 기본 idle timeout(60초)
 * 안쪽에서 끊어야 게이트웨이가 먼저 연결을 닫아 원인 불명의 502가 나가지 않는다.
 */
const DEFAULT_TIMEOUT_MS = 55_000;

const SCHEMA_NAME = "menu_extraction";

@Injectable()
export class MenuVisionClient {
  private readonly logger = new Logger(MenuVisionClient.name);
  private readonly model: string;
  private readonly timeoutMs: number;

  constructor(
    @Inject(OPENAI_CLIENT) private readonly openai: OpenAI,
    private readonly configService: ConfigService
  ) {
    this.model = this.configService.get<string>(
      "OPENAI_MENU_VISION_MODEL",
      "gpt-5.6-luna"
    );
    this.timeoutMs = this.configService.get<number>(
      "OPENAI_MENU_VISION_TIMEOUT_MS",
      DEFAULT_TIMEOUT_MS
    );
  }

  async extract(
    images: OcrImage[],
    existingCategoryNames: string[]
  ): Promise<MenuExtraction> {
    const response = await this.request(images, existingCategoryNames);

    this.logger.log(
      `menu vision: model=${this.model} images=${images.length} ` +
        `input=${response.usage?.input_tokens ?? 0} ` +
        `cached=${response.usage?.input_tokens_details?.cached_tokens ?? 0} ` +
        `output=${response.usage?.output_tokens ?? 0}`
    );

    if (!response.output_parsed) {
      // 스키마 파싱이 비는 경우는 사실상 모델 거부(refusal)다.
      // 메뉴판이 아닌 사진을 올렸을 때 여기로 온다.
      throw new UnprocessableEntityException(
        "사진에서 메뉴를 읽지 못했습니다. 메뉴판이 잘 보이게 다시 촬영해 주세요."
      );
    }

    return response.output_parsed;
  }

  private async request(images: OcrImage[], existingCategoryNames: string[]) {
    const timeout = AbortSignal.timeout(this.timeoutMs);

    try {
      return await this.openai.responses.parse(
        {
          model: this.model,
          input: [
            { role: "system", content: MENU_VISION_SYSTEM_PROMPT },
            {
              role: "user",
              content: [
                {
                  type: "input_text",
                  text: buildMenuVisionPrompt(existingCategoryNames),
                },
                ...images.map((image) => ({
                  type: "input_image" as const,
                  image_url: image.dataUrl,
                  detail: "high" as const,
                })),
              ],
            },
          ],
          text: { format: zodTextFormat(menuExtractionSchema, SCHEMA_NAME) },
        },
        { signal: timeout }
      );
    } catch (error) {
      throw this.toHttpException(error, timeout);
    }
  }

  /**
   * 업스트림 실패를 사장님이 다음에 뭘 할지 아는 상태 코드로 바꾼다.
   *
   * 그대로 두면 전역 필터가 전부 500으로 뭉개서, 잠시 후 다시 누르면 될 일과
   * 사진을 다시 찍어야 할 일이 구분되지 않는다.
   */
  private toHttpException(error: unknown, timeout: AbortSignal): unknown {
    if (error instanceof OpenAI.APIUserAbortError) {
      this.logger.warn(
        timeout.aborted
          ? `menu vision timeout after ${this.timeoutMs}ms`
          : "menu vision aborted by caller before the timeout"
      );
      return new ServiceUnavailableException(
        "메뉴 인식이 시간 안에 끝나지 않았습니다. 사진을 나눠서 다시 시도해 주세요."
      );
    }

    if (error instanceof OpenAI.RateLimitError) {
      this.logger.warn("menu vision rate limited by upstream");
      return new HttpException(
        "메뉴 인식 요청이 몰려 있습니다. 잠시 후 다시 시도해 주세요.",
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    if (
      error instanceof OpenAI.APIConnectionError ||
      error instanceof OpenAI.InternalServerError
    ) {
      this.logger.error(`menu vision upstream failure: ${String(error)}`);
      return new ServiceUnavailableException(
        "메뉴 인식 서비스에 일시적인 문제가 있습니다. 잠시 후 다시 시도해 주세요."
      );
    }

    if (error instanceof OpenAI.APIError) {
      this.logger.error(
        `menu vision request rejected (status=${error.status}): ${error.message}`
      );
    }
    return error;
  }
}
