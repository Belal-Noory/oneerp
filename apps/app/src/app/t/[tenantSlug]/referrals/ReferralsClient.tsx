"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/auth-fetch";
import { useClientI18n } from "@/lib/client-i18n";

type MeResponse = {
  data: {
    memberships: { tenantId: string; tenantSlug: string }[];
  };
};

type DashboardResponse = {
  data: {
    referralCode: string;
    referralLink: string;
    stats: {
      total: number;
      successful: number;
      pending: number;
      awaitingPaymentConfirmation: number;
      paymentReceived: number;
      rejected: number;
    };
    discounts: { bundlePercent: number; loyaltyPercent: number; totalPercent: number };
    rewards: {
      milestone: string;
      next: { at: number; reward: string; remaining: number } | null;
    };
    premiumPartner: { enabled: boolean; betaAccessEnabled: boolean };
  };
};

type HistoryResponse = {
  data: Array<{
    id: string;
    referredTenantSlug: string;
    referredTenantDisplayName: string;
    status: string;
    moduleId: string | null;
    registeredAt: string;
    moduleRequestedAt: string | null;
    paymentReceivedAt: string | null;
    activatedAt: string | null;
    rewardGrantedAt: string | null;
    rejectedAt: string | null;
    rejectedReason: string | null;
  }>;
};

type FeedbackResponse = {
  data: Array<{
    id: string;
    subject: string;
    message: string;
    isBetaFeedback: boolean;
    status: string;
    createdAt: string;
  }>;
};

