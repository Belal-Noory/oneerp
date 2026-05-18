"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type TenantRow = {
  id: string;
  slug: string;
  legalName: string;
  displayName: string;
  status: string;
  createdAt: string;
  branding: { phone: string | null; email: string | null; address: string | null } | null;
  owner: { id: string; fullName: string; email: string | null; phone: string | null } | null;
};

type OwnerTenantsResponse = { data: TenantRow[] };

type TenantDetail = {
  id: string;
  slug: string;
  displayName: string;
  legalName: string;
  createdAt: string;
  owner: { id: string; fullName: string; email: string | null; phone: string | null } | null;
  partnerProfile: { isPremiumPartner: boolean; premiumGrantedAt: string | null; betaAccessEnabled: boolean; betaEnabledAt: string | null };
  partnerFeedback: { id: string; subject: string; message: string; isBetaFeedback: boolean; status: string; createdAt: string }[];
  referralStats: {
    total: number;
    successful: number;
    pending: number;
    awaitingPaymentConfirmation: number;
    paymentReceived: number;
    activated: number;
    rewardGranted: number;
    rejected: number;
  };
  referralRewards: { rewardType: string; grantedAt: string }[];
  roles: { id: string; name: string }[];
  memberships: {
    id: string;
    status: string;
    createdAt: string;
    user: { id: string; fullName: string; email: string | null; phone: string | null };
    role: { id: string; name: string };
  }[];
  enabledModules: { moduleId: string; status: string; moduleNameKey: string }[];
  subscriptionItems: {
    moduleId: string;
    moduleNameKey: string;
    status: string;
    subscriptionType: string | null;
    billingCycle: string | null;
    listPriceAmount: string | null;
    priceAmount: string | null;
    priceCurrency: string | null;
    discountPercent: number | null;
    currentPeriodEndAt: string | null;
    graceEndsAt: string | null;
    lockedAt: string | null;
    supportEndsAt: string | null;
  }[];
};

type TenantDetailResponse = { data: TenantDetail };

type SubscriptionType = "online_monthly" | "offline_no_changes" | "offline_with_changes";

