"use client";

import { useEffect } from "react";

export function Modal(props: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  const open = props.open;
  const onClose = props.onClose;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/45" onClick={onClose} />
      <div className="relative mx-auto flex min-h-dvh max-w-3xl items-center px-4 py-10">
        <div className="w-full rounded-2xl border border-gray-200 bg-white shadow-card">{props.children}</div>
      </div>
    </div>
  );
}
