export interface TokenPayload extends DomainTokenPayload {
  sub: string;
  role: "owner" | "admin";
  typ: "Bearer";
  aud?: string[];
  iss?: string;
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
