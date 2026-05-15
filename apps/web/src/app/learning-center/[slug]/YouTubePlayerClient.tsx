"use client";

import { useState } from "react";
import { getApiBaseUrl } from "@/lib/api";
import { useClientI18n } from "@/lib/client-i18n";

function joinUrl(base: string, path: string): string {
  if (path.startsWith("http")) return path;
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (b.endsWith("/api") && (p === "/api" || p.startsWith("/api/"))) {
    return `${b.slice(0, -4)}${p}`;
  }
  return `${b}${p}`;
}

export function YouTubePlayerClient(props: { slug: string; videoId: string | null; thumbnailUrl: string | null; title: string }) {
  const [playing, setPlaying] = useState(false);
  const { t } = useClientI18n();
  const videoId = props.videoId?.trim() || null;

  if (!videoId) {
    return (
      <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-card">
        <div className="text-sm text-gray-700">{t("public.learning.player.unavailable")}</div>
      </div>
    );
  }

  const embedUrl = `https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}?rel=0&modestbranding=1`;

  return (
    <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-card">
      <div className="relative aspect-video bg-black">
        {!playing ? (
          <button
            type="button"
            onClick={async () => {
              setPlaying(true);
              try {
                await fetch(joinUrl(getApiBaseUrl(), `/api/public/tutorials/${encodeURIComponent(props.slug)}/view`), { method: "POST", cache: "no-store" });
              } catch {}
            }}
            className="absolute inset-0 w-full"
            aria-label={props.title}
          >
            {props.thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={props.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
            ) : (
              <div className="h-full w-full bg-gray-900" />
            )}
            <div className="absolute inset-0 bg-black/35" />
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/90 text-gray-900 shadow-lg">
                <svg className="h-7 w-7 translate-x-[1px]" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M10 8l6 4-6 4V8Z" fill="currentColor" />
                </svg>
              </div>
            </div>
          </button>
        ) : (
          <iframe
            className="absolute inset-0 h-full w-full"
            src={embedUrl}
            title={props.title}
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
          />
        )}
      </div>
    </div>
  );
}
