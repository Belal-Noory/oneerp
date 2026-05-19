"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@/components/Modal";

type VideoSource = { src: string; type: string };

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  return window.matchMedia("(max-width: 768px)").matches;
}

function shouldAvoidAutoplay(): boolean {
  if (typeof window === "undefined") return true;
  if (prefersReducedMotion()) return true;
  const nav = window.navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } };
  const conn = nav.connection;
  if (conn?.saveData) return true;
  const eff = (conn?.effectiveType ?? "").toLowerCase();
  if (eff === "slow-2g" || eff === "2g") return true;
  return false;
}

export function VideoHero(props: {
  enabled: boolean;
  title: string;
  closeLabel: string;
  subtitle?: string;
  poster: React.ReactNode;
  loopSources?: VideoSource[];
  fullSources?: VideoSource[];
}) {
  const enabled = props.enabled;
  const [shouldLoad, setShouldLoad] = useState(false);
  const [canAutoplay, setCanAutoplay] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const hostRef = useRef<HTMLDivElement | null>(null);

  const hasFull = (props.fullSources ?? []).length > 0;
  const hasLoop = (props.loopSources ?? []).length > 0;

  useEffect(() => {
    if (!enabled) return;
    const mobile = isMobileViewport();
    if (mobile) {
      setCanAutoplay(false);
      return;
    }
    setCanAutoplay(!shouldAvoidAutoplay());
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    if (!hasLoop) return;
    if (!canAutoplay) return;
    const el = hostRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setShouldLoad(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            setShouldLoad(true);
            io.disconnect();
            break;
          }
        }
      },
      { root: null, threshold: 0.25 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [enabled, hasLoop, canAutoplay]);

  const loopSources = useMemo(() => (props.loopSources ?? []).filter((x) => x.src && x.type), [props.loopSources]);
  const fullSources = useMemo(() => (props.fullSources ?? []).filter((x) => x.src && x.type), [props.fullSources]);

  const showVideo = enabled && hasLoop && canAutoplay && shouldLoad && !modalOpen;
  const mobile = isMobileViewport();
  const showPlay = enabled && hasFull;
  const playStyle = mobile || !showVideo ? "hero" : "corner";

  return (
    <div ref={hostRef} className="relative h-full w-full">
      <div className="absolute inset-0">{props.poster}</div>

      {showVideo ? (
        <video
          className="absolute inset-0 h-full w-full object-cover"
          muted
          playsInline
          autoPlay
          loop
          preload="none"
        >
          {loopSources.map((s) => (
            <source key={`${s.type}:${s.src}`} src={s.src} type={s.type} />
          ))}
        </video>
      ) : null}

      <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-gray-950/25 via-transparent to-transparent" />

      {showPlay ? (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className={playStyle === "hero" ? "absolute inset-0 flex items-center justify-center" : "absolute bottom-3 right-3"}
          aria-label={props.title}
        >
          <span
            className={[
              "inline-flex items-center justify-center rounded-full bg-white/90 text-gray-900 shadow transition hover:bg-white",
              playStyle === "hero" ? "h-12 w-12" : "h-10 w-10"
            ].join(" ")}
          >
            <svg className={playStyle === "hero" ? "h-5 w-5 translate-x-[1px]" : "h-4 w-4 translate-x-[1px]"} viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M10 8l6 4-6 4V8Z" fill="currentColor" />
            </svg>
          </span>
        </button>
      ) : null}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)}>
        <div className="p-6 md:p-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-xl font-semibold">{props.title}</div>
              {props.subtitle ? <div className="mt-2 text-sm text-gray-700">{props.subtitle}</div> : null}
            </div>
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="inline-flex h-9 items-center justify-center rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-700 hover:bg-gray-50"
            >
              {props.closeLabel}
            </button>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-gray-200 bg-black">
            <div className="aspect-[16/9] w-full">
              <video className="h-full w-full object-contain" controls playsInline preload="metadata" autoPlay>
                {fullSources.map((s) => (
                  <source key={`${s.type}:${s.src}`} src={s.src} type={s.type} />
                ))}
              </video>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  );
}
