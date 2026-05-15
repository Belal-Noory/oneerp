import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequestLocale } from "@/lib/locale";
import { getApiBaseUrl } from "@/lib/api";
import { t as translate } from "@oneerp/i18n";
import { Reveal } from "@/components/Reveal";
import { YouTubePlayerClient } from "./YouTubePlayerClient";

type TutorialDetail = {
  id: string;
  slug: string;
  tutorial_scope: string;
  module_id: string | null;
  category_id: string | null;
  series_id: string | null;
  step_no: number | null;
  order_no: number;
  title_en: string;
  title_dr: string;
  title_ps: string;
  description_en: string | null;
  description_dr: string | null;
  description_ps: string | null;
  youtube_video_id: string | null;
  thumbnail_url: string | null;
  difficulty: string;
  language: string;
  duration_sec: number | null;
  tags: string[];
  views: number;
  is_featured: boolean;
  category: null | { slug: string; icon: string; title_en: string; title_dr: string; title_ps: string };
  series: null | { slug: string; title_en: string; title_dr: string; title_ps: string };
  module: null | { id: string; name_key: string };
  related: Array<{ slug: string; title_en: string; title_dr: string; title_ps: string; thumbnail_url: string | null; difficulty: string; language: string; views: number }>;
  previous: null | { slug: string; title_en: string; title_dr: string; title_ps: string };
  next: null | { slug: string; title_en: string; title_dr: string; title_ps: string };
  continue_learning: Array<{ slug: string; title_en: string; title_dr: string; title_ps: string; step_no: number | null; thumbnail_url: string | null }>;
};

function joinUrl(base: string, path: string): string {
  if (path.startsWith("http")) return path;
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (b.endsWith("/api") && (p === "/api" || p.startsWith("/api/"))) {
    return `${b.slice(0, -4)}${p}`;
  }
  return `${b}${p}`;
}

function pick(locale: "en" | "fa" | "ps", obj: { title_en: string; title_dr: string; title_ps: string }) {
  if (locale === "fa") return obj.title_dr;
  if (locale === "ps") return obj.title_ps;
  return obj.title_en;
}

function pickDesc(locale: "en" | "fa" | "ps", obj: { description_en: string | null; description_dr: string | null; description_ps: string | null }) {
  if (locale === "fa") return obj.description_dr;
  if (locale === "ps") return obj.description_ps;
  return obj.description_en;
}

async function fetchTutorial(slug: string): Promise<TutorialDetail | null> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(joinUrl(apiBase, `/api/public/tutorials/${encodeURIComponent(slug)}`), { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { data?: TutorialDetail } | null;
  return json?.data ?? null;
}

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  const data = await fetchTutorial(slug);
  if (!data) return { title: t("errors.notFound"), robots: { index: false, follow: false } };

  const title = `${pick(locale, data)} — ${t("public.learning.seo.title")}`;
  const description = (pickDesc(locale, data) ?? t("public.learning.hero.subtitle")).slice(0, 160);
  return { title, description, openGraph: { title, description, type: "website" } };
}

export default async function TutorialDetailPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  const data = await fetchTutorial(slug);
  if (!data) notFound();

  const title = pick(locale, data);
  const desc = pickDesc(locale, data);

  return (
    <div className="space-y-10">
      <Reveal>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="text-sm text-gray-600">
              <Link href="/learning-center" className="hover:text-gray-900">
                {t("public.learning.breadcrumb")}
              </Link>
            </div>
            <h1 className="mt-2 text-3xl font-semibold">{title}</h1>
            {desc ? <p className="mt-3 text-gray-700">{desc}</p> : null}
            <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-gray-700">
              <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2">{t(`public.learning.difficulty.${data.difficulty}`)}</span>
              <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2">
                {data.language === "fa" ? t("common.language.fa") : data.language === "ps" ? t("common.language.ps") : t("common.language.en")}
              </span>
              {data.category ? <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2">{pick(locale, data.category)}</span> : null}
              {data.module ? <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2">{t(data.module.name_key)}</span> : null}
              <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2 tabular">
                {t("public.learning.views")}: {data.views}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {data.previous ? (
              <Link
                href={`/learning-center/${encodeURIComponent(data.previous.slug)}`}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              >
                {t("public.learning.previous")}
              </Link>
            ) : null}
            {data.next ? (
              <Link
                href={`/learning-center/${encodeURIComponent(data.next.slug)}`}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
              >
                {t("public.learning.next")}
              </Link>
            ) : null}
          </div>
        </div>
      </Reveal>

      <YouTubePlayerClient slug={data.slug} videoId={data.youtube_video_id} thumbnailUrl={data.thumbnail_url} title={title} />

      {data.continue_learning.length ? (
        <section className="space-y-4">
          <Reveal>
            <h2 className="text-xl font-semibold">{t("public.learning.continueLearning")}</h2>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {data.continue_learning.map((x, idx) => (
              <Reveal key={x.slug} delayMs={idx * 25}>
                <Link
                  href={`/learning-center/${encodeURIComponent(x.slug)}`}
                  className="block rounded-2xl border border-gray-200 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="overflow-hidden rounded-t-2xl bg-gray-100">
                    {x.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={x.thumbnail_url} alt="" className="h-36 w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="h-36 w-full" />
                    )}
                  </div>
                  <div className="p-5">
                    <div className="text-sm font-semibold text-gray-900">{pick(locale, x)}</div>
                    {x.step_no ? <div className="mt-2 text-xs text-gray-600 tabular">{t("public.learning.step")} {x.step_no}</div> : null}
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}

      {data.related.length ? (
        <section className="space-y-4">
          <Reveal>
            <h2 className="text-xl font-semibold">{t("public.learning.related")}</h2>
          </Reveal>
          <div className="grid gap-4 md:grid-cols-3">
            {data.related.map((x, idx) => (
              <Reveal key={x.slug} delayMs={idx * 25}>
                <Link
                  href={`/learning-center/${encodeURIComponent(x.slug)}`}
                  className="block rounded-2xl border border-gray-200 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <div className="overflow-hidden rounded-t-2xl bg-gray-100">
                    {x.thumbnail_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={x.thumbnail_url} alt="" className="h-36 w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="h-36 w-full" />
                    )}
                  </div>
                  <div className="p-5">
                    <div className="text-sm font-semibold text-gray-900">{pick(locale, x)}</div>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-700">
                      <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2">{t(`public.learning.difficulty.${x.difficulty}`)}</span>
                      <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2 tabular">
                        {t("public.learning.views")}: {x.views}
                      </span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}

