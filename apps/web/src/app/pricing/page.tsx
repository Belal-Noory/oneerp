import { getApiBaseUrl } from "@/lib/api";
import { getRequestLocale } from "@/lib/locale";
import { t as translate } from "@oneerp/i18n";
import { Reveal } from "@/components/Reveal";
import type { ReactNode } from "react";

type PublicPlan = {
  code: string;
  name_key: string;
  description_key: string;
  is_active: boolean;
};

export default async function PricingPage() {
  const baseUrl = getApiBaseUrl();
  const locale = await getRequestLocale();
  const t = (key: string) => translate(locale, key);
  const res = await fetch(`${baseUrl}/api/public/plans`, { cache: "no-store" }).catch(() => null);
  const json = res && res.ok ? ((await res.json()) as { data: PublicPlan[] }) : { data: [] as PublicPlan[] };
  const plans = Array.isArray(json.data) ? json.data : [];

  return <PricingView t={t} plans={plans} />;
}

function PricingView(props: { t: (key: string) => string; plans: PublicPlan[] }) {
  const plans = props.plans.length ? props.plans : fallbackPlans();

  return (
    <div className="space-y-14">
      <Reveal>
        <section className="relative overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-accent-50" />
          <div className="relative px-8 py-12 md:px-12">
            <div className="mx-auto max-w-3xl text-center">
              <h1 className="text-4xl font-semibold tracking-tight">{props.t("public.pricing.title")}</h1>
              <p className="mt-3 text-lg text-gray-700">{props.t("public.pricing.subtitle")}</p>
              <p className="mt-4 text-sm text-gray-700">{props.t("public.pricing.note.comingSoon")}</p>
            </div>
          </div>
        </section>
      </Reveal>

      <section className="grid gap-4 md:grid-cols-3">
        <Reveal delayMs={0}>
          <PromoCard t={props.t} icon={<SparkIcon />} title={props.t("public.discounts.businessGrowthOffer")} desc={props.t("public.pricing.promo.default5")} />
        </Reveal>
        <Reveal delayMs={70}>
          <PromoCard t={props.t} icon={<LinkIcon />} title={props.t("public.pricing.promo.referralTitle")} desc={props.t("public.pricing.promo.referral10")} />
        </Reveal>
        <Reveal delayMs={140}>
          <PromoCard t={props.t} icon={<StackIcon />} title={props.t("public.pricing.promo.bundleTitle")} desc={props.t("public.discounts.bundleNote")} />
        </Reveal>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        {plans.map((p, idx) => (
          <Reveal key={p.code} delayMs={idx * 90}>
            <PlanCard t={props.t} plan={p} highlighted={p.code === "pro"} />
          </Reveal>
        ))}
      </section>

      <Reveal>
        <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xl font-semibold">{props.t("public.pricing.compare.title")}</div>
              <div className="mt-1 text-sm text-gray-700">{props.t("public.pricing.compare.subtitle")}</div>
            </div>
            <div className="text-sm text-gray-500">{props.t("public.pricing.compare.note")}</div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="min-w-[720px] w-full border-separate border-spacing-0">
              <thead>
                <tr>
                  <th className="sticky left-0 bg-white px-4 py-3 text-left text-sm font-medium text-gray-900">{props.t("public.pricing.compare.col.feature")}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">{props.t("public.pricing.plan.basic.name")}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">{props.t("public.pricing.plan.pro.name")}</th>
                  <th className="px-4 py-3 text-left text-sm font-medium text-gray-900">{props.t("public.pricing.plan.enterprise.name")}</th>
                </tr>
              </thead>
              <tbody className="text-sm">
                <CompareRow t={props.t} labelKey="public.pricing.compare.row.tenant" basic pro enterprise />
                <CompareRow t={props.t} labelKey="public.pricing.compare.row.rbac" basic pro enterprise />
                <CompareRow t={props.t} labelKey="public.pricing.compare.row.i18n" basic pro enterprise />
                <CompareRow t={props.t} labelKey="public.pricing.compare.row.exports" basic pro enterprise />
                <CompareRow t={props.t} labelKey="public.pricing.compare.row.modules" basic={false} pro enterprise />
                <CompareRow t={props.t} labelKey="public.pricing.compare.row.audit" basic={false} pro enterprise />
                <CompareRow t={props.t} labelKey="public.pricing.compare.row.support" basic={false} pro enterprise />
              </tbody>
            </table>
          </div>
        </section>
      </Reveal>

      <Reveal>
        <section className="rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
          <div className="text-xl font-semibold">{props.t("public.pricing.faq.title")}</div>
          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <FaqItem t={props.t} qKey="public.pricing.faq.q1" aKey="public.pricing.faq.a1" />
            <FaqItem t={props.t} qKey="public.pricing.faq.q2" aKey="public.pricing.faq.a2" />
            <FaqItem t={props.t} qKey="public.pricing.faq.q3" aKey="public.pricing.faq.a3" />
            <FaqItem t={props.t} qKey="public.pricing.faq.q4" aKey="public.pricing.faq.a4" />
          </div>
        </section>
      </Reveal>
    </div>
  );
}

