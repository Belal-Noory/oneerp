import { getRequestLocale } from "@/lib/locale";
import { t as translate } from "@oneerp/i18n";

export default async function PrintPressPage(props: { params: Promise<{ tenantSlug: string }> }) {
  const { tenantSlug } = await props.params;
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="text-lg font-semibold">{t("app.printpress.dashboard.title")}</div>
        <div className="mt-2 text-sm text-gray-700">{t("app.printpress.dashboard.subtitle")}</div>
        <div className="mt-6 grid grid-cols-2 gap-3">
          {[
            ["app.printpress.dashboard.kpi.todayIncome", "0"],
            ["app.printpress.dashboard.kpi.todayExpenses", "0"],
            ["app.printpress.dashboard.kpi.pendingJobs", "0"],
            ["app.printpress.dashboard.kpi.pendingPayments", "0"]
          ].map(([labelKey, value]) => (
            <div key={labelKey} className="rounded-xl border border-gray-200 bg-gray-50 p-4">
              <div className="text-xs font-medium text-gray-700">{t(labelKey)}</div>
              <div className="mt-1 text-xl font-semibold text-gray-900">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="text-lg font-semibold">{t("app.printpress.dashboard.next.title")}</div>
        <div className="mt-2 text-sm text-gray-700">{t("app.printpress.dashboard.next.subtitle")}</div>
        <div className="mt-5 flex flex-wrap items-center gap-2">
          {[
            ["app.printpress.tab.jobs", "jobs"],
            ["app.printpress.tab.customers", "customers"],
            ["app.printpress.tab.quotations", "quotations"]
          ].map(([labelKey, path]) => (
            <a
              key={path}
              href={`/t/${tenantSlug}/printpress/${path}`}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              {t(labelKey)}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
