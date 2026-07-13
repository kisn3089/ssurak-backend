import { createParamDecorator, ExecutionContext } from "@nestjs/common";

const getJwtByContext = (context: ExecutionContext) => {
  return context.switchToHttp().getRequest().user.jwt;
};

export const Jwt = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => getJwtByContext(context)
);
