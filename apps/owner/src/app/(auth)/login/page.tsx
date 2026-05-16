"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

export default function OwnerLoginPage() {
  return (
    <Suspense fallback={<div className="mx-auto max-w-md py-10" />}>
      <OwnerLoginPageInner />
    </Suspense>
  );
}

function OwnerLoginPageInner() {
  const { t } = useClientI18n();
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-md py-10">
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
        <div className="text-2xl font-semibold">{t("app.owner.login.title")}</div>
        <div className="mt-2 text-sm text-gray-700">{t("app.owner.login.subtitle")}</div>

        {errorKey ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{t(errorKey)}</div> : null}

        <form
          className="mt-6 space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setErrorKey(null);
            try {
              const res = await apiFetch("/api/owner-auth/login", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ email: email.trim(), password })
              });
              if (!res.ok) {
                const json = (await res.json()) as { error?: { message_key?: string } };
                setErrorKey(json.error?.message_key ?? "errors.unauthenticated");
                return;
              }
              const meRes = await apiFetch("/api/owner/me", { cache: "no-store" });
              if (!meRes.ok) {
                setErrorKey("errors.permissionDenied");
                return;
              }
              router.push(next);
              router.refresh();
            } catch {
              setErrorKey("errors.internal");
            } finally {
              setLoading(false);
            }
          }}
        >
          <div>
            <label className="block text-sm font-medium text-gray-900">{t("auth.login.field.email.label")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-900">{t("auth.login.field.password.label")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" />
          </div>
          <button type="submit" className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60" disabled={loading}>
            {loading ? t("common.loading") : t("common.button.login")}
          </button>
        </form>
      </div>
    </div>
  );
}
