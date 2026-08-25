/**
 * redlock 5 베타는 package.json exports에 types 조건이 없어 nodenext가 선언을
 * 찾지 못한다(모듈 전체가 any로 샌다). 그래서 실제로 쓰는 만큼만 계약을 여기서
 * 다시 적어두고, 주입 지점은 이 타입으로 받는다.
 */
export interface RedlockAbortSignalLike {
  /** 락을 잃으면 true. 되돌릴 수 없는 작업 전에 반드시 확인한다. */
  aborted: boolean;
  error?: Error;
}

export interface RedlockLike {
  using<T>(
    resources: string[],
    duration: number,
    settings: { retryCount?: number },
    routine: (signal: RedlockAbortSignalLike) => Promise<T>
  ): Promise<T>;
}
