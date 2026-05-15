import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getRequestLocale } from "@/lib/locale";
import { getApiBaseUrl } from "@/lib/api";
import { t as translate } from "@oneerp/i18n";
import { Reveal } from "@/components/Reveal";

type PublicModule = { id: string; version: string; name_key: string; description_key: string; category: string; icon: string; is_active: boolean };
type TutorialCard = { slug: string; title_en: string; title_dr: string; title_ps: string; thumbnail_url: string | null; difficulty: string; language: string; views: number };

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

async function fetchModule(moduleId: string): Promise<PublicModule | null> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(joinUrl(apiBase, "/api/public/modules"), { cache: "no-store" });
  if (!res.ok) return null;
  const json = (await res.json().catch(() => null)) as { data?: PublicModule[] } | null;
  const list = Array.isArray(json?.data) ? json!.data : [];
  return list.find((m) => m.id === moduleId) ?? null;
}

async function fetchTutorials(moduleId: string): Promise<TutorialCard[]> {
  const apiBase = getApiBaseUrl();
  const res = await fetch(joinUrl(apiBase, `/api/public/tutorials?scope=module&moduleId=${encodeURIComponent(moduleId)}&sort=latest&page=1&pageSize=12`), { cache: "no-store" });
  const json = (await res.json().catch(() => null)) as { data?: TutorialCard[] } | null;
  return Array.isArray(json?.data) ? json!.data : [];
}

export async function generateMetadata(props: { params: Promise<{ moduleId: string }> }): Promise<Metadata> {
  const { moduleId } = await props.params;
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const mod = await fetchModule(moduleId);
  if (!mod) return { title: t("errors.notFound"), robots: { index: false, follow: false } };
  const title = `${t(mod.name_key)} — ${t("public.modules.title")}`;
  const description = t(mod.description_key);
  return { title, description, openGraph: { title, description, type: "website" } };
}

export default async function PublicModuleDetailPage(props: { params: Promise<{ moduleId: string }> }) {
  const { moduleId } = await props.params;
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);

  const mod = await fetchModule(moduleId);
  if (!mod) notFound();

  const tutorials = await fetchTutorials(moduleId);

  return (
    <div className="space-y-10">
      <Reveal>
        <section className="rounded-2xl border border-gray-200 bg-white p-10 shadow-card">
          <div className="text-sm text-gray-600">
            <Link href="/modules" className="hover:text-gray-900">
              {t("public.modules.title")}
            </Link>
          </div>
          <h1 className="mt-2 text-3xl font-semibold">{t(mod.name_key)}</h1>
          <p className="mt-3 text-gray-700">{t(mod.description_key)}</p>
        </section>
      </Reveal>

      <section className="space-y-4">
        <Reveal>
          <div className="flex items-center justify-between gap-4">
            <h2 className="text-xl font-semibold">{t("public.learning.moduleSectionTitle")}</h2>
            <Link
              href={`/learning-center?scope=module&moduleId=${encodeURIComponent(moduleId)}`}
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
            >
              {t("public.learning.viewAll")}
            </Link>
          </div>
        </Reveal>

        {tutorials.length === 0 ? (
          <Reveal>
            <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
              <div className="text-gray-700">{t("public.learning.moduleEmpty")}</div>
            </div>
          </Reveal>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {tutorials.map((x, idx) => (
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
        )}
      </section>
    </div>
  );
}

