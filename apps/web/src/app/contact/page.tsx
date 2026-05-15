import type { Metadata } from "next";
import Link from "next/link";
import { getRequestLocale } from "@/lib/locale";
import { t as translate } from "@oneerp/i18n";
import { Reveal } from "@/components/Reveal";
import {
  IconChart,
  IconCode,
  IconDatabase,
  IconGlobe,
  IconLayers,
  IconMail,
  IconMonitor,
  IconPhone,
  IconServer,
  IconSmartphone,
  IconWhatsApp
} from "@/components/Graphics";
import { ContactFormClient } from "./ContactFormClient";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const title = t("public.contact.seo.title");
  const description = t("public.contact.seo.description");
  return {
    title,
    description,
    openGraph: { title, description, type: "website" }
  };
}

export default async function ContactPage() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  return (
    <div className="space-y-16">
      <Reveal>
        <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-accent-50" />
          <div className="relative grid gap-10 p-10 md:grid-cols-2 md:items-center">
            <div className="space-y-6">
              <h1 className="text-4xl font-semibold tracking-tight">{t("public.contact.hero.title")}</h1>
              <p className="text-lg text-gray-700">{t("public.contact.hero.subtitle")}</p>
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href="tel:+93701023165"
                  className="inline-flex h-10 items-center gap-2 rounded-md bg-primary-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 hover:shadow-md"
                >
                  <IconPhone />
                  {t("public.contact.cta.call")}
                </a>
                <a
                  href="https://wa.me/93701023165"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900 transition hover:bg-gray-50 hover:shadow-sm"
                >
                  <IconWhatsApp />
                  {t("public.contact.cta.whatsapp")}
                </a>
                <a
                  href="mailto:belalnoory2@gmail.com"
                  className="inline-flex h-10 items-center gap-2 rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900 transition hover:bg-gray-50 hover:shadow-sm"
                >
                  <IconMail />
                  {t("public.contact.cta.email")}
                </a>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-2xl border border-gray-200 bg-white/70 p-6 backdrop-blur">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                    <IconWhatsApp />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{t("public.contact.info.whatsapp.title")}</div>
                    <div className="mt-1 text-sm text-gray-700">
                      <a className="underline decoration-gray-300 underline-offset-4 hover:decoration-gray-500" href="https://wa.me/93701023165" target="_blank" rel="noopener noreferrer">
                        +93 (0) 701 023 165
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white/70 p-6 backdrop-blur">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                    <IconPhone />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{t("public.contact.info.phone.title")}</div>
                    <div className="mt-1 text-sm text-gray-700">
                      <a className="underline decoration-gray-300 underline-offset-4 hover:decoration-gray-500" href="tel:+93701023165">
                        +93 (0) 701 023 165
                      </a>
                    </div>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white/70 p-6 backdrop-blur">
                <div className="flex items-start gap-3">
                  <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
                    <IconMail />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-gray-900">{t("public.contact.info.email.title")}</div>
                    <div className="mt-1 text-sm text-gray-700">
                      <a className="underline decoration-gray-300 underline-offset-4 hover:decoration-gray-500" href="mailto:belalnoory2@gmail.com">
                        belalnoory2@gmail.com
                      </a>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      <section className="space-y-6">
        <Reveal>
          <h2 className="text-2xl font-semibold">{t("public.contact.services.title")}</h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Reveal delayMs={0}>
            <ServiceCard icon={<IconDatabase />} title={t("public.contact.services.databaseDevelopment")} />
          </Reveal>
          <Reveal delayMs={70}>
            <ServiceCard icon={<IconCode />} title={t("public.contact.services.softwareDevelopment")} />
          </Reveal>
          <Reveal delayMs={140}>
            <ServiceCard icon={<IconSmartphone />} title={t("public.contact.services.mobileAppDevelopment")} />
          </Reveal>
          <Reveal delayMs={210}>
            <ServiceCard icon={<IconGlobe />} title={t("public.contact.services.websiteDevelopment")} />
          </Reveal>
          <Reveal delayMs={280}>
            <ServiceCard icon={<IconMonitor />} title={t("public.contact.services.webAppDevelopment")} />
          </Reveal>
          <Reveal delayMs={350}>
            <ServiceCard icon={<IconChart />} title={t("public.contact.services.dataAnalysis")} />
          </Reveal>
          <Reveal delayMs={420}>
            <ServiceCard icon={<IconServer />} title={t("public.contact.services.dataProcessing")} />
          </Reveal>
          <Reveal delayMs={490}>
            <ServiceCard icon={<IconLayers />} title={t("public.contact.services.erpSolutions")} />
          </Reveal>
        </div>
        <Reveal>
          <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
            <div className="text-sm text-gray-700">{t("public.contact.statement")}</div>
          </div>
        </Reveal>
      </section>

      <section className="grid gap-8 md:grid-cols-5 md:items-start">
        <Reveal className="md:col-span-2">
          <div className="space-y-4 rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
            <div className="text-xl font-semibold">{t("public.contact.form.title")}</div>
            <div className="text-sm text-gray-700">{t("public.contact.form.subtitle")}</div>
            <div className="flex flex-col gap-3">
              <a
                href="https://wa.me/93701023165"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                <IconWhatsApp />
                {t("public.contact.cta.quickWhatsapp")}
              </a>
              <Link
                href="/modules"
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
              >
                {t("common.button.viewModules")}
              </Link>
            </div>
          </div>
        </Reveal>

        <Reveal className="md:col-span-3">
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
            <ContactFormClient />
          </div>
        </Reveal>
      </section>
    </div>
  );
}

function ServiceCard(props: { icon: React.ReactNode; title: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">{props.icon}</div>
        <div className="text-sm font-semibold text-gray-900">{props.title}</div>
      </div>
    </div>
  );
}
