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

/**
 * 메뉴판 사진 → 구조화된 메뉴 목록. OpenAI 호출만 담당한다(얇게 유지).
 *
 * 정규화·검증은 여기서 하지 않는다 — 이 클래스는 네트워크 경계라 테스트가
 * mock에 묶이고, 그 안에 로직을 두면 로직도 같이 묶여 버린다.
 */
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
      "gpt-5-mini"
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

    // 토큰 사용량은 응답에 싣지 않는다(사장님이 알 필요 없는 값이다).
    // 단가 추정은 이 로그가 유일한 근거라 실패해도 남기지 않고 성공 시에만 남긴다.
    this.logger.log(
      `menu vision: model=${this.model} images=${images.length} ` +
        `input=${response.usage?.input_tokens ?? 0} output=${response.usage?.output_tokens ?? 0}`
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
                // detail:"high"라야 모델이 512px 타일로 쪼개 읽는다.
                // auto로 두면 촘촘한 메뉴판의 작은 글자를 통째로 놓친다.
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
        { signal: AbortSignal.timeout(this.timeoutMs) }
      );
    } catch (error) {
      throw this.toHttpException(error);
    }
  }

  /**
   * 업스트림 실패를 사장님이 다음에 뭘 할지 아는 상태 코드로 바꾼다.
   *
   * 그대로 두면 전역 필터가 전부 500으로 뭉개서, 잠시 후 다시 누르면 될 일과
   * 사진을 다시 찍어야 할 일이 구분되지 않는다.
   */
  private toHttpException(error: unknown): unknown {
    if (error instanceof OpenAI.APIUserAbortError) {
      this.logger.warn(`menu vision timeout after ${this.timeoutMs}ms`);
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

    // 인증 실패·잘못된 모델명 등 설정 오류. 사장님이 할 수 있는 게 없으므로
    // 원문을 로그로 남기고 그대로 전역 필터(500)에 넘긴다.
    if (error instanceof OpenAI.APIError) {
      this.logger.error(
        `menu vision request rejected (status=${error.status}): ${error.message}`
      );
    }
    return error;
  }
}
