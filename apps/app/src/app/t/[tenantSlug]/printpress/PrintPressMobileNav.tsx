"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useMemo, useState } from "react";
import { Modal } from "@/components/Modal";
import { useClientI18n } from "@/lib/client-i18n";

type NavItem =
  | { key: "dashboard" | "jobs" | "customers"; href: string; label: string; icon: ReactNode }
  | { key: "more"; label: string; icon: ReactNode };

export function PrintPressMobileNav(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const pathname = usePathname();
  const [moreOpen, setMoreOpen] = useState(false);

  const base = `/t/${props.tenantSlug}/printpress`;

  const hidden = useMemo(() => {
    if (!pathname) return false;
    return pathname.includes("/print");
  }, [pathname]);

  const items: NavItem[] = useMemo(
    () => [
      { key: "dashboard", href: `${base}`, label: t("app.printpress.tab.dashboard"), icon: <IconDashboard /> },
      { key: "jobs", href: `${base}/jobs`, label: t("app.printpress.tab.jobs"), icon: <IconJobs /> },
      { key: "customers", href: `${base}/customers`, label: t("app.printpress.tab.customers"), icon: <IconUsers /> },
      { key: "more", label: t("app.printpress.mobile.more"), icon: <IconMore /> }
    ],
    [base, t]
  );

  const activeKey = useMemo(() => {
    if (!pathname) return null;
    if (pathname === base) return "dashboard";
    if (pathname.startsWith(`${base}/jobs`)) return "jobs";
    if (pathname.startsWith(`${base}/customers`)) return "customers";
    return "more";
  }, [base, pathname]);

  if (hidden) return null;

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-200 bg-white/90 backdrop-blur lg:hidden">
        <div className="mx-auto flex max-w-6xl items-stretch gap-2 px-2 pb-[max(env(safe-area-inset-bottom),0.5rem)] pt-2">
          {items.map((it) => {
            const active = it.key === activeKey;
            const className = [
              "flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-xs",
              active ? "bg-primary-50 text-primary-700" : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
            ].join(" ");
            const iconClass = active ? "text-primary-700" : "text-gray-500";
            if (it.key === "more") {
              return (
                <button
                  key={it.key}
                  type="button"
                  className={className}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setMoreOpen(true)}
                >
                  <span className={iconClass}>{it.icon}</span>
                  <span className="w-full truncate text-center font-medium">{it.label}</span>
                </button>
              );
            }
            return (
              <Link key={it.key} href={it.href} className={className} aria-current={active ? "page" : undefined}>
                <span className={iconClass}>{it.icon}</span>
                <span className="w-full truncate text-center font-medium">{it.label}</span>
              </Link>
            );
          })}
        </div>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.printpress.mobile.more")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.printpress.mobile.more.subtitle")}</div>
          <div className="mt-6 grid grid-cols-2 gap-2">
            {[
              { href: base, label: t("app.printpress.tab.dashboard") },
              { href: `${base}/jobs`, label: t("app.printpress.tab.jobs") },
              { href: `${base}/customers`, label: t("app.printpress.tab.customers") },
              { href: `${base}/quotations`, label: t("app.printpress.tab.quotations") },
              { href: `${base}/reports`, label: t("app.printpress.tab.reports") },
              { href: `${base}/settings`, label: t("app.printpress.tab.settings") }
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                onClick={() => setMoreOpen(false)}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </Modal>
    </>
  );
}

function IconDashboard() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 3h7v7H3V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 3h7v7h-7V3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M14 14h7v7h-7v-7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M3 14h7v7H3v-7Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  );
}

function IconJobs() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 4h10v4H7V4Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M5 10h14v10H5V10Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M8 14h8" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
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

function IconMore() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h0.01M12 12h0.01M19 12h0.01" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

