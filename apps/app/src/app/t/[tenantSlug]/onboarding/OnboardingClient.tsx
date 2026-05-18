"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { supportedLocales, type Locale } from "@oneerp/i18n";
import { getApiBaseUrl } from "@/lib/api";
import { useClientI18n } from "@/lib/client-i18n";
import { apiFetch } from "@/lib/auth-fetch";

type MeResponse = {
  data: {
    user: { id: string; fullName: string; email?: string };
    memberships: { tenantId: string; tenantSlug: string; tenantDisplayName: string; roleName: string }[];
  };
};

type TenantCurrentResponse = {
  data: {
    tenant: { id: string; slug: string; legalName: string; displayName: string; defaultLocale: string; status: string };
    branding: { logoUrl: string | null; address: string | null; phone: string | null; email: string | null };
  } | null;
};

export function OnboardingClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [loading, setLoading] = useState(true);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantCurrentResponse["data"]>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [defaultLocale, setDefaultLocale] = useState<Locale>("en");
  const [legalName, setLegalName] = useState("");
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [referralCode, setReferralCode] = useState("");
  const [applyingReferral, setApplyingReferral] = useState(false);
  const [referralApplied, setReferralApplied] = useState(false);

  const apiBase = getApiBaseUrl();
  const logoFullUrl = useMemo(() => (logoUrl ? `${apiBase}${logoUrl}` : null), [apiBase, logoUrl]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setErrorKey(null);
      try {
        const meRes = await apiFetch(`/api/me`, { cache: "no-store" });
        if (!meRes.ok) {
          setErrorKey("errors.unauthenticated");
          return;
        }
        const me = (await meRes.json()) as MeResponse;
        const membership = me.data.memberships.find((m) => m.tenantSlug === props.tenantSlug) ?? null;
        if (!membership) {
          setErrorKey("errors.tenantAccessDenied");
          return;
        }
        if (cancelled) return;
        setTenantId(membership.tenantId);

        const tenantRes = await apiFetch(`/api/tenants/current`, {
          cache: "no-store",
          headers: { "X-Tenant-Id": membership.tenantId }
        });
        const tenantJson = (await tenantRes.json()) as TenantCurrentResponse;
        if (!tenantRes.ok || !tenantJson.data) {
          setErrorKey("errors.internal");
          return;
        }
        if (cancelled) return;
        setTenant(tenantJson.data);
        setDisplayName(tenantJson.data.tenant.displayName);
        setLegalName(tenantJson.data.tenant.legalName);
        setDefaultLocale(tenantJson.data.tenant.defaultLocale as Locale);
        setAddress(tenantJson.data.branding.address ?? "");
        setPhone(tenantJson.data.branding.phone ?? "");
        setEmail(tenantJson.data.branding.email ?? "");
        setLogoUrl(tenantJson.data.branding.logoUrl ?? null);
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [apiBase, props.tenantSlug]);

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">Loading…</div>;
  }

  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  if (!tenantId || !tenant) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">No tenant</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
        <div className="text-2xl font-semibold">{t("app.onboarding.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.onboarding.subtitle")}</div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
          <div className="text-lg font-semibold">{t("app.onboarding.company.title")}</div>
          <div className="mt-4 space-y-4">
            <Field label={t("app.onboarding.company.displayName")} value={displayName} onChange={setDisplayName} />
            <Field label={t("app.onboarding.company.legalName")} value={legalName} onChange={setLegalName} />
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.onboarding.company.defaultLocale")}</label>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={defaultLocale}
                onChange={(e) => setDefaultLocale(e.target.value as Locale)}
              >
                {supportedLocales.map((l) => (
                  <option key={l} value={l}>
                    {t(`common.language.${l}`)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={saving}
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              onClick={async () => {
                setSaving(true);
                setErrorKey(null);
                try {
                  const res1 = await apiFetch(`/api/tenants/current`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                    body: JSON.stringify({ displayName, defaultLocale })
                  });
                  if (!res1.ok) {
                    setErrorKey("errors.permissionDenied");
                    return;
                  }

                  const res2 = await apiFetch(`/api/tenants/current/branding`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                    body: JSON.stringify({ legalName, displayName, address: address || undefined, phone: phone || undefined, email: email || undefined })
                  });
                  if (!res2.ok) {
                    setErrorKey("errors.permissionDenied");
                    return;
                  }
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setSaving(false);
                }
              }}
            >
              {t("app.onboarding.save")}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
          <div className="text-lg font-semibold">{t("app.onboarding.branding.title")}</div>
          <div className="mt-4 space-y-4">
            <Field label={t("app.onboarding.branding.address")} value={address} onChange={setAddress} />
            <Field label={t("app.onboarding.branding.phone")} value={phone} onChange={setPhone} />
            <Field label={t("app.onboarding.branding.email")} value={email} onChange={setEmail} />

            <div className="rounded-2xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-sm font-medium text-gray-900">{t("app.onboarding.branding.logo")}</div>
              <div className="mt-3 flex items-center gap-4">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white">
                  {logoFullUrl ? (
                    <Image alt="" src={logoFullUrl} unoptimized width={56} height={56} className="h-full w-full object-contain" />
                  ) : (
                    <span className="text-xs text-gray-500">—</span>
                  )}
                </div>
                <label className="inline-flex h-10 cursor-pointer items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50">
                  <input
                    type="file"
                    className="hidden"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={async (e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (!f) return;
                      setUploading(true);
                      setErrorKey(null);
                      try {
                        const fd = new FormData();
                        fd.append("file", f);
                        const up = await apiFetch(`/api/files`, {
                          method: "POST",
                          headers: { "X-Tenant-Id": tenantId },
                          body: fd
                        });
                        const upJson = (await up.json()) as { data?: { id: string; url: string } };
                        if (!up.ok || !upJson.data) {
                          setErrorKey("errors.validationError");
                          return;
                        }

                        const patch = await apiFetch(`/api/tenants/current/branding`, {
                          method: "PATCH",
                          headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                          body: JSON.stringify({ logoFileId: upJson.data.id })
                        });
                        if (!patch.ok) {
                          setErrorKey("errors.permissionDenied");
                          return;
                        }
                        setLogoUrl(upJson.data.url);
                      } catch {
                        setErrorKey("errors.internal");
                      } finally {
                        setUploading(false);
                        e.target.value = "";
                      }
                    }}
                  />
                  {uploading ? t("app.onboarding.branding.uploading") : t("app.onboarding.branding.upload")}
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="text-lg font-semibold">{t("app.onboarding.referral.title")}</div>
        <div className="mt-2 text-sm text-gray-700">{t("app.onboarding.referral.subtitle")}</div>
        <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end">
          <div className="flex-1">
            <Field label={t("app.onboarding.referral.field.code")} value={referralCode} onChange={setReferralCode} />
          </div>
          <button
            type="button"
            disabled={applyingReferral || !referralCode.trim()}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
            onClick={async () => {
              if (!referralCode.trim()) return;
              setApplyingReferral(true);
              setErrorKey(null);
              try {
                const res = await apiFetch(`/api/referrals/apply`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                  body: JSON.stringify({ code: referralCode })
                });
                if (!res.ok) {
                  setErrorKey("errors.validationError");
                  return;
                }
                setReferralApplied(true);
              } catch {
                setErrorKey("errors.internal");
              } finally {
                setApplyingReferral(false);
              }
            }}
          >
            {applyingReferral ? t("common.loading") : t("app.onboarding.referral.apply")}
          </button>
        </div>
        {referralApplied ? (
          <div className="mt-3 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{t("app.onboarding.referral.appliedDiscount")}</div>
        ) : null}
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">
        <div className="text-lg font-semibold">{t("app.onboarding.next.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.onboarding.next.subtitle")}</div>
        <div className="mt-4">
          <a
            href={`/t/${tenant.tenant.slug}/dashboard`}
            className="inline-flex h-11 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
          >
            {t("app.onboarding.next.goDashboard")}
          </a>
        </div>
      </div>
    </div>
  );
}

function Field(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900">{props.label}</label>
      <input
        className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}
