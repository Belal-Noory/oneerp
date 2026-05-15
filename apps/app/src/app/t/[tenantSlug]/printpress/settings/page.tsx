import { getRequestLocale } from "@/lib/locale";
import { t as translate } from "@oneerp/i18n";

export default async function PrintPressSettingsPage() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
      <div className="text-lg font-semibold">{t("app.printpress.settings.title")}</div>
      <div className="mt-2 text-sm text-gray-700">{t("app.printpress.settings.subtitle")}</div>
      <div className="mt-6 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">{t("app.printpress.placeholder")}</div>
    </div>
  );
}

