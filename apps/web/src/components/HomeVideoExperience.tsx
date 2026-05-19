"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Image from "next/image";
import { useClientI18n } from "@/lib/client-i18n";
import { HeroGraphic } from "@/components/Graphics";
import { VideoHero } from "@/components/VideoHero";

function useHomeVideoExperimentEnabled(): boolean {
  const params = useSearchParams();
  const envEnabled = process.env.NEXT_PUBLIC_ENABLE_HOME_VIDEOS === "true";
  const qsEnabled = params.get("videos") === "1";
  const [enabled, setEnabled] = useState(envEnabled || qsEnabled);

  useEffect(() => {
    if (envEnabled || qsEnabled) {
      setEnabled(true);
      return;
    }
    const ls = window.localStorage.getItem("oneerp_home_videos") === "enabled";
    setEnabled(ls);
  }, [envEnabled, qsEnabled]);

  return enabled;
}

const loopSources = [
  { src: "/videos/oneerp-hero-loop.webm", type: "video/webm" },
  { src: "/videos/oneerp-hero-loop.mp4", type: "video/mp4" }
];

const fullSources = [
  { src: "/videos/oneerp-introduction.webm", type: "video/webm" },
  { src: "/videos/oneerp-introduction.mp4", type: "video/mp4" }
];

export function HomeHeroMedia() {
  const { t } = useClientI18n();
  const enabled = useHomeVideoExperimentEnabled();

  return (
    <div className="aspect-[16/10] w-full overflow-hidden rounded-xl">
      <VideoHero
        enabled={enabled}
        title={t("public.home.video.modal.title")}
        subtitle={t("public.home.video.modal.subtitle")}
        closeLabel={t("common.button.close")}
        poster={
          <div className="relative h-full w-full bg-white">
            <Image src="/videos/oneerp-hero-poster.jpg" alt="" fill priority className="object-cover" sizes="(min-width: 768px) 560px, 100vw" />
            <div className="absolute inset-0 bg-gradient-to-br from-primary-50/50 via-white/30 to-accent-50/50" />
            <div className="absolute inset-0 opacity-0 md:opacity-100">
              <div className="mkt-float h-full w-full">
                <HeroGraphic />
              </div>
            </div>
          </div>
        }
        loopSources={loopSources}
        fullSources={fullSources}
      />
    </div>
  );
}
