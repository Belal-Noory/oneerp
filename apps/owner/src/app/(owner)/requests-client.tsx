"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";
import { Modal } from "@/components/Modal";

type ModuleRequest = {
  id: string;
  tenantId: string;
  tenantSlug: string;
  tenantDisplayName: string;
  tenantLegalName: string;
  moduleId: string;
  moduleNameKey: string;
  moduleCategory: string;
  moduleIcon: string;
  status: string;
  requestedAt: string;
  tracking: null | {
    status: string;
    requestedAt: string;
    paymentReceivedAt: string | null;
    activatedAt: string | null;
    rejectedAt: string | null;
    paymentNotes: string | null;
    activationNotes: string | null;
  };
  referral: null | {
    status: string;
    source: string | null;
    moduleId: string | null;
    referrerCode: string;
    referrerTenantSlug: string | null;
    referrerTenantDisplayName: string | null;
  };
};

type ModuleRequestsResponse = { data: ModuleRequest[] };

type SubscriptionType = "online_monthly" | "offline_no_changes" | "offline_with_changes";

type ReferralSettings = {
  bundleStepPercent: number;
  bundleMaxPercent: number;
  loyaltyExtraPercent: number;
  invoiceDiscountPercent: number;
  freeMonthAtReferrals: number;
  premiumPartnerAtReferrals: number;
  loyaltyExtraAtReferrals: number;
};

type ReferralSettingsResponse = { data: ReferralSettings };

