"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { Modal } from "@/components/Modal";
import { t as translate } from "@oneerp/i18n";

type PublicModule = { id: string; name_key: string; description_key: string; category: string; icon: string; is_active: boolean };
type Category = { id: string; slug: string; icon: string; tutorial_scope: string; module_id: string | null; title_en: string; title_dr: string; title_ps: string; is_active: boolean };
type Series = { id: string; slug: string; tutorial_scope: string; module_id: string | null; category_id: string | null; title_en: string; title_dr: string; title_ps: string; is_active: boolean; thumbnail_url: string | null };

type Tutorial = {
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
  youtube_url: string;
  thumbnail_url: string | null;
  youtube_video_id: string | null;
  difficulty: string;
  language: string;
  duration_sec: number | null;
  tags: string[];
  views: number;
  visibility: string;
  is_featured: boolean;
  is_active: boolean;
  updated_at: string;
};

type ListResponse<T> = { data: T[]; meta?: { page: number; pageSize: number; total: number } };

const emptyForm = {
  id: null as string | null,
  slug: "",
  scope: "general",
  moduleId: "",
  categoryId: "",
  seriesId: "",
  stepNo: "",
  orderNo: "0",
  titleEn: "",
  titleFa: "",
  titlePs: "",
  descriptionEn: "",
  descriptionFa: "",
  descriptionPs: "",
  youtubeUrl: "",
  thumbnailUrl: "",
  difficulty: "beginner",
  language: "en",
  durationSec: "",
  tags: "",
  visibility: "public",
  isFeatured: false,
  isActive: true,
  relatedSlugs: ""
};

function toSlug(value: string): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 80);
}

