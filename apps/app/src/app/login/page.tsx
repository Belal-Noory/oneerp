"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useClientI18n } from "@/lib/client-i18n";
import { apiFetch } from "@/lib/auth-fetch";

type ApiError = { error: { message_key: string } };
type LoginResponse = { data: { redirect: { path: string } | null } };

export default function AppLoginPage() {
  const { t } = useClientI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isDesktop = typeof window !== "undefined" && Boolean((window as unknown as { oneerp?: unknown }).oneerp);
  const [mode, setMode] = useState<"online" | "offline">("online");
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const resetHref = useMemo(() => resolvePublicWebUrl("/reset"), []);

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
        <h1 className="text-2xl font-semibold">{t("auth.login.title")}</h1>
        <p className="mt-2 text-sm text-gray-700">{t("auth.login.subtitle")}</p>

        <form
          className="mt-8 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setErrorKey(null);
            setSubmitting(true);
            try {
              const endpoint = isDesktop && mode === "offline" ? "/api/auth/login-offline" : "/api/auth/login";
              const res = await apiFetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email, password })
              });
              const json = (await res.json()) as LoginResponse | ApiError;
              if (!res.ok) {
                setErrorKey("error" in json ? json.error.message_key : "errors.internal");
                return;
              }
              const redirect = "data" in json ? json.data.redirect?.path : null;
              window.location.href = redirect ?? "/";
            } catch {
              setErrorKey("errors.internal");
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <div>
            <label className="block text-sm font-medium text-gray-900">{t("auth.login.field.email.label")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder={t("auth.login.field.email.placeholder")}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-900">{t("auth.login.field.password.label")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t("auth.login.field.password.placeholder")}
              required
            />
            <div className="mt-3 text-right text-sm">
              <Link className="text-primary-700 hover:text-primary-800" href={resetHref}>
                {t("auth.login.link.forgotPassword")}
              </Link>
            </div>
          </div>

          {errorKey ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t(errorKey)}</div> : null}

          {isDesktop ? (
            <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-900">
              <div className="font-medium">{t("auth.login.mode.label")}</div>
              <div className="flex items-center gap-3">
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="loginMode" checked={mode === "online"} onChange={() => setMode("online")} />
                  {t("auth.login.mode.online")}
                </label>
                <label className="inline-flex items-center gap-2">
                  <input type="radio" name="loginMode" checked={mode === "offline"} onChange={() => setMode("offline")} />
                  {t("auth.login.mode.offline")}
                </label>
              </div>
            </div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
          >
            {isDesktop && mode === "offline" ? t("auth.login.button.offline") : t("common.button.login")}
          </button>
        </form>
      </div>
    </div>
  );
}

function resolvePublicWebUrl(path: string): string {
  const fromEnv = (process.env.NEXT_PUBLIC_WEB_BASE_URL ?? "").trim();
  const base = (() => {
    if (fromEnv) return fromEnv.replace(/\/+$/, "");
    if (typeof window !== "undefined") {
      const protocol = window.location.protocol === "https:" ? "https" : "http";
      const host = window.location.hostname.toLowerCase();
      if (host === "localhost" || host === "127.0.0.1") return `http://${host}:3000`;
      const bare = host.replace(/^(www|app|owner|api)\./, "");
      return `${protocol}://${bare}`;
    }
    return "http://localhost:3000";
  })();
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${base}${p}`;
}
