"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { isRtlLocale, type Locale, t as translate } from "@oneerp/i18n";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { IconUser, LogoMark } from "@/components/Graphics";

export function PublicHeader(props: { locale: Locale }) {
  const t = (key: string) => translate(props.locale, key);
  const rtl = isRtlLocale(props.locale);
  const [promoDismissed, setPromoDismissed] = useState(false);

  useEffect(() => {
    try {
      setPromoDismissed(window.localStorage.getItem("oneerp_promo_bar_v1") === "dismissed");
    } catch {
      setPromoDismissed(false);
    }
  }, []);

  return (
    <header className="sticky top-0 z-20 border-b border-gray-200 bg-white/80 backdrop-blur">
      <div
        className={[
          "border-b border-amber-100 bg-gradient-to-r from-amber-50 via-white to-primary-50 transition-all duration-300",
          promoDismissed ? "max-h-0 overflow-hidden opacity-0" : "max-h-24 opacity-100"
        ].join(" ")}
      >
        <div className={["mx-auto flex max-w-6xl items-start justify-between gap-3 px-4 py-2.5 text-xs text-gray-900", rtl ? "flex-row-reverse" : "flex-row"].join(" ")}>
          <div className="min-w-0">
            <div className="font-semibold text-amber-900">{t("public.promo.top.title")}</div>
            <div className="mt-0.5 text-gray-700">{t("public.promo.top.subtitle")}</div>
          </div>
          <div className={["flex items-center gap-2", rtl ? "flex-row-reverse" : "flex-row"].join(" ")}>
            <Link href="/pricing" className="whitespace-nowrap rounded-full bg-white px-3 py-1 text-xs font-medium text-primary-700 shadow-sm ring-1 ring-primary-100 hover:bg-primary-50">
              {t("public.promo.top.cta")}
            </Link>
            <button
              type="button"
              aria-label={t("public.promo.top.dismiss")}
              className="inline-flex h-7 w-7 items-center justify-center rounded-full text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              onClick={() => {
                try {
                  window.localStorage.setItem("oneerp_promo_bar_v1", "dismissed");
                } catch {}
                setPromoDismissed(true);
              }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </div>
      <div className={["mx-auto flex h-16 max-w-6xl items-center justify-between px-4", rtl ? "flex-row-reverse" : "flex-row"].join(" ")}>
        <div className={["flex items-center gap-6", rtl ? "flex-row-reverse" : "flex-row"].join(" ")}>
          <Link href="/" className="inline-flex items-center gap-2 text-lg font-semibold text-gray-900">
            <span className="text-primary-700">
              <LogoMark className="h-7 w-7" />
            </span>
            <span>{t("common.brand.name")}</span>
          </Link>
          <nav className={["hidden items-center gap-4 text-sm text-gray-700 md:flex", rtl ? "flex-row-reverse" : "flex-row"].join(" ")}>
            <Link className="hover:text-gray-900" href="/">
              {t("common.nav.home")}
            </Link>
            <Link className="hover:text-gray-900" href="/features">
              {t("common.nav.features")}
            </Link>
            <Link className="hover:text-gray-900" href="/modules">
              {t("common.nav.modules")}
            </Link>
            <Link className="hover:text-gray-900" href="/learning-center">
              {t("common.nav.learningCenter")}
            </Link>
            <Link className="hover:text-gray-900" href="/pricing">
              {t("common.nav.pricing")}
            </Link>
          </nav>
        </div>

        <div className={["flex items-center gap-3", rtl ? "flex-row-reverse" : "flex-row"].join(" ")}>
          <LanguageSwitcher locale={props.locale} />
          <details className="relative md:hidden">
            <summary
              aria-label={t("common.button.openMenu")}
              className="inline-flex h-9 w-9 list-none items-center justify-center rounded-md text-gray-700 transition hover:bg-gray-100 hover:text-gray-900 [&::-webkit-details-marker]:hidden"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </summary>

            <div
              className="absolute right-0 z-30 mt-3 w-[18rem] max-w-[85vw] rounded-2xl border border-gray-200 bg-white p-2 shadow-lg"
            >
              <div className="space-y-1 p-1">
                <Link className="block rounded-xl px-3 py-2 text-sm text-gray-800 hover:bg-gray-50" href="/">
                  {t("common.nav.home")}
                </Link>
                <Link className="block rounded-xl px-3 py-2 text-sm text-gray-800 hover:bg-gray-50" href="/features">
                  {t("common.nav.features")}
                </Link>
                <Link className="block rounded-xl px-3 py-2 text-sm text-gray-800 hover:bg-gray-50" href="/modules">
                  {t("common.nav.modules")}
                </Link>
                <Link className="block rounded-xl px-3 py-2 text-sm text-gray-800 hover:bg-gray-50" href="/learning-center">
                  {t("common.nav.learningCenter")}
                </Link>
                <Link className="block rounded-xl px-3 py-2 text-sm text-gray-800 hover:bg-gray-50" href="/pricing">
                  {t("common.nav.pricing")}
                </Link>
              </div>

              <div className="my-2 h-px bg-gray-200" />

              <div className="grid gap-2 p-1">
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  href="/login"
                >
                  {t("common.nav.login")}
                </Link>
                <Link
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                  href="/register"
                >
                  {t("common.button.getStarted")}
                </Link>
              </div>

              <div className="my-2 h-px bg-gray-200" />

              <div className="space-y-1 p-1">
                <Link className="block rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50" href="/contact">
                  {t("common.footer.contact")}
                </Link>
                <Link className="block rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50" href="/privacy-policy">
                  {t("common.footer.privacy")}
                </Link>
                <Link className="block rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-50" href="/terms-and-conditions">
                  {t("common.footer.terms")}
                </Link>
              </div>
            </div>
          </details>
          <Link
            className="hidden h-9 items-center justify-center rounded-md text-gray-700 hover:bg-gray-100 hover:text-gray-900 sm:px-2 md:inline-flex"
            href="/login"
            aria-label={t("common.nav.login")}
          >
            <span aria-hidden="true">
              <IconUser />
            </span>
            <span className="ml-2 hidden text-sm sm:inline">{t("common.nav.login")}</span>
          </Link>
          <Link
            className="hidden h-9 items-center rounded-md bg-primary-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-primary-700 md:inline-flex"
            href="/register"
          >
            {t("common.button.getStarted")}
          </Link>
        </div>
      </div>
    </header>
  );
}
