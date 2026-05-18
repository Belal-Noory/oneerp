import { HttpException, Injectable } from "@nestjs/common";
import { randomUUID } from "crypto";
import { promises as fs } from "fs";
import path from "path";
import type { SupportSenderType, SupportTicketPriority, SupportTicketStatus, SupportTicketType } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { SupportCenterGateway } from "./support-center.gateway";

const STORAGE_ROOT = path.join(process.cwd(), "apps", "api", "storage", "support-center");
const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function safeTrim(v: string): string {
  return v.trim().replace(/\s+/g, " ");
}

function previewText(v: string, max = 140): string {
  const s = safeTrim(v);
  if (s.length <= max) return s;
  return s.slice(0, max - 1) + "…";
}

function isAllowedAttachmentContentType(contentType: string): boolean {
  const ct = (contentType ?? "").toLowerCase();
  if (ct.startsWith("image/")) return true;
  if (ct.startsWith("video/")) return true;
  if (ct === "application/pdf") return true;
  if (ct === "text/plain") return true;
  if (ct === "text/csv") return true;
  if (ct === "application/json") return true;
  if (ct === "application/zip") return true;
  return false;
}

function supportEmailConfig() {
  const host = process.env.SUPPORT_EMAIL_SMTP_HOST?.trim() || process.env.CONTACT_EMAIL_SMTP_HOST?.trim() || "";
  const portRaw = process.env.SUPPORT_EMAIL_SMTP_PORT?.trim() || process.env.CONTACT_EMAIL_SMTP_PORT?.trim() || "465";
  const port = Number.parseInt(portRaw, 10) || 465;
  const user = process.env.SUPPORT_EMAIL_USER?.trim() || process.env.CONTACT_EMAIL_USER?.trim() || "";
  const pass = ((process.env.SUPPORT_EMAIL_PASS ?? process.env.CONTACT_EMAIL_PASS ?? "") + "").replace(/\s+/g, "");
  const from = (process.env.SUPPORT_EMAIL_FROM ?? process.env.CONTACT_EMAIL_FROM ?? user).trim();
  const toRaw =
    (process.env.SUPPORT_EMAIL_TO ?? "").trim() ||
    (process.env.OWNER_ADMIN_EMAILS ?? "").trim() ||
    (process.env.OWNER_ADMIN_EMAIL ?? "").trim() ||
    (process.env.CONTACT_EMAIL_TO ?? "").trim();
  const to = toRaw
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  return { host, port, user, pass, from, to };
}

