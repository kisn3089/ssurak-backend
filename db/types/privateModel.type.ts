import { Admin, Owner, Table, TableSession } from "@prisma/client";
import { TokenPayload } from "./token-payload.interface";

export type SessionWithTable = TableSession & {
  table: Table & { store: { publicId: string } };
};

export type User = Owner | Admin;

export type PrivateRequestUser = { info: User; jwt: TokenPayload };
