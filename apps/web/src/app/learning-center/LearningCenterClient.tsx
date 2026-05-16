"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useClientI18n } from "@/lib/client-i18n";
import { getApiBaseUrl } from "@/lib/api";
import { Reveal } from "@/components/Reveal";

type TutorialCategory = { id: string; slug: string; icon: string; tutorial_scope: string; module_id: string | null; title_en: string; title_dr: string; title_ps: string; order_no: number };
type TutorialSeries = { id: string; slug: string; tutorial_scope: string; module_id: string | null; category_id: string | null; title_en: string; title_dr: string; title_ps: string; order_no: number };
type PublicModule = { id: string; name_key: string; description_key: string; category: string; icon: string; is_active: boolean };

type TutorialCard = {
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
  thumbnail_url: string | null;
  difficulty: string;
  language: string;
  duration_sec: number | null;
  tags: string[];
  views: number;
  is_featured: boolean;
  created_at: string;
};

type ListResponse = { data: TutorialCard[]; meta: { page: number; pageSize: number; total: number } };

function joinUrl(base: string, path: string): string {
  if (path.startsWith("http")) return path;
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (b.endsWith("/api") && (p === "/api" || p.startsWith("/api/"))) {
    return `${b.slice(0, -4)}${p}`;
  }
  return `${b}${p}`;
}

