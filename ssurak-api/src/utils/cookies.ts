import { COOKIE_TABLE } from "@ssurak/db/constants";
import { CookieOptions, Response } from "express";

const isProd = process.env.NODE_ENV === "production";
const cookieDomain = isProd ? process.env.COOKIE_DOMAIN : undefined;

const baseCookieOptions: Pick<
  CookieOptions,
  "httpOnly" | "sameSite" | "secure" | "domain"
> = {
  httpOnly: true,
  sameSite: "lax",
  secure: isProd,
  ...(cookieDomain ? { domain: cookieDomain } : {}),
};

function set(
  response: Response,
  name: (typeof COOKIE_TABLE)[keyof typeof COOKIE_TABLE],
  value: string,
  cookieOptions: Omit<CookieOptions, "httpOnly" | "sameSite" | "secure">
) {
  return response.cookie(name, value, {
    ...baseCookieOptions,
    ...cookieOptions,
  });
}

function remove(
  response: Response,
  name: (typeof COOKIE_TABLE)[keyof typeof COOKIE_TABLE],
  cookieOptions: Omit<CookieOptions, "httpOnly" | "sameSite" | "secure">
) {
  return response.clearCookie(name, {
    ...baseCookieOptions,
    ...cookieOptions,
  });
}

export const responseCookie = {
  set,
  remove,
};
