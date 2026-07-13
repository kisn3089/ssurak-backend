export type AccessToken = {
  accessToken: string;
  expiresAt: Date;
};

export type SignInPayload = {
  email: string;
  password: string;
};
