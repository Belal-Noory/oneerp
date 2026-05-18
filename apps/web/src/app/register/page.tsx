"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supportedLocales, type Locale } from "@oneerp/i18n";
import { useClientI18n } from "@/lib/client-i18n";
import { getApiBaseUrl } from "@/lib/api";
import { resolveRedirect } from "@/lib/redirect";
import { isValidEmail, isValidTenantSlug, toTenantSlug } from "@/lib/validation";
import type { ApiError, RegisterRequest, RegisterResponse } from "@oneerp/types";
import { HeroGraphic, IconGlobe, IconPuzzle, IconShield } from "@/components/Graphics";

type Step = "account" | "company";
type ReferralValidateResponse = { data: { valid: boolean; discountPercent: number; defaultPercent: number; referralPercent: number } };

export default function RegisterPage() {
  const { t, locale: currentLocale } = useClientI18n();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("account");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [preferredLocale, setPreferredLocale] = useState<Locale>(currentLocale);

  const [legalName, setLegalName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const suggestedSlug = useMemo(() => toTenantSlug(displayName), [displayName]);
  const [slug, setSlug] = useState("");
  const [defaultLocale, setDefaultLocale] = useState<Locale>(currentLocale);
  const [showMore, setShowMore] = useState(false);
  const [address, setAddress] = useState("");
  const [phone, setPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [referralCode, setReferralCode] = useState("");
  const [referralValidate, setReferralValidate] = useState<ReferralValidateResponse["data"] | null>(null);
  const [checkingReferral, setCheckingReferral] = useState(false);

  const [fieldError, setFieldError] = useState<Record<string, string>>({});
  const [apiErrorKey, setApiErrorKey] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const effectiveSlug = slug.trim().length ? slug : suggestedSlug;

  useEffect(() => {
    const raw = (searchParams.get("ref") ?? "").trim();
    if (!raw) return;
    setReferralCode((prev) => (prev.trim().length ? prev : raw));
  }, [searchParams]);

  useEffect(() => {
    let cancelled = false;
    const handle = window.setTimeout(async () => {
      const raw = referralCode.trim();
      setCheckingReferral(true);
      try {
        const res = await fetch(`${getApiBaseUrl()}/api/public/referral-codes/validate?code=${encodeURIComponent(raw)}`, { cache: "no-store" });
        if (!res.ok) {
          if (!cancelled) setReferralValidate(null);
          return;
        }
        const json = (await res.json()) as ReferralValidateResponse;
        if (!cancelled) setReferralValidate(json.data);
      } catch {
        if (!cancelled) setReferralValidate(null);
      } finally {
        if (!cancelled) setCheckingReferral(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [referralCode]);

  return (
    <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-2 md:items-stretch">
      <div className="relative hidden overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card md:block">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-50 via-white to-accent-50" />
        <div className="relative flex h-full flex-col p-8">
          <div className="text-sm font-semibold text-gray-900">{t("common.brand.name")}</div>
          <div className="mt-6 text-2xl font-semibold">{t("public.home.hero.title")}</div>
          <div className="mt-2 text-sm text-gray-700">{t("public.home.hero.subtitle")}</div>
          <div className="mt-8 space-y-4 text-sm text-gray-700">
            <Bullet icon={<IconPuzzle />} title={t("public.home.benefits.modular.title")} desc={t("public.home.benefits.modular.desc")} />
            <Bullet icon={<IconGlobe />} title={t("public.home.benefits.localization.title")} desc={t("public.home.benefits.localization.desc")} />
            <Bullet icon={<IconShield />} title={t("public.home.benefits.security.title")} desc={t("public.home.benefits.security.desc")} />
          </div>
          <div className="mt-auto pt-8">
            <div className="aspect-[16/10] w-full overflow-hidden rounded-xl border border-gray-200 bg-white/70 backdrop-blur">
              <HeroGraphic />
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
        <h1 className="text-2xl font-semibold">{t("auth.register.title")}</h1>
        <p className="mt-2 text-sm text-gray-700">{t("auth.register.subtitle")}</p>

        <div className="mt-6 flex items-center gap-2 text-sm">
          <StepChip active={step === "account"} label={t("auth.register.step.account")} />
          <div className="h-px flex-1 bg-gray-200" />
          <StepChip active={step === "company"} label={t("auth.register.step.company")} />
        </div>

        {step === "account" ? (
          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              setApiErrorKey(null);
              const errors: Record<string, string> = {};
              if (!fullName.trim()) errors.fullName = "validation.required";
              if (!email.trim()) errors.email = "validation.required";
              else if (!isValidEmail(email)) errors.email = "validation.email.invalid";
              if (!password.trim()) errors.password = "validation.required";
              setFieldError(errors);
              if (Object.keys(errors).length > 0) return;
              setStep("company");
            }}
          >
            <Field
              label={t("auth.register.account.fullName.label")}
              placeholder={t("auth.register.account.fullName.placeholder")}
              value={fullName}
              onChange={setFullName}
              errorKey={fieldError.fullName}
            />

            <Field
              label={t("auth.register.account.email.label")}
              placeholder={t("auth.register.account.email.placeholder")}
              value={email}
              onChange={setEmail}
              errorKey={fieldError.email}
              type="email"
            />

            <Field
              label={t("auth.register.account.password.label")}
              placeholder={t("auth.register.account.password.placeholder")}
              value={password}
              onChange={setPassword}
              errorKey={fieldError.password}
              type="password"
            />

            <div>
              <label className="block text-sm font-medium text-gray-900">{t("auth.register.account.language.label")}</label>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={preferredLocale}
                onChange={(e) => setPreferredLocale(e.target.value as Locale)}
              >
                {supportedLocales.map((l) => (
                  <option key={l} value={l}>
                    {t(`common.language.${l}`)}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700"
            >
              {t("common.button.continue")}
            </button>
          </form>
        ) : (
          <form
            className="mt-8 space-y-4"
            onSubmit={async (e) => {
              e.preventDefault();
              setApiErrorKey(null);
              const errors: Record<string, string> = {};
              if (!legalName.trim()) errors.legalName = "validation.required";
              if (!displayName.trim()) errors.displayName = "validation.required";
              if (!effectiveSlug.trim()) errors.slug = "validation.required";
              else if (!isValidTenantSlug(effectiveSlug)) errors.slug = "validation.tenantSlug.invalidFormat";
              else if (effectiveSlug.length < 3) errors.slug = "validation.tenantSlug.tooShort";
              else if (effectiveSlug.length > 50) errors.slug = "validation.tenantSlug.tooLong";
              if (companyEmail.trim() && !isValidEmail(companyEmail)) errors.companyEmail = "validation.email.invalid";
              setFieldError(errors);
              if (Object.keys(errors).length > 0) return;

              setSubmitting(true);
              try {
                const request: RegisterRequest = {
                  account: { fullName, email, password },
                  tenant: {
                    legalName,
                    displayName,
                    slug: effectiveSlug,
                    defaultLocale,
                    address: address || undefined,
                    phone: phone || undefined,
                    email: companyEmail || undefined
                  },
                  referralCode: referralCode.trim() || undefined
                };

                const res = await fetch(`${getApiBaseUrl()}/api/auth/register`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  credentials: "include",
                  body: JSON.stringify(request satisfies RegisterRequest)
                });

                const json = (await res.json()) as RegisterResponse | ApiError;
                if (!res.ok) {
                  if ("error" in json && json.error.code === "VALIDATION_ERROR" && json.error.details) {
                    const nextErrors: Record<string, string> = {};
                    const details = json.error.details as Record<string, unknown>;
                    for (const [field, messageKey] of Object.entries(details)) {
                      if (typeof messageKey === "string") nextErrors[field] = messageKey;
                    }
                    setFieldError(nextErrors);
                    setApiErrorKey(json.error.message_key);
                  } else {
                    setApiErrorKey("error" in json ? json.error.message_key : "errors.internal");
                  }
                  return;
                }

                const redirectPath = "data" in json ? json.data.redirect.path : "/login";
                window.location.href = resolveRedirect(redirectPath);
              } catch {
                setApiErrorKey("errors.internal");
              } finally {
                setSubmitting(false);
              }
            }}
          >
            <Field
              label={t("auth.register.company.legalName.label")}
              placeholder={t("auth.register.company.legalName.placeholder")}
              value={legalName}
              onChange={setLegalName}
              errorKey={fieldError.legalName}
            />

            <Field
              label={t("auth.register.company.displayName.label")}
              placeholder={t("auth.register.company.displayName.placeholder")}
              value={displayName}
              onChange={(v) => {
                setDisplayName(v);
                if (!slug.trim()) setSlug("");
              }}
              errorKey={fieldError.displayName}
            />

            <div>
              <label className="block text-sm font-medium text-gray-900">{t("auth.register.company.slug.label")}</label>
              <input
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder={suggestedSlug}
              />
              <div className="mt-1 text-xs text-gray-600">{t("auth.register.company.slug.helper")}</div>
              {fieldError.slug ? <div className="mt-1 text-xs text-red-700">{t(fieldError.slug)}</div> : null}
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-900">{t("auth.register.company.defaultLocale.label")}</label>
              <select
                className="mt-1 h-11 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
                value={defaultLocale}
                onChange={(e) => setDefaultLocale(e.target.value as Locale)}
              >
                {supportedLocales.map((l) => (
                  <option key={l} value={l}>
                    {t(`common.language.${l}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <div className="text-sm font-semibold text-amber-900">{t("auth.register.offer.title")}</div>
              <div className="mt-2 text-sm text-amber-900/80">{t("auth.register.offer.default")}</div>
              <div className="mt-1 text-sm text-amber-900/80">{t("auth.register.offer.referral")}</div>
              <div className="mt-1 text-sm text-amber-900/80">{t("auth.register.offer.bundle")}</div>
            </div>

            <Field
              label={t("auth.register.referralCode.label")}
              placeholder={t("auth.register.referralCode.placeholder")}
              value={referralCode}
              onChange={setReferralCode}
            />
            {referralValidate ? (
              referralCode.trim() ? (
                referralValidate.valid ? (
                  <div className="rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">
                    {t("auth.register.referralCode.valid")} {referralValidate.referralPercent}%
                  </div>
                ) : (
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                    {t("auth.register.referralCode.invalid")} {referralValidate.defaultPercent}%
                  </div>
                )
              ) : (
                <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
                  {t("auth.register.referralCode.default")} {referralValidate.defaultPercent}%
                </div>
              )
            ) : checkingReferral ? (
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">{t("common.loading")}</div>
            ) : null}

            <button
              type="button"
              className="inline-flex h-10 items-center rounded-xl border border-gray-200 bg-white px-3 text-sm font-medium text-gray-900 hover:bg-gray-50"
              onClick={() => setShowMore((v) => !v)}
            >
              {t("auth.register.company.moreDetails.toggle")}
            </button>

            {showMore ? (
              <div className="space-y-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
                <Field
                  label={t("auth.register.company.address.label")}
                  placeholder=""
                  value={address}
                  onChange={setAddress}
                />
                <Field label={t("auth.register.company.phone.label")} placeholder="" value={phone} onChange={setPhone} />
                <Field
                  label={t("auth.register.company.email.label")}
                  placeholder=""
                  value={companyEmail}
                  onChange={setCompanyEmail}
                  errorKey={fieldError.companyEmail}
                  type="email"
                />
              </div>
            ) : null}

            {apiErrorKey ? <div className="rounded-md bg-red-50 p-3 text-sm text-red-700">{t(apiErrorKey)}</div> : null}

            <div className="flex flex-col gap-3 md:flex-row">
              <button
                type="button"
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                onClick={() => setStep("account")}
                disabled={submitting}
              >
                {t("auth.register.step.account")}
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
              >
                {t("common.button.createCompany")}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function StepChip(props: { active: boolean; label: string }) {
  return (
    <div
      className={[
        "inline-flex h-8 items-center rounded-full px-3 text-sm",
        props.active ? "bg-primary-50 text-primary-700" : "bg-gray-100 text-gray-700"
      ].join(" ")}
    >
      {props.label}
    </div>
  );
}

function Field(props: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  errorKey?: string;
  type?: string;
}) {
  const { t } = useClientI18n();
  return (
    <div>
      <label className="block text-sm font-medium text-gray-900">{props.label}</label>
      <input
        className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        type={props.type ?? "text"}
      />
      {props.errorKey ? <div className="mt-1 text-xs text-red-700">{t(props.errorKey)}</div> : null}
    </div>
  );
}

function Bullet(props: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-xl bg-white text-primary-700 shadow-sm">
        {props.icon}
      </div>
      <div>
        <div className="text-sm font-semibold text-gray-900">{props.title}</div>
        <div className="mt-1 text-sm text-gray-700">{props.desc}</div>
      </div>
    </div>
  );
}
