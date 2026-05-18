import { Body, Controller, Get, HttpException, Param, Patch, Post, Query, Req, Res, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import type { Response } from "express";
import type { SupportTicketPriority, SupportTicketStatus, SupportTicketType } from "@prisma/client";
import { OwnerGuard } from "../../shared/owner.guard";
import { SendSupportMessageDto, UpdateSupportTicketDto } from "./dto/support-center.dto";
import { SupportCenterService } from "./support-center.service";

type RequestWithOwner = { user?: { id: string } };

@Controller("owner/support-center")
export class SupportCenterOwnerController {
  constructor(private readonly support: SupportCenterService) {}

  @Get("tickets")
  @UseGuards(AuthGuard("owner-jwt"), OwnerGuard)
  async listTickets(
    @Query("status") status?: string,
    @Query("type") type?: string,
    @Query("priority") priority?: string,
    @Query("q") q?: string,
    @Query("unread") unread?: string,
    @Query("premium") premium?: string
  ) {
    const parsedStatus = (status?.trim() || null) as SupportTicketStatus | null;
    const parsedType = (type?.trim() || null) as SupportTicketType | null;
    const parsedPriority = (priority?.trim() || null) as SupportTicketPriority | null;
    const unreadOnly = (unread ?? "").trim() === "1" || (unread ?? "").trim().toLowerCase() === "true";
    const premiumOnly = (premium ?? "").trim() === "1" || (premium ?? "").trim().toLowerCase() === "true";

    const tickets = await this.support.listOwnerTickets({
      status: parsedStatus ?? undefined,
      type: parsedType ?? undefined,
      priority: parsedPriority ?? undefined,
      q: q?.trim() || undefined,
      unreadOnly,
      premiumOnly
    });

    return { data: { tickets } };
  }

  @Get("tickets/:ticketId/messages")
  @UseGuards(AuthGuard("owner-jwt"), OwnerGuard)
  async listMessages(@Param("ticketId") ticketId: string, @Query("cursor") cursor?: string, @Query("limit") limitRaw?: string) {
    const limit = limitRaw ? Number.parseInt(limitRaw, 10) : undefined;
    const messages = await this.support.getOwnerMessages({ ticketId, cursor: cursor?.trim() || undefined, limit });
    return { data: { messages } };
  }

  @Post("tickets/:ticketId/messages")
  @UseGuards(AuthGuard("owner-jwt"), OwnerGuard)
  async sendMessage(@Req() req: RequestWithOwner, @Param("ticketId") ticketId: string, @Body() body: SendSupportMessageDto) {
    const ownerUserId = req.user?.id ?? null;
    if (!ownerUserId) {
      throw new HttpException({ error: { code: "UNAUTHENTICATED", message_key: "errors.unauthenticated" } }, 401);
    }

    const created = await this.support.sendOwnerMessage({
      ownerUserId,
      ticketId,
      message: body.message,
      attachmentIds: body.attachmentIds ?? []
    });
    return { data: created };
  }

  @Patch("tickets/:ticketId")
  @UseGuards(AuthGuard("owner-jwt"), OwnerGuard)
  async updateTicket(@Param("ticketId") ticketId: string, @Body() body: UpdateSupportTicketDto) {
    const updated = await this.support.updateOwnerTicket({
      ticketId,
      status: (body.status?.trim() || undefined) as SupportTicketStatus | undefined,
      priority: (body.priority?.trim() || undefined) as SupportTicketPriority | undefined,
      assignedToUserId: typeof body.assignedToUserId !== "undefined" ? (body.assignedToUserId as string | null) : undefined
    });
    return { data: { ticket: updated } };
  }

  @Post("tickets/:ticketId/read")
  @UseGuards(AuthGuard("owner-jwt"), OwnerGuard)
  async markRead(@Param("ticketId") ticketId: string) {
    await this.support.markOwnerRead({ ticketId });
    return { data: { ok: true } };
  }

  @Post("tickets/:ticketId/attachments")
  @UseGuards(AuthGuard("owner-jwt"), OwnerGuard)
  @UseInterceptors(
    FileInterceptor("file", {
      storage: memoryStorage(),
      limits: { fileSize: 20 * 1024 * 1024 }
    })
  )
  async uploadAttachment(@Req() req: RequestWithOwner, @Param("ticketId") ticketId: string, @UploadedFile() file: Express.Multer.File | undefined) {
    const ownerUserId = req.user?.id ?? null;
    if (!ownerUserId) {
      throw new HttpException({ error: { code: "UNAUTHENTICATED", message_key: "errors.unauthenticated" } }, 401);
    }
    if (!file) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const attachment = await this.support.uploadOwnerAttachment({ ownerUserId, ticketId, file });
    return { data: { attachment } };
  }

  @Get("attachments/:attachmentId")
  @UseGuards(AuthGuard("owner-jwt"), OwnerGuard)
  async downloadAttachment(@Param("attachmentId") attachmentId: string, @Res() res: Response) {
    const f = await this.support.getOwnerAttachment({ attachmentId });
    res.setHeader("Content-Type", f.contentType);
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(f.originalName)}"`);
    res.setHeader("Cache-Control", "private, max-age=0");
    res.send(f.buf);
  }
}

