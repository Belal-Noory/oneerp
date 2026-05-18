export type Locale = "en" | "fa" | "ps";

export type ApiMeta = {
  requestId?: string;
};

export type ApiSuccess<T> = {
  data: T;
  meta?: ApiMeta;
};

export type ApiError = {
  error: {
    code:
      | "UNAUTHENTICATED"
      | "TENANT_REQUIRED"
      | "TENANT_ACCESS_DENIED"
      | "SUBSCRIPTION_REQUIRED"
      | "MODULE_DISABLED"
      | "PERMISSION_DENIED"
      | "VALIDATION_ERROR"
      | "NOT_FOUND"
      | "CONFLICT"
      | "RATE_LIMITED"
      | "INTERNAL_ERROR";
    message_key: string;
    details?: Record<string, unknown>;
  };
  meta?: ApiMeta;
};

export type RegisterRequest = {
  account: {
    fullName: string;
    email: string;
    password: string;
  };
  tenant: {
    legalName: string;
    displayName: string;
    slug: string;
    defaultLocale: Locale;
    address?: string;
    phone?: string;
    email?: string;
  };
  referralCode?: string;
};

export type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};

export type RegisterResponse = ApiSuccess<{
  user: { id: string; fullName: string; email: string };
  tenant: { id: string; slug: string; displayName: string; defaultLocale: Locale };
  membership: { id: string; role: string };
  auth: AuthTokens;
  redirect: { path: string };
}>;

export type LoginRequest = {
  email: string;
  password: string;
};

export type LoginResponse = ApiSuccess<{
  user: { id: string; fullName: string; email?: string };
  auth: AuthTokens;
  tenants: { id: string; slug: string; displayName: string }[];
  redirect: { path: string } | null;
}>;
