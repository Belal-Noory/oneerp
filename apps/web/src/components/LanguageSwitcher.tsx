"use client";

import { isRtlLocale, supportedLocales, type Locale, t as translate } from "@oneerp/i18n";
import { useEffect, useMemo, useRef, useState } from "react";
import { LOCALE_COOKIE } from "@/lib/locale-constants";
import { IconGlobe } from "@/components/Graphics";

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
    document.cookie = `${LOCALE_COOKIE}=${nextLocale}; path=/; max-age=31536000`;
    window.location.reload();
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className="inline-flex h-9 w-9 items-center justify-center rounded-md text-gray-700 transition hover:bg-gray-100 hover:text-gray-900"
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
          className="absolute right-0 z-30 mt-2 w-44 rounded-xl border border-gray-200 bg-white p-1 shadow-lg"
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
