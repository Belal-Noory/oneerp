import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/locale";
import { t as translate } from "@oneerp/i18n";
import { Reveal } from "@/components/Reveal";
import { IconBadge, IconBan, IconFileCheck, IconMonitor, IconRefresh, IconShield } from "@/components/Graphics";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const title = t("public.terms.seo.title");
  const description = t("public.terms.seo.description");
  return {
    title,
    description,
    openGraph: { title, description, type: "website" }
  };
}

export default async function TermsAndConditionsPage() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  return (
    <div className="space-y-12">
      <Reveal>
        <section className="rounded-2xl border border-gray-200 bg-white p-10 shadow-card">
          <h1 className="text-3xl font-semibold">{t("public.terms.title")}</h1>
          <p className="mt-3 text-gray-700">{t("public.terms.subtitle")}</p>
        </section>
      </Reveal>

      <section className="grid gap-4 md:grid-cols-2">
        <Reveal delayMs={0}>
          <TermsCard icon={<IconFileCheck />} title={t("public.terms.section.acceptance.title")} desc={t("public.terms.section.acceptance.desc")} />
        </Reveal>
        <Reveal delayMs={70}>
          <TermsCard icon={<IconMonitor />} title={t("public.terms.section.usage.title")} desc={t("public.terms.section.usage.desc")} />
        </Reveal>
        <Reveal delayMs={140}>
          <TermsCard icon={<IconShield />} title={t("public.terms.section.accountResponsibility.title")} desc={t("public.terms.section.accountResponsibility.desc")} />
        </Reveal>
        <Reveal delayMs={210}>
          <TermsCard icon={<IconRefresh />} title={t("public.terms.section.serviceAvailability.title")} desc={t("public.terms.section.serviceAvailability.desc")} />
        </Reveal>
        <Reveal delayMs={280}>
          <TermsCard icon={<IconBadge />} title={t("public.terms.section.intellectualProperty.title")} desc={t("public.terms.section.intellectualProperty.desc")} />
        </Reveal>
        <Reveal delayMs={350}>
          <TermsCard icon={<IconBan />} title={t("public.terms.section.prohibitedActivities.title")} desc={t("public.terms.section.prohibitedActivities.desc")} />
        </Reveal>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <Reveal delayMs={0}>
          <TermsCard icon={<IconShield />} title={t("public.terms.section.termination.title")} desc={t("public.terms.section.termination.desc")} />
        </Reveal>
        <Reveal delayMs={70}>
          <TermsCard icon={<IconRefresh />} title={t("public.terms.section.changesToTerms.title")} desc={t("public.terms.section.changesToTerms.desc")} />
        </Reveal>
      </section>
    </div>
  );
}

function TermsCard(props: { icon: React.ReactNode; title: string; desc: string }) {
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

