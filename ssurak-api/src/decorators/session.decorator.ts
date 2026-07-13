import { createParamDecorator, ExecutionContext } from "@nestjs/common";

const getTableSessionByContext = (context: ExecutionContext) => {
  return context.switchToHttp().getRequest().session;
};

export const Session = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    getTableSessionByContext(context)
);
