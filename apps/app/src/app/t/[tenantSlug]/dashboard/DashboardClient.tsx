"use client";

import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
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

type TenantAppsResponse = {
  data: {
    modules: { id: string; nameKey: string; allowed: boolean }[];
  };
};

type EnabledModule = { id: string; nameKey: string; href: string };

export function DashboardClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const apiBase = getApiBaseUrl();
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [tenant, setTenant] = useState<TenantCurrentResponse["data"]>(null);
  const [enabledModules, setEnabledModules] = useState<EnabledModule[]>([]);

  const logoFullUrl = useMemo(() => {
    const logoUrl = tenant?.branding.logoUrl ?? null;
    return logoUrl ? `${apiBase}${logoUrl}` : null;
  }, [apiBase, tenant?.branding.logoUrl]);

  const checks = useMemo(() => {
    const profileOk = !!tenant?.tenant.displayName?.trim() && !!tenant?.tenant.defaultLocale?.trim();
    const brandingOk = !!tenant?.tenant.legalName?.trim() || !!tenant?.branding.email || !!tenant?.branding.phone || !!tenant?.branding.address;
    const logoOk = !!tenant?.branding.logoUrl;
    return [
      { key: "profile", label: t("app.dashboard.check.profile"), ok: profileOk },
      { key: "branding", label: t("app.dashboard.check.branding"), ok: brandingOk },
      { key: "logo", label: t("app.dashboard.check.logo"), ok: logoOk }
    ];
  }, [t, tenant]);

  const progress = useMemo(() => {
    const total = checks.length;
    const done = checks.filter((c) => c.ok).length;
    return { total, done };
  }, [checks]);

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

        const appsRes = await apiFetch(`/api/tenants/current/apps`, {
          cache: "no-store",
          headers: { "X-Tenant-Id": membership.tenantId }
        });
        const appsJson = (await appsRes.json()) as TenantAppsResponse;
        if (appsRes.ok && appsJson.data?.modules) {
          const list = (appsJson.data.modules ?? [])
            .filter((m) => m.allowed)
            .map((m) => ({ id: m.id, nameKey: m.nameKey, href: moduleHref(props.tenantSlug, m.id) }))
            .filter((m) => m.href !== null) as EnabledModule[];
          if (!cancelled) setEnabledModules(list);
        }
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
    return <div className="rounded-2xl border border-gray-200 bg-white p-6">Loading…</div>;
  }

  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  if (!tenantId || !tenant) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6">No tenant</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.dashboard.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.dashboard.subtitle")}</div>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href={`/t/${tenant.tenant.slug}/onboarding`}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
            >
              {t("app.onboarding.cta")}
            </a>
            <a
              href={`/t/${tenant.tenant.slug}/modules`}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              {t("app.dashboard.cta.viewModules")}
            </a>
          </div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6 lg:col-span-2">
          <div className="flex items-start gap-4">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white">
              {logoFullUrl ? (
                <Image alt="" src={logoFullUrl} unoptimized width={56} height={56} className="h-full w-full object-contain" />
              ) : (
                <span className="text-xs text-gray-500">—</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-lg font-semibold text-gray-900">{tenant.tenant.displayName}</div>
              <div className="mt-1 text-sm text-gray-700">{tenant.tenant.legalName}</div>
              <div className="mt-2 text-xs text-gray-500">
                {t("app.dashboard.tenantSlug")}: {tenant.tenant.slug} • {t("app.dashboard.defaultLocale")}: {tenant.tenant.defaultLocale}
              </div>
            </div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Info label={t("app.dashboard.branding.email")} value={tenant.branding.email} />
            <Info label={t("app.dashboard.branding.phone")} value={tenant.branding.phone} />
            <Info label={t("app.dashboard.branding.address")} value={tenant.branding.address} />
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
          <div className="text-lg font-semibold">{t("app.dashboard.setup.title")}</div>
          <div className="mt-2 text-sm text-gray-700">
            {t("app.dashboard.setup.progress")} {progress.done}/{progress.total}
          </div>
          <ul className="mt-5 space-y-3 text-sm text-gray-700">
            {checks.map((c) => (
              <li key={c.key} className="flex items-center justify-between gap-3">
                <span>{c.label}</span>
                {c.ok ? <Badge kind="ok" text={t("app.dashboard.setup.done")} /> : <Badge kind="todo" text={t("app.dashboard.setup.todo")} />}
              </li>
            ))}
          </ul>
          <div className="mt-6">
            <a
              href={`/t/${tenant.tenant.slug}/onboarding`}
              className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
            >
              {t("app.dashboard.setup.open")}
            </a>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="text-lg font-semibold">{t("app.nav.apps")}</div>
        <div className="mt-4 flex flex-wrap gap-2">
          {enabledModules.length === 0 ? (
            <div className="text-sm text-gray-700">{t("app.nav.apps.empty")}</div>
          ) : (
            enabledModules.map((m) => (
              <a
                key={m.id}
                href={m.href}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                {t(m.nameKey)}
              </a>
            ))
          )}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="text-lg font-semibold">{t("app.dashboard.next.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.dashboard.next.subtitle")}</div>
        <div className="mt-4 flex flex-col gap-3 md:flex-row">
          <a
            href={`/t/${tenant.tenant.slug}/modules`}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            {t("app.dashboard.next.modules")}
          </a>
          <button
            type="button"
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            {t("app.dashboard.next.invite")}
          </button>
        </div>
      </div>
    </div>
  );
}

function moduleHref(tenantSlug: string, id: string): string | null {
  if (id === "shop") return `/t/${tenantSlug}/shop`;
  if (id === "pharmacy") return `/t/${tenantSlug}/pharmacy`;
  if (id === "fuel") return `/t/${tenantSlug}/fuel`;
  if (id === "msp") return `/t/${tenantSlug}/msp`;
  if (id === "printpress") return `/t/${tenantSlug}/printpress`;
  return null;
}

function Info(props: { label: string; value: string | null }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <div className="text-xs font-medium text-gray-700">{props.label}</div>
      <div className="mt-1 truncate text-sm text-gray-900">{props.value ?? "—"}</div>
    </div>
  );
}

function Badge(props: { kind: "ok" | "todo"; text: string }) {
  return (
    <span
      className={[
        "inline-flex h-6 items-center rounded-full px-2 text-xs",
        props.kind === "ok" ? "bg-primary-50 text-primary-700" : "bg-gray-100 text-gray-700"
      ].join(" ")}
    >
      {props.text}
    </span>
  );
}
