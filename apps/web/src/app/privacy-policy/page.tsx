import type { Metadata } from "next";
import Link from "next/link";
import { getRequestLocale } from "@/lib/locale";
import { t as translate } from "@oneerp/i18n";
import { Reveal } from "@/components/Reveal";
import { IconCloud, IconEyeOff, IconLock, IconMail, IconShield, IconUserCheck } from "@/components/Graphics";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const title = t("public.privacy.seo.title");
  const description = t("public.privacy.seo.description");
  return {
    title,
    description,
    openGraph: { title, description, type: "website" }
  };
}

export default async function PrivacyPolicyPage() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  return (
    <div className="space-y-12">
      <Reveal>
        <section className="rounded-2xl border border-gray-200 bg-white p-10 shadow-card">
          <h1 className="text-3xl font-semibold">{t("public.privacy.title")}</h1>
          <p className="mt-3 text-gray-700">{t("public.privacy.subtitle")}</p>
        </section>
      </Reveal>

      <section className="grid gap-4 md:grid-cols-2">
        <Reveal delayMs={0}>
          <PolicyCard icon={<IconEyeOff />} title={t("public.privacy.section.introduction.title")} desc={t("public.privacy.section.introduction.desc")} />
        </Reveal>
        <Reveal delayMs={70}>
          <PolicyCard icon={<IconMail />} title={t("public.privacy.section.dataCollection.title")} desc={t("public.privacy.section.dataCollection.desc")} />
        </Reveal>
        <Reveal delayMs={140}>
          <PolicyCard icon={<IconLock />} title={t("public.privacy.section.dataProtection.title")} desc={t("public.privacy.section.dataProtection.desc")} />
        </Reveal>
        <Reveal delayMs={210}>
          <PolicyCard icon={<IconShield />} title={t("public.privacy.section.confidentiality.title")} desc={t("public.privacy.section.confidentiality.desc")} />
        </Reveal>
        <Reveal delayMs={280}>
          <PolicyCard icon={<IconCloud />} title={t("public.privacy.section.thirdParty.title")} desc={t("public.privacy.section.thirdParty.desc")} />
        </Reveal>
        <Reveal delayMs={350}>
          <PolicyCard icon={<IconUserCheck />} title={t("public.privacy.section.userRights.title")} desc={t("public.privacy.section.userRights.desc")} />
        </Reveal>
      </section>

      <Reveal>
        <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
          <div className="text-lg font-semibold">{t("public.privacy.section.contact.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("public.privacy.section.contact.desc")}</div>
          <div className="mt-4">
            <Link
              href="/contact"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
            >
              {t("public.privacy.section.contact.cta")}
            </Link>
          </div>
        </section>
      </Reveal>
    </div>
  );
}

function PolicyCard(props: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">{props.icon}</div>
        <div className="min-w-0">
          <div className="text-sm font-semibold text-gray-900">{props.title}</div>
          <div className="mt-1 text-sm text-gray-700">{props.desc}</div>
        </div>
      </div>
    </div>
  );
}

