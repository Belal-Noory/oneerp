import { Body, Controller, Get, HttpException, Param, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Response } from "express";
import type { SupportTicketPriority, SupportTicketStatus, SupportTicketType } from "@prisma/client";
import { TenantGuard } from "../../shared/tenant.guard";
import { CreateSupportTicketDto, SendSupportMessageDto } from "./dto/support-center.dto";
import { SupportCenterService } from "./support-center.service";

type RequestWithTenant = { tenantId: string; user?: { id: string } };

@Controller("support-center")
export class SupportCenterController {
  constructor(private readonly support: SupportCenterService) {}

  @Get("tickets")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async listTickets(
    @Req() req: RequestWithTenant,
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("priority") priority?: string,
    @Query("q") q?: string,
    @Query("unread") unread?: string
  ) {
    const tenantId = req.tenantId;
    const userId = req.user?.id ?? null;
    if (!userId) {
      throw new HttpException({ error: { code: "UNAUTHENTICATED", message_key: "errors.unauthenticated" } }, 401);
    }

    const parsedStatus = (status?.trim() || null) as SupportTicketStatus | null;
    const parsedType = (type?.trim() || null) as SupportTicketType | null;
    const parsedPriority = (priority?.trim() || null) as SupportTicketPriority | null;
    const unreadOnly = (unread ?? "").trim() === "1" || (unread ?? "").trim().toLowerCase() === "true";

    const items = await this.support.listTenantTickets({
      tenantId,
      userId,
      status: parsedStatus ?? undefined,
      type: parsedType ?? undefined,
      priority: parsedPriority ?? undefined,
      q: q?.trim() || undefined,
      unreadOnly
    });
    return { data: { tickets: items } };
  }

  @Post("tickets")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async createTicket(@Req() req: RequestWithTenant, @Body() body: CreateSupportTicketDto) {
    const tenantId = req.tenantId;
    const userId = req.user?.id ?? null;
    if (!userId) {
      throw new HttpException({ error: { code: "UNAUTHENTICATED", message_key: "errors.unauthenticated" } }, 401);
    }

    const priority = ((body.priority ?? "normal").trim() || "normal") as SupportTicketPriority;
    const ticket = await this.support.createTenantTicket({
      tenantId,
      userId,
      type: body.type as SupportTicketType,
      subject: body.subject,
      description: body.description,
      priority
    });

    return { data: { ticket } };
  }

  @Get("tickets/:ticketId/messages")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async listMessages(
    @Req() req: RequestWithTenant,
    @Param("ticketId") ticketId: string,
    @Query("cursor") cursor?: string,
    @Query("limit") limitRaw?: string
  ) {
    const tenantId = req.tenantId;
    const userId = req.user?.id ?? null;
    if (!userId) {
      throw new HttpException({ error: { code: "UNAUTHENTICATED", message_key: "errors.unauthenticated" } }, 401);
    }

    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const messages = await this.support.getTenantMessages({ tenantId, userId, ticketId, cursor: cursor?.trim() || undefined, limit });
    return { data: { messages } };
  }

  @Post("tickets/:ticketId/messages")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async sendMessage(@Req() req: RequestWithTenant, @Param("ticketId") ticketId: string, @Body() body: SendSupportMessageDto) {
    const tenantId = req.tenantId;
    const userId = req.user?.id ?? null;
    if (!userId) {
      throw new HttpException({ error: { code: "UNAUTHENTICATED", message_key: "errors.unauthenticated" } }, 401);
    }

    const created = await this.support.sendTenantMessage({
      tenantId,
      userId,
      ticketId,
      message: body.message,
      attachmentIds: body.attachmentIds ?? []
    });

    return { data: created };
  }

  @Post("tickets/:ticketId/read")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async markRead(@Req() req: RequestWithTenant, @Param("ticketId") ticketId: string) {
    const tenantId = req.tenantId;
    const userId = req.user?.id ?? null;
    if (!userId) {
      throw new HttpException({ error: { code: "UNAUTHENTICATED", message_key: "errors.unauthenticated" } }, 401);
    }

    await this.support.markTenantRead({ tenantId, userId, ticketId });
    return { data: { ok: true } };
  }

  @Post("tickets/:ticketId/attachments")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 }
    })
  )
  async uploadAttachment(@Req() req: RequestWithTenant, @Param("ticketId") ticketId: string, @UploadedFile() file: Express.Multer.File | undefined) {
    const tenantId = req.tenantId;
    const userId = req.user?.id ?? null;
    if (!userId) {
      throw new HttpException({ error: { code: "UNAUTHENTICATED", message_key: "errors.unauthenticated" } }, 401);
    }
    if (!file) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const attachment = await this.support.uploadTenantAttachment({ tenantId, userId, ticketId, file });
    return { data: { attachment } };
  }

  @Get("attachments/:attachmentId")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async downloadAttachment(@Req() req: RequestWithTenant, @Param("attachmentId") attachmentId: string, @Res() res: Response) {
    const tenantId = req.tenantId;
    const f = await this.support.getTenantAttachment({ tenantId, attachmentId });
    res.setHeader("Content-Type", f.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(f.originalName)}"`);
    res.setHeader("Cache-Control", "private, max-age=0");
    res.send(f.buf);
  }
}