function toIsoFromDateInput(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function OwnerTenantsClient() {
  const { t } = useClientI18n();
  const [items, setItems] = useState<TenantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detail, setDetail] = useState<TenantDetail | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [setPeriod, setSetPeriod] = useState<null | { moduleId: string; moduleNameKey: string; date: string }>(null);
  const [activate, setActivate] = useState<null | { moduleId: string; moduleNameKey: string }>(null);
  const [activateType, setActivateType] = useState<SubscriptionType>("online_monthly");
  const [activatePriceAmount, setActivatePriceAmount] = useState("40");
  const [activatePriceCurrency, setActivatePriceCurrency] = useState("USD");
  const [activatePeriodEndDate, setActivatePeriodEndDate] = useState("");
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserEmail, setAddUserEmail] = useState("");
  const [addUserFullName, setAddUserFullName] = useState("");
  const [addUserRole, setAddUserRole] = useState("Staff");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [partnerNotesErrorKey, setPartnerNotesErrorKey] = useState<string | null>(null);

  const applySubscriptionItemUpdate = useCallback((patch: { id: string; moduleId: string; status: string; billingCycle: string | null; currentPeriodEndAt: string | null; graceEndsAt: string | null; lockedAt: string | null }) => {
    setDetail((prev) => {
      if (!prev) return prev;
      const next = prev.subscriptionItems.map((s) =>
        s.moduleId === patch.moduleId
          ? { ...s, status: patch.status, billingCycle: patch.billingCycle, currentPeriodEndAt: patch.currentPeriodEndAt, graceEndsAt: patch.graceEndsAt, lockedAt: patch.lockedAt }
          : s
      );
      return { ...prev, subscriptionItems: next };
    });
  }, []);

  const loadTenantDetail = useCallback(async (tenantId: string, preserve: boolean) => {
    setDetailOpen(true);
    setDetailLoading(true);
    if (!preserve) setDetail(null);
    try {
      const res = await apiFetch(`/api/owner/tenants/${encodeURIComponent(tenantId)}`, { cache: "no-store" });
      if (!res.ok) {
        setErrorKey("errors.internal");
        return;
      }
      const json = (await res.json()) as TenantDetailResponse;
      setDetail(json.data);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const updatePartnerProfile = useCallback(
    async (patch: { isPremiumPartner?: boolean; betaAccessEnabled?: boolean }) => {
      if (!detail?.id) return;
      setActing("partner-profile");
      setPartnerNotesErrorKey(null);
      try {
        const res = await apiFetch(`/api/owner/tenants/${encodeURIComponent(detail.id)}/partner-profile`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patch)
        });
        if (!res.ok) {
          setPartnerNotesErrorKey("errors.internal");
          return;
        }
        await loadTenantDetail(detail.id, true);
      } catch {
        setPartnerNotesErrorKey("errors.internal");
      } finally {
        setActing(null);
      }
    },
    [detail?.id, loadTenantDetail]
  );

  const reload = useCallback(async () => {
    setLoading(true);
    setErrorKey(null);
    try {
      const res = await apiFetch("/api/owner/tenants", { cache: "no-store" });
      if (!res.ok) {
        setErrorKey("errors.internal");
        return;
      }
      const json = (await res.json()) as OwnerTenantsResponse;
      setItems(json.data ?? []);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, []);

  const openTenant = useCallback(async (tenantId: string) => loadTenantDetail(tenantId, false), [loadTenantDetail]);

  const refreshDetail = useCallback(async () => {
    if (!detail?.id) return;
    await loadTenantDetail(detail.id, true);
  }, [detail?.id, loadTenantDetail]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.owner.tenants.title")}</div>
            <div className="mt-2 text-sm text-gray-700">{t("app.owner.tenants.subtitle")}</div>
          </div>
          <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => void reload()} disabled={loading}>
            {t("common.button.refresh")}
          </button>
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.table.tenant")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.table.owner")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.table.createdAt")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.owner.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={4}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={4}>
                    {t("app.owner.tenants.empty")}
                  </td>
                </tr>
              ) : (
                items.map((r) => (
                  <tr key={r.id}>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="font-semibold text-gray-900">{r.displayName}</div>
                      <div className="mt-1 text-xs text-gray-600">{r.slug}</div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="text-gray-900">{r.owner?.fullName ?? "—"}</div>
                      <div className="mt-1 text-xs text-gray-600">{r.owner?.email ?? "—"}</div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700 tabular">{new Date(r.createdAt).toLocaleDateString()}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right">
                      <button
                        type="button"
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                        onClick={() => void openTenant(r.id)}
                      >
                        {t("app.owner.action.view")}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={detailOpen} onClose={() => (acting ? null : setDetailOpen(false))}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{t("app.owner.tenantDetails.title")}</div>
              <div className="mt-2 text-sm text-gray-700">{detail ? `${detail.displayName} • ${detail.slug}` : "—"}</div>
            </div>
            <button type="button" className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => void refreshDetail()} disabled={detailLoading}>
              {t("common.button.refresh")}
            </button>
          </div>

          {errorKey ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{t(errorKey)}</div> : null}

          {detailLoading ? (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">{t("common.loading")}</div>
          ) : detail ? (
            <div className="mt-6 space-y-4">
              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <div className="text-sm font-semibold text-gray-900">{t("app.owner.billing.title")}</div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-[860px] w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr>
                        <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-900">{t("app.owner.table.module")}</th>
                        <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-900">{t("common.status")}</th>
                        <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-900">{t("app.owner.billing.subscriptionType")}</th>
                        <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-900">{t("app.owner.billing.price")}</th>
                        <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-900">{t("app.owner.billing.discount")}</th>
                        <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-900">{t("app.owner.billing.periodEnd")}</th>
                        <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-900">{t("app.owner.billing.graceEnd")}</th>
                        <th className="border-b border-gray-200 px-3 py-2 text-right font-medium text-gray-900">{t("app.owner.table.actions")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.enabledModules.length === 0 && detail.subscriptionItems.length === 0 ? (
                        <tr>
                          <td className="px-3 py-4 text-gray-600" colSpan={8}>
                            {t("app.owner.billing.empty")}
                          </td>
                        </tr>
                      ) : (
                        (() => {
                          const byId = new Map(detail.subscriptionItems.map((s) => [s.moduleId, s]));
                          const rows = [
                            ...detail.enabledModules.map((m) => ({ moduleId: m.moduleId, moduleNameKey: m.moduleNameKey, sub: byId.get(m.moduleId) ?? null })),
                            ...detail.subscriptionItems.filter((s) => !detail.enabledModules.some((m) => m.moduleId === s.moduleId)).map((s) => ({ moduleId: s.moduleId, moduleNameKey: s.moduleNameKey, sub: s }))
                          ];

                          return rows.map(({ moduleId, moduleNameKey, sub }) => {
                            const now = Date.now();
                            const isMonthly = sub?.billingCycle === "monthly";
                            const periodEnd = sub?.currentPeriodEndAt ? new Date(sub.currentPeriodEndAt).getTime() : null;
                            const graceEnd = sub?.graceEndsAt ? new Date(sub.graceEndsAt).getTime() : periodEnd ? periodEnd + 3 * 24 * 60 * 60 * 1000 : null;
                            const inGrace = isMonthly && periodEnd !== null && now > periodEnd && graceEnd !== null && now <= graceEnd;
                            const expired = isMonthly && graceEnd !== null ? now > graceEnd : false;
                            const locked = !sub || !!sub.lockedAt || sub.status === "locked" || expired;

                            const statusLabel = locked ? t("app.owner.status.locked") : inGrace ? t("app.owner.status.grace") : sub.status === "active" ? t("common.status.active") : sub.status;

                            return (
                              <tr key={moduleId}>
                                <td className="border-b border-gray-200 px-3 py-3">
                                  <div className="font-semibold text-gray-900">{t(moduleNameKey)}</div>
                                  <div className="mt-1 text-xs text-gray-600">{moduleId}</div>
                                </td>
                                <td className="border-b border-gray-200 px-3 py-3 text-gray-700">{sub ? statusLabel : t("app.owner.status.notConfigured")}</td>
                                <td className="border-b border-gray-200 px-3 py-3 text-gray-700">{sub?.subscriptionType ?? "—"}</td>
                                <td className="border-b border-gray-200 px-3 py-3 text-gray-700 tabular">
                                  {sub?.priceAmount && sub.priceCurrency ? (
                                    <div>
                                      {sub.listPriceAmount && sub.discountPercent && sub.discountPercent > 0 ? (
                                        <div className="text-xs text-gray-500 line-through">
                                          {sub.listPriceAmount} {sub.priceCurrency}
                                        </div>
                                      ) : null}
                                      <div className="font-medium text-gray-900">
                                        {sub.priceAmount} {sub.priceCurrency}
                                      </div>
                                    </div>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className="border-b border-gray-200 px-3 py-3 text-gray-700 tabular">{sub?.discountPercent ? `${sub.discountPercent}%` : "—"}</td>
                                <td className="border-b border-gray-200 px-3 py-3 text-gray-700">{sub?.currentPeriodEndAt ? new Date(sub.currentPeriodEndAt).toLocaleDateString() : "—"}</td>
                                <td className="border-b border-gray-200 px-3 py-3 text-gray-700">{sub?.graceEndsAt ? new Date(sub.graceEndsAt).toLocaleDateString() : "—"}</td>
                                <td className="border-b border-gray-200 px-3 py-3 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    {!sub ? (
                                      <button
                                        type="button"
                                        disabled={acting === moduleId}
                                        className="inline-flex h-9 items-center justify-center rounded-xl bg-primary-600 px-3 text-xs font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                                        onClick={() => {
                                          setActivateType("online_monthly");
                                          setActivatePriceAmount("40");
                                          setActivatePriceCurrency("USD");
                                          setActivatePeriodEndDate("");
                                          setActivate({ moduleId, moduleNameKey });
                                        }}
                                      >
                                        {t("app.owner.action.activate")}
                                      </button>
                                    ) : (
                                      <>
                                        {sub.billingCycle === "monthly" ? (
                                          <>
                                            <button
                                              type="button"
                                              disabled={acting === moduleId}
                                              className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                                              onClick={() => setSetPeriod({ moduleId, moduleNameKey, date: sub.currentPeriodEndAt ? new Date(sub.currentPeriodEndAt).toISOString().slice(0, 10) : "" })}
                                            >
                                              {t("app.owner.action.setPeriodEnd")}
                                            </button>
                                            <button
                                              type="button"
                                              disabled={acting === moduleId}
                                              className="inline-flex h-9 items-center justify-center rounded-xl bg-gray-900 px-3 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                                              onClick={async () => {
                                                setActing(moduleId);
                                                setErrorKey(null);
                                                try {
                                                  const res = await apiFetch(`/api/owner/subscriptions/${encodeURIComponent(detail.id)}/${encodeURIComponent(moduleId)}/mark-paid`, {
                                                    method: "POST",
                                                    headers: { "Content-Type": "application/json" },
                                                    body: JSON.stringify({})
                                                  });
                                                  const json = (await res.json().catch(() => null)) as
                                                    | { data?: { subscriptionItem?: { id: string; moduleId: string; status: string; billingCycle: string | null; currentPeriodEndAt: string | null; graceEndsAt: string | null; lockedAt: string | null } }; error?: { message_key?: string } }
                                                    | null;
                                                  if (!res.ok) {
                                                    setErrorKey(json?.error?.message_key ?? "errors.internal");
                                                    return;
                                                  }
                                                  const updated = json?.data?.subscriptionItem;
                                                  if (updated) applySubscriptionItemUpdate(updated);
                                                  await refreshDetail();
                                                } catch {
                                                  setErrorKey("errors.internal");
                                                } finally {
                                                  setActing(null);
                                                }
                                              }}
                                            >
                                              {t("app.owner.action.markPaid")}
                                            </button>
                                          </>
                                        ) : null}
                                        {locked ? (
                                          <button
                                            type="button"
                                            disabled={acting === moduleId}
                                            className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-xs font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                                            onClick={async () => {
                                              setActing(moduleId);
                                              setErrorKey(null);
                                              try {
                                                const res = await apiFetch(`/api/owner/subscriptions/${encodeURIComponent(detail.id)}/${encodeURIComponent(moduleId)}/unlock`, { method: "POST" });
                                                if (!res.ok) setErrorKey("errors.internal");
                                                await refreshDetail();
                                              } catch {
                                                setErrorKey("errors.internal");
                                              } finally {
                                                setActing(null);
                                              }
                                            }}
                                          >
                                            {t("app.owner.action.unlock")}
                                          </button>
                                        ) : (
                                          <button
                                            type="button"
                                            disabled={acting === moduleId}
                                            className="inline-flex h-9 items-center justify-center rounded-xl border border-red-200 bg-red-50 px-3 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
                                            onClick={async () => {
                                              setActing(moduleId);
                                              setErrorKey(null);
                                              try {
                                                const res = await apiFetch(`/api/owner/subscriptions/${encodeURIComponent(detail.id)}/${encodeURIComponent(moduleId)}/lock`, { method: "POST" });
                                                if (!res.ok) setErrorKey("errors.internal");
                                                await refreshDetail();
                                              } catch {
                                                setErrorKey("errors.internal");
                                              } finally {
                                                setActing(null);
                                              }
                                            }}
                                          >
                                            {t("app.owner.action.lock")}
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            );
                          });
                        })()
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <div className="text-sm font-semibold text-gray-900">{t("app.owner.partner.title")}</div>
                <div className="mt-1 text-xs text-gray-600">{t("app.owner.partner.subtitle")}</div>

                {partnerNotesErrorKey ? <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{t(partnerNotesErrorKey)}</div> : null}

                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="text-xs font-semibold text-gray-900">{t("app.owner.partner.premiumPartner")}</div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div className="text-sm text-gray-700">{detail.partnerProfile.isPremiumPartner ? t("common.status.active") : t("common.status.inactive")}</div>
                      <button
                        type="button"
                        disabled={!!acting}
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                        onClick={() => void updatePartnerProfile({ isPremiumPartner: !detail.partnerProfile.isPremiumPartner })}
                      >
                        {detail.partnerProfile.isPremiumPartner ? t("app.owner.partner.disable") : t("app.owner.partner.enable")}
                      </button>
                    </div>
                    {detail.partnerProfile.isPremiumPartner && detail.partnerProfile.premiumGrantedAt ? (
                      <div className="mt-2 text-xs text-gray-600">{new Date(detail.partnerProfile.premiumGrantedAt).toLocaleString()}</div>
                    ) : null}
                    {detail.partnerProfile.isPremiumPartner ? (
                      <div className="mt-3 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
                        <span className="h-2 w-2 rounded-full bg-amber-500" />
                        {t("app.referrals.premium.badge")}
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-xl border border-gray-200 bg-white p-4">
                    <div className="text-xs font-semibold text-gray-900">{t("app.owner.partner.betaAccess")}</div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div className="text-sm text-gray-700">{detail.partnerProfile.betaAccessEnabled ? t("common.status.active") : t("common.status.inactive")}</div>
                      <button
                        type="button"
                        disabled={!!acting}
                        className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                        onClick={() => void updatePartnerProfile({ betaAccessEnabled: !detail.partnerProfile.betaAccessEnabled })}
                      >
                        {detail.partnerProfile.betaAccessEnabled ? t("app.owner.partner.disable") : t("app.owner.partner.enable")}
                      </button>
                    </div>
                    {detail.partnerProfile.betaAccessEnabled && detail.partnerProfile.betaEnabledAt ? (
                      <div className="mt-2 text-xs text-gray-600">{new Date(detail.partnerProfile.betaEnabledAt).toLocaleString()}</div>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <Stat label={t("app.owner.partner.stats.total")} value={detail.referralStats.total} />
                  <Stat label={t("app.owner.partner.stats.successful")} value={detail.referralStats.successful} />
                  <Stat label={t("app.owner.partner.stats.pending")} value={detail.referralStats.pending} />
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold text-gray-900">{t("app.owner.partner.rewards")}</div>
                  {detail.referralRewards.length === 0 ? (
                    <div className="mt-2 text-sm text-gray-600">{t("app.owner.partner.rewards.empty")}</div>
                  ) : (
                    <div className="mt-2 space-y-1 text-sm text-gray-700">
                      {detail.referralRewards.slice(0, 6).map((r) => (
                        <div key={`${r.rewardType}:${r.grantedAt}`} className="flex items-center justify-between gap-3">
                          <span className="font-medium text-gray-900">{t(`app.referrals.reward.${r.rewardType}`)}</span>
                          <span className="text-xs text-gray-600">{new Date(r.grantedAt).toLocaleDateString()}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="mt-4 rounded-xl border border-gray-200 bg-white p-4">
                  <div className="text-xs font-semibold text-gray-900">{t("app.owner.partner.feedback")}</div>
                  {detail.partnerFeedback.length === 0 ? (
                    <div className="mt-2 text-sm text-gray-600">{t("app.owner.partner.feedback.empty")}</div>
                  ) : (
                    <div className="mt-2 space-y-3">
                      {detail.partnerFeedback.slice(0, 5).map((f) => (
                        <div key={f.id} className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="font-medium text-gray-900">{f.subject}</div>
                              <div className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{f.message}</div>
                            </div>
                            {f.isBetaFeedback ? (
                              <span className="inline-flex shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                                {t("app.owner.partner.feedback.beta")}
                              </span>
                            ) : null}
                          </div>
                          <div className="mt-2 text-xs text-gray-600">{new Date(f.createdAt).toLocaleString()}</div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-gray-50 p-5">
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-gray-900">{t("app.owner.users.title")}</div>
                    <div className="mt-1 text-xs text-gray-600">{t("app.owner.users.subtitle")}</div>
                  </div>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                    onClick={() => {
                      setInviteUrl(null);
                      setAddUserEmail("");
                      setAddUserFullName("");
                      setAddUserRole("Staff");
                      setAddUserOpen(true);
                    }}
                    disabled={detailLoading}
                  >
                    {t("app.owner.users.add")}
                  </button>
                </div>

                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-[860px] w-full border-separate border-spacing-0 text-sm">
                    <thead>
                      <tr>
                        <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-900">{t("app.owner.users.col.user")}</th>
                        <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-900">{t("app.owner.users.col.role")}</th>
                        <th className="border-b border-gray-200 px-3 py-2 text-left font-medium text-gray-900">{t("app.owner.users.col.status")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.memberships.length === 0 ? (
                        <tr>
                          <td className="px-3 py-4 text-gray-600" colSpan={3}>
                            {t("app.owner.users.empty")}
                          </td>
                        </tr>
                      ) : (
                        detail.memberships.map((m) => (
                          <tr key={m.id}>
                            <td className="border-b border-gray-200 px-3 py-3">
                              <div className="font-semibold text-gray-900">{m.user.fullName}</div>
                              <div className="mt-1 text-xs text-gray-600">{m.user.email ?? "—"}</div>
                            </td>
                            <td className="border-b border-gray-200 px-3 py-3 text-gray-700">{m.role.name}</td>
                            <td className="border-b border-gray-200 px-3 py-3 text-gray-700">{m.status}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">{t("errors.notFound")}</div>
          )}
        </div>
      </Modal>

      <Modal
        open={!!setPeriod && !!detailOpen}
        onClose={() => {
          if (acting) return;
          setSetPeriod(null);
        }}
      >
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.owner.setPeriod.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{setPeriod ? t(setPeriod.moduleNameKey) : null}</div>
          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-900">{t("app.owner.form.periodEnd")}</label>
            <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" type="date" value={setPeriod?.date ?? ""} onChange={(e) => setSetPeriod((p) => (p ? { ...p, date: e.target.value } : p))} />
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setSetPeriod(null)} disabled={!!acting}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              disabled={!detail?.id || !setPeriod?.date || !!acting}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              onClick={async () => {
                if (!detail?.id || !setPeriod) return;
                const iso = toIsoFromDateInput(setPeriod.date);
                if (!iso) return;
                setActing(setPeriod.moduleId);
                setErrorKey(null);
                try {
                  const res = await apiFetch(`/api/owner/subscriptions/${encodeURIComponent(detail.id)}/${encodeURIComponent(setPeriod.moduleId)}/set-period`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ currentPeriodEndAt: iso })
                  });
                  if (!res.ok) setErrorKey("errors.internal");
                  setSetPeriod(null);
                  await refreshDetail();
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setActing(null);
                }
              }}
            >
              {t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!activate && !!detailOpen}
        onClose={() => {
          if (acting) return;
          setActivate(null);
        }}
      >
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.owner.activate.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{activate ? t(activate.moduleNameKey) : null}</div>

          <div className="mt-6 space-y-3">
            <label className="block text-sm font-medium text-gray-900">{t("app.owner.approve.subscriptionType")}</label>
            <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={activateType} onChange={(e) => setActivateType(e.target.value as SubscriptionType)}>
              <option value="online_monthly">{t("common.pricing.online.label")}</option>
              <option value="offline_no_changes">{t("common.pricing.desktopNoChanges.label")}</option>
              <option value="offline_with_changes">{t("common.pricing.desktopWithChanges.label")}</option>
            </select>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.owner.form.priceAmount")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={activatePriceAmount} onChange={(e) => setActivatePriceAmount(e.target.value)} inputMode="decimal" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.owner.form.priceCurrency")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={activatePriceCurrency} onChange={(e) => setActivatePriceCurrency(e.target.value)} />
            </div>
          </div>

          {activateType === "online_monthly" ? (
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-900">{t("app.owner.form.periodEnd")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" type="date" value={activatePeriodEndDate} onChange={(e) => setActivatePeriodEndDate(e.target.value)} />
              <div className="mt-2 text-xs text-gray-600">{t("app.owner.form.periodEnd.hint")}</div>
            </div>
          ) : null}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setActivate(null)} disabled={!!acting}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              disabled={!detail?.id || !activate || !!acting}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              onClick={async () => {
                if (!detail?.id || !activate) return;
                const iso = activateType === "online_monthly" ? toIsoFromDateInput(activatePeriodEndDate) : null;
                setActing(activate.moduleId);
                setErrorKey(null);
                try {
                  const res = await apiFetch(`/api/owner/subscriptions/${encodeURIComponent(detail.id)}/${encodeURIComponent(activate.moduleId)}/activate`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      subscriptionType: activateType,
                      priceAmount: activatePriceAmount.trim() || undefined,
                      priceCurrency: activatePriceCurrency.trim() || undefined,
                      currentPeriodEndAt: iso ?? undefined
                    })
                  });
                  if (!res.ok) setErrorKey("errors.internal");
                  setActivate(null);
                  await refreshDetail();
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setActing(null);
                }
              }}
            >
              {t("app.owner.action.activate")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={addUserOpen && !!detailOpen}
        onClose={() => {
          if (acting) return;
          setAddUserOpen(false);
        }}
      >
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.owner.users.addTitle")}</div>
          <div className="mt-2 text-sm text-gray-700">{detail ? `${detail.displayName} • ${detail.slug}` : null}</div>

          <div className="mt-6 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.owner.users.field.email")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={addUserEmail} onChange={(e) => setAddUserEmail(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.owner.users.field.fullName")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={addUserFullName} onChange={(e) => setAddUserFullName(e.target.value)} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.owner.users.field.role")}</label>
              <select className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={addUserRole} onChange={(e) => setAddUserRole(e.target.value)}>
                {(detail?.roles ?? []).map((r) => (
                  <option key={r.id} value={r.name}>
                    {r.name}
                  </option>
                ))}
              </select>
            </div>

            {inviteUrl ? (
              <div className="rounded-2xl border border-gray-200 bg-white p-4">
                <div className="text-xs font-medium text-gray-500">{t("app.owner.users.inviteLink")}</div>
                <div className="mt-2 flex items-center gap-2">
                  <input className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" readOnly value={inviteUrl} />
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(inviteUrl);
                      } catch {}
                    }}
                  >
                    {t("app.owner.action.copy")}
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setAddUserOpen(false)} disabled={!!acting}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              disabled={!detail?.id || !addUserEmail.trim() || !!acting}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              onClick={async () => {
                if (!detail?.id) return;
                setActing("add-user");
                setErrorKey(null);
                setInviteUrl(null);
                try {
                  const res = await apiFetch(`/api/owner/tenants/${encodeURIComponent(detail.id)}/memberships`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ email: addUserEmail.trim(), fullName: addUserFullName.trim() || undefined, roleName: addUserRole })
                  });
                  const json = (await res.json().catch(() => null)) as { data?: { inviteUrl?: string } } | null;
                  if (!res.ok) {
                    setErrorKey("errors.internal");
                    return;
                  }
                  if (json?.data?.inviteUrl) setInviteUrl(json.data.inviteUrl);
                  await refreshDetail();
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setActing(null);
                }
              }}
            >
              {t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function Stat(props: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4">
      <div className="text-xs font-medium text-gray-500">{props.label}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900 tabular">{String(props.value)}</div>
    </div>
  );
}
