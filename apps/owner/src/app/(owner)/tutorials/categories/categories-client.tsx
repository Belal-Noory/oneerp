"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { Modal } from "@/components/Modal";
import { t as translate } from "@oneerp/i18n";

type Category = {
  id: string;
  slug: string;
  icon: string;
  tutorial_scope: string;
  module_id: string | null;
  title_en: string;
  title_dr: string;
  title_ps: string;
  order_no: number;
  is_active: boolean;
};

type PublicModule = { id: string; name_key: string; description_key: string; category: string; icon: string; is_active: boolean };

const emptyForm = {
  id: null as string | null,
  slug: "",
  icon: "layers",
  scope: "general",
  moduleId: "",
  titleEn: "",
  titleFa: "",
  titlePs: "",
  orderNo: "0",
  isActive: true
};
export function OwnerTutorialCategoriesClient() {
  const t = (key: string) => translate("en", key);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [items, setItems] = useState<Category[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [modules, setModules] = useState<PublicModule[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [form, setForm] = useState({ ...emptyForm });

  const reload = async () => {
    setLoading(true);
    setErrorKey(null);
    try {
      const [modsRes, res] = await Promise.all([apiFetch("/api/owner/modules", { cache: "no-store" }), apiFetch("/api/owner/tutorial-categories", { cache: "no-store" })]);
      if (!modsRes.ok || !res.ok) {
        setErrorKey("errors.internal");
        return;
      }
      const json = (await res.json()) as { data?: Category[] };
      const modsJson = (await modsRes.json().catch(() => null)) as { data?: PublicModule[] } | null;
      setModules(Array.isArray(modsJson?.data) ? modsJson!.data : []);
      setItems(Array.isArray(json.data) ? json.data : []);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  };


  useEffect(() => {
    void reload();
  }, []);

  const openCreate = () => {
    setForm({ ...emptyForm });
    setModalOpen(true);
  };

  const openEdit = (c: Category) => {
    setForm({
      id: c.id,
      slug: c.slug,
      icon: c.icon,
      scope: c.tutorial_scope,
      moduleId: c.module_id ?? "",
      titleEn: c.title_en,
      titleFa: c.title_dr,
      titlePs: c.title_ps,
      orderNo: String(c.order_no ?? 0),
      isActive: c.is_active
    });
    setModalOpen(true);
  };

  const save = async () => {
    setSaving(true);
    setErrorKey(null);
    try {
      const moduleId = form.scope === "module" ? form.moduleId.trim() : "";
      if (form.scope === "module" && !moduleId) {
        setErrorKey("errors.validationError");
        return;
      }
      const payload = {
        slug: form.slug,
        icon: form.icon,
        scope: form.scope,
        moduleId: form.scope === "module" ? moduleId : undefined,
        titleEn: form.titleEn,
        titleFa: form.titleFa,
        titlePs: form.titlePs,
        orderNo: Number(form.orderNo || 0),
        isActive: form.isActive
      };
      const res = await apiFetch(form.id ? `/api/owner/tutorial-categories/${encodeURIComponent(form.id)}` : "/api/owner/tutorial-categories", {
        method: form.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        setErrorKey("errors.validationError");
        return;
      }
      setModalOpen(false);
      await reload();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    setDeletingId(id);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/owner/tutorial-categories/${encodeURIComponent(id)}`, { method: "DELETE" });
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
            <div className="text-2xl font-semibold">{t("app.owner.tutorialCategories.title")}</div>
            <div className="mt-2 text-sm text-gray-700">{t("app.owner.tutorialCategories.subtitle")}</div>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => void reload()} disabled={loading}>
              {t("common.button.refresh")}
            </button>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700" onClick={openCreate}>
              {t("common.button.create")}
            </button>
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.tutorialCategories.table.category")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.tutorialCategories.table.slug")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.tutorialCategories.table.order")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.tutorialCategories.table.status")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.owner.tutorialCategories.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={5}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={5}>
                    {t("app.owner.tutorialCategories.empty")}
                  </td>
                </tr>
              ) : (
                items.map((c) => (
                  <tr key={c.id}>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="font-semibold text-gray-900">{c.title_en}</div>
                      <div className="mt-1 text-xs text-gray-600">{c.title_dr} • {c.title_ps}</div>
                      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-700">
                        <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2">{t(`public.learning.scope.${c.tutorial_scope}`)}</span>
                        {c.module_id ? <span className="inline-flex h-6 items-center rounded-full bg-gray-100 px-2">{c.module_id}</span> : null}
                      </div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{c.slug}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700 tabular">{c.order_no}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{c.is_active ? t("common.status.active") : t("common.status.inactive")}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button type="button" className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => openEdit(c)}>
                          {t("common.button.edit")}
                        </button>
                        <button type="button" disabled={deletingId === c.id} className="inline-flex h-9 items-center justify-center rounded-xl border border-red-200 bg-white px-3 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60" onClick={() => void remove(c.id)}>
                          {deletingId === c.id ? t("common.working") : t("common.button.remove")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={modalOpen} onClose={() => (saving ? null : setModalOpen(false))}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{form.id ? t("app.owner.tutorialCategories.editTitle") : t("app.owner.tutorialCategories.createTitle")}</div>
              <div className="mt-2 text-sm text-gray-700">{t("app.owner.tutorialCategories.form.subtitle")}</div>
            </div>
            <button type="button" className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setModalOpen(false)} disabled={saving}>
              {t("common.button.close")}
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Field label={t("app.owner.tutorialCategories.form.slug")}>
              <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.slug} onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))} />
            </Field>
            <Field label={t("app.owner.tutorialCategories.form.icon")}>
              <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.icon} onChange={(e) => setForm((p) => ({ ...p, icon: e.target.value }))} />
            </Field>
            <Field label={t("app.owner.tutorials.form.scope")}>
              <select
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={form.scope}
                onChange={(e) => setForm((p) => ({ ...p, scope: e.target.value, moduleId: e.target.value === "module" ? p.moduleId : "" }))}
              >
                <option value="general">{t("public.learning.scope.general")}</option>
                <option value="module">{t("public.learning.scope.module")}</option>
              </select>
            </Field>
            <Field label={t("app.owner.tutorials.form.module")} >
              <select
                className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100 disabled:opacity-60"
                value={form.moduleId}
                onChange={(e) => setForm((p) => ({ ...p, moduleId: e.target.value }))}
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
            <Field label={t("app.owner.tutorialCategories.form.titleEn")}>
              <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.titleEn} onChange={(e) => setForm((p) => ({ ...p, titleEn: e.target.value }))} />
            </Field>
            <Field label={t("app.owner.tutorialCategories.form.titleFa")}>
              <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.titleFa} onChange={(e) => setForm((p) => ({ ...p, titleFa: e.target.value }))} />
            </Field>
            <Field label={t("app.owner.tutorialCategories.form.titlePs")}>
              <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.titlePs} onChange={(e) => setForm((p) => ({ ...p, titlePs: e.target.value }))} />
            </Field>
            <Field label={t("app.owner.tutorialCategories.form.orderNo")}>
              <input className="h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={form.orderNo} onChange={(e) => setForm((p) => ({ ...p, orderNo: e.target.value }))} inputMode="numeric" />
            </Field>
          </div>

          <div className="mt-4">
            <label className="flex h-11 items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 text-sm text-gray-900">
              <input type="checkbox" checked={form.isActive} onChange={(e) => setForm((p) => ({ ...p, isActive: e.target.checked }))} />
              {t("common.status.active")}
            </label>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setModalOpen(false)} disabled={saving}>
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

function Field(props: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900">{props.label}</label>
      <div className="mt-1">{props.children}</div>
    </div>
  );
}
