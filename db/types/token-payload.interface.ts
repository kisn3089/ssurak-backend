export interface TokenPayload extends DomainTokenPayload {
  sub: string;
  role: "owner" | "admin";
  typ: "Bearer";
  aud?: string[];
  iss?: string;
  /**
   * 토큰 고유 ID. 같은 초에 발급된 JWT는 클레임이 동일해 문자열까지
   * 같아지므로, refresh token rotation이 성립하려면 발급마다 유일해야 한다.
   */
  jti?: string;
}

export interface TokenPayloadDecoded extends DomainTokenPayload {
  iat: number;
  exp: number;
}
interface DomainTokenPayload {
  email?: string;
  username?: string;
  // [TODO:] verify 추가 필요
}