async function smtpSendMail(args: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  text: string;
}): Promise<void> {
  const tls = await import("tls");
  const socket = tls.connect({
    host: args.host,
    port: args.port,
    servername: args.host,
    timeout: 8000
  });

  const readReply = () =>
    new Promise<{ code: number; lines: string[] }>((resolve, reject) => {
      let buf = "";
      const lines: string[] = [];
      const onData = (chunk: Buffer) => {
        buf += chunk.toString("utf8");
        for (;;) {
          const idx = buf.indexOf("\r\n");
          if (idx < 0) break;
          const line = buf.slice(0, idx);
          buf = buf.slice(idx + 2);
          lines.push(line);
          if (line.length >= 4 && /^\d{3} /.test(line)) {
            cleanup();
            resolve({ code: Number.parseInt(line.slice(0, 3), 10), lines });
            return;
          }
        }
      };
      const onError = (err: unknown) => {
        cleanup();
        reject(err);
      };
      const onTimeout = () => {
        cleanup();
        reject(new Error("SMTP_TIMEOUT"));
      };
      const cleanup = () => {
        socket.off("data", onData);
        socket.off("error", onError);
        socket.off("timeout", onTimeout);
      };
      socket.on("data", onData);
      socket.on("error", onError);
      socket.on("timeout", onTimeout);
    });

  const send = (line: string) =>
    new Promise<void>((resolve, reject) => {
      socket.write(`${line}\r\n`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

  const expect = async (okCodes: number[]) => {
    const r = await readReply();
    if (!okCodes.includes(r.code)) throw new Error(`SMTP_BAD_REPLY_${r.code}`);
    return r;
  };

  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", () => resolve());
      socket.once("error", (err) => reject(err));
    });

    await expect([220]);
    await send(`EHLO oneerp`);
    await expect([250]);

    await send("AUTH LOGIN");
    await expect([334]);
    await send(Buffer.from(args.user, "utf8").toString("base64"));
    await expect([334]);
    await send(Buffer.from(args.pass, "utf8").toString("base64"));
    await expect([235]);

    await send(`MAIL FROM:<${args.from}>`);
    await expect([250]);
    await send(`RCPT TO:<${args.to}>`);
    await expect([250, 251]);
    await send("DATA");
    await expect([354]);

    const date = new Date().toUTCString();
    const msg =
      [
        `From: ${args.from}`,
        `To: ${args.to}`,
        `Subject: ${args.subject}`,
        `Date: ${date}`,
        `MIME-Version: 1.0`,
        `Content-Type: text/plain; charset="utf-8"`,
        `Content-Transfer-Encoding: 8bit`,
        "",
        args.text
      ].join("\r\n") + "\r\n";

    socket.write(msg.replace(/\r?\n/g, "\r\n"));
    socket.write("\r\n.\r\n");
    await expect([250]);

    await send("QUIT");
    await expect([221]);
  } finally {
    socket.end();
  }
}

