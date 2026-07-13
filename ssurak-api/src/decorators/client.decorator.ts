import { createParamDecorator, ExecutionContext } from "@nestjs/common";

const getClientByContext = (context: ExecutionContext) => {
  return context.switchToHttp().getRequest().user.info;
};

export const Client = createParamDecorator(
  (_data: unknown, context: ExecutionContext) => getClientByContext(context)
);
