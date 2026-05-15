import type { MetadataRoute } from "next";
import { getApiBaseUrl } from "@/lib/api";

type TutorialRow = { slug: string; updated_at?: string | null; updatedAt?: string | null };

function joinUrl(base: string, path: string): string {
  if (path.startsWith("http")) return path;
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  if (b.endsWith("/api") && (p === "/api" || p.startsWith("/api/"))) {
    return `${b.slice(0, -4)}${p}`;
  }
  return `${b}${p}`;
}

function getSiteBaseUrl(): string {
  const env = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (env) return env.replace(/\/+$/, "");
  return "http://localhost:3000";
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = getSiteBaseUrl();
  const urls: MetadataRoute.Sitemap = [
    { url: `${base}/`, changeFrequency: "weekly", priority: 1 },
    { url: `${base}/features`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/modules`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${base}/pricing`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/learning-center`, changeFrequency: "weekly", priority: 0.9 },
    { url: `${base}/contact`, changeFrequency: "yearly", priority: 0.4 },
    { url: `${base}/privacy-policy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms-and-conditions`, changeFrequency: "yearly", priority: 0.3 }
  ];

  try {
    const apiBase = getApiBaseUrl();
    const res = await fetch(joinUrl(apiBase, "/api/public/tutorials?page=1&pageSize=500&sort=latest"), { cache: "no-store" });
    const json = (await res.json().catch(() => null)) as { data?: TutorialRow[] } | null;
    const rows = Array.isArray(json?.data) ? json!.data : [];
    for (const r of rows) {
      const updated = r.updated_at ?? r.updatedAt ?? null;
      const lastModified = updated ? new Date(updated) : undefined;
      urls.push({ url: `${base}/learning-center/${encodeURIComponent(r.slug)}`, changeFrequency: "monthly", priority: 0.6, lastModified });
    }
  } catch {}

  return urls;
}

