import { HttpException, HttpStatus } from "@nestjs/common";
import {
  Order,
  OrderStatus,
  TableSession,
  TableSessionStatus,
} from "@ssurak/db";
import { exceptionContentsIs } from "src/common/constants/exceptionContents";

export function validateOrderSessionToWrite<
  OrderType extends Order & { tableSession: TableSession },
>(order: OrderType | null): OrderType {
  if (!order) {
    throw new HttpException(
      exceptionContentsIs("NOT_FOUND"),
      HttpStatus.NOT_FOUND
    );
  }

  if (order.status === OrderStatus.CANCELLED) {
    throw new HttpException(
      exceptionContentsIs("ORDER_ALREADY_CANCELLED"),
      HttpStatus.BAD_REQUEST
    );
  }

  validateSessionActive(order.tableSession.status);
  return order;
}

function validateSessionActive(status: TableSessionStatus): void {
  if (
    status !== TableSessionStatus.ACTIVE &&
    status !== TableSessionStatus.WAITING_ORDER
  ) {
    throw new HttpException(
      exceptionContentsIs("SESSION_INACTIVE"),
      HttpStatus.BAD_REQUEST
    );
  }
}