function PlanCard(props: { t: (key: string) => string; plan: PublicPlan; highlighted: boolean }) {
  const features = planFeatures(props.plan.code);
  return (
    <div
      className={[
        "relative rounded-2xl border bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg",
        props.highlighted ? "border-primary-200 ring-1 ring-primary-100" : "border-gray-200"
      ].join(" ")}
    >
      {props.highlighted ? (
        <div className="absolute right-4 top-4 rounded-full bg-primary-50 px-3 py-1 text-xs font-medium text-primary-700">
          {props.t("public.pricing.plan.pro.badge")}
        </div>
      ) : null}

      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold">{props.t(props.plan.name_key)}</div>
          <div className="mt-1 text-sm text-gray-700">{props.t(props.plan.description_key)}</div>
        </div>
        <div className="mt-1">{planIcon(props.plan.code)}</div>
      </div>

      <ul className="mt-6 space-y-3 text-sm text-gray-700">
        {features.map((key) => (
          <li key={key} className="flex items-start gap-2">
            <CheckIcon />
            <span className="pt-0.5">{props.t(key)}</span>
          </li>
        ))}
      </ul>

      <div className="mt-8">
        <button
          className={[
            "inline-flex h-10 w-full items-center justify-center rounded-md px-4 text-sm font-medium shadow-sm transition",
            props.highlighted ? "bg-primary-600 text-white hover:bg-primary-700 hover:shadow-md" : "bg-gray-900 text-white hover:bg-gray-800 hover:shadow-md"
          ].join(" ")}
        >
          {props.t(props.plan.code === "enterprise" ? "public.pricing.cta.contactSales" : "public.pricing.cta.startTrial")}
        </button>
      </div>
    </div>
  );
}

function planFeatures(code: string): string[] {
  if (code === "enterprise") {
    return [
      "public.pricing.plan.enterprise.features.1",
      "public.pricing.plan.enterprise.features.2",
      "public.pricing.plan.enterprise.features.3",
      "public.pricing.plan.enterprise.features.4"
    ];
  }
  if (code === "pro") {
    return [
      "public.pricing.plan.pro.features.1",
      "public.pricing.plan.pro.features.2",
      "public.pricing.plan.pro.features.3",
      "public.pricing.plan.pro.features.4"
    ];
  }
  return [
    "public.pricing.plan.basic.features.1",
    "public.pricing.plan.basic.features.2",
    "public.pricing.plan.basic.features.3",
    "public.pricing.plan.basic.features.4"
  ];
}

function FaqItem(props: { t: (key: string) => string; qKey: string; aKey: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-5">
      <div className="text-sm font-semibold text-gray-900">{props.t(props.qKey)}</div>
      <div className="mt-2 text-sm text-gray-700">{props.t(props.aKey)}</div>
    </div>
  );
}

function CompareRow(props: {
  t: (key: string) => string;
  labelKey: string;
  basic: boolean;
  pro: boolean;
  enterprise: boolean;
}) {
  return (
    <tr>
      <td className="sticky left-0 border-t border-gray-200 bg-white px-4 py-3 text-gray-900">{props.t(props.labelKey)}</td>
      <td className="border-t border-gray-200 px-4 py-3">{props.basic ? <CheckIcon /> : <Dash />}</td>
      <td className="border-t border-gray-200 px-4 py-3">{props.pro ? <CheckIcon /> : <Dash />}</td>
      <td className="border-t border-gray-200 px-4 py-3">{props.enterprise ? <CheckIcon /> : <Dash />}</td>
    </tr>
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

function Dash() {
  return <span className="text-gray-300">—</span>;
}

function planIcon(code: string) {
  if (code === "enterprise") {
    return (
      <svg className="h-10 w-10 text-gray-900" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M7 10V7a5 5 0 0 1 10 0v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path
          d="M6 10h12a2 2 0 0 1 2 2v6a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3v-6a2 2 0 0 1 2-2Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <path d="M12 14v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    );
  }
  if (code === "pro") {
    return (
      <svg className="h-10 w-10 text-primary-700" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.77 5.82 22 7 14.14 2 9.27l6.91-1.01L12 2Z" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }
  return (
    <svg className="h-10 w-10 text-gray-900" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l8 5v8l-8 5-8-5V8l8-5Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 8v8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M8.5 12h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function PromoCard(props: { t: (key: string) => string; icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-card transition hover:-translate-y-0.5 hover:shadow-lg">
      <div className="flex items-start gap-3">
        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
          {props.icon}
        </div>
        <div>
          <div className="text-sm font-semibold text-gray-900">{props.title}</div>
          <div className="mt-1 text-sm text-gray-700">{props.desc}</div>
        </div>
      </div>
    </div>
  );
}

function SparkIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2l1.5 6.5L20 10l-6.5 1.5L12 18l-1.5-6.5L4 10l6.5-1.5L12 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M10 13a5 5 0 0 1 0-7l.8-.8a5 5 0 0 1 7.1 7.1l-.8.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 11a5 5 0 0 1 0 7l-.8.8a5 5 0 0 1-7.1-7.1l.8-.8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function StackIcon() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3l9 5-9 5-9-5 9-5Z" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 12l9 5 9-5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M3 16l9 5 9-5" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function fallbackPlans(): PublicPlan[] {
  return [
    { code: "basic", name_key: "public.pricing.plan.basic.name", description_key: "public.pricing.plan.basic.desc", is_active: true },
    { code: "pro", name_key: "public.pricing.plan.pro.name", description_key: "public.pricing.plan.pro.desc", is_active: true },
    { code: "enterprise", name_key: "public.pricing.plan.enterprise.name", description_key: "public.pricing.plan.enterprise.desc", is_active: true }
  ];
}
