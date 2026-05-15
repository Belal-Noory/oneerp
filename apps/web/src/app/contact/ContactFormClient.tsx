"use client";

import { useMemo, useState } from "react";
import { useClientI18n } from "@/lib/client-i18n";
import { getApiBaseUrl } from "@/lib/api";
import { isValidEmail } from "@/lib/validation";

type ServiceType =
  | "erpModuleActivation"
  | "databaseDevelopment"
  | "softwareDevelopment"
  | "mobileAppDevelopment"
  | "websiteDevelopment"
  | "webAppDevelopment"
  | "dataAnalysis"
  | "dataProcessing"
  | "other";

function joinUrl(base: string, path: string): string {
  if (path.startsWith("http")) return path;
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (b.endsWith("/api") && (p === "/api" || p.startsWith("/api/"))) {
    return `${b.slice(0, -4)}${p}`;
  }
  return `${b}${p}`;
}

export function ContactFormClient(props: { defaultServiceType?: ServiceType }) {
  const { t, locale } = useClientI18n();

  const [fullName, setFullName] = useState("");
  const [organizationName, setOrganizationName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [serviceType, setServiceType] = useState<ServiceType>(props.defaultServiceType ?? "erpModuleActivation");
  const [message, setMessage] = useState("");
  const [website, setWebsite] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<"idle" | "success" | "error">("idle");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string | null>>({});

  const serviceOptions = useMemo(
    () =>
      [
        { value: "erpModuleActivation", labelKey: "public.contact.form.service.erpModuleActivation" },
        { value: "databaseDevelopment", labelKey: "public.contact.form.service.databaseDevelopment" },
        { value: "softwareDevelopment", labelKey: "public.contact.form.service.softwareDevelopment" },
        { value: "mobileAppDevelopment", labelKey: "public.contact.form.service.mobileAppDevelopment" },
        { value: "websiteDevelopment", labelKey: "public.contact.form.service.websiteDevelopment" },
        { value: "webAppDevelopment", labelKey: "public.contact.form.service.webAppDevelopment" },
        { value: "dataAnalysis", labelKey: "public.contact.form.service.dataAnalysis" },
        { value: "dataProcessing", labelKey: "public.contact.form.service.dataProcessing" },
        { value: "other", labelKey: "public.contact.form.service.other" }
      ] as const,
    []
  );

  function validate(): boolean {
    const errs: Record<string, string | null> = {};
    const name = fullName.trim();
    const e = email.trim();
    const phone = phoneNumber.trim();
    const msg = message.trim();

    if (!name) errs.fullName = t("public.contact.form.error.fullNameRequired");
    if (!e) errs.email = t("public.contact.form.error.emailRequired");
    else if (!isValidEmail(e)) errs.email = t("public.contact.form.error.emailInvalid");
    if (!phone) errs.phoneNumber = t("public.contact.form.error.phoneRequired");
    if (!serviceType) errs.serviceType = t("public.contact.form.error.serviceRequired");
    if (!msg) errs.message = t("public.contact.form.error.messageRequired");
    if (msg.length > 2000) errs.message = t("public.contact.form.error.messageTooLong");

    setFieldErrors(errs);
    return Object.values(errs).every((v) => !v);
  }

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setResult("idle");
        if (!validate()) return;

        setSubmitting(true);
        try {
          const res = await fetch(joinUrl(getApiBaseUrl(), "/api/public/contact"), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              fullName: fullName.trim(),
              organizationName: organizationName.trim() || undefined,
              email: email.trim(),
              phoneNumber: phoneNumber.trim(),
              serviceType,
              message: message.trim(),
              locale,
              website: website.trim() || undefined
            })
          });
          if (!res.ok) {
            setResult("error");
            return;
          }
          setResult("success");
          setFullName("");
          setOrganizationName("");
          setEmail("");
          setPhoneNumber("");
          setServiceType(props.defaultServiceType ?? "erpModuleActivation");
          setMessage("");
          setWebsite("");
          setFieldErrors({});
        } catch {
          setResult("error");
        } finally {
          setSubmitting(false);
        }
      }}
    >
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-900">{t("public.contact.form.field.fullName")}</label>
          <input
            className={[
              "mt-1 h-11 w-full rounded-xl border px-3 text-sm shadow-sm outline-none focus:ring-2",
              fieldErrors.fullName ? "border-red-300 focus:border-red-300 focus:ring-red-100" : "border-gray-200 focus:border-primary-200 focus:ring-primary-100"
            ].join(" ")}
            value={fullName}
            onChange={(ev) => setFullName(ev.target.value)}
            placeholder={t("public.contact.form.placeholder.fullName")}
            autoComplete="name"
            required
          />
          {fieldErrors.fullName ? <div className="mt-1 text-xs text-red-700">{fieldErrors.fullName}</div> : null}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900">{t("public.contact.form.field.organizationName")}</label>
          <input
            className="mt-1 h-11 w-full rounded-xl border border-gray-200 px-3 text-sm shadow-sm outline-none focus:border-primary-200 focus:ring-2 focus:ring-primary-100"
            value={organizationName}
            onChange={(ev) => setOrganizationName(ev.target.value)}
            placeholder={t("public.contact.form.placeholder.organizationName")}
            autoComplete="organization"
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label className="block text-sm font-medium text-gray-900">{t("public.contact.form.field.email")}</label>
          <input
            className={[
              "mt-1 h-11 w-full rounded-xl border px-3 text-sm shadow-sm outline-none focus:ring-2",
              fieldErrors.email ? "border-red-300 focus:border-red-300 focus:ring-red-100" : "border-gray-200 focus:border-primary-200 focus:ring-primary-100"
            ].join(" ")}
            value={email}
            onChange={(ev) => setEmail(ev.target.value)}
            placeholder={t("public.contact.form.placeholder.email")}
            type="email"
            autoComplete="email"
            required
          />
          {fieldErrors.email ? <div className="mt-1 text-xs text-red-700">{fieldErrors.email}</div> : null}
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-900">{t("public.contact.form.field.phoneNumber")}</label>
          <input
            className={[
              "mt-1 h-11 w-full rounded-xl border px-3 text-sm shadow-sm outline-none focus:ring-2",
              fieldErrors.phoneNumber ? "border-red-300 focus:border-red-300 focus:ring-red-100" : "border-gray-200 focus:border-primary-200 focus:ring-primary-100"
            ].join(" ")}
            value={phoneNumber}
            onChange={(ev) => setPhoneNumber(ev.target.value)}
            placeholder={t("public.contact.form.placeholder.phoneNumber")}
            autoComplete="tel"
            required
          />
          {fieldErrors.phoneNumber ? <div className="mt-1 text-xs text-red-700">{fieldErrors.phoneNumber}</div> : null}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900">{t("public.contact.form.field.serviceType")}</label>
        <select
          className={[
            "mt-1 h-11 w-full rounded-xl border bg-white px-3 text-sm shadow-sm outline-none focus:ring-2",
            fieldErrors.serviceType ? "border-red-300 focus:border-red-300 focus:ring-red-100" : "border-gray-200 focus:border-primary-200 focus:ring-primary-100"
          ].join(" ")}
          value={serviceType}
          onChange={(ev) => setServiceType(ev.target.value as ServiceType)}
          required
        >
          {serviceOptions.map((o) => (
            <option key={o.value} value={o.value}>
              {t(o.labelKey)}
            </option>
          ))}
        </select>
        {fieldErrors.serviceType ? <div className="mt-1 text-xs text-red-700">{fieldErrors.serviceType}</div> : null}
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-900">{t("public.contact.form.field.message")}</label>
        <textarea
          className={[
            "mt-1 min-h-32 w-full rounded-xl border px-3 py-2 text-sm shadow-sm outline-none focus:ring-2",
            fieldErrors.message ? "border-red-300 focus:border-red-300 focus:ring-red-100" : "border-gray-200 focus:border-primary-200 focus:ring-primary-100"
          ].join(" ")}
          value={message}
          onChange={(ev) => setMessage(ev.target.value)}
          placeholder={t("public.contact.form.placeholder.message")}
          required
        />
        <div className="mt-1 flex items-center justify-between gap-3 text-xs text-gray-500">
          <span>{fieldErrors.message ? <span className="text-red-700">{fieldErrors.message}</span> : null}</span>
          <span className="tabular">{message.length}/2000</span>
        </div>
      </div>

      <input
        className="hidden"
        tabIndex={-1}
        autoComplete="off"
        value={website}
        onChange={(ev) => setWebsite(ev.target.value)}
        name="website"
        aria-hidden="true"
      />

      {result === "success" ? <div className="rounded-xl bg-green-50 p-3 text-sm text-green-700">{t("public.contact.form.success")}</div> : null}
      {result === "error" ? <div className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{t("public.contact.form.error")}</div> : null}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary-600 px-4 text-sm font-medium text-white shadow-sm hover:bg-primary-700 disabled:opacity-60"
      >
        {submitting ? t("public.contact.form.submitting") : t("public.contact.form.submit")}
      </button>
    </form>
  );
}

