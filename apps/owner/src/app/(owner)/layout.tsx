import Link from "next/link";
import { getRequestLocale } from "@/lib/locale";
import { getTextDirection, t as translate } from "@oneerp/i18n";
import { OwnerUserMenu } from "@/components/OwnerUserMenu";

export default async function OwnerLayout(props: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const dir = getTextDirection(locale);
  const t = (key: string) => translate(locale, key);

  return (
    <div className="min-h-dvh" dir={dir}>
      <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link href="/" className="text-sm font-semibold text-gray-900">
              {t("app.owner.title")}
            </Link>
            <nav className="hidden items-center gap-3 text-sm md:flex">
              <Link className="text-gray-700 hover:text-gray-900" href="/">
                {t("app.owner.nav.requests")}
              </Link>
              <Link className="text-gray-700 hover:text-gray-900" href="/support">
                {t("app.owner.nav.supportCenter")}
              </Link>
              <Link className="text-gray-700 hover:text-gray-900" href="/tenants">
                {t("app.owner.nav.tenants")}
              </Link>
              <Link className="text-gray-700 hover:text-gray-900" href="/tutorials">
                {t("app.owner.nav.tutorials")}
              </Link>
              <Link className="text-gray-700 hover:text-gray-900" href="/contact-submissions">
                {t("app.owner.nav.contactSubmissions")}
              </Link>
            </nav>
          </div>
          <OwnerUserMenu />
        </div>
      </header>
      <main className="mx-auto max-w-6xl p-4 md:p-6">{props.children}</main>
    </div>
  );
}