export function OwnerTutorialsClient() {
  const t = (key: string) => translate("en", key);

  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [items, setItems] = useState<Tutorial[]>([]);

  const [modules, setModules] = useState<PublicModule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [series, setSeries] = useState<Series[]>([]);

  const [q, setQ] = useState("");
  const [scope, setScope] = useState<string>("all");
  const [visibility, setVisibility] = useState<string>("all");
  const [featured, setFeatured] = useState<string>("all");

  const [editOpen, setEditOpen] = useState(false);
  const [form, setForm] = useState({ ...emptyForm });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const moduleById = useMemo(() => new Map(modules.map((m) => [m.id, m])), [modules]);
  const categoryById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const seriesById = useMemo(() => new Map(series.map((s) => [s.id, s])), [series]);

  const formCategories = useMemo(() => {
    return categories
      .filter((c) => {
        if (!c.is_active) return false;
        if (c.tutorial_scope !== form.scope) return false;
        if (form.scope === "module") {
          if (!form.moduleId) return true;
          return c.module_id === form.moduleId || c.module_id === null;
        }
        return true;
      })
      .sort((a, b) => a.title_en.localeCompare(b.title_en));
  }, [categories, form.moduleId, form.scope]);

  const formSeries = useMemo(() => {
    return series
      .filter((s) => {
        if (!s.is_active) return false;
        if (s.tutorial_scope !== form.scope) return false;
        if (form.scope === "module") {
          if (!form.moduleId) return true;
          if (!(s.module_id === form.moduleId || s.module_id === null)) return false;
        }
        if (form.categoryId) return s.category_id === form.categoryId;
        return true;
      })
      .sort((a, b) => a.title_en.localeCompare(b.title_en));
  }, [form.categoryId, form.moduleId, form.scope, series]);

  async function loadLookups() {
    const [modsRes, catRes, seriesRes] = await Promise.all([
      apiFetch("/api/owner/modules", { cache: "no-store" }),
      apiFetch("/api/owner/tutorial-categories", { cache: "no-store" }),
      apiFetch("/api/owner/tutorial-series", { cache: "no-store" })
    ]);
    const modsJson = (await modsRes.json().catch(() => null)) as { data?: PublicModule[] } | null;
    const catJson = (await catRes.json().catch(() => null)) as { data?: Category[] } | null;
    const seriesJson = (await seriesRes.json().catch(() => null)) as { data?: Series[] } | null;
    setModules(Array.isArray(modsJson?.data) ? modsJson!.data : []);
    setCategories(Array.isArray(catJson?.data) ? catJson!.data : []);
    setSeries(Array.isArray(seriesJson?.data) ? seriesJson!.data : []);
  }

  async function reload() {
    setLoading(true);
    setErrorKey(null);
    try {
      await loadLookups();
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      if (scope !== "all") params.set("scope", scope);
      if (visibility !== "all") params.set("visibility", visibility);
      if (featured !== "all") params.set("featured", featured === "featured" ? "1" : "0");
      const res = await apiFetch(`/api/owner/tutorials?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        setErrorKey("errors.internal");
        return;
      }
      const json = (await res.json()) as ListResponse<Tutorial>;
      setItems(Array.isArray(json.data) ? json.data : []);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openCreate = () => {
    setForm({ ...emptyForm });
    setEditOpen(true);
  };

  const openEdit = (it: Tutorial) => {
    setForm({
      id: it.id,
      slug: it.slug,
      scope: it.tutorial_scope,
      moduleId: it.module_id ?? "",
      categoryId: it.category_id ?? "",
      seriesId: it.series_id ?? "",
      stepNo: it.step_no ? String(it.step_no) : "",
      orderNo: String(it.order_no ?? 0),
      titleEn: it.title_en,
      titleFa: it.title_dr,
      titlePs: it.title_ps,
      descriptionEn: it.description_en ?? "",
      descriptionFa: it.description_dr ?? "",
      descriptionPs: it.description_ps ?? "",
      youtubeUrl: it.youtube_url,
      thumbnailUrl: it.thumbnail_url ?? "",
      difficulty: it.difficulty,
      language: it.language,
      durationSec: it.duration_sec ? String(it.duration_sec) : "",
      tags: Array.isArray(it.tags) ? it.tags.join(", ") : "",
      visibility: it.visibility,
      isFeatured: it.is_featured,
      isActive: it.is_active,
      relatedSlugs: ""
    });
    setEditOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setErrorKey(null);
    try {
      const relatedSlugs = form.relatedSlugs
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const tags = form.tags
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean);
      const payload = {
        slug: form.slug,
        scope: form.scope,
        moduleId: form.scope === "module" ? (form.moduleId || undefined) : undefined,
        categoryId: form.categoryId || undefined,
        seriesId: form.seriesId || undefined,
        stepNo: form.seriesId && form.stepNo ? Number(form.stepNo) : undefined,
        orderNo: form.orderNo ? Number(form.orderNo) : undefined,
        titleEn: form.titleEn,
        titleFa: form.titleFa,
        titlePs: form.titlePs,
        descriptionEn: form.descriptionEn || undefined,
        descriptionFa: form.descriptionFa || undefined,
        descriptionPs: form.descriptionPs || undefined,
        youtubeUrl: form.youtubeUrl,
        thumbnailUrl: form.thumbnailUrl || undefined,
        difficulty: form.difficulty,
        language: form.language,
        durationSec: form.durationSec ? Number(form.durationSec) : undefined,
        tags: tags.length ? tags : undefined,
        visibility: form.visibility,
        isFeatured: form.isFeatured,
        isActive: form.isActive,
        relatedSlugs: relatedSlugs.length ? relatedSlugs : undefined
      };

      const res = await apiFetch(form.id ? `/api/owner/tutorials/${encodeURIComponent(form.id)}` : "/api/owner/tutorials", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        setErrorKey("errors.validationError");
        return;
      }
      setEditOpen(false);
      await reload();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!id) return;
    setDeletingId(id);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/owner/tutorials/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        setErrorKey("errors.internal");
        return;
      }
      await reload();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.owner.tutorials.title")}</div>
            <div className="mt-2 text-sm text-gray-700">{t("app.owner.tutorials.subtitle")}</div>
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
              <Link className="text-primary-700 hover:text-primary-800" href="/tutorials/categories">
                {t("app.owner.tutorials.manageCategories")}
              </Link>
              <Link className="text-primary-700 hover:text-primary-800" href="/tutorials/series">
                {t("app.owner.tutorials.manageSeries")}
              </Link>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => void reload()} disabled={loading}>
              {t("common.button.refresh")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700" onClick={openCreate}>
              {t("app.owner.tutorials.create")}
            </button>
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="grid gap-3 md:grid-cols-12 md:items-end">
          <div className="md:col-span-6">
            <label className="block text-sm font-medium text-gray-900">{t("common.button.search")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("app.owner.tutorials.searchPlaceholder")} />
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900">{t("app.owner.tutorials.filter.scope")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={scope} onChange={(e) => setScope(e.target.value)}>
              <option value="all">{t("common.all")}</option>
              <option value="general">{t("public.learning.scope.general")}</option>
              <option value="module">{t("public.learning.scope.module")}</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900">{t("app.owner.tutorials.filter.visibility")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={visibility} onChange={(e) => setVisibility(e.target.value)}>
              <option value="all">{t("common.all")}</option>
              <option value="public">{t("app.owner.tutorials.visibility.public")}</option>
              <option value="private">{t("app.owner.tutorials.visibility.private")}</option>
              <option value="draft">{t("app.owner.tutorials.visibility.draft")}</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-gray-900">{t("app.owner.tutorials.filter.featured")}</label>
            <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={featured} onChange={(e) => setFeatured(e.target.value)}>
              <option value="all">{t("common.all")}</option>
              <option value="featured">{t("app.owner.tutorials.featured")}</option>
              <option value="notFeatured">{t("app.owner.tutorials.notFeatured")}</option>
            </select>
          </div>
          <div className="md:col-span-12 md:flex md:justify-end">
            <button type="button" className="mt-3 inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50 md:mt-0" onClick={() => void reload()} disabled={loading}>
              {t("app.owner.tutorials.applyFilters")}
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[1100px] w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.tutorials.table.tutorial")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.tutorials.table.scope")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.tutorials.table.module")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.tutorials.table.category")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.tutorials.table.status")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.owner.tutorials.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={6}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={6}>
                    {t("app.owner.tutorials.empty")}
                  </td>
                </tr>
              ) : (
                items.map((it) => {
                  const mod = it.module_id ? moduleById.get(it.module_id) : null;
                  const cat = it.category_id ? categoryById.get(it.category_id) : null;
                  const seriesItem = it.series_id ? seriesById.get(it.series_id) : null;
                  return (
                    <tr key={it.id}>
                      <td className="border-b border-gray-100 px-4 py-3">
                        <div className="font-semibold text-gray-900">{it.title_en}</div>
                        <div className="mt-1 text-xs text-gray-600">{it.slug}</div>
                        {seriesItem ? <div className="mt-1 text-xs text-gray-600">{t("app.owner.tutorials.series")}: {seriesItem.title_en}</div> : null}
                      </td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{it.tutorial_scope}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{mod ? t(mod.name_key) : "—"}</td>
                      <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{cat ? cat.title_en : "—"}</td>
                      <td className="border-b border-gray-100 px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2 text-xs text-gray-700">{it.visibility}</span>
                          {it.is_featured ? <span className="inline-flex h-6 items-center rounded-full bg-primary-50 px-2 text-xs text-primary-700">{t("app.owner.tutorials.featured")}</span> : null}
                          {!it.is_active ? <span className="inline-flex h-6 items-center rounded-full bg-red-50 px-2 text-xs text-red-700">{t("app.owner.tutorials.inactive")}</span> : null}
                        </div>
                      </td>
                      <td className="border-b border-gray-100 px-4 py-3 text-right">
                        <div className="flex justify-end gap-2">
                          <a
                            className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                            href={`https://www.youtube.com/watch?v=${encodeURIComponent(it.youtube_video_id ?? "")}`}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {t("app.owner.tutorials.openYouTube")}
                          </a>
                          <button
                            type="button"
                            className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                            onClick={() => openEdit(it)}
                          >
                            {t("common.button.edit")}
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === it.id}
                            className="inline-flex h-9 items-center justify-center rounded-xl border border-red-200 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                            onClick={() => void remove(it.id)}
                          >
                            {deletingId === it.id ? t("common.working") : t("common.button.remove")}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={editOpen} onClose={() => (saving ? null : setEditOpen(false))}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{form.id ? t("app.owner.tutorials.editTitle") : t("app.owner.tutorials.createTitle")}</div>
              <div className="mt-2 text-sm text-gray-700">{t("app.owner.tutorials.form.subtitle")}</div>
            </div>
            <button type="button" className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setEditOpen(false)} disabled={saving}>
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label={t("app.owner.tutorials.form.slug")}>
              <input
                className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={form.slug}
                onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
              />
            </Field>
            <Field label={t("app.owner.tutorials.form.scope")}>
              <select
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={form.scope}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    scope: e.target.value,
                    moduleId: e.target.value === "module" ? p.moduleId : "",
                    categoryId: "",
                    seriesId: "",
                    stepNo: ""
                  }))
                }
              >
                <option value="general">{t("public.learning.scope.general")}</option>
                <option value="module">{t("public.learning.scope.module")}</option>
              </select>
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label={t("app.owner.tutorials.form.module")} hint={t("app.owner.tutorials.form.moduleHint")}>
              <select
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
                value={form.moduleId}
                onChange={(e) => setForm((p) => ({ ...p, moduleId: e.target.value, categoryId: "", seriesId: "", stepNo: "" }))}
                disabled={form.scope !== "module"}
              >
                <option value="">{t("common.select")}</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {t(m.name_key)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("app.owner.tutorials.form.category")}>
              <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.categoryId} onChange={(e) => setForm((p) => ({ ...p, categoryId: e.target.value }))}>
                <option value="">{t("common.select")}</option>
                {formCategories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title_en}
                  </option>
                ))}
              </select>
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label={t("app.owner.tutorials.form.series")}>
              <select
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={form.seriesId}
                onChange={(e) => setForm((p) => ({ ...p, seriesId: e.target.value, stepNo: e.target.value ? p.stepNo : "" }))}
              >
                <option value="">{t("common.select")}</option>
                {formSeries.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.title_en}
                  </option>
                ))}
              </select>
            </Field>
            {form.seriesId ? (
              <Field label={t("app.owner.tutorials.form.stepNo")}>
                <input
                  className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={form.stepNo}
                  onChange={(e) => setForm((p) => ({ ...p, stepNo: e.target.value }))}
                  inputMode="numeric"
                />
              </Field>
            ) : null}
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <Field label={t("app.owner.tutorials.form.difficulty")}>
              <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.difficulty} onChange={(e) => setForm((p) => ({ ...p, difficulty: e.target.value }))}>
                <option value="beginner">{t("public.learning.difficulty.beginner")}</option>
                <option value="intermediate">{t("public.learning.difficulty.intermediate")}</option>
                <option value="advanced">{t("public.learning.difficulty.advanced")}</option>
              </select>
            </Field>
            <Field label={t("app.owner.tutorials.form.language")}>
              <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.language} onChange={(e) => setForm((p) => ({ ...p, language: e.target.value }))}>
                <option value="en">{t("common.language.en")}</option>
                <option value="fa">{t("common.language.fa")}</option>
                <option value="ps">{t("common.language.ps")}</option>
              </select>
            </Field>
            <Field label={t("app.owner.tutorials.form.visibility")}>
              <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.visibility} onChange={(e) => setForm((p) => ({ ...p, visibility: e.target.value }))}>
                <option value="public">{t("app.owner.tutorials.visibility.public")}</option>
                <option value="private">{t("app.owner.tutorials.visibility.private")}</option>
                <option value="draft">{t("app.owner.tutorials.visibility.draft")}</option>
              </select>
            </Field>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label={t("app.owner.tutorials.form.titleEn")}>
              <input
                className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={form.titleEn}
                onChange={(e) =>
                  setForm((p) => ({
                    ...p,
                    titleEn: e.target.value,
                    slug: p.slug ? p.slug : toSlug(e.target.value)
                  }))
                }
              />
            </Field>
            <Field label={t("app.owner.tutorials.form.titleFa")}>
              <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.titleFa} onChange={(e) => setForm((p) => ({ ...p, titleFa: e.target.value }))} />
            </Field>
            <Field label={t("app.owner.tutorials.form.titlePs")}>
              <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.titlePs} onChange={(e) => setForm((p) => ({ ...p, titlePs: e.target.value }))} />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-1">
            <Field label={t("app.owner.tutorials.form.descriptionEn")}>
              <textarea className="min-h-24 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.descriptionEn} onChange={(e) => setForm((p) => ({ ...p, descriptionEn: e.target.value }))} />
            </Field>
            <Field label={t("app.owner.tutorials.form.descriptionFa")}>
              <textarea className="min-h-24 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.descriptionFa} onChange={(e) => setForm((p) => ({ ...p, descriptionFa: e.target.value }))} />
            </Field>
            <Field label={t("app.owner.tutorials.form.descriptionPs")}>
              <textarea className="min-h-24 w-full rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.descriptionPs} onChange={(e) => setForm((p) => ({ ...p, descriptionPs: e.target.value }))} />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label={t("app.owner.tutorials.form.youtubeUrl")}>
              <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.youtubeUrl} onChange={(e) => setForm((p) => ({ ...p, youtubeUrl: e.target.value }))} />
            </Field>
            <Field label={t("app.owner.tutorials.form.thumbnailUrl")} hint={t("app.owner.tutorials.form.thumbnailHint")}>
              <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.thumbnailUrl} onChange={(e) => setForm((p) => ({ ...p, thumbnailUrl: e.target.value }))} />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Field label={t("app.owner.tutorials.form.orderNo")}>
              <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.orderNo} onChange={(e) => setForm((p) => ({ ...p, orderNo: e.target.value }))} inputMode="numeric" />
            </Field>
            <Field label={t("app.owner.tutorials.form.durationSec")}>
              <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.durationSec} onChange={(e) => setForm((p) => ({ ...p, durationSec: e.target.value }))} inputMode="numeric" />
            </Field>
            <Field label={t("app.owner.tutorials.form.tags")} hint={t("app.owner.tutorials.form.tagsHint")}>
              <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.tags} onChange={(e) => setForm((p) => ({ ...p, tags: e.target.value }))} />
            </Field>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <Field label={t("app.owner.tutorials.form.related")} hint={t("app.owner.tutorials.form.relatedHint")}>
              <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.relatedSlugs} onChange={(e) => setForm((p) => ({ ...p, relatedSlugs: e.target.value }))} />
            </Field>
            <div className="flex items-end gap-3">
              <label className="flex h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900">
                <input type="checkbox" checked={form.isFeatured} onChange={(e) => setForm((p) => ({ ...p, isFeatured: e.target.checked }))} />
                {t("app.owner.tutorials.featured")}
              </label>
              <label className="flex h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900">
                <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
                {t("common.status.active")}
              </label>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setEditOpen(false)} disabled={saving}>
              {t("common.button.cancel")}
            </button>
            <button type="button" disabled={saving} className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60" onClick={() => void save()}>
              {saving ? t("common.working") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Field(props: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label className="block text-sm font-medium text-gray-900">{props.label}</label>
        {props.hint ? <div className="text-xs text-gray-500">{props.hint}</div> : null}
      </div>
      <div className="mt-1">{props.children}</div>
    </div>
  );
}
