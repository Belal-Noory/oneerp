import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConnectedSocket, MessageBody, SubscribeMessage, WebSocketGateway, WebSocketServer } from "@nestjs/websockets";
import type { Server, Socket } from "socket.io";
import { PrismaService } from "../../prisma/prisma.service";

type AuthedSocket = Socket & {
  data: {
    auth?: { kind: "tenant" | "owner"; userId: string; tenantId?: string };
  };
};

function parseCookieHeader(header: string | undefined): Record<string, string> {
  if (!header) return {};
  const out: Record<string, string> = {};
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (!k) continue;
    out[k] = decodeURIComponent(v);
  }
  return out;
}

function isOwnerEmailAllowed(emailRaw: string | null | undefined): boolean {
  const email = (emailRaw ?? "").trim().toLowerCase();
  if (!email) return false;
  const fromSingle = (process.env.OWNER_ADMIN_EMAIL ?? "").trim().toLowerCase();
  const fromList = (process.env.OWNER_ADMIN_EMAILS ?? "")
    .split(",")
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean);
  const allow = new Set([fromSingle, ...fromList].filter(Boolean));
  return allow.has(email);
}

@Injectable()
@WebSocketGateway({
  path: "/api/socket.io",
  cors: { origin: true, credentials: true }
})
export class SupportCenterGateway {
  @WebSocketServer()
  server!: Server;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async handleConnection(client: AuthedSocket) {
    const cookies = parseCookieHeader(client.handshake.headers.cookie);
    const ownerToken = cookies["oneerp_owner_access"] ?? null;
    const tenantToken = cookies["oneerp_access"] ?? null;

    if (ownerToken) {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(ownerToken).catch(() => null);
      if (!payload?.sub) return client.disconnect(true);
      const user = await this.prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, email: true, isActive: true } });
      if (!user || !user.isActive || !isOwnerEmailAllowed(user.email)) return client.disconnect(true);

      client.data.auth = { kind: "owner", userId: user.id };
      client.join("owner:admins");
      client.join(`owner:user:${user.id}`);
      return;
    }

    if (tenantToken) {
      const payload = await this.jwt.verifyAsync<{ sub: string }>(tenantToken).catch(() => null);
      if (!payload?.sub) return client.disconnect(true);

      const tenantIdHeader = client.handshake.headers["x-tenant-id"];
      const tenantIdAuth = (client.handshake as unknown as { auth?: { tenantId?: unknown } })?.auth?.tenantId;
      const tenantId =
        typeof tenantIdHeader === "string"
          ? tenantIdHeader
          : typeof tenantIdAuth === "string"
            ? tenantIdAuth
            : null;
      if (!tenantId) return client.disconnect(true);

      const membership = await this.prisma.membership.findUnique({
        where: { tenantId_userId: { tenantId, userId: payload.sub } },
        select: { id: true, status: true }
      });
      if (!membership || membership.status !== "active") return client.disconnect(true);

      client.data.auth = { kind: "tenant", userId: payload.sub, tenantId };
      client.join(`tenant:${tenantId}`);
      client.join(`tenant:${tenantId}:user:${payload.sub}`);
      return;
    }

    client.disconnect(true);
  }

  async handleDisconnect(client: AuthedSocket) {
    client.data.auth = undefined;
  }

  async joinTicketRoom(client: AuthedSocket, ticketId: string): Promise<boolean> {
    const auth = client.data.auth;
    if (!auth) return false;

    const ticket = await this.prisma.supportTicket.findUnique({ where: { id: ticketId }, select: { id: true, tenantId: true } });
    if (!ticket) return false;

    if (auth.kind === "tenant") {
      if (!auth.tenantId || ticket.tenantId !== auth.tenantId) return false;
      client.join(`ticket:${ticketId}`);
      return true;
    }

    if (auth.kind === "owner") {
      client.join(`ticket:${ticketId}`);
      return true;
    }

    return false;
  }

  @SubscribeMessage("support:join")
  async onJoin(@ConnectedSocket() client: AuthedSocket, @MessageBody() body: { ticketId?: string }) {
    const ticketId = typeof body?.ticketId === "string" ? body.ticketId.trim() : "";
    if (!ticketId) return { ok: false };
    const ok = await this.joinTicketRoom(client, ticketId);
    return { ok };
  }

  @SubscribeMessage("support:typing")
  async onTyping(
    @ConnectedSocket() client: AuthedSocket,
    @MessageBody() body: { ticketId?: string; isTyping?: boolean }
  ) {
    const ticketId = typeof body?.ticketId === "string" ? body.ticketId.trim() : "";
    if (!ticketId) return { ok: false };

    const ok = await this.joinTicketRoom(client, ticketId);
    if (!ok) return { ok: false };

    const auth = client.data.auth;
    if (!auth) return { ok: false };

    const isTyping = body?.isTyping === true;
    const sender = auth.kind === "owner" ? "owner" : "tenant";
    client.to(`ticket:${ticketId}`).emit("support:typing", { ticketId, sender, isTyping });
    return { ok: true };
  }

  emitTicketCreated(args: { tenantId: string; ticketId: string }) {
    this.server.to("owner:admins").emit("support:ticketCreated", args);
    this.server.to(`tenant:${args.tenantId}`).emit("support:ticketCreated", args);
  }

  emitTicketUpdated(args: { tenantId: string; ticketId: string }) {
    this.server.to("owner:admins").emit("support:ticketUpdated", args);
    this.server.to(`tenant:${args.tenantId}`).emit("support:ticketUpdated", args);
    this.server.to(`ticket:${args.ticketId}`).emit("support:ticketUpdated", args);
  }

  emitMessageCreated(args: { tenantId: string; ticketId: string; messageId: string }) {
    this.server.to("owner:admins").emit("support:messageCreated", args);
    this.server.to(`tenant:${args.tenantId}`).emit("support:messageCreated", args);
    this.server.to(`ticket:${args.ticketId}`).emit("support:messageCreated", args);
  }

  emitTyping(args: { ticketId: string; sender: "tenant" | "owner"; isTyping: boolean }) {
    this.server.to(`ticket:${args.ticketId}`).emit("support:typing", args);
  }
}
