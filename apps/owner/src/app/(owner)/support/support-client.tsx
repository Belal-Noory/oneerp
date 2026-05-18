"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { io, type Socket } from "socket.io-client";
import { useClientI18n } from "@/lib/client-i18n";
import { apiFetch } from "@/lib/auth-fetch";
import { getApiBaseUrl } from "@/lib/api";

type Ticket = {
  id: string;
  tenantId: string;
  type: string;
  subject: string;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  lastMessageAt: string | null;
  lastMessageText: string | null;
  lastSenderType: string | null;
  unreadForOwner: number;
  assignedToUserId: string | null;
  tenant: { id: string; slug: string; displayName: string; isPremiumPartner: boolean };
};

type TicketsResponse = { data?: { tickets?: Ticket[] }; error?: { message_key?: string } };

type Attachment = { id: string; originalName: string; contentType: string; sizeBytes: number; createdAt: string };

type Message = {
  id: string;
  senderType: "tenant" | "owner";
  senderUserId: string;
  message: string;
  createdAt: string;
  seenByTenantAt: string | null;
  seenByOwnerAt: string | null;
  attachments: Attachment[];
};

type MessagesResponse = { data?: { messages?: Message[] }; error?: { message_key?: string } };
type UploadAttachmentResponse = { data?: { attachment?: Attachment }; error?: { message_key?: string } };
type SendMessageResponse = { data?: { message?: Message; ticket?: unknown }; error?: { message_key?: string } };

function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes;
  let idx = 0;
  while (v >= 1024 && idx < units.length - 1) {
    v /= 1024;
    idx++;
  }
  const fixed = idx === 0 ? String(Math.round(v)) : v.toFixed(v >= 10 ? 0 : 1);
  return `${fixed} ${units[idx]}`;
}

