import { HttpException, HttpStatus } from "@nestjs/common";
import {
  ExceptionContentKeys,
  exceptionContentsIs,
} from "src/common/constants/exceptionContents";

export class ExtendedMap<K, V> extends Map<K, V> {
  private exceptionContent: ExceptionContentKeys = "BADREQUEST";
  private exceptionStatus: number = HttpStatus.BAD_REQUEST;

  getOrThrow(key: K): V {
    const value = this.get(key);
    if (value === undefined) {
      throw new HttpException(
        {
          ...exceptionContentsIs(this.exceptionContent),
          details: { missingKey: key },
        },
        this.exceptionStatus
      );
    }
    return value;
  }

  setException(exceptionContent: ExceptionContentKeys, status?: number) {
    this.exceptionContent = exceptionContent;
    if (status !== undefined) {
      this.exceptionStatus = status;
    }
  }
}
