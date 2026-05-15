import type { Metadata } from "next";
import { getRequestLocale } from "@/lib/locale";
import { t as translate } from "@oneerp/i18n";
import { Reveal } from "@/components/Reveal";
import { LearningCenterClient } from "./LearningCenterClient";

export async function generateMetadata(): Promise<Metadata> {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const title = t("public.learning.seo.title");
  const description = t("public.learning.seo.description");
  return { title, description, openGraph: { title, description, type: "website" } };
}

export default async function LearningCenterPage() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  return (
    <div className="space-y-10">
      <Reveal>
        <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-accent-50" />
          <div className="relative p-10">
            <h1 className="text-3xl font-semibold">{t("public.learning.hero.title")}</h1>
            <p className="mt-2 text-gray-700">{t("public.learning.hero.subtitle")}</p>
          </div>
        </section>
      </Reveal>

      <LearningCenterClient />
    </div>
  );
}

