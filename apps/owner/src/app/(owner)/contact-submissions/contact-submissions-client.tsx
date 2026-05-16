"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { Modal } from "@/components/Modal";
import { t as translate } from "@oneerp/i18n";

type ContactSubmission = {
  id: string;
  full_name: string;
  organization_name: string | null;
  email: string;
  phone_number: string;
  service_type: string;
  message: string;
  locale: string | null;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};

type ListResponse = { data: ContactSubmission[]; meta: { page: number; pageSize: number; total: number } };

function formatDateTime(d: string): string {
  const dt = new Date(d);
  if (Number.isNaN(dt.getTime())) return d;
  return dt.toLocaleString();
}

function clip(s: string, max: number): string {
  const x = (s ?? "").trim();
  if (x.length <= max) return x;
  return `${x.slice(0, max - 1)}…`;
}

export function OwnerContactSubmissionsClient() {
  const t = (key: string) => translate("en", key);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [items, setItems] = useState<ContactSubmission[]>([]);
  const [meta, setMeta] = useState<{ page: number; pageSize: number; total: number }>({ page: 1, pageSize: 30, total: 0 });
  const [openId, setOpenId] = useState<string | null>(null);

  const selected = useMemo(() => items.find((x) => x.id === openId) ?? null, [items, openId]);

  const load = async (page: number) => {
    setLoading(true);
    setErrorKey(null);
    try {
      const params = new URLSearchParams();
      if (q.trim()) params.set("q", q.trim());
      params.set("page", String(page));
      params.set("pageSize", String(meta.pageSize));
      const res = await apiFetch(`/api/owner/contact-submissions?${params.toString()}`, { cache: "no-store" });
      if (!res.ok) {
        setErrorKey("errors.internal");
        return;
      }
      const json = (await res.json()) as ListResponse;
      setItems(Array.isArray(json.data) ? json.data : []);
      setMeta(json.meta ?? { page, pageSize: meta.pageSize, total: 0 });
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const canPrev = meta.page > 1;
  const canNext = meta.page * meta.pageSize < meta.total;

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.owner.nav.contactSubmissions")}</div>
            <div className="mt-2 text-sm text-gray-700">Messages submitted from the public website contact form.</div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
            <div className="w-full sm:w-80">
              <label className="block text-sm font-medium text-gray-900">Search</label>
              <input
                className="mt-1 h-10 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Name, email, phone, message…"
              />
            </div>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              disabled={loading}
              onClick={() => void load(1)}
            >
              {loading ? t("common.loading") : "Search"}
            </button>
          </div>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[1000px] w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">Date</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">From</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">Service</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">Message</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">Actions</th>
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
                    No messages found.
                  </td>
                </tr>
              ) : (
                items.map((x) => (
                  <tr key={x.id}>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700 tabular">{formatDateTime(x.created_at)}</td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="font-semibold text-gray-900">{x.full_name}</div>
                      <div className="mt-1 text-xs text-gray-600">{x.email} • {x.phone_number}</div>
                      {x.organization_name ? <div className="mt-1 text-xs text-gray-600">{x.organization_name}</div> : null}
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{x.service_type}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{clip(x.message, 140)}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right">
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                        onClick={() => setOpenId(x.id)}
                      >
                        View
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="flex flex-col gap-3 border-t border-gray-100 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-gray-700">
            Total: <span className="font-semibold tabular">{meta.total}</span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={loading || !canPrev}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => void load(meta.page - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={loading || !canNext}
              className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
              onClick={() => void load(meta.page + 1)}
            >
              Next
            </button>
          </div>
        </div>
      </div>

      <Modal open={Boolean(openId)} onClose={() => setOpenId(null)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">Contact Message</div>
              <div className="mt-2 text-sm text-gray-700">{selected ? formatDateTime(selected.created_at) : ""}</div>
            </div>
            <button type="button" className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50" onClick={() => setOpenId(null)}>
              {t("common.button.close")}
            </button>
          </div>

          {selected ? (
            <div className="mt-6 space-y-4">
              <div className="grid gap-4 md:grid-cols-2">
                <Info label="Name" value={selected.full_name} />
                <Info label="Service" value={selected.service_type} />
                <Info label="Email" value={selected.email} />
                <Info label="Phone" value={selected.phone_number} />
                <Info label="Organization" value={selected.organization_name ?? "—"} />
                <Info label="Locale" value={selected.locale ?? "—"} />
                <Info label="IP" value={selected.ip ?? "—"} />
                <Info label="User-Agent" value={selected.user_agent ?? "—"} />
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">Message</div>
                <div className="mt-2 whitespace-pre-wrap rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">{selected.message}</div>
              </div>
            </div>
          ) : null}
        </div>
      </Modal>
    </div>
  );
}

function Info(props: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium text-gray-600">{props.label}</div>
      <div className="mt-1 text-sm font-semibold text-gray-900">{props.value}</div>
    </div>
  );
}