@Injectable()
export class SupportCenterService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: SupportCenterGateway
  ) {}

  async listTenantTickets(args: {
    tenantId: string;
    userId: string;
    status?: SupportTicketStatus;
    type?: SupportTicketType;
    priority?: SupportTicketPriority;
    q?: string;
    unreadOnly?: boolean;
  }) {
    const q = args.q ? safeTrim(args.q) : null;
    const where = {
      tenantId: args.tenantId,
      ...(args.status ? { status: args.status } : {}),
      ...(args.type ? { type: args.type } : {}),
      ...(args.priority ? { priority: args.priority } : {}),
      ...(args.unreadOnly ? { unreadForTenant: { gt: 0 } } : {}),
      ...(q
        ? {
            OR: [
              { subject: { contains: q, mode: "insensitive" as const } },
              { description: { contains: q, mode: "insensitive" as const } }
            ]
          }
        : {})
    };

    const rows = await this.prisma.supportTicket.findMany({
      where,
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        type: true,
        subject: true,
        status: true,
        priority: true,
        updatedAt: true,
        createdAt: true,
        lastMessageAt: true,
        lastMessageText: true,
        lastSenderType: true,
        unreadForTenant: true
      },
      take: 100
    });

    return rows;
  }

  async createTenantTicket(args: {
    tenantId: string;
    userId: string;
    type: SupportTicketType;
    subject: string;
    description: string;
    priority: SupportTicketPriority;
  }) {
    const now = new Date();
    const subject = safeTrim(args.subject);
    const description = safeTrim(args.description);

    const ticket = await this.prisma.supportTicket.create({
      data: {
        tenantId: args.tenantId,
        createdByUserId: args.userId,
        type: args.type,
        subject,
        description,
        status: "open",
        priority: args.priority,
        lastMessageAt: now,
        lastMessageText: previewText(description),
        lastSenderType: "tenant",
        unreadForTenant: 0,
        unreadForOwner: 1,
        messages: {
          create: {
            senderType: "tenant",
            senderUserId: args.userId,
            message: description,
            seenByTenantAt: now
          }
        }
      },
      select: { id: true, type: true, subject: true, status: true, priority: true, createdAt: true }
    });

    await this.notifyOwnerEmail({
      tenantId: args.tenantId,
      kind: "new_ticket",
      ticketId: ticket.id,
      ticketType: args.type,
      subject,
      preview: description
    });

    this.gateway.emitTicketCreated({ tenantId: args.tenantId, ticketId: ticket.id });
    return ticket;
  }

  async getTenantMessages(args: { tenantId: string; userId: string; ticketId: string; cursor?: string; limit?: number }) {
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: args.ticketId },
      select: { id: true, tenantId: true }
    });
    if (!ticket || ticket.tenantId !== args.tenantId) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    const take = Math.min(Math.max(args.limit ?? 30, 1), 50);
    const messages = await this.prisma.supportMessage.findMany({
      where: { ticketId: args.ticketId },
      orderBy: [{ createdAt: "desc" }],
      ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
      take,
      select: {
        id: true,
        senderType: true,
        senderUserId: true,
        message: true,
        createdAt: true,
        seenByTenantAt: true,
        seenByOwnerAt: true,
        attachments: {
          select: { id: true, originalName: true, contentType: true, sizeBytes: true, createdAt: true }
        }
      }
    });

    return messages.reverse();
  }

  async sendTenantMessage(args: {
    tenantId: string;
    userId: string;
    ticketId: string;
    message: string;
    attachmentIds: string[];
  }) {
    const now = new Date();
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: args.ticketId },
      select: { id: true, tenantId: true, type: true, subject: true }
    });
    if (!ticket || ticket.tenantId !== args.tenantId) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    const msg = safeTrim(args.message);
    const attachmentIds = (args.attachmentIds ?? []).filter(Boolean);

    const created = await this.prisma.$transaction(async (tx) => {
      const createdMessage = await tx.supportMessage.create({
        data: {
          ticketId: args.ticketId,
          senderType: "tenant",
          senderUserId: args.userId,
          message: msg,
          seenByTenantAt: now
        },
        select: {
          id: true,
          senderType: true,
          senderUserId: true,
          message: true,
          createdAt: true,
          seenByTenantAt: true,
          seenByOwnerAt: true
        }
      });

      if (attachmentIds.length > 0) {
        await tx.supportAttachment.updateMany({
          where: {
            id: { in: attachmentIds },
            ticketId: args.ticketId,
            uploaderUserId: args.userId,
            messageId: null
          },
          data: { messageId: createdMessage.id }
        });
      }

      const updatedTicket = await tx.supportTicket.update({
        where: { id: args.ticketId },
        data: {
          lastMessageAt: now,
          lastMessageText: previewText(msg),
          lastSenderType: "tenant",
          unreadForOwner: { increment: 1 }
        },
        select: { id: true, unreadForOwner: true, unreadForTenant: true, status: true, priority: true, updatedAt: true }
      });

      return { message: createdMessage, ticket: updatedTicket };
    });

    await this.notifyOwnerEmail({
      tenantId: args.tenantId,
      kind: "new_message",
      ticketId: ticket.id,
      ticketType: ticket.type,
      subject: ticket.subject,
      preview: msg
    });

    this.gateway.emitMessageCreated({ tenantId: args.tenantId, ticketId: ticket.id, messageId: created.message.id });
    this.gateway.emitTicketUpdated({ tenantId: args.tenantId, ticketId: ticket.id });
    return created;
  }

  async markTenantRead(args: { tenantId: string; userId: string; ticketId: string }) {
    const now = new Date();
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: args.ticketId },
      select: { id: true, tenantId: true }
    });
    if (!ticket || ticket.tenantId !== args.tenantId) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: args.ticketId },
        data: { unreadForTenant: 0 }
      });
      await tx.supportMessage.updateMany({
        where: { ticketId: args.ticketId, senderType: "owner", seenByTenantAt: null },
        data: { seenByTenantAt: now }
      });
    });

    this.gateway.emitTicketUpdated({ tenantId: args.tenantId, ticketId: args.ticketId });
  }

  async markOwnerRead(args: { ticketId: string }) {
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.supportTicket.update({
        where: { id: args.ticketId },
        data: { unreadForOwner: 0 }
      });
      await tx.supportMessage.updateMany({
        where: { ticketId: args.ticketId, senderType: "tenant", seenByOwnerAt: null },
        data: { seenByOwnerAt: now }
      });
    });

    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: args.ticketId }, select: { tenantId: true } });
    if (ticket) this.gateway.emitTicketUpdated({ tenantId: ticket.tenantId, ticketId: args.ticketId });
  }

  async uploadTenantAttachment(args: { tenantId: string; userId: string; ticketId: string; file: Express.Multer.File }) {
    if (!args.file || !args.file.buffer) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }
    if (args.file.size > MAX_ATTACHMENT_BYTES) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const contentType = (args.file.mimetype ?? "application/octet-stream").toLowerCase();
    if (!isAllowedAttachmentContentType(contentType)) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: args.ticketId },
      select: { id: true, tenantId: true }
    });
    if (!ticket || ticket.tenantId !== args.tenantId) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    const id = randomUUID();
    const storageKey = path.posix.join(args.tenantId, args.ticketId, id);
    const diskPath = path.join(STORAGE_ROOT, storageKey.replaceAll("/", path.sep));
    await fs.mkdir(path.dirname(diskPath), { recursive: true });
    await fs.writeFile(diskPath, args.file.buffer);

    const record = await this.prisma.supportAttachment.create({
      data: {
        id,
        ticketId: args.ticketId,
        uploaderType: "tenant",
        uploaderUserId: args.userId,
        originalName: args.file.originalname ?? "attachment",
        contentType,
        sizeBytes: args.file.size,
        storageKey
      },
      select: { id: true, originalName: true, contentType: true, sizeBytes: true, createdAt: true }
    });

    return record;
  }

  async getTenantAttachment(args: { tenantId: string; attachmentId: string }) {
    const record = await this.prisma.supportAttachment.findUnique({
      where: { id: args.attachmentId },
      select: { id: true, ticketId: true, contentType: true, originalName: true, sizeBytes: true, storageKey: true, ticket: { select: { tenantId: true } } }
    });
    if (!record || record.ticket.tenantId !== args.tenantId) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    const diskPath = path.join(STORAGE_ROOT, record.storageKey.replaceAll("/", path.sep));
    const buf = await fs.readFile(diskPath).catch(() => null);
    if (!buf) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    return { contentType: record.contentType, originalName: record.originalName, buf };
  }

  async listOwnerTickets(args: {
    status?: SupportTicketStatus;
    type?: SupportTicketType;
    priority?: SupportTicketPriority;
    q?: string;
    unreadOnly?: boolean;
    premiumOnly?: boolean;
  }) {
    const q = args.q ? safeTrim(args.q) : null;

    const where: Record<string, unknown> = {
      ...(args.status ? { status: args.status } : {}),
      ...(args.type ? { type: args.type } : {}),
      ...(args.priority ? { priority: args.priority } : {}),
      ...(args.unreadOnly ? { unreadForOwner: { gt: 0 } } : {}),
      ...(q
        ? {
            OR: [
              { subject: { contains: q, mode: "insensitive" } },
              { description: { contains: q, mode: "insensitive" } },
              { tenant: { displayName: { contains: q, mode: "insensitive" } } },
              { tenant: { slug: { contains: q, mode: "insensitive" } } }
            ]
          }
        : {}),
      ...(args.premiumOnly ? { tenant: { partnerProfile: { is: { isPremiumPartner: true } } } } : {})
    };

    const rows = await this.prisma.supportTicket.findMany({
      where: where as never,
      orderBy: [{ updatedAt: "desc" }],
      select: {
        id: true,
        tenantId: true,
        type: true,
        subject: true,
        status: true,
        priority: true,
        updatedAt: true,
        createdAt: true,
        lastMessageAt: true,
        lastMessageText: true,
        lastSenderType: true,
        unreadForOwner: true,
        assignedToUserId: true,
        tenant: {
          select: {
            id: true,
            slug: true,
            displayName: true,
            partnerProfile: { select: { isPremiumPartner: true } }
          }
        }
      },
      take: 200
    });

    return rows.map((r) => ({
      ...r,
      tenant: { ...r.tenant, isPremiumPartner: r.tenant.partnerProfile?.isPremiumPartner === true }
    }));
  }

  async getOwnerMessages(args: { ticketId: string; cursor?: string; limit?: number }) {
    const take = Math.min(Math.max(args.limit ?? 40, 1), 60);
    const messages = await this.prisma.supportMessage.findMany({
      where: { ticketId: args.ticketId },
      orderBy: [{ createdAt: "desc" }],
      ...(args.cursor ? { cursor: { id: args.cursor }, skip: 1 } : {}),
      take,
      select: {
        id: true,
        senderType: true,
        senderUserId: true,
        message: true,
        createdAt: true,
        seenByTenantAt: true,
        seenByOwnerAt: true,
        attachments: { select: { id: true, originalName: true, contentType: true, sizeBytes: true, createdAt: true } }
      }
    });
    return messages.reverse();
  }

  async sendOwnerMessage(args: { ownerUserId: string; ticketId: string; message: string; attachmentIds: string[] }) {
    const now = new Date();
    const msg = safeTrim(args.message);
    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: args.ticketId },
      select: { id: true, tenantId: true }
    });
    if (!ticket) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    const attachmentIds = (args.attachmentIds ?? []).filter(Boolean);
    const created = await this.prisma.$transaction(async (tx) => {
      const createdMessage = await tx.supportMessage.create({
        data: {
          ticketId: args.ticketId,
          senderType: "owner",
          senderUserId: args.ownerUserId,
          message: msg,
          seenByOwnerAt: now
        },
        select: {
          id: true,
          senderType: true,
          senderUserId: true,
          message: true,
          createdAt: true,
          seenByTenantAt: true,
          seenByOwnerAt: true
        }
      });

      if (attachmentIds.length > 0) {
        await tx.supportAttachment.updateMany({
          where: { id: { in: attachmentIds }, ticketId: args.ticketId, uploaderUserId: args.ownerUserId, messageId: null },
          data: { messageId: createdMessage.id }
        });
      }

      const updatedTicket = await tx.supportTicket.update({
        where: { id: args.ticketId },
        data: {
          lastMessageAt: now,
          lastMessageText: previewText(msg),
          lastSenderType: "owner",
          unreadForTenant: { increment: 1 }
        },
        select: { id: true, unreadForOwner: true, unreadForTenant: true, status: true, priority: true, updatedAt: true }
      });

      return { message: createdMessage, ticket: updatedTicket };
    });

    this.gateway.emitMessageCreated({ tenantId: ticket.tenantId, ticketId: ticket.id, messageId: created.message.id });
    this.gateway.emitTicketUpdated({ tenantId: ticket.tenantId, ticketId: ticket.id });
    return created;
  }

  async updateOwnerTicket(args: { ticketId: string; status?: SupportTicketStatus; priority?: SupportTicketPriority; assignedToUserId?: string | null }) {
    const existing = await this.prisma.supportTicket.findUnique({ where: { id: args.ticketId }, select: { id: true } });
    if (!existing) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    const updated = await this.prisma.supportTicket.update({
      where: { id: args.ticketId },
      data: {
        ...(args.status ? { status: args.status } : {}),
        ...(args.priority ? { priority: args.priority } : {}),
        ...(typeof args.assignedToUserId !== "undefined" ? { assignedToUserId: args.assignedToUserId } : {})
      },
      select: { id: true, status: true, priority: true, assignedToUserId: true, updatedAt: true }
    });

    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: args.ticketId }, select: { tenantId: true } });
    if (ticket) this.gateway.emitTicketUpdated({ tenantId: ticket.tenantId, ticketId: args.ticketId });
    return updated;
  }

  async uploadOwnerAttachment(args: { ownerUserId: string; ticketId: string; file: Express.Multer.File }) {
    if (!args.file || !args.file.buffer) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }
    if (args.file.size > MAX_ATTACHMENT_BYTES) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const contentType = (args.file.mimetype ?? "application/octet-stream").toLowerCase();
    if (!isAllowedAttachmentContentType(contentType)) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const ticket = await this.prisma.supportTicket.findUnique({
      where: { id: args.ticketId },
      select: { id: true, tenantId: true }
    });
    if (!ticket) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    const id = randomUUID();
    const storageKey = path.posix.join(ticket.tenantId, args.ticketId, id);
    const diskPath = path.join(STORAGE_ROOT, storageKey.replaceAll("/", path.sep));
    await fs.mkdir(path.dirname(diskPath), { recursive: true });
    await fs.writeFile(diskPath, args.file.buffer);

    const record = await this.prisma.supportAttachment.create({
      data: {
        id,
        ticketId: args.ticketId,
        uploaderType: "owner",
        uploaderUserId: args.ownerUserId,
        originalName: args.file.originalname ?? "attachment",
        contentType,
        sizeBytes: args.file.size,
        storageKey
      },
      select: { id: true, originalName: true, contentType: true, sizeBytes: true, createdAt: true }
    });

    return record;
  }

  async getOwnerAttachment(args: { attachmentId: string }) {
    const record = await this.prisma.supportAttachment.findUnique({
      where: { id: args.attachmentId },
      select: { id: true, contentType: true, originalName: true, storageKey: true }
    });
    if (!record) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    const diskPath = path.join(STORAGE_ROOT, record.storageKey.replaceAll("/", path.sep));
    const buf = await fs.readFile(diskPath).catch(() => null);
    if (!buf) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    return { contentType: record.contentType, originalName: record.originalName, buf };
  }

  private async notifyOwnerEmail(args: {
    tenantId: string;
    kind: "new_ticket" | "new_message";
    ticketId: string;
    ticketType: SupportTicketType;
    subject: string;
    preview: string;
  }) {
    const cfg = supportEmailConfig();
    if (!cfg.host || !cfg.user || !cfg.pass || cfg.to.length === 0) return;

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: args.tenantId },
      select: { id: true, slug: true, displayName: true, legalName: true }
    });
    if (!tenant) return;

    const ownerBase = (process.env.OWNER_APP_BASE_URL ?? "https://owner.oneerp.online").trim().replace(/\/+$/, "");
    const link = `${ownerBase}/support?ticketId=${encodeURIComponent(args.ticketId)}`;

    const typeLabel =
      args.ticketType === "issue_report"
        ? "Issue Report"
        : args.ticketType === "support_request"
          ? "Support Request"
          : args.ticketType === "feature_suggestion"
            ? "Feature Suggestion"
            : args.ticketType === "billing"
              ? "Billing"
              : "Other";

    const subjectPrefix = args.kind === "new_ticket" ? "New Support Ticket" : "New Client Reply";
    const mailSubject = `[ONEERP] ${subjectPrefix} — ${tenant.displayName} — ${typeLabel}`;
    const text = [
      `Tenant: ${tenant.displayName} (${tenant.slug})`,
      `Type: ${typeLabel}`,
      `Subject: ${args.subject}`,
      "",
      `Message:`,
      previewText(args.preview, 600),
      "",
      `Open in Owner App: ${link}`
    ].join("\n");

    await Promise.all(
      cfg.to.map(async (to) => {
        try {
          await smtpSendMail({
            host: cfg.host,
            port: cfg.port,
            user: cfg.user,
            pass: cfg.pass,
            from: cfg.from,
            to,
            subject: mailSubject,
            text
          });
        } catch {
        }
      })
    );
  }
}
