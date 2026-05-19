"use client";

import { isRtlLocale, supportedLocales, type Locale, t as translate, LOCALE_COOKIE_NAME } from "@oneerp/i18n";
import { useEffect, useMemo, useRef, useState } from "react";

export function LanguageSwitcher(props: { locale: Locale }) {
  const [locale, setLocale] = useState<Locale>(props.locale);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const rtl = useMemo(() => isRtlLocale(locale), [locale]);

  useEffect(() => {
    setLocale(props.locale);
  }, [props.locale]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent) => {
      const root = rootRef.current;
      if (!root) return;
      if (!root.contains(e.target as Node)) setOpen(false);
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  const setLocaleAndReload = (nextLocale: Locale) => {
    setLocale(nextLocale);
    document.cookie = `${LOCALE_COOKIE_NAME}=${nextLocale}; path=/; max-age=31536000`;
    window.location.reload();
  };

  return (
    <div ref={rootRef} className="relative z-50">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-gray-700 transition hover:bg-gray-100 hover:text-gray-900"
        aria-label={translate(locale, "common.language.label")}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span aria-hidden="true">
          <IconGlobe />
        </span>
      </button>

      {open ? (
        <div
          role="menu"
          className={[
            "absolute z-50 mt-2 w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-lg",
            rtl ? "left-0" : "right-0"
          ].join(" ")}
        >
          {supportedLocales.map((l) => {
            const active = l === locale;
            return (
              <button
                key={l}
                type="button"
                role="menuitem"
                className={[
                  "flex h-10 w-full items-center justify-between rounded-lg px-3 text-sm transition",
                  active ? "bg-primary-50 text-primary-800" : "text-gray-700 hover:bg-gray-50 hover:text-gray-900"
                ].join(" ")}
                onClick={() => setLocaleAndReload(l)}
              >
                <span>{translate(locale, `common.language.${l}`)}</span>
                {active ? <span className="text-xs font-semibold text-primary-700">✓</span> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function IconGlobe() {
  return (
    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M2 12h20" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path
        d="M12 2c2.8 2.7 4.4 6.4 4.4 10S14.8 19.3 12 22c-2.8-2.7-4.4-6.4-4.4-10S9.2 4.7 12 2Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
    </svg>
  );
}