function formatDuration(sec: number | null): string | null {
  if (!sec || sec <= 0) return null;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
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

export function LearningCenterClient() {
  const { t, locale } = useClientI18n();
  const searchParams = useSearchParams();
  const [categories, setCategories] = useState<TutorialCategory[]>([]);
  const [series, setSeries] = useState<TutorialSeries[]>([]);
  const [modules, setModules] = useState<PublicModule[]>([]);

  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"all" | "general" | "module">("all");
  const [moduleId, setModuleId] = useState<string>("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [seriesId, setSeriesId] = useState<string>("all");
  const [difficulty, setDifficulty] = useState<string>("all");
  const [language, setLanguage] = useState<string>("all");
  const [sort, setSort] = useState<"latest" | "mostViewed">("latest");

  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [items, setItems] = useState<TutorialCard[]>([]);
  const [meta, setMeta] = useState<{ page: number; pageSize: number; total: number }>({ page: 1, pageSize: 24, total: 0 });
  const [errorKey, setErrorKey] = useState<string | null>(null);

  useEffect(() => {
    const scopeParam = (searchParams.get("scope") ?? "").trim();
    const moduleIdParam = (searchParams.get("moduleId") ?? "").trim();
    if (scopeParam === "general" || scopeParam === "module") setScope(scopeParam);
    if (moduleIdParam) setModuleId(moduleIdParam);
    const qParam = (searchParams.get("q") ?? "").trim();
    if (qParam) setQ(qParam);
    const catParam = (searchParams.get("categoryId") ?? "").trim();
    if (catParam) setCategoryId(catParam);
    const seriesParam = (searchParams.get("seriesId") ?? "").trim();
    if (seriesParam) setSeriesId(seriesParam);
    const diffParam = (searchParams.get("difficulty") ?? "").trim();
    if (diffParam) setDifficulty(diffParam);
    const langParam = (searchParams.get("language") ?? "").trim();
    if (langParam) setLanguage(langParam);
    const sortParam = (searchParams.get("sort") ?? "").trim();
    if (sortParam === "latest" || sortParam === "mostViewed") setSort(sortParam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const apiBase = getApiBaseUrl();
        const modRes = await fetch(joinUrl(apiBase, "/api/public/modules"), { cache: "no-store" });
        const modJson = (await modRes.json().catch(() => null)) as { data?: PublicModule[] } | null;
        if (!cancelled) {
          setModules(Array.isArray(modJson?.data) ? modJson!.data : []);
        }
      } catch {
        if (!cancelled) {
          setCategories([]);
          setSeries([]);
          setModules([]);
        }
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (scope !== "module") setModuleId("all");
    setCategoryId("all");
    setSeriesId("all");
  }, [scope]);

  useEffect(() => {
    setCategoryId("all");
    setSeriesId("all");
  }, [moduleId]);

  useEffect(() => {
    setSeriesId("all");
  }, [categoryId]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const apiBase = getApiBaseUrl();
        const params = new URLSearchParams();
        if (scope !== "all") params.set("scope", scope);
        if (scope === "module" && moduleId !== "all") params.set("moduleId", moduleId);
        const res = await fetch(joinUrl(apiBase, `/api/public/tutorial-categories?${params.toString()}`), { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { data?: TutorialCategory[] } | null;
        if (!cancelled) setCategories(Array.isArray(json?.data) ? json!.data : []);
      } catch {
        if (!cancelled) setCategories([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [moduleId, scope]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const apiBase = getApiBaseUrl();
        const params = new URLSearchParams();
        if (scope !== "all") params.set("scope", scope);
        if (scope === "module" && moduleId !== "all") params.set("moduleId", moduleId);
        if (categoryId !== "all") params.set("categoryId", categoryId);
        const res = await fetch(joinUrl(apiBase, `/api/public/tutorial-series?${params.toString()}`), { cache: "no-store" });
        const json = (await res.json().catch(() => null)) as { data?: TutorialSeries[] } | null;
        if (!cancelled) setSeries(Array.isArray(json?.data) ? json!.data : []);
      } catch {
        if (!cancelled) setSeries([]);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [categoryId, moduleId, scope]);

  const fetchPage = useCallback(
    async (page: number, mode: "replace" | "append") => {
      const apiBase = getApiBaseUrl();
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (scope !== "all") params.set("scope", scope);
      if (scope === "module" && moduleId !== "all") params.set("moduleId", moduleId);
      if (categoryId !== "all") params.set("categoryId", categoryId);
      if (seriesId !== "all") params.set("seriesId", seriesId);
      if (difficulty !== "all") params.set("difficulty", difficulty);
      if (language !== "all") params.set("language", language);
      params.set("sort", sort);
      params.set("page", String(page));
      params.set("pageSize", String(meta.pageSize));
      const url = joinUrl(apiBase, `/api/public/tutorials?${params.toString()}`);
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) throw new Error("failed");
      const json = (await res.json()) as ListResponse;
      const next = Array.isArray(json.data) ? json.data : [];
      setMeta(json.meta ?? { page, pageSize: meta.pageSize, total: next.length });
      setItems((prev) => (mode === "append" ? [...prev, ...next] : next));
    },
    [categoryId, difficulty, language, meta.pageSize, moduleId, q, scope, seriesId, sort]
  );

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setErrorKey(null);
      try {
        await fetchPage(1, "replace");
      } catch {
        if (!cancelled) setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  const canLoadMore = items.length < meta.total;

  const categoryOptions = useMemo(() => [{ id: "all", label: t("public.learning.filter.allCategories") }, ...categories.map((c) => ({ id: c.id, label: pick(locale, c) }))], [categories, locale, t]);

  const moduleOptions = useMemo(() => [{ id: "all", label: t("public.learning.filter.allModules") }, ...modules.map((m) => ({ id: m.id, label: t(m.name_key) }))], [modules, t]);

  const seriesOptions = useMemo(() => [{ id: "all", label: t("public.learning.filter.allSeries") }, ...series.map((s) => ({ id: s.id, label: pick(locale, s) }))], [locale, series, t]);

  return (
    <div className="space-y-10">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="grid gap-3 md:grid-cols-12 md:items-end">
          <div className="md:col-span-4">
            <label className="block text-sm font-medium text-gray-900">{t("public.learning.search.label")}</label>
            <input
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none transition focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("public.learning.search.placeholder")}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900">{t("public.learning.filter.scope")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={scope}
              onChange={(e) => setScope(e.target.value as "all" | "general" | "module")}
            >
              <option value="all">{t("public.learning.filter.allScopes")}</option>
              <option value="general">{t("public.learning.scope.general")}</option>
              <option value="module">{t("public.learning.scope.module")}</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900">{t("public.learning.filter.module")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
              value={moduleId}
              onChange={(e) => setModuleId(e.target.value)}
              disabled={scope !== "module"}
            >
              {moduleOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900">{t("public.learning.filter.category")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
            >
              {categoryOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900">{t("public.learning.filter.sort")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={sort}
              onChange={(e) => setSort(e.target.value as "latest" | "mostViewed")}
            >
              <option value="latest">{t("public.learning.sort.latest")}</option>
              <option value="mostViewed">{t("public.learning.sort.mostViewed")}</option>
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-3 md:grid-cols-12">
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-900">{t("public.learning.filter.difficulty")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="all">{t("public.learning.filter.allDifficulties")}</option>
              <option value="beginner">{t("public.learning.difficulty.beginner")}</option>
              <option value="intermediate">{t("public.learning.difficulty.intermediate")}</option>
              <option value="advanced">{t("public.learning.difficulty.advanced")}</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-900">{t("public.learning.filter.language")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
            >
              <option value="all">{t("public.learning.filter.allLanguages")}</option>
              <option value="en">{t("common.language.en")}</option>
              <option value="fa">{t("common.language.fa")}</option>
              <option value="ps">{t("common.language.ps")}</option>
            </select>
          </div>
          <div className="md:col-span-3">
            <label className="block text-sm font-medium text-gray-900">{t("public.learning.filter.series")}</label>
            <select
              className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={seriesId}
              onChange={(e) => setSeriesId(e.target.value)}
            >
              {seriesOptions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-3 md:flex md:items-end md:justify-end">
            <div className="mt-3 text-sm text-gray-600 md:mt-0">
              {t("public.learning.results")}: <span className="font-semibold text-gray-900 tabular">{meta.total}</span>
            </div>
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 9 }).map((_, i) => (
            <div key={i} className="h-64 rounded-2xl border border-gray-200 bg-white shadow-card" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <Reveal>
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
            <div className="text-lg font-semibold">{t("public.learning.empty.title")}</div>
            <div className="mt-2 text-gray-700">{t("public.learning.empty.subtitle")}</div>
          </div>
        </Reveal>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {items.map((it, idx) => (
            <Reveal key={it.id} delayMs={idx * 25}>
              <Link href={`/learning-center/${encodeURIComponent(it.slug)}`} className="block rounded-2xl border border-gray-200 bg-white shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="relative overflow-hidden rounded-t-2xl bg-gray-100">
                  {it.thumbnail_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.thumbnail_url} alt="" className="h-44 w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="h-44 w-full" />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                  <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center rounded-full bg-white/90 px-2 py-1 text-[11px] font-semibold text-gray-900">
                      {t(it.tutorial_scope === "module" ? "public.learning.scope.module" : "public.learning.scope.general")}
                    </span>
                    {formatDuration(it.duration_sec) ? (
                      <span className="inline-flex items-center rounded-full bg-black/60 px-2 py-1 text-[11px] font-semibold text-white tabular">{formatDuration(it.duration_sec)}</span>
                    ) : null}
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow">
                      <PlayIcon />
                    </div>
                  </div>
                </div>

                <div className="p-5">
                  <div className="line-clamp-2 text-sm font-semibold text-gray-900">{pick(locale, it)}</div>
                  <div className="mt-2 line-clamp-2 text-sm text-gray-700">{pickDesc(locale, it) ?? "—"}</div>

                  <div className="mt-4 flex flex-wrap items-center gap-2">
                    <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2 text-xs text-gray-700">
                      {t(`public.learning.difficulty.${it.difficulty}`)}
                    </span>
                    <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2 text-xs text-gray-700">
                      {it.language === "fa" ? t("common.language.fa") : it.language === "ps" ? t("common.language.ps") : t("common.language.en")}
                    </span>
                    <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2 text-xs text-gray-700 tabular">
                      {t("public.learning.views")}: {it.views}
                    </span>
                  </div>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      )}

      {canLoadMore ? (
        <div className="flex justify-center">
          <button
            type="button"
            disabled={loadingMore}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-6 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50 disabled:opacity-60"
            onClick={async () => {
              setLoadingMore(true);
              try {
                await fetchPage(meta.page + 1, "append");
              } catch {
                setErrorKey("errors.internal");
              } finally {
                setLoadingMore(false);
              }
            }}
          >
            {loadingMore ? t("common.loading") : t("public.learning.loadMore")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg className="h-5 w-5 translate-x-[1px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 8l6 4-6 4V8Z" fill="currentColor" />
    </svg>
  );
}
