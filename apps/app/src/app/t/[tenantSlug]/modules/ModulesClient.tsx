"use client";

import { useEffect, useMemo, useState } from "react";
import { useClientI18n } from "@/lib/client-i18n";
import { apiFetch } from "@/lib/auth-fetch";

type MeResponse = {
  data: {
    memberships: { tenantId: string; tenantSlug: string }[];
  };
};

type EnabledModulesResponse = {
  data: {
    id: string;
    version: string;
    name_key: string;
    description_key: string;
    category: string;
    icon: string;
    is_catalog_active: boolean;
    status: string;
  }[];
};

export function ModulesClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [modules, setModules] = useState<EnabledModulesResponse["data"]>([]);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "enabled" | "disabled" | "comingSoon">("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const m of modules) set.add(m.category);
    return ["all", ...Array.from(set).sort()];
  }, [modules]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return modules
      .filter((m) => {
        if (categoryFilter !== "all" && m.category !== categoryFilter) return false;
        if (statusFilter !== "all") {
          if (statusFilter === "comingSoon" && m.is_catalog_active) return false;
          if (statusFilter === "enabled" && (!m.is_catalog_active || m.status !== "enabled")) return false;
          if (statusFilter === "disabled" && (!m.is_catalog_active || m.status !== "disabled")) return false;
        }
        if (!q) return true;
        const hay = `${m.id} ${m.category} ${m.name_key} ${m.description_key}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => {
        const aRank = a.is_catalog_active ? (a.status === "enabled" ? 0 : 1) : 2;
        const bRank = b.is_catalog_active ? (b.status === "enabled" ? 0 : 1) : 2;
        if (aRank !== bRank) return aRank - bRank;
        return a.id.localeCompare(b.id);
      });
  }, [modules, search, categoryFilter, statusFilter]);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setErrorKey(null);
      try {
        const meRes = await apiFetch(`/api/me`, { cache: "no-store" });
        if (!meRes.ok) {
          setErrorKey("errors.unauthenticated");
          return;
        }
        const me = (await meRes.json()) as MeResponse;
        const membership = me.data.memberships.find((m) => m.tenantSlug === props.tenantSlug) ?? null;
        if (!membership) {
          setErrorKey("errors.tenantAccessDenied");
          return;
        }
        if (!cancelled) setTenantId(membership.tenantId);

        const res = await apiFetch(`/api/tenants/current/modules`, {
          cache: "no-store",
          headers: { "X-Tenant-Id": membership.tenantId }
        });
        if (!res.ok) {
          setErrorKey("errors.internal");
          return;
        }
        const json = (await res.json()) as EnabledModulesResponse;
        if (!cancelled) setModules(Array.isArray(json.data) ? json.data : []);
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [props.tenantSlug]);

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">Loading…</div>;
  }

  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.modules.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.modules.subtitle")}</div>
          </div>
          <div className="w-full max-w-md">
            <div className="relative">
              <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                <SearchIcon />
              </div>
              <input
                className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("app.modules.search.placeholder")}
              />
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ["all", t("app.modules.filter.all")],
                ["enabled", t("app.modules.status.enabled")],
                ["disabled", t("app.modules.status.disabled")],
                ["comingSoon", t("app.modules.status.comingSoon")]
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={[
                  "inline-flex h-9 items-center rounded-full border px-3 text-sm",
                  statusFilter === key ? "border-primary-200 bg-primary-50 text-primary-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                ].join(" ")}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {categories.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategoryFilter(c)}
                className={[
                  "inline-flex h-9 items-center rounded-full border px-3 text-sm",
                  categoryFilter === c ? "border-primary-200 bg-primary-50 text-primary-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                ].join(" ")}
              >
                {c === "all" ? t("app.modules.filter.category.all") : c}
              </button>
            ))}
          </div>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
          <div className="text-lg font-semibold">{t("app.modules.empty.title")}</div>
          <div className="mt-2 text-gray-700">{t("app.modules.empty.subtitle")}</div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {filtered.map((m) => (
            <div key={m.id} className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-lg font-semibold">{t(m.name_key)}</div>
                  <div className="mt-1 text-sm text-gray-700">{t(m.description_key)}</div>
                </div>
                <span className={["inline-flex h-6 items-center rounded-full px-2 text-xs", badgeClass(m.status, m.is_catalog_active)].join(" ")}>
                  {t(statusKey(m.status, m.is_catalog_active))}
                </span>
              </div>
              <div className="mt-4 flex items-center justify-between text-xs text-gray-500">
                <span>
                  {t("app.modules.category")}: {m.category}
                </span>
                <span>
                  {t("app.modules.version")}: {m.version}
                </span>
              </div>

              <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-semibold text-gray-900">{t("common.pricing.title")}</div>
                <div className="mt-2 space-y-1 text-xs text-gray-700">
                  <div className="flex items-center justify-between gap-3">
                    <span>{t("common.pricing.online.label")}</span>
                    <span className="font-semibold text-gray-900 tabular">{t("common.pricing.online.value")}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{t("common.pricing.desktopNoChanges.label")}</span>
                    <span className="font-semibold text-gray-900 tabular">{t("common.pricing.desktopNoChanges.value")}</span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <span>{t("common.pricing.desktopWithChanges.label")}</span>
                    <span className="font-semibold text-gray-900 tabular">{t("common.pricing.desktopWithChanges.value")}</span>
                  </div>
                  <div className="pt-1 text-[11px] text-gray-600">{t("common.pricing.changesPeriod")}</div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between gap-3">
                <div className="text-xs text-gray-500">{t("app.modules.action.label")}</div>
                {!m.is_catalog_active ? (
                  <button
                    type="button"
                    className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  >
                    {t("app.modules.action.comingSoon")}
                  </button>
                ) : m.status === "enabled" ? (
                  <div className="flex items-center gap-2">
                    <a
                      href={modulePath(props.tenantSlug, m.id) ?? "#"}
                      className="inline-flex h-9 items-center rounded-xl bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800"
                    >
                      {t("app.modules.action.open")}
                    </a>
                  </div>
                ) : m.status === "requested" ? (
                  <button
                    type="button"
                    disabled
                    className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-700 opacity-60"
                  >
                    {t("app.modules.action.requested")}
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={!tenantId || changing === m.id}
                    className="inline-flex h-9 items-center rounded-xl bg-primary-600 px-3 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
                    onClick={async () => {
                      if (!tenantId) return;
                      setChanging(m.id);
                      setErrorKey(null);
                      try {
                        const res = await apiFetch(`/api/tenants/current/modules/${m.id}/request`, {
                          method: "POST",
                          headers: { "X-Tenant-Id": tenantId }
                        });
                        if (!res.ok) {
                          setErrorKey("errors.permissionDenied");
                          return;
                        }
                        setModules((prev) => prev.map((x) => (x.id === m.id ? { ...x, status: "requested" } : x)));
                      } catch {
                        setErrorKey("errors.internal");
                      } finally {
                        setChanging(null);
                      }
                    }}
                  >
                    {changing === m.id ? t("app.modules.action.working") : t("app.modules.action.request")}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function modulePath(tenantSlug: string, moduleId: string): string | null {
  if (moduleId === "shop") return `/t/${tenantSlug}/shop`;
  if (moduleId === "pharmacy") return `/t/${tenantSlug}/pharmacy`;
  if (moduleId === "fuel") return `/t/${tenantSlug}/fuel`;
  if (moduleId === "msp") return `/t/${tenantSlug}/msp`;
  if (moduleId === "printpress") return `/t/${tenantSlug}/printpress`;
  return null;
}

function SearchIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M16.2 16.2 21 21" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function statusKey(status: string, isCatalogActive: boolean): string {
  if (!isCatalogActive) return "app.modules.status.comingSoon";
  if (status === "enabled") return "app.modules.status.enabled";
  if (status === "disabled") return "app.modules.status.disabled";
  if (status === "requested") return "app.modules.status.requested";
  if (status === "locked") return "app.modules.status.locked";
  return "app.modules.status.pending";
}

function badgeClass(status: string, isCatalogActive: boolean): string {
  if (!isCatalogActive) return "bg-gray-100 text-gray-700";
  if (status === "enabled") return "bg-primary-50 text-primary-700";
  if (status === "disabled") return "bg-gray-100 text-gray-700";
  if (status === "requested") return "bg-accent-50 text-accent-600";
  if (status === "locked") return "bg-red-50 text-red-700";
  return "bg-accent-50 text-accent-600";
}
