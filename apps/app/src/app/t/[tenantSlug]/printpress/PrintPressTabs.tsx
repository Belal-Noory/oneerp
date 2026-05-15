"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useClientI18n } from "@/lib/client-i18n";

export function PrintPressTabs(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const pathname = usePathname();

  const base = `/t/${props.tenantSlug}/printpress`;

  const tabs = [
    { label: t("app.printpress.tab.dashboard"), href: base },
    { label: t("app.printpress.tab.jobs"), href: `${base}/jobs` },
    { label: t("app.printpress.tab.customers"), href: `${base}/customers` },
    { label: t("app.printpress.tab.quotations"), href: `${base}/quotations` },
    { label: t("app.printpress.tab.reports"), href: `${base}/reports` },
    { label: t("app.printpress.tab.settings"), href: `${base}/settings` }
  ];

  return (
    <div className="mt-6 flex flex-wrap items-center gap-2">
      {tabs.map((tab) => {
        const active = pathname === tab.href || (pathname.startsWith(tab.href + "/") && tab.href !== base);
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`inline-flex h-9 items-center rounded-full px-4 text-sm font-medium transition-colors ${
              active ? "bg-primary-50 text-primary-700" : "bg-gray-50 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}

