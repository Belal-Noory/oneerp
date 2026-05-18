"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getApiBaseUrl } from "@/lib/api";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";
import { WaitlistModal } from "@/components/WaitlistModal";
import { Reveal } from "@/components/Reveal";

type PublicModule = {
  id: string;
  version: string;
  name_key: string;
  description_key: string;
  category: string;
  icon: string;
  is_active: boolean;
};

type MeResponse = {
  data: {
    memberships: { tenantId: string; tenantSlug: string; tenantDisplayName: string; roleName: string }[];
  };
};

type ApiError = { error?: { message_key?: string } };

export default function ModulesPage() {
  const { t } = useClientI18n();
  const searchParams = useSearchParams();
  const [modules, setModules] = useState<PublicModule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [waitlistOpen, setWaitlistOpen] = useState(false);
  const [waitlistModule, setWaitlistModule] = useState<PublicModule | null>(null);
  const [activationOpen, setActivationOpen] = useState(false);
  const [activationMemberships, setActivationMemberships] = useState<MeResponse["data"]["memberships"]>([]);
  const [activationTenantId, setActivationTenantId] = useState<string>("");
  const [activationErrorKey, setActivationErrorKey] = useState<string | null>(null);
  const [activationDone, setActivationDone] = useState(false);
  const [activationNeedsLogin, setActivationNeedsLogin] = useState(false);
  const [activationWorking, setActivationWorking] = useState(false);
  const [autoActivated, setAutoActivated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/public/modules`, { cache: "no-store" });
        const json = (await res.json()) as { data?: unknown };
        const list = Array.isArray(json.data) ? (json.data as PublicModule[]) : [];
        if (!cancelled) setModules(list);
      } catch {
        if (!cancelled) setModules([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const m of modules) {
      if (m.category) set.add(m.category);
    }
    return ["all", ...Array.from(set).sort()];
  }, [modules]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return modules.filter((m) => {
      if (category !== "all" && m.category !== category) return false;
      if (!q) return true;
      const hay = `${m.id} ${m.name_key} ${m.description_key} ${m.category}`.toLowerCase();
      return hay.includes(q);
    });
  }, [modules, search, category]);

  const selected = useMemo(() => (selectedId ? modules.find((m) => m.id === selectedId) ?? null : null), [modules, selectedId]);

  const requestActivation = useCallback(async (moduleId: string) => {
    setActivationErrorKey(null);
    setActivationDone(false);
    setActivationNeedsLogin(false);
    setActivationMemberships([]);
    setActivationTenantId("");
    setActivationOpen(true);
    setActivationWorking(true);
    try {
      const meRes = await fetch(`${getApiBaseUrl()}/api/me`, { cache: "no-store", credentials: "include" });
      if (!meRes.ok) {
        setActivationNeedsLogin(true);
        return;
      }
      const meJson = (await meRes.json()) as MeResponse;
      const memberships = Array.isArray(meJson.data?.memberships) ? meJson.data.memberships : [];
      if (memberships.length === 0) {
        setActivationErrorKey("errors.tenantAccessDenied");
        return;
      }
      setActivationMemberships(memberships);
      setActivationTenantId(memberships[0]!.tenantId);

      if (memberships.length === 1) {
        const res = await fetch(`${getApiBaseUrl()}/api/tenants/current/modules/${moduleId}/request`, {
          method: "POST",
          credentials: "include",
          headers: { "X-Tenant-Id": memberships[0]!.tenantId }
        });
        if (!res.ok) {
          const json = (await res.json()) as ApiError;
          setActivationErrorKey(json.error?.message_key ?? "errors.internal");
          return;
        }
        setActivationDone(true);
      }
    } catch {
      setActivationErrorKey("errors.internal");
    } finally {
      setActivationWorking(false);
    }
  }, []);

  useEffect(() => {
    if (autoActivated) return;
    const requestedId = (searchParams.get("activate") ?? "").trim();
    if (!requestedId) return;
    if (!modules.some((m) => m.id === requestedId)) return;
    setAutoActivated(true);
    void requestActivation(requestedId);
  }, [autoActivated, modules, requestActivation, searchParams]);

  return (
    <div className="space-y-10">
      <Reveal>
        <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-accent-50" />
          <div className="relative">
            <h1 className="text-3xl font-semibold">{t("public.modules.title")}</h1>
            <p className="mt-2 text-gray-700">{t("public.modules.subtitle")}</p>

            <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div className="relative flex-1">
                <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-gray-400">
                  <SearchIcon />
                </div>
                <input
                  className="h-11 w-full rounded-xl border border-gray-200 bg-white pl-10 pr-3 text-sm shadow-sm outline-none transition focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t("public.modules.search.placeholder")}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {categories.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCategory(c)}
                    className={[
                      "inline-flex h-9 items-center rounded-full border px-3 text-sm transition",
                      category === c ? "border-primary-200 bg-primary-50 text-primary-700" : "border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                    ].join(" ")}
                  >
                    {c === "all" ? t("public.modules.filter.all") : c}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>
      </Reveal>

      {loading ? (
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-40 rounded-2xl border border-gray-200 bg-white shadow-card" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Reveal>
          <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
            <div className="text-lg font-semibold">{t("public.modules.empty.title")}</div>
            <div className="mt-2 text-gray-700">{t("public.modules.empty.desc")}</div>
          </div>
        </Reveal>
      ) : (
        <div className="grid gap-4 md:grid-cols-3">
          {filtered.map((m, idx) => (
            <Reveal key={m.id} delayMs={idx * 40}>
              <button
                type="button"
                onClick={() => setSelectedId(m.id)}
                className="w-full rounded-2xl border border-gray-200 bg-white p-6 text-left shadow-card transition hover:-translate-y-0.5 hover:shadow-lg"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gray-50 text-primary-700">
                      {moduleIcon(m.id)}
                    </div>
                    <div>
                      <div className="text-lg font-semibold">{t(m.name_key)}</div>
                      <div className="mt-1 text-sm text-gray-700">{t(m.description_key)}</div>
                    </div>
                  </div>
                  <span
                    className={[
                      "inline-flex h-6 items-center rounded-full px-2 text-xs",
                      m.is_active ? "bg-primary-50 text-primary-700" : "bg-gray-100 text-gray-700"
                    ].join(" ")}
                  >
                    {m.is_active ? t("public.modules.badge.available") : t("public.modules.badge.comingSoon")}
                  </span>
                </div>
                <div className="mt-4 text-xs text-gray-500">
                  {t("public.modules.filter.category.label")}: {m.category}
                </div>
                <div className="mt-1 text-xs text-gray-500">
                  {t("common.pricing.online.label")}: <span className="font-medium text-gray-700">{t("common.pricing.online.value")}</span>
                </div>
                <div className="mt-5 inline-flex items-center gap-2 text-sm font-medium text-primary-700">
                  <span>{t("public.modules.card.learnMore")}</span>
                  <ArrowRight />
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      )}

      <Modal open={!!selected} onClose={() => setSelectedId(null)}>
        {selected ? (
          <div className="p-6 md:p-8">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-50 text-primary-700">
                  {moduleIcon(selected.id)}
                </div>
                <div>
                  <div className="text-2xl font-semibold">{t(selected.name_key)}</div>
                  <div className="mt-1 text-gray-700">{t(selected.description_key)}</div>
                  <div className="mt-3 inline-flex items-center gap-2">
                    <span
                      className={[
                        "inline-flex h-7 items-center rounded-full px-3 text-xs font-medium",
                        selected.is_active ? "bg-primary-50 text-primary-700" : "bg-gray-100 text-gray-700"
                      ].join(" ")}
                    >
                      {selected.is_active ? t("public.modules.badge.available") : t("public.modules.badge.comingSoon")}
                    </span>
                    <span className="text-xs text-gray-500">{t("public.modules.modal.version")}: {selected.version}</span>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setSelectedId(null)}
                className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
              >
                {t("common.button.close")}
              </button>
            </div>

            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <DetailCard title={t("public.modules.modal.highlights.title")} items={moduleHighlights(selected.id).map(t)} />
              <DetailCard title={t("public.modules.modal.fit.title")} items={moduleFit(selected.id).map(t)} />
            </div>

            <div className="mt-4">
              <PricingCard t={t} />
            </div>

            <div className="mt-8 flex flex-col gap-3 md:flex-row md:items-center md:justify-end">
              {selected.is_active ? (
                <>
                  <a
                    href={`/learning-center?scope=module&moduleId=${encodeURIComponent(selected.id)}`}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50"
                  >
                    {t("public.learning.viewAll")}
                  </a>
                  {selected.id === "msp" ? (
                    <button
                      type="button"
                      onClick={async () => {
                        setSelectedId(null);
                        await requestActivation(selected.id);
                      }}
                      className="inline-flex h-10 items-center justify-center rounded-md bg-gray-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
                    >
                      {t("public.modules.modal.cta.requestActivation")}
                    </button>
                  ) : null}
                  <a
                    href="/register"
                    className="inline-flex h-10 items-center justify-center rounded-md bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                  >
                    {t("public.modules.modal.cta.startTrial")}
                  </a>
                </>
              ) : (
                <>
                  <a
                    href={`/learning-center?scope=module&moduleId=${encodeURIComponent(selected.id)}`}
                    className="inline-flex h-10 items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 shadow-sm hover:bg-gray-50"
                  >
                    {t("public.learning.viewAll")}
                  </a>
                  <button
                    type="button"
                    onClick={() => {
                      setWaitlistOpen(true);
                      setWaitlistModule(selected);
                      setSelectedId(null);
                    }}
                    className="inline-flex h-10 items-center justify-center rounded-md bg-gray-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-gray-800"
                  >
                    {t("public.modules.modal.cta.joinWaitlist")}
                  </button>
                </>
              )}
            </div>
          </div>
        ) : null}
      </Modal>

      <WaitlistModal
        open={waitlistOpen}
        onClose={() => {
          setWaitlistOpen(false);
          setWaitlistModule(null);
        }}
        moduleId={waitlistModule?.id ?? null}
        moduleName={waitlistModule ? t(waitlistModule.name_key) : null}
      />

      <Modal
        open={activationOpen}
        onClose={() => {
          setActivationOpen(false);
          setActivationMemberships([]);
          setActivationTenantId("");
          setActivationErrorKey(null);
          setActivationDone(false);
          setActivationNeedsLogin(false);
          setActivationWorking(false);
        }}
      >
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{t("public.modules.modal.cta.requestActivation")}</div>
              <div className="mt-1 text-sm text-gray-700">{t("module.msp.name")}</div>
            </div>
            <button
              type="button"
              onClick={() => setActivationOpen(false)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
            >
              {t("common.button.close")}
            </button>
          </div>

          {activationNeedsLogin ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-800">{t("errors.unauthenticated")}</div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
                <a
                  href="/login"
                  className="inline-flex h-10 items-center justify-center rounded-md bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
                >
                  {t("common.button.login")}
                </a>
                <a href="/register" className="inline-flex h-10 items-center justify-center rounded-md border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50">
                  {t("auth.login.link.createAccount")}
                </a>
              </div>
            </div>
          ) : activationDone ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-xl bg-green-50 p-4 text-sm text-green-700">{t("app.modules.action.requested")}</div>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {activationErrorKey ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{t(activationErrorKey)}</div> : null}

              {activationMemberships.length > 1 ? (
                <div>
                  <label className="block text-sm font-medium text-gray-900">{t("app.dashboard.tenantSlug")}</label>
                  <select
                    className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                    value={activationTenantId}
                    onChange={(e) => setActivationTenantId(e.target.value)}
                  >
                    {activationMemberships.map((m) => (
                      <option key={m.tenantId} value={m.tenantId}>
                        {m.tenantDisplayName} ({m.tenantSlug})
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {activationMemberships.length > 0 ? (
                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    disabled={activationWorking || !activationTenantId}
                    className="inline-flex h-10 items-center justify-center rounded-md bg-gray-900 px-4 text-sm font-medium text-white shadow-sm hover:bg-gray-800 disabled:opacity-60"
                    onClick={async () => {
                      if (!activationTenantId) return;
                      setActivationWorking(true);
                      setActivationErrorKey(null);
                      try {
                        const res = await fetch(`${getApiBaseUrl()}/api/tenants/current/modules/msp/request`, {
                          method: "POST",
                          credentials: "include",
                          headers: { "X-Tenant-Id": activationTenantId }
                        });
                        if (!res.ok) {
                          const json = (await res.json()) as ApiError;
                          setActivationErrorKey(json.error?.message_key ?? "errors.internal");
                          return;
                        }
                        setActivationDone(true);
                      } catch {
                        setActivationErrorKey("errors.internal");
                      } finally {
                        setActivationWorking(false);
                      }
                    }}
                  >
                    {activationWorking ? t("app.modules.action.working") : t("public.modules.modal.cta.requestActivation")}
                  </button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}

function DetailCard(props: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
      <div className="text-sm font-semibold text-gray-900">{props.title}</div>
      <ul className="mt-4 space-y-3 text-sm text-gray-700">
        {props.items.map((text) => (
          <li key={text} className="flex items-start gap-2">
            <CheckIcon />
            <span className="pt-0.5">{text}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PricingCard(props: { t: (key: string) => string }) {
  const defaultPercent = 5;
  const referralPercent = 10;
  return (
    <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
      <div className="text-sm font-semibold text-gray-900">{props.t("common.pricing.title")}</div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">
          {props.t("public.discounts.businessGrowthOffer")} • {props.t("public.discounts.save")} {defaultPercent}%
        </span>
        <span className="inline-flex items-center rounded-full border border-primary-200 bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-800">
          {props.t("public.discounts.useReferral")} {referralPercent}%
        </span>
        <span className="inline-flex items-center rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-800">
          {props.t("public.pricing.bundleSavingsLabel")} {props.t("public.pricing.saveUpTo25")}
        </span>
      </div>
      <div className="mt-4 space-y-2 text-sm text-gray-700">
        <PriceLine t={props.t} label={props.t("common.pricing.online.label")} listAmount={40} suffix={props.t("public.pricing.perMonth")} primaryPercent={defaultPercent} secondaryPercent={referralPercent} />
        <PriceLine t={props.t} label={props.t("common.pricing.desktopNoChanges.label")} listAmount={1000} suffix={props.t("public.pricing.oneTime")} primaryPercent={defaultPercent} secondaryPercent={referralPercent} />
        <PriceLine t={props.t} label={props.t("common.pricing.desktopWithChanges.label")} listAmount={2000} suffix={props.t("public.pricing.oneTime")} primaryPercent={defaultPercent} secondaryPercent={referralPercent} />
        <div className="pt-2 text-xs text-gray-600">{props.t("common.pricing.changesPeriod")}</div>
        <div className="text-xs text-gray-600">{props.t("public.discounts.bundleNote")}</div>
      </div>
    </div>
  );
}

function PriceLine(props: { t: (key: string) => string; label: string; listAmount: number; suffix: string; primaryPercent: number; secondaryPercent: number }) {
  const primary = Number.isFinite(props.primaryPercent) ? Math.max(0, Math.min(25, props.primaryPercent)) : 0;
  const secondary = Number.isFinite(props.secondaryPercent) ? Math.max(0, Math.min(25, props.secondaryPercent)) : 0;
  const discounted = primary > 0 ? props.listAmount * ((100 - primary) / 100) : props.listAmount;
  const savings = Math.max(0, props.listAmount - discounted);
  const discountedReferral = secondary > primary ? props.listAmount * ((100 - secondary) / 100) : discounted;
  return (
    <div className="flex items-start justify-between gap-3">
      <span>{props.label}</span>
      <span className="text-right tabular">
        {primary > 0 ? <span className="block text-xs text-gray-500 line-through">{formatUsd(props.listAmount)} {props.suffix}</span> : null}
        <span className="block font-semibold text-gray-900">{formatUsd(discounted)} {props.suffix}</span>
        {primary > 0 ? <span className="block text-xs text-emerald-700">{`${props.t("public.discounts.smartSavings")}: -${formatUsd(savings)}`}</span> : null}
        {secondary > primary ? (
          <span className="block text-[11px] text-primary-700">
            {props.t("public.discounts.withReferral")} {formatUsd(discountedReferral)} {props.suffix}
          </span>
        ) : null}
      </span>
    </div>
  );
}

function formatUsd(amount: number): string {
  const v = Number.isFinite(amount) ? amount : 0;
  const fixed = v % 1 === 0 ? v.toFixed(0) : v.toFixed(2);
  return `$${fixed}`;
}

function moduleHighlights(id: string): string[] {
  if (id === "shop") return ["public.modules.modal.shop.h1", "public.modules.modal.shop.h2", "public.modules.modal.shop.h3"];
  if (id === "pharmacy") return ["public.modules.modal.pharmacy.h1", "public.modules.modal.pharmacy.h2", "public.modules.modal.pharmacy.h3"];
  if (id === "fuel") return ["public.modules.modal.fuel.h1", "public.modules.modal.fuel.h2", "public.modules.modal.fuel.h3"];
  if (id === "msp") return ["public.modules.modal.msp.h1", "public.modules.modal.msp.h2", "public.modules.modal.msp.h3"];
  return ["public.modules.modal.generic.h1", "public.modules.modal.generic.h2", "public.modules.modal.generic.h3"];
}

function moduleFit(id: string): string[] {
  if (id === "shop") return ["public.modules.modal.shop.f1", "public.modules.modal.shop.f2", "public.modules.modal.shop.f3"];
  if (id === "pharmacy") return ["public.modules.modal.pharmacy.f1", "public.modules.modal.pharmacy.f2", "public.modules.modal.pharmacy.f3"];
  if (id === "fuel") return ["public.modules.modal.fuel.f1", "public.modules.modal.fuel.f2", "public.modules.modal.fuel.f3"];
  if (id === "msp") return ["public.modules.modal.msp.f1", "public.modules.modal.msp.f2", "public.modules.modal.msp.f3"];
  return ["public.modules.modal.generic.f1", "public.modules.modal.generic.f2", "public.modules.modal.generic.f3"];
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

function ArrowRight() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M13 6l6 6-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="mt-0.5 h-4 w-4 flex-none text-primary-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
      <path
        fillRule="evenodd"
        d="M16.704 5.29a1 1 0 0 1 .006 1.414l-7.25 7.35a1 1 0 0 1-1.424-.002L3.29 9.294a1 1 0 1 1 1.42-1.41l3.01 3.036 6.54-6.63a1 1 0 0 1 1.414 0Z"
        clipRule="evenodd"
      />
    </svg>
  );
}

function moduleIcon(id: string) {
  if (id === "shop") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 7h12l-1 14H7L6 7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M9 7a3 3 0 0 1 6 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "pharmacy") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M10 4h4v6h6v4h-6v6h-4v-6H4v-4h6V4Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
      </svg>
    );
  }
  if (id === "fuel") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M7 4h8v6H7V4Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M7 10h8v10H7V10Z"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path d="M15 7h2l2 2v9a2 2 0 0 1-2 2h-2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (id === "msp") {
    return (
      <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M6 4h12v16H6V4Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M8 8h8M8 12h8M8 16h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M16.5 9.5c.8 0 1.5.7 1.5 1.5S17.3 12.5 16.5 12.5 15 11.8 15 11s.7-1.5 1.5-1.5Z" fill="currentColor" />
      </svg>
    );
  }
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l9 6-9 6-9-6 9-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M3 15l9 6 9-6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}