export function ReferralsClient(props: { tenantSlug: string }) {
  const { t } = useClientI18n();
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [tenantId, setTenantId] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse["data"] | null>(null);
  const [history, setHistory] = useState<HistoryResponse["data"]>([]);
  const [feedback, setFeedback] = useState<FeedbackResponse["data"]>([]);
  const [feedbackSubject, setFeedbackSubject] = useState("");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackIsBeta, setFeedbackIsBeta] = useState(false);
  const [submittingFeedback, setSubmittingFeedback] = useState(false);
  const [copied, setCopied] = useState<"code" | "link" | null>(null);

  const discountLabel = useMemo(() => `${dashboard?.discounts.totalPercent ?? 0}%`, [dashboard?.discounts.totalPercent]);

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
        if (cancelled) return;
        setTenantId(membership.tenantId);

        const [dashRes, histRes] = await Promise.all([
          apiFetch(`/api/referrals/dashboard`, { cache: "no-store", headers: { "X-Tenant-Id": membership.tenantId } }),
          apiFetch(`/api/referrals/history`, { cache: "no-store", headers: { "X-Tenant-Id": membership.tenantId } })
        ]);

        if (!dashRes.ok) {
          setErrorKey("errors.internal");
          return;
        }

        const dashJson = (await dashRes.json()) as DashboardResponse;
        const histJson = (await histRes.json().catch(() => ({ data: [] }))) as HistoryResponse;

        if (!cancelled) {
          setDashboard(dashJson.data);
          setHistory(Array.isArray(histJson.data) ? histJson.data : []);
        }

        if (dashJson.data?.premiumPartner?.enabled) {
          const fbRes = await apiFetch(`/api/referrals/feedback`, { cache: "no-store", headers: { "X-Tenant-Id": membership.tenantId } });
          if (fbRes.ok) {
            const fbJson = (await fbRes.json().catch(() => ({ data: [] }))) as FeedbackResponse;
            if (!cancelled) setFeedback(Array.isArray(fbJson.data) ? fbJson.data : []);
          }
        }
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

  async function copyText(kind: "code" | "link", value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(kind);
      window.setTimeout(() => setCopied((v) => (v === kind ? null : v)), 1200);
    } catch {}
  }

  async function shareLink(link: string) {
    try {
      if (navigator.share) {
        await navigator.share({ title: t("app.referrals.share.title"), text: t("app.referrals.share.text"), url: link });
        return;
      }
    } catch {}
    await copyText("link", link);
  }

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">{t("common.loading")}</div>;
  }

  if (errorKey) {
    return <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">{t(errorKey)}</div>;
  }

  if (!tenantId || !dashboard) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-4 md:p-6">{t("errors.tenantRequired")}</div>;
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="text-2xl font-semibold">{t("app.referrals.title")}</div>
            <div className="mt-2 text-gray-700">{t("app.referrals.subtitle")}</div>
          </div>
          {dashboard.premiumPartner.enabled ? (
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">
              <span className="h-2 w-2 rounded-full bg-amber-500" />
              {t("app.referrals.premium.badge")}
            </div>
          ) : null}
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard title={t("app.referrals.cards.total")} value={String(dashboard.stats.total)} />
        <StatCard title={t("app.referrals.cards.successful")} value={String(dashboard.stats.successful)} />
        <StatCard title={t("app.referrals.cards.pending")} value={String(dashboard.stats.pending)} />
        <StatCard title={t("app.referrals.cards.discount")} value={discountLabel} />
        <StatCard
          title={t("app.referrals.cards.rewardLevel")}
          value={t(`app.referrals.reward.${dashboard.rewards.milestone}`)}
        />
        <StatCard title={t("app.referrals.cards.betaAccess")} value={dashboard.premiumPartner.betaAccessEnabled ? t("common.yes") : t("common.no")} />
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="text-lg font-semibold">{t("app.referrals.link.title")}</div>
        <div className="mt-2 text-sm text-gray-700">{t("app.referrals.link.subtitle")}</div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold text-gray-900">{t("app.referrals.link.codeLabel")}</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="truncate font-mono text-sm text-gray-900">{dashboard.referralCode}</div>
              <button
                type="button"
                className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                onClick={() => void copyText("code", dashboard.referralCode)}
              >
                {copied === "code" ? t("app.referrals.link.copied") : t("app.referrals.link.copy")}
              </button>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <div className="text-xs font-semibold text-gray-900">{t("app.referrals.link.linkLabel")}</div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <div className="truncate text-sm text-gray-900">{dashboard.referralLink}</div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="inline-flex h-9 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  onClick={() => void copyText("link", dashboard.referralLink)}
                >
                  {copied === "link" ? t("app.referrals.link.copied") : t("app.referrals.link.copy")}
                </button>
                <button
                  type="button"
                  className="inline-flex h-9 items-center rounded-xl bg-gray-900 px-3 text-sm font-medium text-white hover:bg-gray-800"
                  onClick={() => void shareLink(dashboard.referralLink)}
                >
                  {t("app.referrals.link.share")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="text-lg font-semibold">{t("app.referrals.rewards.title")}</div>
        <div className="mt-2 text-sm text-gray-700">{t("app.referrals.rewards.subtitle")}</div>
        <div className="mt-4 overflow-auto">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="text-left text-xs text-gray-500">
              <tr>
                <th className="py-2 pr-4">{t("app.referrals.rewards.table.referrals")}</th>
                <th className="py-2 pr-4">{t("app.referrals.rewards.table.reward")}</th>
                <th className="py-2">{t("app.referrals.rewards.table.benefits")}</th>
              </tr>
            </thead>
            <tbody className="text-gray-900">
              <RewardRow referrals="1" rewardKey="invoice_discount_10" />
              <RewardRow referrals="3" rewardKey="free_month" />
              <RewardRow referrals="5" rewardKey="premium_partner" />
              <RewardRow referrals="10" rewardKey="loyalty_extra_5" />
            </tbody>
          </table>
        </div>

        {dashboard.rewards.next ? (
          <div className="mt-4 rounded-xl border border-primary-200 bg-primary-50 p-4 text-sm text-primary-800">
            {`${t("app.referrals.progress.youAre")} ${dashboard.rewards.next.remaining} ${t("app.referrals.progress.awayFrom")} ${t(
              `app.referrals.reward.${dashboard.rewards.next.reward}`
            )}`}
          </div>
        ) : (
          <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm text-gray-700">{t("app.referrals.progress.completed")}</div>
        )}
      </div>

      {dashboard.premiumPartner.enabled ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 shadow-card md:p-6">
          <div className="text-lg font-semibold text-amber-900">{t("app.referrals.premium.title")}</div>
          <div className="mt-2 text-sm text-amber-900/80">{t("app.referrals.premium.subtitle")}</div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <BenefitCard title={t("app.referrals.premium.benefit.prioritySupport.title")} desc={t("app.referrals.premium.benefit.prioritySupport.desc")} />
            <BenefitCard title={t("app.referrals.premium.benefit.betaAccess.title")} desc={t("app.referrals.premium.benefit.betaAccess.desc")} />
          </div>

          <div className="mt-6 rounded-xl border border-amber-200 bg-white/70 p-4">
            <div className="text-sm font-semibold text-amber-900">{t("app.referrals.feedback.title")}</div>
            <div className="mt-1 text-sm text-amber-900/80">{t("app.referrals.feedback.subtitle")}</div>

            <div className="mt-4 grid gap-3 md:grid-cols-2">
              <div>
                <label className="block text-sm font-medium text-amber-900">{t("app.referrals.feedback.subject")}</label>
                <input
                  className="mt-1 h-11 w-full rounded-xl border border-amber-200 bg-white px-3 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                  value={feedbackSubject}
                  onChange={(e) => setFeedbackSubject(e.target.value)}
                />
              </div>
              <div className="flex items-end">
                <label className="inline-flex items-center gap-2 text-sm text-amber-900">
                  <input type="checkbox" className="h-4 w-4 rounded border-amber-300" checked={feedbackIsBeta} onChange={(e) => setFeedbackIsBeta(e.target.checked)} />
                  {t("app.referrals.feedback.beta")}
                </label>
              </div>
            </div>

            <div className="mt-3">
              <label className="block text-sm font-medium text-amber-900">{t("app.referrals.feedback.message")}</label>
              <textarea
                className="mt-1 min-h-[110px] w-full resize-y rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
                value={feedbackMessage}
                onChange={(e) => setFeedbackMessage(e.target.value)}
              />
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                disabled={submittingFeedback || !feedbackSubject.trim() || !feedbackMessage.trim()}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-amber-600 px-4 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                onClick={async () => {
                  if (!feedbackSubject.trim() || !feedbackMessage.trim()) return;
                  setSubmittingFeedback(true);
                  try {
                    const res = await apiFetch(`/api/referrals/feedback`, {
                      method: "POST",
                      headers: { "Content-Type": "application/json", "X-Tenant-Id": tenantId },
                      body: JSON.stringify({ subject: feedbackSubject.trim(), message: feedbackMessage.trim(), isBetaFeedback: feedbackIsBeta })
                    });
                    if (!res.ok) {
                      setErrorKey("errors.validationError");
                      return;
                    }
                    setFeedbackSubject("");
                    setFeedbackMessage("");
                    setFeedbackIsBeta(false);
                    const fbRes = await apiFetch(`/api/referrals/feedback`, { cache: "no-store", headers: { "X-Tenant-Id": tenantId } });
                    if (fbRes.ok) {
                      const fbJson = (await fbRes.json().catch(() => ({ data: [] }))) as FeedbackResponse;
                      setFeedback(Array.isArray(fbJson.data) ? fbJson.data : []);
                    }
                  } catch {
                    setErrorKey("errors.internal");
                  } finally {
                    setSubmittingFeedback(false);
                  }
                }}
              >
                {submittingFeedback ? t("common.loading") : t("app.referrals.feedback.submit")}
              </button>
            </div>

            <div className="mt-5">
              <div className="text-sm font-semibold text-amber-900">{t("app.referrals.feedback.history")}</div>
              {feedback.length === 0 ? (
                <div className="mt-2 text-sm text-amber-900/80">{t("app.referrals.feedback.empty")}</div>
              ) : (
                <div className="mt-2 space-y-2">
                  {feedback.slice(0, 5).map((f) => (
                    <div key={f.id} className="rounded-xl border border-amber-200 bg-white p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium text-gray-900">{f.subject}</div>
                          <div className="mt-1 whitespace-pre-wrap text-sm text-gray-700">{f.message}</div>
                        </div>
                        {f.isBetaFeedback ? (
                          <span className="inline-flex shrink-0 rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-800">
                            {t("app.referrals.feedback.beta")}
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-2 text-xs text-gray-600">{formatDate(f.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card md:p-6">
        <div className="text-lg font-semibold">{t("app.referrals.history.title")}</div>
        <div className="mt-2 text-sm text-gray-700">{t("app.referrals.history.subtitle")}</div>
        {history.length === 0 ? (
          <div className="mt-4 text-sm text-gray-500">{t("app.referrals.history.empty")}</div>
        ) : (
          <div className="mt-4 overflow-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="text-left text-xs text-gray-500">
                <tr>
                  <th className="py-2 pr-4">{t("app.referrals.history.table.tenant")}</th>
                  <th className="py-2 pr-4">{t("app.referrals.history.table.date")}</th>
                  <th className="py-2 pr-4">{t("app.referrals.history.table.status")}</th>
                  <th className="py-2 pr-4">{t("app.referrals.history.table.module")}</th>
                  <th className="py-2">{t("app.referrals.history.table.reward")}</th>
                </tr>
              </thead>
              <tbody className="text-gray-900">
                {history.map((r) => (
                  <tr key={r.id} className="border-t border-gray-100">
                    <td className="py-3 pr-4">
                      <div className="font-medium">{r.referredTenantDisplayName}</div>
                      <div className="text-xs text-gray-500">{r.referredTenantSlug}</div>
                    </td>
                    <td className="py-3 pr-4 text-gray-700">{formatDate(r.registeredAt)}</td>
                    <td className="py-3 pr-4">
                      <span className="inline-flex rounded-full bg-gray-100 px-2 py-1 text-xs text-gray-700">{t(`app.referrals.status.${r.status}`)}</span>
                    </td>
                    <td className="py-3 pr-4 text-gray-700">{r.moduleId ?? "—"}</td>
                    <td className="py-3 text-gray-700">{r.rewardGrantedAt ? t("app.referrals.history.rewardGranted") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );

  function RewardRow(props: { referrals: string; rewardKey: string }) {
    return (
      <tr className="border-t border-gray-100">
        <td className="py-3 pr-4 font-semibold">{props.referrals}</td>
        <td className="py-3 pr-4">{t(`app.referrals.reward.${props.rewardKey}`)}</td>
        <td className="py-3">{t(`app.referrals.rewardBenefit.${props.rewardKey}`)}</td>
      </tr>
    );
  }
}

function StatCard(props: { title: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-card">
      <div className="text-xs font-medium text-gray-500">{props.title}</div>
      <div className="mt-2 text-2xl font-semibold text-gray-900 tabular">{props.value}</div>
    </div>
  );
}

function BenefitCard(props: { title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-amber-200 bg-white/60 p-4">
      <div className="text-sm font-semibold text-amber-900">{props.title}</div>
      <div className="mt-1 text-sm text-amber-900/80">{props.desc}</div>
    </div>
  );
}

function formatDate(raw: string) {
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toISOString().slice(0, 10);
}