function Badge(props: { kind: "gray" | "blue" | "green" | "amber" | "red" | "purple"; text: string }) {
  const cls =
    props.kind === "green"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : props.kind === "blue"
        ? "bg-blue-50 text-blue-700 border-blue-200"
        : props.kind === "amber"
          ? "bg-amber-50 text-amber-700 border-amber-200"
          : props.kind === "red"
            ? "bg-red-50 text-red-700 border-red-200"
            : props.kind === "purple"
              ? "bg-purple-50 text-purple-700 border-purple-200"
              : "bg-gray-50 text-gray-700 border-gray-200";
  return <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${cls}`}>{props.text}</span>;
}

export function OwnerSupportClient() {
  const { t } = useClientI18n();
  const [loading, setLoading] = useState(true);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const [priorityFilter, setPriorityFilter] = useState<string>("all");
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [premiumOnly, setPremiumOnly] = useState(false);

  const [composeText, setComposeText] = useState("");
  const [sending, setSending] = useState(false);
  const [pendingAttachments, setPendingAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const [tenantTyping, setTenantTyping] = useState(false);

  const attachmentUrl = useCallback((id: string) => {
    const base = getApiBaseUrl().replace(/\/$/, "");
    return `${base}/api/owner/support-center/attachments/${encodeURIComponent(id)}`;
  }, []);

  const statusLabel = useCallback(
    (status: string) => {
      if (status === "open") return t("app.supportCenter.status.open");
      if (status === "in_progress") return t("app.supportCenter.status.inProgress");
      if (status === "waiting_for_client") return t("app.supportCenter.status.waitingForClient");
      if (status === "resolved") return t("app.supportCenter.status.resolved");
      if (status === "closed") return t("app.supportCenter.status.closed");
      if (status === "under_review") return t("app.supportCenter.status.underReview");
      if (status === "planned") return t("app.supportCenter.status.planned");
      if (status === "in_development") return t("app.supportCenter.status.inDevelopment");
      if (status === "completed") return t("app.supportCenter.status.completed");
      if (status === "rejected") return t("app.supportCenter.status.rejected");
      return status;
    },
    [t]
  );

  const typeLabel = useCallback(
    (type: string) => {
      if (type === "issue_report") return t("app.supportCenter.type.issueReport");
      if (type === "support_request") return t("app.supportCenter.type.supportRequest");
      if (type === "feature_suggestion") return t("app.supportCenter.type.featureSuggestion");
      if (type === "billing") return t("app.supportCenter.type.billing");
      if (type === "other") return t("app.supportCenter.type.other");
      return type;
    },
    [t]
  );

  const priorityLabel = useCallback(
    (p: string) => {
      if (p === "low") return t("app.supportCenter.priority.low");
      if (p === "normal") return t("app.supportCenter.priority.normal");
      if (p === "high") return t("app.supportCenter.priority.high");
      if (p === "urgent") return t("app.supportCenter.priority.urgent");
      return p;
    },
    [t]
  );

  const statusBadgeKind = useCallback((status: string) => {
    if (status === "open") return "blue" as const;
    if (status === "in_progress") return "amber" as const;
    if (status === "waiting_for_client") return "gray" as const;
    if (status === "resolved") return "green" as const;
    if (status === "closed") return "gray" as const;
    if (status === "rejected") return "red" as const;
    if (status === "completed") return "green" as const;
    return "gray" as const;
  }, []);

  const filteredTickets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return tickets
      .filter((x) => {
        if (unreadOnly && (x.unreadForOwner ?? 0) <= 0) return false;
        if (premiumOnly && !x.tenant.isPremiumPartner) return false;
        if (statusFilter !== "all" && x.status !== statusFilter) return false;
        if (typeFilter !== "all" && x.type !== typeFilter) return false;
        if (priorityFilter !== "all" && x.priority !== priorityFilter) return false;
        if (!q) return true;
        const hay = `${x.subject} ${x.tenant.displayName} ${x.tenant.slug} ${x.lastMessageText ?? ""}`.toLowerCase();
        return hay.includes(q);
      })
      .sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
  }, [tickets, search, statusFilter, typeFilter, priorityFilter, unreadOnly, premiumOnly]);

  const selectedTicket = useMemo(() => tickets.find((x) => x.id === selectedTicketId) ?? null, [tickets, selectedTicketId]);

  const loadTickets = useCallback(async () => {
    const qs = new URLSearchParams();
    if (statusFilter !== "all") qs.set("status", statusFilter);
    if (typeFilter !== "all") qs.set("type", typeFilter);
    if (priorityFilter !== "all") qs.set("priority", priorityFilter);
    if (search.trim()) qs.set("q", search.trim());
    if (unreadOnly) qs.set("unread", "1");
    if (premiumOnly) qs.set("premium", "1");

    const res = await apiFetch(`/api/owner/support-center/tickets?${qs.toString()}`, { cache: "no-store" });
    const json = (await res.json()) as TicketsResponse;
    if (!res.ok) {
      setErrorKey(json.error?.message_key ?? "errors.internal");
      return;
    }
    setTickets(Array.isArray(json.data?.tickets) ? (json.data?.tickets as Ticket[]) : []);
  }, [statusFilter, typeFilter, priorityFilter, search, unreadOnly, premiumOnly]);

  const loadMessages = useCallback(async (ticketId: string) => {
    setLoadingMessages(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/owner/support-center/tickets/${encodeURIComponent(ticketId)}/messages`, { cache: "no-store" });
      const json = (await res.json()) as MessagesResponse;
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setMessages(Array.isArray(json.data?.messages) ? (json.data?.messages as Message[]) : []);
      await apiFetch(`/api/owner/support-center/tickets/${encodeURIComponent(ticketId)}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setLoadingMessages(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      setErrorKey(null);
      try {
        await loadTickets();
      } catch {
        setErrorKey("errors.internal");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
  }, [loadTickets]);

  useEffect(() => {
    const ticketIdFromQuery = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("ticketId") : null;
    if (ticketIdFromQuery) setSelectedTicketId(ticketIdFromQuery);
  }, []);

  useEffect(() => {
    const socket = io(getApiBaseUrl(), { path: "/api/socket.io", withCredentials: true });
    socketRef.current = socket;

    const onTicketUpdate = () => void loadTickets();
    const onMessageCreated = (payload: { ticketId?: string }) => {
      void loadTickets();
      if (payload?.ticketId && payload.ticketId === selectedTicketId) void loadMessages(payload.ticketId);
    };
    const onTyping = (payload: { ticketId?: string; sender?: string; isTyping?: boolean }) => {
      if (payload?.ticketId !== selectedTicketId) return;
      if (payload?.sender !== "tenant") return;
      if (payload?.isTyping) {
        setTenantTyping(true);
        if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = window.setTimeout(() => setTenantTyping(false), 1200);
      } else {
        setTenantTyping(false);
      }
    };

    socket.on("support:ticketCreated", onTicketUpdate);
    socket.on("support:ticketUpdated", onTicketUpdate);
    socket.on("support:messageCreated", onMessageCreated);
    socket.on("support:typing", onTyping);

    return () => {
      socket.off("support:ticketCreated", onTicketUpdate);
      socket.off("support:ticketUpdated", onTicketUpdate);
      socket.off("support:messageCreated", onMessageCreated);
      socket.off("support:typing", onTyping);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [loadTickets, loadMessages, selectedTicketId]);

  useEffect(() => {
    if (!selectedTicketId) return;
    const socket = socketRef.current;
    if (socket) socket.emit("support:join", { ticketId: selectedTicketId });
    void loadMessages(selectedTicketId);
  }, [selectedTicketId, loadMessages]);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = messagesEndRef.current;
    if (!el) return;
    el.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, loadingMessages]);

  const pickTicket = (id: string) => {
    setSelectedTicketId(id);
    setPendingAttachments([]);
    setComposeText("");
    setTenantTyping(false);
  };

  const uploadFiles = useCallback(
    async (files: FileList) => {
      if (!selectedTicketId) return;
      const list = Array.from(files);
      if (list.length === 0) return;
      setUploading(true);
      setErrorKey(null);
      try {
        for (const f of list) {
          const fd = new FormData();
          fd.append("file", f);
          const res = await apiFetch(`/api/owner/support-center/tickets/${encodeURIComponent(selectedTicketId)}/attachments`, { method: "POST", body: fd });
          const json = (await res.json()) as UploadAttachmentResponse;
          if (!res.ok) {
            setErrorKey(json.error?.message_key ?? "errors.internal");
            break;
          }
          const att = json.data?.attachment ?? null;
          if (att) setPendingAttachments((prev) => [...prev, att]);
        }
      } catch {
        setErrorKey("errors.internal");
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [selectedTicketId]
  );

  const send = useCallback(async () => {
    if (!selectedTicketId) return;
    const text = composeText.trim();
    if (!text && pendingAttachments.length === 0) return;
    setSending(true);
    setErrorKey(null);
    try {
      const res = await apiFetch(`/api/owner/support-center/tickets/${encodeURIComponent(selectedTicketId)}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text || t("app.supportCenter.message.attachmentOnly"), attachmentIds: pendingAttachments.map((a) => a.id) })
      });
      const json = (await res.json()) as SendMessageResponse;
      if (!res.ok) {
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      setComposeText("");
      setPendingAttachments([]);
      await loadMessages(selectedTicketId);
      await loadTickets();
    } catch {
      setErrorKey("errors.internal");
    } finally {
      setSending(false);
    }
  }, [selectedTicketId, composeText, pendingAttachments, loadMessages, loadTickets, t]);

  const onTypingLocal = useCallback(
    (next: string) => {
      setComposeText(next);
      const socket = socketRef.current;
      if (!socket || !selectedTicketId) return;
      socket.emit("support:typing", { ticketId: selectedTicketId, isTyping: next.trim().length > 0 });
    },
    [selectedTicketId]
  );

  const updateTicket = useCallback(
    async (patch: { status?: string; priority?: string }) => {
      if (!selectedTicketId) return;
      setErrorKey(null);
      const res = await apiFetch(`/api/owner/support-center/tickets/${encodeURIComponent(selectedTicketId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      if (!res.ok) {
        const json = (await res.json()) as { error?: { message_key?: string } };
        setErrorKey(json.error?.message_key ?? "errors.internal");
        return;
      }
      await loadTickets();
    },
    [selectedTicketId, loadTickets]
  );

  if (loading) {
    return <div className="rounded-2xl border border-gray-200 bg-white p-6">{t("common.loading")}</div>;
  }

  return (
    <div className="space-y-4">
      <div>
        <div className="text-2xl font-semibold text-gray-900">{t("app.owner.support.title")}</div>
        <div className="mt-1 text-sm text-gray-600">{t("app.owner.support.subtitle")}</div>
      </div>

      {errorKey ? <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{t(errorKey)}</div> : null}

      <div className="grid gap-4 lg:grid-cols-[420px_1fr]">
        <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="border-b border-gray-200 p-4">
            <div className="flex flex-col gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("app.supportCenter.search.placeholder")}
                className="h-10 w-full rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary-400"
              />
              <div className="grid grid-cols-2 gap-2">
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary-400">
                  <option value="all">{t("app.supportCenter.filter.status.all")}</option>
                  <option value="open">{t("app.supportCenter.status.open")}</option>
                  <option value="in_progress">{t("app.supportCenter.status.inProgress")}</option>
                  <option value="waiting_for_client">{t("app.supportCenter.status.waitingForClient")}</option>
                  <option value="resolved">{t("app.supportCenter.status.resolved")}</option>
                  <option value="closed">{t("app.supportCenter.status.closed")}</option>
                  <option value="under_review">{t("app.supportCenter.status.underReview")}</option>
                  <option value="planned">{t("app.supportCenter.status.planned")}</option>
                  <option value="in_development">{t("app.supportCenter.status.inDevelopment")}</option>
                  <option value="completed">{t("app.supportCenter.status.completed")}</option>
                  <option value="rejected">{t("app.supportCenter.status.rejected")}</option>
                </select>
                <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary-400">
                  <option value="all">{t("app.supportCenter.filter.type.all")}</option>
                  <option value="issue_report">{t("app.supportCenter.type.issueReport")}</option>
                  <option value="support_request">{t("app.supportCenter.type.supportRequest")}</option>
                  <option value="feature_suggestion">{t("app.supportCenter.type.featureSuggestion")}</option>
                  <option value="billing">{t("app.supportCenter.type.billing")}</option>
                  <option value="other">{t("app.supportCenter.type.other")}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary-400">
                  <option value="all">{t("app.owner.support.filter.priorityAll")}</option>
                  <option value="low">{t("app.supportCenter.priority.low")}</option>
                  <option value="normal">{t("app.supportCenter.priority.normal")}</option>
                  <option value="high">{t("app.supportCenter.priority.high")}</option>
                  <option value="urgent">{t("app.supportCenter.priority.urgent")}</option>
                </select>
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                  onClick={() => void loadTickets()}
                >
                  {t("app.supportCenter.action.refresh")}
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
                  {t("app.supportCenter.filter.unreadOnly")}
                </label>
                <label className="flex items-center gap-2 text-sm text-gray-700">
                  <input type="checkbox" checked={premiumOnly} onChange={(e) => setPremiumOnly(e.target.checked)} />
                  {t("app.owner.support.filter.premiumOnly")}
                </label>
              </div>
            </div>
          </div>
          <div className="max-h-[70dvh] overflow-auto p-2">
            {filteredTickets.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">{t("app.owner.support.empty")}</div>
            ) : (
              <div className="space-y-2">
                {filteredTickets.map((x) => {
                  const active = x.id === selectedTicketId;
                  return (
                    <button
                      key={x.id}
                      type="button"
                      className={[
                        "w-full rounded-2xl border p-3 text-left transition-colors",
                        active ? "border-primary-200 bg-primary-50" : "border-gray-200 bg-white hover:bg-gray-50"
                      ].join(" ")}
                      onClick={() => pickTicket(x.id)}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-gray-900">{x.subject}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-2">
                            <Badge kind={statusBadgeKind(x.status)} text={statusLabel(x.status)} />
                            <Badge kind="gray" text={typeLabel(x.type)} />
                            {x.tenant.isPremiumPartner ? <Badge kind="purple" text={t("app.owner.support.premiumBadge")} /> : null}
                          </div>
                          <div className="mt-2 text-xs text-gray-700">
                            <span className="font-medium text-gray-900">{x.tenant.displayName}</span>
                            <span className="ml-2 text-gray-500">{x.tenant.slug}</span>
                          </div>
                          <div className="mt-1 line-clamp-2 text-xs text-gray-600">{x.lastMessageText ?? ""}</div>
                        </div>
                        {x.unreadForOwner > 0 ? (
                          <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full bg-primary-600 px-2 text-xs font-semibold text-white">
                            {x.unreadForOwner}
                          </span>
                        ) : null}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-gray-200 bg-white shadow-card">
          <div className="border-b border-gray-200 p-4">
            {!selectedTicket ? (
              <div className="text-sm text-gray-600">{t("app.supportCenter.selectTicket")}</div>
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-900">{selectedTicket.subject}</div>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Badge kind={statusBadgeKind(selectedTicket.status)} text={statusLabel(selectedTicket.status)} />
                    <Badge kind="gray" text={typeLabel(selectedTicket.type)} />
                    <Badge kind="gray" text={priorityLabel(selectedTicket.priority)} />
                    {selectedTicket.tenant.isPremiumPartner ? <Badge kind="purple" text={t("app.owner.support.premiumBadge")} /> : null}
                  </div>
                  <div className="mt-2 text-xs text-gray-700">
                    <span className="font-medium text-gray-900">{selectedTicket.tenant.displayName}</span>
                    <span className="ml-2 text-gray-500">{selectedTicket.tenant.slug}</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    value={selectedTicket.status}
                    onChange={(e) => void updateTicket({ status: e.target.value })}
                    className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary-400"
                  >
                    <option value="open">{t("app.supportCenter.status.open")}</option>
                    <option value="in_progress">{t("app.supportCenter.status.inProgress")}</option>
                    <option value="waiting_for_client">{t("app.supportCenter.status.waitingForClient")}</option>
                    <option value="resolved">{t("app.supportCenter.status.resolved")}</option>
                    <option value="closed">{t("app.supportCenter.status.closed")}</option>
                    <option value="under_review">{t("app.supportCenter.status.underReview")}</option>
                    <option value="planned">{t("app.supportCenter.status.planned")}</option>
                    <option value="in_development">{t("app.supportCenter.status.inDevelopment")}</option>
                    <option value="completed">{t("app.supportCenter.status.completed")}</option>
                    <option value="rejected">{t("app.supportCenter.status.rejected")}</option>
                  </select>
                  <select
                    value={selectedTicket.priority}
                    onChange={(e) => void updateTicket({ priority: e.target.value })}
                    className="h-10 rounded-xl border border-gray-200 bg-white px-3 text-sm outline-none focus:border-primary-400"
                  >
                    <option value="low">{t("app.supportCenter.priority.low")}</option>
                    <option value="normal">{t("app.supportCenter.priority.normal")}</option>
                    <option value="high">{t("app.supportCenter.priority.high")}</option>
                    <option value="urgent">{t("app.supportCenter.priority.urgent")}</option>
                  </select>
                  <button
                    type="button"
                    className="inline-flex h-10 items-center justify-center rounded-xl border border-gray-200 bg-white px-4 text-sm font-medium text-gray-900 hover:bg-gray-50"
                    onClick={() => {
                      void loadMessages(selectedTicket.id);
                      const socket = socketRef.current;
                      if (socket) socket.emit("support:join", { ticketId: selectedTicket.id });
                    }}
                  >
                    {t("app.supportCenter.action.reloadChat")}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="max-h-[55dvh] overflow-auto p-4">
            {!selectedTicketId ? null : loadingMessages ? (
              <div className="text-sm text-gray-600">{t("common.loading")}</div>
            ) : (
              <div className="space-y-3">
                {messages.map((m) => {
                  const mine = m.senderType === "owner";
                  return (
                    <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[85%] rounded-2xl border px-3 py-2 text-sm ${mine ? "border-gray-900/20 bg-gray-900 text-white" : "border-gray-200 bg-white text-gray-900"}`}>
                        <div className="whitespace-pre-wrap">{m.message}</div>
                        {m.attachments?.length ? (
                          <div className="mt-2 space-y-1">
                            {m.attachments.map((a) => (
                              <a
                                key={a.id}
                                href={attachmentUrl(a.id)}
                                target="_blank"
                                rel="noreferrer"
                                className={`block rounded-xl border px-3 py-2 text-xs hover:bg-gray-50 ${mine ? "border-white/20 bg-white/10 text-white" : "border-gray-200 bg-white text-gray-800"}`}
                              >
                                <div className="truncate font-medium">{a.originalName}</div>
                                <div className={`mt-0.5 ${mine ? "text-white/70" : "text-gray-500"}`}>{formatSize(a.sizeBytes)}</div>
                              </a>
                            ))}
                          </div>
                        ) : null}
                        <div className={`mt-1 text-[11px] ${mine ? "text-white/70" : "text-gray-500"}`}>
                          {new Date(m.createdAt).toLocaleString()}
                          {mine ? (
                            <span className="ml-2">
                              {m.seenByTenantAt ? t("app.supportCenter.read.seen") : t("app.supportCenter.read.sent")}
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {tenantTyping ? <div className="text-xs text-gray-500">{t("app.supportCenter.typing.tenant")}</div> : null}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {selectedTicketId ? (
            <div className="border-t border-gray-200 p-4">
              {pendingAttachments.length > 0 ? (
                <div className="mb-3 flex flex-wrap gap-2">
                  {pendingAttachments.map((a) => (
                    <div key={a.id} className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs text-gray-800">
                      <span className="max-w-[220px] truncate">{a.originalName}</span>
                      <button
                        type="button"
                        className="text-gray-500 hover:text-gray-900"
                        onClick={() => setPendingAttachments((prev) => prev.filter((x) => x.id !== a.id))}
                        aria-label={t("common.button.remove")}
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              <div className="flex items-end gap-2">
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  multiple
                  onChange={(e) => {
                    const files = e.target.files;
                    if (files) void uploadFiles(files);
                  }}
                />
                <button
                  type="button"
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 bg-white text-gray-900 hover:bg-gray-50"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  aria-label={t("app.supportCenter.action.attach")}
                >
                  <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M8 12.5 12.5 8a3 3 0 0 1 4.2 4.2l-6.7 6.7a5 5 0 0 1-7.1-7.1l7.4-7.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                <textarea
                  value={composeText}
                  onChange={(e) => onTypingLocal(e.target.value)}
                  placeholder={t("app.supportCenter.message.placeholder")}
                  className="min-h-[40px] w-full resize-none rounded-2xl border border-gray-200 bg-white px-3 py-2 text-sm outline-none focus:border-primary-400"
                  rows={1}
                />
                <button
                  type="button"
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-60"
                  onClick={() => void send()}
                  disabled={sending || uploading}
                >
                  {sending ? t("common.loading") : t("app.supportCenter.action.send")}
                </button>
              </div>
              <div className="mt-2 text-xs text-gray-500">{t("app.supportCenter.upload.note")}</div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
