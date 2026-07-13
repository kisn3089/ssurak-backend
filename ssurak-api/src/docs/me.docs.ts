import { applyDecorators } from "@nestjs/common";
import { ApiOperation, ApiResponse, getSchemaPath } from "@nestjs/swagger";
import { PublicOwnerDto } from "src/dto/response/owner.dto";
import { PublicAdminDto } from "src/dto/response/admin.dto";

const meta = {
  find: {
    summary: "현재 로그인한 사용자 정보 조회",
    ok: { status: 200, description: "사용자 정보 반환" },
  },
  unauthorized: { status: 401, description: "인증되지 않은 요청" },
};

export const DocsMeFind = () =>
  applyDecorators(
    ApiOperation({ summary: meta.find.summary }),
    ApiResponse({
      ...meta.find.ok,
      schema: {
        oneOf: [
          { $ref: getSchemaPath(PublicOwnerDto) },
          { $ref: getSchemaPath(PublicAdminDto) },
        ],
      },
    }),
    ApiResponse(meta.unauthorized)
  );