function toIsoFromDateInput(value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  const d = new Date(`${v}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function OwnerRequestsClient() {
  const { t } = useClientI18n();
  const [items, setItems] = useState<ModuleRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);

  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settings, setSettings] = useState<ReferralSettings | null>(null);

  const [approve, setApprove] = useState<null | { tenantId: string; moduleId: string; tenantName: string; moduleName: string }>(null);
  const [reject, setReject] = useState<null | { tenantId: string; moduleId: string; tenantName: string; moduleName: string }>(null);
  const [markPayment, setMarkPayment] = useState<null | { tenantId: string; moduleId: string; tenantName: string; moduleName: string }>(null);
  const [paymentNotes, setPaymentNotes] = useState("");
  const [markingPayment, setMarkingPayment] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [subscriptionType, setSubscriptionType] = useState<SubscriptionType>("online_monthly");
  const [priceAmount, setPriceAmount] = useState("");
  const [priceCurrency, setPriceCurrency] = useState("USD");
  const [periodEndDate, setPeriodEndDate] = useState("");
  const [approvePaymentNotes, setApprovePaymentNotes] = useState("");
  const [approveActivationNotes, setApproveActivationNotes] = useState("");
  const [approving, setApproving] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setErrorKey(null);
    try {
      const res = await apiFetch("/api/owner/module-requests", { cache: "no-store" });
      if (!res.ok) {
        setErrorKey("errors.internal");
        return;
      }
      const json = (await res.json()) as ModuleRequestsResponse;
      setItems(json.data ?? []);
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const count = items.length;
  const grouped = useMemo(() => items, [items]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.owner.requests.title")}</div>
            <div className="mt-2 text-sm text-gray-700">{t("app.owner.requests.subtitle")}</div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={async () => {
                setSettingsOpen(true);
                if (settings) return;
                setSettingsLoading(true);
                setErrorKey(null);
                try {
                  const res = await apiFetch("/api/owner/referral-settings", { cache: "no-store" });
                  if (!res.ok) {
                    setErrorKey("errors.internal");
                    return;
                  }
                  const json = (await res.json()) as ReferralSettingsResponse;
                  setSettings(json.data);
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setSettingsLoading(false);
                }
              }}
            >
              {t("app.owner.referrals.settings")}
            </button>
            <button
              type="button"
              className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => void reload()}
              disabled={loading}
            >
              {t("common.button.refresh")}
            </button>
          </div>
        </div>
        <div className="mt-4 text-sm text-gray-600 tabular">
          {t("app.owner.requests.count")}: {count}
        </div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full border-separate border-spacing-0 text-sm">
            <thead>
              <tr>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.table.tenant")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.table.module")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.table.paymentStatus")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.table.referral")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-left font-medium text-gray-900">{t("app.owner.table.requestedAt")}</th>
                <th className="border-b border-gray-200 px-4 py-3 text-right font-medium text-gray-900">{t("app.owner.table.actions")}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={6}>
                    {t("common.loading")}
                  </td>
                </tr>
              ) : grouped.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-gray-600" colSpan={6}>
                    {t("app.owner.requests.empty")}
                  </td>
                </tr>
              ) : (
                grouped.map((r) => (
                  <tr key={r.id}>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="font-semibold text-gray-900">{r.tenantDisplayName}</div>
                      <div className="mt-1 text-xs text-gray-600">{r.tenantSlug}</div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <div className="font-semibold text-gray-900">{t(r.moduleNameKey)}</div>
                      <div className="mt-1 text-xs text-gray-600">{r.moduleId}</div>
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      <span
                        className={[
                          "inline-flex rounded-full px-2 py-1 text-xs font-medium",
                          r.tracking?.status === "payment_received"
                            ? "bg-emerald-50 text-emerald-700"
                            : r.tracking?.status === "activated"
                              ? "bg-primary-50 text-primary-700"
                              : r.tracking?.status === "rejected"
                                ? "bg-red-50 text-red-700"
                                : "bg-amber-50 text-amber-700"
                        ].join(" ")}
                      >
                        {t(`app.owner.paymentStatus.${r.tracking?.status ?? "pending"}`)}
                      </span>
                      {r.tracking?.paymentReceivedAt ? (
                        <div className="mt-1 text-xs text-gray-600">{new Date(r.tracking.paymentReceivedAt).toLocaleString()}</div>
                      ) : null}
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3">
                      {r.referral ? (
                        <div className="space-y-1">
                          <div className="font-medium text-gray-900">{r.referral.referrerTenantDisplayName ?? r.referral.referrerTenantSlug ?? "—"}</div>
                          <div className="text-xs text-gray-600 tabular">{r.referral.referrerCode}</div>
                          <div className="text-xs text-gray-600">{t(`app.owner.referralStatus.${r.referral.status}`)}</div>
                        </div>
                      ) : (
                        <div className="text-sm text-gray-600">—</div>
                      )}
                    </td>
                    <td className="border-b border-gray-100 px-4 py-3 text-gray-700">{new Date(r.requestedAt).toLocaleString()}</td>
                    <td className="border-b border-gray-100 px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                          disabled={r.tracking?.status === "payment_received" || r.tracking?.status === "activated"}
                          onClick={() => {
                            setPaymentNotes(r.tracking?.paymentNotes ?? "");
                            setMarkPayment({ tenantId: r.tenantId, moduleId: r.moduleId, tenantName: r.tenantDisplayName, moduleName: t(r.moduleNameKey) });
                          }}
                        >
                          {t("app.owner.action.paymentReceived")}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50 disabled:opacity-60"
                          onClick={() => {
                            setRejectReason("");
                            setReject({ tenantId: r.tenantId, moduleId: r.moduleId, tenantName: r.tenantDisplayName, moduleName: t(r.moduleNameKey) });
                          }}
                        >
                          {t("app.owner.action.reject")}
                        </button>
                        <button
                          type="button"
                          className="inline-flex h-9 items-center justify-center rounded-xl bg-primary-600 px-3 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
                          onClick={() => {
                            setSubscriptionType("online_monthly");
                            setPriceAmount("40");
                            setPriceCurrency("USD");
                            setPeriodEndDate("");
                            setApprovePaymentNotes("");
                            setApproveActivationNotes("");
                            setApprove({ tenantId: r.tenantId, moduleId: r.moduleId, tenantName: r.tenantDisplayName, moduleName: t(r.moduleNameKey) });
                          }}
                        >
                          {t("app.owner.action.approve")}
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

      <Modal
        open={!!approve}
        onClose={() => {
          if (approving) return;
          setApprove(null);
        }}
      >
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.owner.approve.title")}</div>
          <div className="mt-2 text-sm text-gray-700">
            {approve ? (
              <>
                <span className="font-medium text-gray-900">{approve.tenantName}</span> • <span className="font-medium text-gray-900">{approve.moduleName}</span>
              </>
            ) : null}
          </div>

          <div className="mt-6 space-y-3">
            <label className="block text-sm font-medium text-gray-900">{t("app.owner.approve.subscriptionType")}</label>
            <select className="h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm" value={subscriptionType} onChange={(e) => setSubscriptionType(e.target.value as SubscriptionType)}>
              <option value="online_monthly">{t("common.pricing.online.label")}</option>
              <option value="offline_no_changes">{t("common.pricing.desktopNoChanges.label")}</option>
              <option value="offline_with_changes">{t("common.pricing.desktopWithChanges.label")}</option>
            </select>
            <div className="text-xs text-gray-600">{t("common.pricing.changesPeriod")}</div>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.owner.form.priceAmount")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={priceAmount}
                onChange={(e) => setPriceAmount(e.target.value)}
                inputMode="decimal"
                placeholder="40"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.owner.form.priceCurrency")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" value={priceCurrency} onChange={(e) => setPriceCurrency(e.target.value)} placeholder="USD" />
            </div>
          </div>

          {subscriptionType === "online_monthly" ? (
            <div className="mt-6">
              <label className="block text-sm font-medium text-gray-900">{t("app.owner.form.periodEnd")}</label>
              <input className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100" type="date" value={periodEndDate} onChange={(e) => setPeriodEndDate(e.target.value)} />
              <div className="mt-2 text-xs text-gray-600">{t("app.owner.form.periodEnd.hint")}</div>
            </div>
          ) : null}

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.owner.approve.paymentNotes")}</label>
              <textarea
                className="mt-1 min-h-[96px] w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={approvePaymentNotes}
                onChange={(e) => setApprovePaymentNotes(e.target.value)}
                placeholder={t("app.owner.approve.paymentNotes.placeholder")}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-900">{t("app.owner.approve.activationNotes")}</label>
              <textarea
                className="mt-1 min-h-[96px] w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={approveActivationNotes}
                onChange={(e) => setApproveActivationNotes(e.target.value)}
                placeholder={t("app.owner.approve.activationNotes.placeholder")}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setApprove(null)} disabled={approving}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={!approve || approving}
              onClick={async () => {
                if (!approve) return;
                setApproving(true);
                setErrorKey(null);
                try {
                  const currentPeriodEndAt = subscriptionType === "online_monthly" ? toIsoFromDateInput(periodEndDate) : null;
                  const res = await apiFetch(`/api/owner/module-requests/${encodeURIComponent(approve.tenantId)}/${encodeURIComponent(approve.moduleId)}/approve`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      subscriptionType,
                      priceAmount: priceAmount.trim() || undefined,
                      priceCurrency: priceCurrency.trim() || undefined,
                      currentPeriodEndAt: currentPeriodEndAt ?? undefined,
                      paymentNotes: approvePaymentNotes.trim() || undefined,
                      activationNotes: approveActivationNotes.trim() || undefined
                    })
                  });
                  if (!res.ok) {
                    setErrorKey("errors.internal");
                    return;
                  }
                  setApprove(null);
                  await reload();
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setApproving(false);
                }
              }}
            >
              {approving ? t("common.loading") : t("app.owner.action.approve")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!markPayment}
        onClose={() => {
          if (markingPayment) return;
          setMarkPayment(null);
        }}
      >
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.owner.paymentReceived.title")}</div>
          <div className="mt-2 text-sm text-gray-700">
            {markPayment ? (
              <>
                <span className="font-medium text-gray-900">{markPayment.tenantName}</span> • <span className="font-medium text-gray-900">{markPayment.moduleName}</span>
              </>
            ) : null}
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-900">{t("app.owner.paymentReceived.notes")}</label>
            <textarea
              className="mt-1 min-h-[96px] w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={paymentNotes}
              onChange={(e) => setPaymentNotes(e.target.value)}
              placeholder={t("app.owner.paymentReceived.notes.placeholder")}
            />
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setMarkPayment(null)} disabled={markingPayment}>
              {t("common.button.cancel")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-gray-900 px-5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              disabled={!markPayment || markingPayment}
              onClick={async () => {
                if (!markPayment) return;
                setMarkingPayment(true);
                setErrorKey(null);
                try {
                  const res = await apiFetch(`/api/owner/module-requests/${encodeURIComponent(markPayment.tenantId)}/${encodeURIComponent(markPayment.moduleId)}/payment-received`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ paymentNotes: paymentNotes.trim() || undefined })
                  });
                  if (!res.ok) {
                    setErrorKey("errors.internal");
                    return;
                  }
                  setMarkPayment(null);
                  await reload();
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setMarkingPayment(false);
                }
              }}
            >
              {markingPayment ? t("common.loading") : t("app.owner.action.paymentReceived")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={!!reject}
        onClose={() => {
          if (rejecting) return;
          setReject(null);
        }}
      >
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.owner.action.reject")}</div>
          <div className="mt-2 text-sm text-gray-700">
            {reject ? (
              <>
                <span className="font-medium text-gray-900">{reject.tenantName}</span> • <span className="font-medium text-gray-900">{reject.moduleName}</span>
              </>
            ) : null}
          </div>

          <div className="mt-6">
            <label className="block text-sm font-medium text-gray-900">{t("app.owner.reject.reason")}</label>
            <textarea
              className="mt-1 min-h-[96px] w-full resize-y rounded-xl border border-gray-200 px-3 py-2 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={t("app.owner.reject.reason.placeholder")}
            />
          </div>

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button type="button" className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-900 hover:bg-gray-50" onClick={() => setReject(null)} disabled={rejecting}>
              {t("common.button.close")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-gray-900 px-5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
              disabled={!reject || rejecting}
              onClick={async () => {
                if (!reject) return;
                setRejecting(true);
                setErrorKey(null);
                try {
                  const res = await apiFetch(`/api/owner/module-requests/${encodeURIComponent(reject.tenantId)}/${encodeURIComponent(reject.moduleId)}/reject`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ reason: rejectReason.trim() || undefined })
                  });
                  if (!res.ok) {
                    setErrorKey("errors.internal");
                    return;
                  }
                  setReject(null);
                  await reload();
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setRejecting(false);
                }
              }}
            >
              {rejecting ? t("common.loading") : t("app.owner.action.reject")}
            </button>
          </div>
        </div>
      </Modal>

      <Modal
        open={settingsOpen}
        onClose={() => {
          if (settingsSaving) return;
          setSettingsOpen(false);
        }}
      >
        <div className="p-6 md:p-8">
          <div className="text-xl font-semibold">{t("app.owner.referrals.settings")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("app.owner.referrals.settings.subtitle")}</div>

          {settingsLoading ? (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">{t("common.loading")}</div>
          ) : settings ? (
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <FieldNumber label={t("app.owner.referrals.settings.bundleStep")} value={settings.bundleStepPercent} onChange={(v) => setSettings((s) => (s ? { ...s, bundleStepPercent: v } : s))} />
              <FieldNumber label={t("app.owner.referrals.settings.bundleMax")} value={settings.bundleMaxPercent} onChange={(v) => setSettings((s) => (s ? { ...s, bundleMaxPercent: v } : s))} />
              <FieldNumber label={t("app.owner.referrals.settings.loyaltyExtra")} value={settings.loyaltyExtraPercent} onChange={(v) => setSettings((s) => (s ? { ...s, loyaltyExtraPercent: v } : s))} />
              <FieldNumber label={t("app.owner.referrals.settings.invoiceDiscount")} value={settings.invoiceDiscountPercent} onChange={(v) => setSettings((s) => (s ? { ...s, invoiceDiscountPercent: v } : s))} />
              <FieldNumber label={t("app.owner.referrals.settings.freeMonthAt")} value={settings.freeMonthAtReferrals} onChange={(v) => setSettings((s) => (s ? { ...s, freeMonthAtReferrals: v } : s))} />
              <FieldNumber label={t("app.owner.referrals.settings.premiumAt")} value={settings.premiumPartnerAtReferrals} onChange={(v) => setSettings((s) => (s ? { ...s, premiumPartnerAtReferrals: v } : s))} />
              <FieldNumber label={t("app.owner.referrals.settings.loyaltyAt")} value={settings.loyaltyExtraAtReferrals} onChange={(v) => setSettings((s) => (s ? { ...s, loyaltyExtraAtReferrals: v } : s))} />
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-gray-200 bg-white p-4 text-sm text-gray-700">{t("errors.internal")}</div>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl border border-gray-200 bg-white px-5 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => setSettingsOpen(false)}
              disabled={settingsSaving}
            >
              {t("common.button.close")}
            </button>
            <button
              type="button"
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary-600 px-5 text-sm font-medium text-white hover:bg-primary-700 disabled:opacity-60"
              disabled={!settings || settingsSaving}
              onClick={async () => {
                if (!settings) return;
                setSettingsSaving(true);
                setErrorKey(null);
                try {
                  const res = await apiFetch("/api/owner/referral-settings", {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(settings)
                  });
                  if (!res.ok) {
                    setErrorKey("errors.internal");
                    return;
                  }
                  const json = (await res.json().catch(() => null)) as { data?: { settings?: ReferralSettings } } | null;
                  const updated = json?.data?.settings;
                  if (updated) setSettings(updated);
                  setSettingsOpen(false);
                } catch {
                  setErrorKey("errors.internal");
                } finally {
                  setSettingsSaving(false);
                }
              }}
            >
              {settingsSaving ? t("common.loading") : t("common.button.save")}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function FieldNumber(props: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900">{props.label}</label>
      <input
        className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
        inputMode="numeric"
        value={String(props.value)}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </div>
  );
}
