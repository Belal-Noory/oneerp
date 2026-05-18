import Link from "next/link";
import { t as translate } from "@oneerp/i18n";
import { getRequestLocale } from "@/lib/locale";
import { getApiBaseUrl } from "@/lib/api";
import { HeroGraphic, IconChart, IconGlobe, IconLayers, IconPuzzle, IconShield } from "@/components/Graphics";
import { Reveal } from "@/components/Reveal";

type TutorialCard = { slug: string; title_en: string; title_dr: string; title_ps: string; thumbnail_url: string | null; difficulty: string; language: string; views: number };

export default async function HomePage() {
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const tutorials = await fetchHomeTutorials().catch(() => ({ featured: [] as TutorialCard[], latest: [] as TutorialCard[] }));

  return (
    <div className="space-y-16">
      <Reveal>
        <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-accent-50" />
          <div className="relative grid gap-10 p-10 md:grid-cols-2 md:items-center">
            <div className="space-y-6">
              <h1 className="text-4xl font-semibold tracking-tight">{t("public.home.hero.title")}</h1>
              <p className="text-lg text-gray-700">{t("public.home.hero.subtitle")}</p>
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/register"
                  className="inline-flex h-10 items-center rounded-md bg-primary-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 hover:shadow-md"
                >
                  {t("public.home.hero.ctaPrimary")}
                </Link>
                <Link
                  href="/modules"
                  className="inline-flex h-10 items-center rounded-md border border-gray-300 bg-white px-4 text-sm font-medium text-gray-900 transition hover:bg-gray-50 hover:shadow-sm"
                >
                  {t("public.home.hero.ctaSecondary")}
                </Link>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-5">
                <div className="text-sm font-semibold text-amber-900">{t("public.promo.hero.title")}</div>
                <div className="mt-3 grid gap-2 text-sm text-amber-900/80">
                  <div className="flex items-start gap-2">
                    <span className="mt-[3px] h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span>{t("public.promo.hero.bullet.default5")}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-[3px] h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span>{t("public.promo.hero.bullet.referral10")}</span>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="mt-[3px] h-1.5 w-1.5 rounded-full bg-amber-500" />
                    <span>{t("public.promo.hero.bullet.bundle25")}</span>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Link
                    href="/register"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
                  >
                    {t("public.promo.hero.cta.requestActivation")}
                  </Link>
                  <Link
                    href="/pricing"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-amber-200 bg-white px-4 text-sm font-medium text-amber-900 hover:bg-amber-50"
                  >
                    {t("public.promo.hero.cta.learnMore")}
                  </Link>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white/70 p-6 backdrop-blur">
              <div className="aspect-[16/10] w-full overflow-hidden rounded-xl">
                <div className="mkt-float h-full w-full">
                  <HeroGraphic />
                </div>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      <section className="space-y-6">
        <Reveal>
          <h2 className="text-2xl font-semibold">{t("public.home.benefits.title")}</h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-3">
          <Reveal delayMs={0}>
            <Benefit t={t} titleKey="public.home.benefits.multitenant.title" descKey="public.home.benefits.multitenant.desc" />
          </Reveal>
          <Reveal delayMs={70}>
            <Benefit t={t} titleKey="public.home.benefits.modular.title" descKey="public.home.benefits.modular.desc" />
          </Reveal>
          <Reveal delayMs={140}>
            <Benefit t={t} titleKey="public.home.benefits.reporting.title" descKey="public.home.benefits.reporting.desc" />
          </Reveal>
          <Reveal delayMs={210}>
            <Benefit t={t} titleKey="public.home.benefits.localization.title" descKey="public.home.benefits.localization.desc" />
          </Reveal>
          <Reveal delayMs={280}>
            <Benefit t={t} titleKey="public.home.benefits.security.title" descKey="public.home.benefits.security.desc" />
          </Reveal>
        </div>
      </section>

      <section className="space-y-6">
        <Reveal>
          <h2 className="text-2xl font-semibold">{t("public.home.howItWorks.title")}</h2>
        </Reveal>
        <div className="grid gap-4 md:grid-cols-3">
          <Reveal delayMs={0}>
            <Step t={t} index={1} titleKey="public.home.howItWorks.step1.title" descKey="public.home.howItWorks.step1.desc" />
          </Reveal>
          <Reveal delayMs={90}>
            <Step t={t} index={2} titleKey="public.home.howItWorks.step2.title" descKey="public.home.howItWorks.step2.desc" />
          </Reveal>
          <Reveal delayMs={180}>
            <Step t={t} index={3} titleKey="public.home.howItWorks.step3.title" descKey="public.home.howItWorks.step3.desc" />
          </Reveal>
        </div>
      </section>

      <section className="space-y-6">
        <Reveal>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-2xl font-semibold">{t("public.learning.home.title")}</h2>
            <Link
              href="/learning-center"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              {t("public.learning.home.viewAll")}
            </Link>
          </div>
        </Reveal>

        <div className="grid gap-4 md:grid-cols-3">
          {(tutorials.featured.length ? tutorials.featured : tutorials.latest).slice(0, 6).map((x, idx) => (
            <Reveal key={x.slug} delayMs={idx * 40}>
              <Link href={`/learning-center/${encodeURIComponent(x.slug)}`} className="block rounded-2xl border border-gray-200 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="relative overflow-hidden rounded-t-2xl bg-gray-100">
                  {x.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={x.thumbnail_url} alt="" className="h-40 w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="h-40 w-full" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 to-transparent" />
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow">
                      <svg className="h-5 w-5 translate-x-[1px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M10 8l6 4-6 4V8Z" fill="currentColor" />
                      </svg>
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  <div className="line-clamp-2 text-sm font-semibold text-gray-900">{pick(locale, x)}</div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-gray-700">
                    <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2">{t(`public.learning.difficulty.${x.difficulty}`)}</span>
                    <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2 tabular">
                      {t("public.learning.views")}: {x.views}
                    </span>
                  </div>
                  <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-primary-700">
                    <span>{t("public.learning.home.watch")}</span>
                    <ArrowRight />
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <Reveal>
        <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-10 shadow-card">
          <div className="absolute inset-0 bg-gradient-to-br from-amber-50 via-white to-primary-50" />
          <div className="relative grid gap-8 md:grid-cols-2 md:items-center">
            <div>
              <div className="text-2xl font-semibold">{t("public.referralPromo.title")}</div>
              <div className="mt-2 text-gray-700">{t("public.referralPromo.subtitle")}</div>
              <div className="mt-5 grid gap-2 text-sm text-gray-700">
                {[
                  t("public.referralPromo.feature.default5"),
                  t("public.referralPromo.feature.referral10"),
                  t("public.referralPromo.feature.bundle25"),
                  t("public.referralPromo.feature.rewards"),
                  t("public.referralPromo.feature.premium")
                ].map((x) => (
                  <div key={x} className="flex items-start gap-2">
                    <span className="mt-[3px] h-1.5 w-1.5 rounded-full bg-primary-600" />
                    <span>{x}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-gray-200 bg-white/70 p-6 backdrop-blur">
              <div className="text-sm font-semibold text-gray-900">{t("public.referralPromo.card.title")}</div>
              <div className="mt-2 text-sm text-gray-700">{t("public.referralPromo.card.subtitle")}</div>
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Link
                  href="/register"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                >
                  {t("public.referralPromo.cta.getStarted")}
                </Link>
                <Link
                  href="/pricing"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                >
                  {t("public.referralPromo.cta.learnMore")}
                </Link>
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="flex flex-col items-start justify-between gap-4 rounded-2xl border border-gray-200 bg-white p-8 shadow-card md:flex-row md:items-center">
          <div>
            <div className="text-lg font-semibold">{t("public.home.hero.title")}</div>
            <div className="text-gray-700">{t("public.home.hero.subtitle")}</div>
          </div>
          <Link
            href="/register"
            className="inline-flex h-10 items-center rounded-md bg-primary-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-primary-700 hover:shadow-md"
          >
            {t("common.button.getStarted")}
          </Link>
        </section>
      </Reveal>
    </div>
  );
}

function Benefit(props: { t: (key: string) => string; titleKey: string; descKey: string }) {
  const icon = getBenefitIcon(props.titleKey);
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          {icon}
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900">{props.t(props.titleKey)}</div>
      <div className="mt-1 text-sm text-gray-700">{props.t(props.descKey)}</div>
        </div>
      </div>
    </div>
  );
}

function Step(props: { t: (key: string) => string; index: number; titleKey: string; descKey: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-primary-50 text-sm font-semibold text-primary-700">
        {props.index}
      </div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{props.t(props.titleKey)}</div>
      <div className="mt-1 text-sm text-gray-700">{props.t(props.descKey)}</div>
    </div>
  );
}

function getBenefitIcon(titleKey: string) {
  if (titleKey.includes("multitenant")) return <IconLayers />;
  if (titleKey.includes("modular")) return <IconPuzzle />;
  if (titleKey.includes("reporting")) return <IconChart />;
  if (titleKey.includes("localization")) return <IconGlobe />;
  return <IconShield />;
}

function pick(locale: "en" | "fa" | "ps", obj: { title_en: string; title_dr: string; title_ps: string }) {
  if (locale === "fa") return obj.title_dr;
  if (locale === "ps") return obj.title_ps;
  return obj.title_en;
}

function joinUrl(base: string, path: string): string {
  if (path.startsWith("http")) return path;
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (b.endsWith("/api") && (p === "/api" || p.startsWith("/api/"))) {
    return `${b.slice(0, -4)}${p}`;
  }
  return `${b}${p}`;
}

async function fetchHomeTutorials(): Promise<{ featured: TutorialCard[]; latest: TutorialCard[] }> {
  const apiBase = getApiBaseUrl();
  const [featuredRes, latestRes] = await Promise.all([
    fetch(joinUrl(apiBase, "/api/public/tutorials?featured=1&sort=latest&page=1&pageSize=12"), { cache: "no-store" }),
    fetch(joinUrl(apiBase, "/api/public/tutorials?sort=latest&page=1&pageSize=12"), { cache: "no-store" })
  ]);
  const featuredJson = (await featuredRes.json().catch(() => null)) as { data?: TutorialCard[] } | null;
  const latestJson = (await latestRes.json().catch(() => null)) as { data?: TutorialCard[] } | null;
  const featured = Array.isArray(featuredJson?.data) ? featuredJson!.data.slice(0, 6) : [];
  const latest = Array.isArray(latestJson?.data) ? latestJson!.data.slice(0, 6) : [];
  return { featured, latest };
}

function ArrowRight() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="m13 6 6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
