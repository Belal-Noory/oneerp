import "./globals.css";
import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/locale";
import { getTextDirection, t as translate } from "@oneerp/i18n";
import { PublicHeader } from "@/components/PublicHeader";
import { PublicFooter } from "@/components/PublicFooter";
import { IconWhatsApp } from "@/components/Graphics";
import { Inter, Noto_Sans_Arabic } from "next/font/google";

export const metadata: Metadata = {
  title: "OneERP",
  description: "Modular SaaS ERP platform"
};

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });
const notoArabic = Noto_Sans_Arabic({ subsets: ["arabic"], variable: "--font-arabic" });

export default async function RootLayout(props: { children: React.ReactNode }) {
  const locale = await getRequestLocale();
  const dir = getTextDirection(locale);
  const t = (key: string) => translate(locale, key);

  return (
    <html lang={locale} dir={dir}>
      <body
        className={[
          "min-h-dvh bg-gray-50 text-gray-900",
          inter.variable,
          notoArabic.variable,
          dir === "rtl" ? "font-[var(--font-arabic)]" : "font-[var(--font-inter)]"
        ].join(" ")}
      >
        <PublicHeader locale={locale} />
        <main className="mx-auto max-w-6xl px-4 py-12">{props.children}</main>
        <PublicFooter locale={locale} />
        <a
          href="https://wa.me/93701023165"
          target="_blank"
          rel="noopener noreferrer"
          aria-label={t("public.whatsapp.floatingLabel")}
          className={[
            "fixed bottom-5 z-30 inline-flex h-12 w-12 items-center justify-center rounded-full bg-green-600 text-white shadow-lg transition hover:bg-green-700 hover:shadow-xl",
            dir === "rtl" ? "left-5" : "right-5"
          ].join(" ")}
        >
          <IconWhatsApp />
        </a>
      </body>
    </html>
  );
}
