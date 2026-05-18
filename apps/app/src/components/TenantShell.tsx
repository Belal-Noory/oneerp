"use client";

import { useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { useClientI18n } from "@/lib/client-i18n";
import { TenantSidebar } from "@/components/TenantSidebar";
import { Drawer } from "@/components/Drawer";

export function TenantShell(props: { tenantSlug: string; dir: "ltr" | "rtl"; children: React.ReactNode }) {
  const { t } = useClientI18n();
  const pathname = usePathname();
  const [drawerOpen, setDrawerOpen] = useState(false);

  const title = useMemo(() => {
    if (!pathname) return props.tenantSlug;
    if (pathname.includes(`/t/${props.tenantSlug}/shop`)) return t("app.shop.title");
    if (pathname.endsWith(`/t/${props.tenantSlug}/dashboard`)) return t("app.nav.dashboard");
    if (pathname.includes(`/t/${props.tenantSlug}/modules`)) return t("app.nav.modules");
    if (pathname.includes(`/t/${props.tenantSlug}/onboarding`)) return t("app.nav.onboarding");
    if (pathname.includes(`/t/${props.tenantSlug}/team`)) return t("app.nav.team");
    if (pathname.includes(`/t/${props.tenantSlug}/support-center`)) return t("app.nav.supportCenter");
    return props.tenantSlug;
  }, [pathname, props.tenantSlug, t]);

  const flexDir = props.dir === "rtl" ? "lg:flex-row-reverse" : "lg:flex-row";
  const drawerSide = props.dir === "rtl" ? "right" : "left";

  return (
    <div className="min-h-[calc(100dvh-4rem)]">
      <div className="tenant-mobile-header sticky top-0 z-30 mb-4 rounded-2xl border border-gray-200 bg-white/90 px-4 py-3 backdrop-blur lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
            onClick={() => setDrawerOpen(true)}
            aria-label={t("common.button.openMenu")}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-semibold text-gray-900">{title}</div>
            <div className="truncate text-xs text-gray-500">{props.tenantSlug}</div>
          </div>
        </div>
      </div>

      <Drawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        side={drawerSide}
        widthClassName="w-[18rem] max-w-[90vw]"
      >
        <div
          onClick={(e) => {
            const el = e.target as HTMLElement | null;
            if (!el) return;
            if (el.closest("a[href]") || el.closest("button")) setDrawerOpen(false);
          }}
          className="relative"
        >
          <button
            type="button"
            className={["absolute top-3 z-10 inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-50", drawerSide === "left" ? "right-3" : "left-3"].join(" ")}
            onClick={() => setDrawerOpen(false)}
            aria-label={t("common.button.close")}
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
          <TenantSidebar tenantSlug={props.tenantSlug} variant="mobile" />
        </div>
      </Drawer>

      <div className={["tenant-shell-body flex items-start gap-6", flexDir].join(" ")}>
        <div className="tenant-shell-sidebar hidden lg:block">
          <TenantSidebar tenantSlug={props.tenantSlug} variant="desktop" />
        </div>
        <div className="tenant-shell-content min-w-0 flex-1">
          <div className="tenant-shell-content-inner mx-auto w-full max-w-6xl">{props.children}</div>
        </div>
      </div>
    </div>
  );
}
