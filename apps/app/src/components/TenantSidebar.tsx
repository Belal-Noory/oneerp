"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

type MeResponse = {
  data: {
    memberships: { tenantId: string; tenantSlug: string; tenantDisplayName: string; roleName: string }[];
  };
};

type TenantCurrentResponse = {
  data: {
    tenant: { id: string; slug: string; legalName: string; displayName: string; defaultLocale: string; status: string };
    branding: { logoUrl: string | null };
  } | null;
};

type TenantAppsResponse = {
  data: { modules: { id: string; nameKey: string; allowed: boolean }[] };
};

type EnabledModule = { id: string; nameKey: string; href: string };

export function TenantSidebar(props: { tenantSlug: string; variant?: "desktop" | "mobile" }) {
  const { t } = useClientI18n();
  const pathname = usePathname();
  const apiBase = getApiBaseUrl();
  const [tenantName, setTenantName] = useState<string | null>(null);
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [enabledModules, setEnabledModules] = useState<EnabledModule[]>([]);
  const [reloadToken, setReloadToken] = useState(0);
  const [membershipTenantId, setMembershipTenantId] = useState<string | null>(null);

  const logoFullUrl = useMemo(() => (logoUrl ? `${apiBase}${logoUrl}` : null), [apiBase, logoUrl]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const meRes = await apiFetch("/api/me", { cache: "no-store" });
        if (!meRes.ok) return;
        const me = (await meRes.json()) as MeResponse;
        const membership = me.data.memberships.find((m) => m.tenantSlug === props.tenantSlug) ?? null;
        if (!membership) return;
        if (cancelled) return;
        setMembershipTenantId(membership.tenantId);

        const tenantRes = await apiFetch("/api/tenants/current", {
          cache: "no-store",
          headers: { "X-Tenant-Id": membership.tenantId }
        });
        const tenantJson = (await tenantRes.json()) as TenantCurrentResponse;
        if (tenantRes.ok && tenantJson.data) {
          if (!cancelled) {
            setTenantName(tenantJson.data.tenant.displayName);
            setLogoUrl(tenantJson.data.branding.logoUrl);
          }
        }

        const modsRes = await apiFetch("/api/tenants/current/apps", {
          cache: "no-store",
          headers: { "X-Tenant-Id": membership.tenantId }
        });
        const modsJson = (await modsRes.json()) as TenantAppsResponse;
        if (modsRes.ok && modsJson.data?.modules) {
          const list = (modsJson.data.modules ?? [])
            .filter((m) => m.allowed)
            .map((m) => ({ id: m.id, nameKey: m.nameKey, href: moduleHref(props.tenantSlug, m.id) }))
            .filter((m) => m.href !== null) as EnabledModule[];
          if (!cancelled) setEnabledModules(list);
        }
      } catch {}
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [props.tenantSlug, reloadToken]);

  useEffect(() => {
    function triggerReload() {
      setReloadToken((v) => v + 1);
    }

    function onStorage(e: StorageEvent) {
      if (!membershipTenantId) return;
      if (e.key === `tenantAppsChanged:${membershipTenantId}`) triggerReload();
    }

    function onLocalEvent() {
      triggerReload();
    }

    function onVisibility() {
      if (document.visibilityState === "visible") triggerReload();
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener("tenantAppsChanged", onLocalEvent);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("tenantAppsChanged", onLocalEvent);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [membershipTenantId]);

  const nav = useMemo(
    () => [
      { href: `/t/${props.tenantSlug}/dashboard`, label: t("app.nav.dashboard"), icon: <IconHome /> },
      { href: `/t/${props.tenantSlug}/modules`, label: t("app.nav.modules"), icon: <IconGrid /> },
      { href: `/t/${props.tenantSlug}/onboarding`, label: t("app.nav.onboarding"), icon: <IconSpark /> }
    ],
    [props.tenantSlug, t]
  );

  const variant = props.variant ?? "desktop";

  return (
    <aside
      className={[
        "shrink-0 overflow-hidden bg-white",
        variant === "desktop"
          ? "sticky top-6 w-[280px] rounded-2xl border border-gray-200 shadow-card"
          : "w-full"
      ].join(" ")}
    >
      <div className="flex h-16 items-center gap-3 border-b border-gray-200 px-4">
        <div className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-2xl border border-gray-200 bg-white">
          {logoFullUrl ? (
            <Image alt="" src={logoFullUrl} unoptimized width={40} height={40} className="h-full w-full object-contain" />
          ) : (
            <LogoMark />
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-gray-900">{tenantName ?? t("common.brand.name")}</div>
          <div className="truncate text-xs text-gray-500">{props.tenantSlug}</div>
        </div>
      </div>

      <div className={variant === "desktop" ? "max-h-[calc(100dvh-7rem)] overflow-auto p-3" : "p-3"}>
        <div className="space-y-1">
          {nav.map((item) => (
            <SidebarLink key={item.href} href={item.href} active={pathname === item.href} icon={item.icon} label={item.label} />
          ))}
        </div>

        <div className="mt-6 px-2 text-xs font-medium text-gray-500">{t("app.nav.apps")}</div>
        <div className="mt-2 space-y-1">
          {enabledModules.length === 0 ? (
            <div className="px-2 py-2 text-xs text-gray-500">{t("app.nav.apps.empty")}</div>
          ) : (
            enabledModules.map((m) => (
              <SidebarLink
                key={m.id}
                href={m.href}
                active={pathname === m.href || pathname.startsWith(`${m.href}/`)}
                icon={moduleIcon(m.id)}
                label={t(m.nameKey)}
              />
            ))
          )}
        </div>

        <div className="mt-6 px-2 text-xs font-medium text-gray-500">{t("app.nav.team")}</div>
        <div className="mt-2 space-y-1">
          <SidebarLink
            href={`/t/${props.tenantSlug}/team`}
            active={pathname === `/t/${props.tenantSlug}/team`}
            icon={<IconUsers />}
            label={t("app.nav.team")}
          />
        </div>

        <div className="mt-6 border-t border-gray-200 pt-3">
          <button
            type="button"
            className="flex h-10 w-full items-center gap-3 rounded-xl px-3 text-sm text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            onClick={async () => {
              try {
                await apiFetch("/api/auth/logout", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: "{}"
                });
              } finally {
                window.location.href = "/login";
              }
            }}
          >
            <span className="text-gray-400">
              <IconLogout />
            </span>
            <span className="truncate">{t("common.button.logout")}</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

function SidebarLink(props: { href: string; active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={props.href}
      className={[
        "flex h-10 items-center gap-3 rounded-xl px-3 text-sm",
        props.active ? "bg-primary-50 text-primary-700" : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
      ].join(" ")}
    >
      <span className="text-gray-400">{props.icon}</span>
      <span className="truncate">{props.label}</span>
    </Link>
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

function moduleIcon(id: string) {
  if (id === "shop") return <IconBag />;
  if (id === "pharmacy") return <IconPill />;
  if (id === "fuel") return <IconFuel />;
  if (id === "msp") return <IconMsp />;
  if (id === "printpress") return <IconPrintPress />;
  return <IconGrid />;
}

function LogoMark() {
  return (
    <svg className="h-6 w-6 text-primary-700" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 2.5 3.5 7.5v9L12 21.5l8.5-5v-9L12 2.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
      <path
        d="M7.5 10.2 12 12.8l4.5-2.6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M12 12.8v5.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 11.5 12 4l8 7.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1v-8.5Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconGrid() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 4h7v7H4V4Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 4h7v7h-7V4Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 13h7v7H4v-7Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M13 13h7v7h-7v-7Z" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function IconSpark() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function IconFuel() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 3h8a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 7h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M9 11h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M18 8l2 2v7a1 1 0 0 1-2 0v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconBag() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M6 7h12l-1 14H7L6 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M9 7a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconMsp() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7h10M7 12h10M7 17h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M5 4h14v16H5V4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M16.5 9.5c.8 0 1.5.7 1.5 1.5S17.3 12.5 16.5 12.5 15 11.8 15 11s.7-1.5 1.5-1.5Z" fill="currentColor" />
    </svg>
  );
}

function IconPrintPress() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 7V4h10v3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M7 17v3h10v-3" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M6 9h12a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 13h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function IconUsers() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M16 11a3 3 0 1 0-6 0 3 3 0 0 0 6 0Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M4 20a6 6 0 0 1 16 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function IconPill() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M9.2 14.8 14.8 9.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M8.5 8.5 15.5 15.5a4 4 0 0 1-5.7 5.7l-7-7a4 4 0 0 1 5.7-5.7Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path
        d="M21.2 9.8 17 14a4 4 0 0 1-5.7 0l-1.3-1.3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function IconLogout() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 7V6a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-7a2 2 0 0 1-2-2v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M3 12h10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M7 8l-4 4 4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
