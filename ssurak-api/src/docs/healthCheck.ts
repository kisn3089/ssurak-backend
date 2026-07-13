export const healthCheckDocs = {
  summary: "서버 상태 확인",
  response: {
    status: 200,
    description: "서버 정상 동작",
    schema: {
      type: "object",
      properties: {
        status: { type: "string", example: "ok" },
        timestamp: { type: "string", example: "2024-01-01T00:00:00.000Z" },
      },
    },
  },
};
