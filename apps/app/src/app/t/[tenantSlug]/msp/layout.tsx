import { getRequestLocale } from "@/lib/locale";
import { getApiBaseUrl } from "@/lib/api";
import { t as translate } from "@oneerp/i18n";
import { cookies } from "next/headers";
import { MspMobileNav } from "./MspMobileNav";
import { MspTabs } from "./MspTabs";

type MeResponse = { data: { memberships: { tenantId: string; tenantSlug: string }[] } };
type TenantModulesResponse = {
  data: Array<{
    id: string;
    status: string;
  }>;
};

function joinUrl(base: string, path: string): string {
  if (path.startsWith("http")) return path;
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (b.endsWith("/api") && (p === "/api" || p.startsWith("/api/"))) {
    return `${b.slice(0, -4)}${p}`;
  }
  return `${b}${p}`;
}

export default async function MspLayout(props: { children: React.ReactNode; params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  const apiBaseUrl = getApiBaseUrl();
  const cookieHeader = (await cookies()).toString();

  const meRes = await fetch(joinUrl(apiBaseUrl, "/api/me"), { cache: "no-store", headers: cookieHeader ? { cookie: cookieHeader } : {} });
  const meJson = (await meRes.json().catch(() => null)) as MeResponse | null;
  const membership = meRes.ok ? (meJson?.data?.memberships ?? []).find((m) => m.tenantSlug === tenantSlug) ?? null : null;
  const tenantId = membership?.tenantId ?? null;

  let status: string | null = null;
  if (tenantId) {
    const modsRes = await fetch(joinUrl(apiBaseUrl, "/api/tenants/current/modules"), {
      cache: "no-store",
      headers: { ...(cookieHeader ? { cookie: cookieHeader } : {}), "X-Tenant-Id": tenantId }
    });
    const modsJson = (await modsRes.json().catch(() => null)) as TenantModulesResponse | null;
    status = modsRes.ok ? (modsJson?.data ?? []).find((m) => m.id === "msp")?.status ?? null : null;
  }

  const blockedKey =
    !meRes.ok ? "errors.unauthenticated" : !tenantId ? "errors.tenantAccessDenied" : status === "locked" ? "errors.moduleLocked" : status === "enabled" ? null : "errors.moduleDisabled";

  if (blockedKey) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
          <div className="text-2xl font-semibold">{t("app.msp.title")}</div>
          <div className="mt-2 text-gray-700">{t("app.msp.subtitle")}</div>
        </div>
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(blockedKey)}</div>
        <div>
          <a
            href={`/t/${tenantSlug}/modules`}
            className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
          >
            {t("app.dashboard.cta.viewModules")}
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="text-2xl font-semibold">{t("app.msp.title")}</div>
        <div className="mt-2 text-gray-700">{t("app.msp.subtitle")}</div>
        <MspTabs tenantSlug={tenantSlug} />
      </div>

      <div className="pb-24 lg:pb-0">{props.children}</div>
      <MspMobileNav tenantSlug={tenantSlug} />
    </div>
  );
}
