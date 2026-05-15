import { type Locale, t as translate } from "@oneerp/i18n";
import Link from "next/link";
import { LogoMark } from "@/components/Graphics";

export function PublicFooter(props: { locale: Locale }) {
  const t = (key: string) => translate(props.locale, key);

  return (
    <footer className="border-t border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-10 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <span className="text-primary-700">
            <LogoMark className="h-6 w-6" />
          </span>
          <span>
            © {new Date().getFullYear()} {t("common.brand.name")}. {t("common.footer.rights")}
          </span>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link className="text-gray-700 hover:text-gray-900" href="/learning-center">
            {t("common.nav.learningCenter")}
          </Link>
          <Link className="text-gray-700 hover:text-gray-900" href="/terms-and-conditions">
            {t("common.footer.terms")}
          </Link>
          <Link className="text-gray-700 hover:text-gray-900" href="/privacy-policy">
            {t("common.footer.privacy")}
          </Link>
          <Link className="text-gray-700 hover:text-gray-900" href="/contact">
            {t("common.footer.contact")}
          </Link>
        </div>
      </div>
    </footer>
  );
}
