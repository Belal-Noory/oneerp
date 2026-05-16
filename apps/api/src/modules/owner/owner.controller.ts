import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import * as argon2 from "argon2";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { OwnerGuard } from "../../shared/owner.guard";
import { ensureFuelDefaultRolePermissions, ensureMspDefaultRolePermissions } from "../../shared/module-enabled.guard";
import { ApproveModuleRequestDto, RejectModuleRequestDto } from "./dto/approve-module-request.dto";
import { SetPeriodDto } from "./dto/set-period.dto";
import { AddMembershipDto } from "./dto/add-membership.dto";
import { UpsertTutorialCategoryDto, UpsertTutorialDto, UpsertTutorialSeriesDto } from "./dto/tutorials.dto";

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function addMonths(d: Date, months: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + months);
  return x;
}

function parseIsoDateOrNull(raw?: string): Date | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function randomPassword(length: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%^&*";
  let out = "";
  for (let i = 0; i < length; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

@Controller("owner")
@UseGuards(AuthGuard("owner-jwt"), OwnerGuard)
export class OwnerController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("me")
  async me(@Req() req: { user: { id: string; email?: string | null; fullName: string } }) {
    return { data: { id: req.user.id, email: req.user.email ?? null, fullName: req.user.fullName } };
  }

  @Get("tenants")
  async listTenants() {
    const tenants = await this.prisma.tenant.findMany({
      select: {
        id: true,
        slug: true,
        legalName: true,
        displayName: true,
        status: true,
        createdAt: true,
        branding: { select: { phone: true, email: true, address: true } },
        memberships: {
          where: { status: "active", role: { is: { name: "Owner" } } },
          select: { user: { select: { id: true, fullName: true, email: true, phone: true } } },
          take: 1,
          orderBy: { createdAt: "asc" }
        },
        enabledModules: { select: { moduleId: true, status: true, enabledAt: true, disabledAt: true } },
        subscription: {
          select: {
            id: true,
            items: {
              select: {
                moduleId: true,
                status: true,
                subscriptionType: true,
                billingCycle: true,
                priceAmount: true,
                priceCurrency: true,
                currentPeriodEndAt: true,
                graceEndsAt: true,
                lockedAt: true,
                module: { select: { nameKey: true } }
              }
            }
          }
        }
      },
      orderBy: { createdAt: "desc" }
    });

    return {
      data: tenants.map((t) => ({
        id: t.id,
        slug: t.slug,
        legalName: t.legalName,
        displayName: t.displayName,
        status: t.status,
        createdAt: t.createdAt,
        branding: t.branding ?? null,
        owner: t.memberships[0]?.user ?? null,
        enabledModules: t.enabledModules.map((m) => ({ moduleId: m.moduleId, status: m.status, enabledAt: m.enabledAt, disabledAt: m.disabledAt })),
        subscriptionItems: (t.subscription?.items ?? []).map((i) => ({
          moduleId: i.moduleId,
          status: i.status,
          subscriptionType: i.subscriptionType,
          billingCycle: i.billingCycle,
          priceAmount: i.priceAmount?.toString() ?? null,
          priceCurrency: i.priceCurrency ?? null,
          currentPeriodEndAt: i.currentPeriodEndAt,
          graceEndsAt: i.graceEndsAt,
          lockedAt: i.lockedAt,
          moduleNameKey: i.module.nameKey
        }))
      }))
    };
  }

  @Get("tenants/:tenantId")
  async getTenant(@Param("tenantId") tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        slug: true,
        legalName: true,
        displayName: true,
        status: true,
        createdAt: true,
        branding: { select: { phone: true, email: true, address: true } },
        memberships: {
          where: { status: "active" },
          select: { id: true, status: true, createdAt: true, user: { select: { id: true, fullName: true, email: true, phone: true } }, role: { select: { id: true, name: true } } },
          orderBy: { createdAt: "asc" }
        },
        enabledModules: { select: { moduleId: true, status: true, enabledAt: true, disabledAt: true, module: { select: { nameKey: true } } } },
        roles: { select: { id: true, name: true }, orderBy: { name: "asc" } },
        subscription: {
          select: {
            id: true,
            items: {
              where: { endedAt: null },
              select: {
                moduleId: true,
                status: true,
                subscriptionType: true,
                billingCycle: true,
                priceAmount: true,
                priceCurrency: true,
                currentPeriodStartAt: true,
                currentPeriodEndAt: true,
                graceEndsAt: true,
                lockedAt: true,
                approvedAt: true,
                supportEndsAt: true,
                module: { select: { nameKey: true } }
              },
              orderBy: { startedAt: "asc" }
            }
          }
        }
      }
    });

    if (!tenant) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    return {
      data: {
        id: tenant.id,
        slug: tenant.slug,
        legalName: tenant.legalName,
        displayName: tenant.displayName,
        status: tenant.status,
        createdAt: tenant.createdAt,
        branding: tenant.branding ?? null,
        owner: tenant.memberships.find((m) => m.role.name === "Owner")?.user ?? null,
        roles: tenant.roles.map((r) => ({ id: r.id, name: r.name })),
        memberships: tenant.memberships.map((m) => ({
          id: m.id,
          status: m.status,
          createdAt: m.createdAt,
          user: m.user,
          role: m.role
        })),
        enabledModules: tenant.enabledModules.map((m) => ({ moduleId: m.moduleId, status: m.status, enabledAt: m.enabledAt, disabledAt: m.disabledAt, moduleNameKey: m.module.nameKey })),
        subscriptionItems: (tenant.subscription?.items ?? []).map((i) => ({
          moduleId: i.moduleId,
          moduleNameKey: i.module.nameKey,
          status: i.status,
          subscriptionType: i.subscriptionType,
          billingCycle: i.billingCycle,
          priceAmount: i.priceAmount?.toString() ?? null,
          priceCurrency: i.priceCurrency ?? null,
          currentPeriodStartAt: i.currentPeriodStartAt,
          currentPeriodEndAt: i.currentPeriodEndAt,
          graceEndsAt: i.graceEndsAt,
          lockedAt: i.lockedAt,
          approvedAt: i.approvedAt,
          supportEndsAt: i.supportEndsAt
        }))
      }
    };
  }

  @Post("tenants/:tenantId/memberships")
  async addMembership(@Req() req: { user: { id: string } }, @Param("tenantId") tenantId: string, @Body() body: AddMembershipDto) {
    const email = body.email.trim().toLowerCase();
    const fullName = (body.fullName ?? "").trim();
    const roleName = body.roleName;

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { id: true } });
    if (!tenant) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const role = await this.prisma.role.findFirst({ where: { tenantId, name: roleName }, select: { id: true, name: true } });
    if (!role) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const result = await this.prisma.$transaction(async (tx) => {
      const existingUser = await tx.user.findUnique({ where: { email }, select: { id: true, fullName: true, email: true } });
      const user = existingUser
        ? await tx.user.update({
            where: { email },
            data: fullName ? { fullName } : {},
            select: { id: true, fullName: true, email: true }
          })
        : await tx.user.create({
            data: { email, fullName: fullName || email.split("@")[0], passwordHash: await argon2.hash(randomPassword(16)) },
            select: { id: true, fullName: true, email: true }
          });

      const membership = await tx.membership.upsert({
        where: { tenantId_userId: { tenantId, userId: user.id } },
        update: { status: "active", roleId: role.id },
        create: { tenantId, userId: user.id, roleId: role.id, status: "active" },
        select: { id: true }
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "owner.membership.upsert",
          entityType: "membership",
          entityId: membership.id,
          metadataJson: { email, roleName }
        }
      });

      const token = randomBytes(32).toString("hex");
      const tokenHash = createHash("sha256").update(token).digest("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
      await tx.passwordResetToken.create({ data: { userId: user.id, tenantId, tokenHash, expiresAt } });
      const publicWebBaseUrl = (process.env.PUBLIC_WEB_URL ?? process.env.PUBLIC_WEB_BASE_URL ?? "http://localhost:3000").trim().replace(/\/+$/, "");
      const inviteUrl = `${publicWebBaseUrl}/invite?token=${token}`;

      return { user, inviteUrl };
    });

    return { data: { success: true, user: result.user, inviteUrl: result.inviteUrl } };
  }

  @Get("module-requests")
  async listModuleRequests() {
    const items = await this.prisma.subscriptionItem.findMany({
      where: { status: "requested", endedAt: null },
      select: {
        id: true,
        tenantId: true,
        moduleId: true,
        status: true,
        startedAt: true,
        tenant: { select: { slug: true, displayName: true, legalName: true } },
        module: { select: { id: true, nameKey: true, category: true, icon: true } }
      },
      orderBy: [{ startedAt: "desc" }, { id: "desc" }]
    });

    return {
      data: items.map((i) => ({
        id: i.id,
        tenantId: i.tenantId,
        tenantSlug: i.tenant.slug,
        tenantDisplayName: i.tenant.displayName,
        tenantLegalName: i.tenant.legalName,
        moduleId: i.moduleId,
        moduleNameKey: i.module.nameKey,
        moduleCategory: i.module.category,
        moduleIcon: i.module.icon,
        status: i.status,
        requestedAt: i.startedAt
      }))
    };
  }

  @Post("module-requests/:tenantId/:moduleId/approve")
  async approveModuleRequest(
    @Req() req: { user: { id: string } },
    @Param("tenantId") tenantId: string,
    @Param("moduleId") moduleId: string,
    @Body() body: ApproveModuleRequestDto
  ) {
    const now = new Date();
    const mod = await this.prisma.moduleCatalog.findUnique({ where: { id: moduleId }, select: { id: true, isActive: true } });
    if (!mod) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (!mod.isActive) throw new HttpException({ error: { code: "MODULE_DISABLED", message_key: "errors.moduleDisabled" } }, 400);

    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
    if (!subscription) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const subscriptionType = body.subscriptionType;
    const isMonthly = subscriptionType === "online_monthly";
    const billingCycle = isMonthly ? "monthly" : "one_time";
    const defaultAmount = subscriptionType === "online_monthly" ? "40" : subscriptionType === "offline_no_changes" ? "1000" : "2000";
    const priceAmount = new Prisma.Decimal((body.priceAmount ?? defaultAmount).trim());
    const priceCurrency = (body.priceCurrency ?? "USD").trim() || "USD";

    const currentPeriodStartAt = isMonthly ? now : null;
    const configuredPeriodEnd = isMonthly ? parseIsoDateOrNull(body.currentPeriodEndAt) : null;
    const currentPeriodEndAt = isMonthly ? (configuredPeriodEnd ?? addDays(now, 30)) : null;
    const graceEndsAt = isMonthly && currentPeriodEndAt ? addDays(currentPeriodEndAt, 3) : null;
    const supportEndsAt = subscriptionType === "offline_with_changes" ? addMonths(now, 3) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionItem.upsert({
        where: { tenantId_subscriptionId_moduleId: { tenantId, subscriptionId: subscription.id, moduleId } },
        update: {
          status: "active",
          endedAt: null,
          subscriptionType,
          billingCycle,
          priceAmount,
          priceCurrency,
          currentPeriodStartAt,
          currentPeriodEndAt,
          graceEndsAt,
          lockedAt: null,
          approvedAt: now,
          approvedByUserId: req.user.id,
          supportEndsAt
        },
        create: {
          tenantId,
          subscriptionId: subscription.id,
          moduleId,
          status: "active",
          subscriptionType,
          billingCycle,
          priceAmount,
          priceCurrency,
          currentPeriodStartAt: currentPeriodStartAt ?? undefined,
          currentPeriodEndAt: currentPeriodEndAt ?? undefined,
          graceEndsAt: graceEndsAt ?? undefined,
          approvedAt: now,
          approvedByUserId: req.user.id,
          supportEndsAt: supportEndsAt ?? undefined
        }
      });

      await tx.tenantEnabledModule.upsert({
        where: { tenantId_moduleId: { tenantId, moduleId } },
        update: { status: "enabled", disabledAt: null, enabledAt: now },
        create: { tenantId, moduleId, status: "enabled", enabledAt: now }
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "owner.module.approve",
          entityType: "module",
          entityId: moduleId,
          metadataJson: { subscriptionType, billingCycle, priceAmount: priceAmount.toString(), priceCurrency }
        }
      });
    });

    const membershipsWithExplicitModules = await this.prisma.membership.findMany({
      where: { tenantId, status: "active", enabledModules: { some: {} }, role: { is: { name: { not: "Owner" } } } },
      select: { id: true }
    });
    if (membershipsWithExplicitModules.length > 0) {
      await this.prisma.membershipEnabledModule.createMany({
        data: membershipsWithExplicitModules.map((m) => ({ tenantId, membershipId: m.id, moduleId })),
        skipDuplicates: true
      });
    }
    if (moduleId === "fuel") {
      await ensureFuelDefaultRolePermissions(this.prisma, tenantId);
    }
    if (moduleId === "msp") {
      await ensureMspDefaultRolePermissions(this.prisma, tenantId);
    }

    return { data: { success: true } };
  }

  @Post("module-requests/:tenantId/:moduleId/reject")
  async rejectModuleRequest(
    @Req() req: { user: { id: string } },
    @Param("tenantId") tenantId: string,
    @Param("moduleId") moduleId: string,
    @Body() body: RejectModuleRequestDto
  ) {
    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
    if (!subscription) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const item = await this.prisma.subscriptionItem.findUnique({
      where: { tenantId_subscriptionId_moduleId: { tenantId, subscriptionId: subscription.id, moduleId } },
      select: { id: true, status: true }
    });
    if (!item) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (item.status !== "requested") {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    await this.prisma.subscriptionItem.update({
      where: { id: item.id },
      data: {
        status: "rejected",
        endedAt: new Date(),
        approvedAt: null,
        approvedByUserId: null,
        lockedAt: null
      }
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "owner.module.reject",
        entityType: "module",
        entityId: moduleId,
        metadataJson: { reason: body.reason?.trim() || null }
      }
    });

    return { data: { success: true } };
  }

  @Post("subscriptions/:tenantId/:moduleId/activate")
  async activateSubscription(
    @Req() req: { user: { id: string } },
    @Param("tenantId") tenantId: string,
    @Param("moduleId") moduleId: string,
    @Body() body: ApproveModuleRequestDto
  ) {
    const now = new Date();
    const mod = await this.prisma.moduleCatalog.findUnique({ where: { id: moduleId }, select: { id: true, isActive: true } });
    if (!mod) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (!mod.isActive) throw new HttpException({ error: { code: "MODULE_DISABLED", message_key: "errors.moduleDisabled" } }, 400);

    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
    if (!subscription) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const subscriptionType = body.subscriptionType;
    const isMonthly = subscriptionType === "online_monthly";
    const billingCycle = isMonthly ? "monthly" : "one_time";
    const defaultAmount = subscriptionType === "online_monthly" ? "40" : subscriptionType === "offline_no_changes" ? "1000" : "2000";
    const priceAmount = new Prisma.Decimal((body.priceAmount ?? defaultAmount).trim());
    const priceCurrency = (body.priceCurrency ?? "USD").trim() || "USD";

    const currentPeriodStartAt = isMonthly ? now : null;
    const configuredPeriodEnd = isMonthly ? parseIsoDateOrNull(body.currentPeriodEndAt) : null;
    const currentPeriodEndAt = isMonthly ? (configuredPeriodEnd ?? addDays(now, 30)) : null;
    const graceEndsAt = isMonthly && currentPeriodEndAt ? addDays(currentPeriodEndAt, 3) : null;
    const supportEndsAt = subscriptionType === "offline_with_changes" ? addMonths(now, 3) : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.subscriptionItem.upsert({
        where: { tenantId_subscriptionId_moduleId: { tenantId, subscriptionId: subscription.id, moduleId } },
        update: {
          status: "active",
          endedAt: null,
          subscriptionType,
          billingCycle,
          priceAmount,
          priceCurrency,
          currentPeriodStartAt,
          currentPeriodEndAt,
          graceEndsAt,
          lockedAt: null,
          approvedAt: now,
          approvedByUserId: req.user.id,
          supportEndsAt
        },
        create: {
          tenantId,
          subscriptionId: subscription.id,
          moduleId,
          status: "active",
          subscriptionType,
          billingCycle,
          priceAmount,
          priceCurrency,
          currentPeriodStartAt: currentPeriodStartAt ?? undefined,
          currentPeriodEndAt: currentPeriodEndAt ?? undefined,
          graceEndsAt: graceEndsAt ?? undefined,
          approvedAt: now,
          approvedByUserId: req.user.id,
          supportEndsAt: supportEndsAt ?? undefined
        }
      });

      await tx.tenantEnabledModule.upsert({
        where: { tenantId_moduleId: { tenantId, moduleId } },
        update: { status: "enabled", disabledAt: null, enabledAt: now },
        create: { tenantId, moduleId, status: "enabled", enabledAt: now }
      });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "owner.subscription.activate",
          entityType: "module",
          entityId: moduleId,
          metadataJson: { subscriptionType, billingCycle, priceAmount: priceAmount.toString(), priceCurrency }
        }
      });
    });

    const membershipsWithExplicitModules = await this.prisma.membership.findMany({
      where: { tenantId, status: "active", enabledModules: { some: {} }, role: { is: { name: { not: "Owner" } } } },
      select: { id: true }
    });
    if (membershipsWithExplicitModules.length > 0) {
      await this.prisma.membershipEnabledModule.createMany({
        data: membershipsWithExplicitModules.map((m) => ({ tenantId, membershipId: m.id, moduleId })),
        skipDuplicates: true
      });
    }
    if (moduleId === "fuel") {
      await ensureFuelDefaultRolePermissions(this.prisma, tenantId);
    }
    if (moduleId === "msp") {
      await ensureMspDefaultRolePermissions(this.prisma, tenantId);
    }

    return { data: { success: true } };
  }

  @Post("subscriptions/:tenantId/:moduleId/lock")
  async lockSubscription(@Req() req: { user: { id: string } }, @Param("tenantId") tenantId: string, @Param("moduleId") moduleId: string) {
    const now = new Date();
    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
    if (!subscription) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    await this.prisma.$transaction(async (tx) => {
      const item = await tx.subscriptionItem.findFirst({
        where: { tenantId, subscriptionId: subscription.id, moduleId, endedAt: null },
        select: { id: true }
      });
      if (!item) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

      await tx.subscriptionItem.update({ where: { id: item.id }, data: { status: "locked", lockedAt: now } });
      await tx.auditLog.create({
        data: { tenantId, actorUserId: req.user.id, action: "owner.subscription.lock", entityType: "subscriptionItem", entityId: item.id, metadataJson: { moduleId } }
      });
    });

    return { data: { success: true } };
  }

  @Post("subscriptions/:tenantId/:moduleId/unlock")
  async unlockSubscription(@Req() req: { user: { id: string } }, @Param("tenantId") tenantId: string, @Param("moduleId") moduleId: string) {
    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
    if (!subscription) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    await this.prisma.$transaction(async (tx) => {
      const item = await tx.subscriptionItem.findFirst({
        where: { tenantId, subscriptionId: subscription.id, moduleId, endedAt: null },
        select: { id: true }
      });
      if (!item) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

      await tx.subscriptionItem.update({ where: { id: item.id }, data: { status: "active", lockedAt: null } });
      await tx.auditLog.create({
        data: { tenantId, actorUserId: req.user.id, action: "owner.subscription.unlock", entityType: "subscriptionItem", entityId: item.id, metadataJson: { moduleId } }
      });
    });

    return { data: { success: true } };
  }

  @Post("subscriptions/:tenantId/:moduleId/set-period")
  async setPeriod(
    @Req() req: { user: { id: string } },
    @Param("tenantId") tenantId: string,
    @Param("moduleId") moduleId: string,
    @Body() body: SetPeriodDto
  ) {
    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
    if (!subscription) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const nextEnd = parseIsoDateOrNull(body.currentPeriodEndAt);
    if (!nextEnd) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
    const nextGrace = addDays(nextEnd, 3);

    await this.prisma.$transaction(async (tx) => {
      const item = await tx.subscriptionItem.findFirst({
        where: { tenantId, subscriptionId: subscription.id, moduleId, endedAt: null },
        select: { id: true, billingCycle: true }
      });
      if (!item) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (item.billingCycle !== "monthly") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);

      await tx.subscriptionItem.update({
        where: { id: item.id },
        data: { currentPeriodEndAt: nextEnd, graceEndsAt: nextGrace }
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "owner.subscription.setPeriod",
          entityType: "subscriptionItem",
          entityId: item.id,
          metadataJson: { moduleId, currentPeriodEndAt: nextEnd.toISOString() }
        }
      });
    });

    return { data: { success: true } };
  }

  @Post("subscriptions/:tenantId/:moduleId/mark-paid")
  async markPaid(
    @Req() req: { user: { id: string } },
    @Param("tenantId") tenantId: string,
    @Param("moduleId") moduleId: string,
    @Body() body?: SetPeriodDto
  ) {
    const now = new Date();
    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId }, select: { id: true } });
    if (!subscription) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const configuredPeriodEnd = parseIsoDateOrNull(body?.currentPeriodEndAt);

    const updated = await this.prisma.$transaction(async (tx) => {
      const item = await tx.subscriptionItem.findFirst({
        where: { tenantId, subscriptionId: subscription.id, moduleId, endedAt: null },
        select: { id: true, billingCycle: true, currentPeriodEndAt: true }
      });
      if (!item) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (item.billingCycle !== "monthly") {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validation" } }, 400);
      }

      const base = item.currentPeriodEndAt && item.currentPeriodEndAt.getTime() > now.getTime() ? item.currentPeriodEndAt : now;
      const nextEnd = item.billingCycle === "monthly" ? (configuredPeriodEnd ?? addDays(base, 30)) : item.currentPeriodEndAt;
      const nextGrace = item.billingCycle === "monthly" && nextEnd ? addDays(nextEnd, 3) : null;

      const updatedItem = await tx.subscriptionItem.update({
        where: { id: item.id },
        data: {
          status: "active",
          lockedAt: null,
          currentPeriodStartAt: item.billingCycle === "monthly" ? now : undefined,
          currentPeriodEndAt: nextEnd ?? undefined,
          graceEndsAt: nextGrace ?? undefined
        },
        select: { id: true, moduleId: true, status: true, billingCycle: true, currentPeriodEndAt: true, graceEndsAt: true, lockedAt: true }
      });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "owner.subscription.markPaid",
          entityType: "subscriptionItem",
          entityId: item.id,
          metadataJson: { moduleId, billingCycle: item.billingCycle, currentPeriodEndAt: nextEnd?.toISOString() ?? null }
        }
      });

      return updatedItem;
    });

    return { data: { success: true, subscriptionItem: updated } };
  }

  @Get("modules")
  async listAllModules() {
    const modules = await this.prisma.moduleCatalog.findMany({
      select: { id: true, nameKey: true, descriptionKey: true, category: true, icon: true, isActive: true, version: true },
      orderBy: { id: "asc" }
    });
    return {
      data: modules.map((m) => ({
        id: m.id,
        version: m.version,
        name_key: m.nameKey,
        description_key: m.descriptionKey,
        category: m.category,
        icon: m.icon,
        is_active: m.isActive
      }))
    };
  }

  @Get("tutorial-categories")
  async ownerListTutorialCategories() {
    const prismaAny = this.prisma as unknown as {
      tutorialCategory?: { findMany: (args: unknown) => Promise<unknown[]> };
    };
    if (!prismaAny.tutorialCategory) return { data: [] };

    const items = (await prismaAny.tutorialCategory.findMany({
      select: { id: true, slug: true, icon: true, scope: true, moduleId: true, titleEn: true, titleFa: true, titlePs: true, orderNo: true, isActive: true, createdAt: true, updatedAt: true },
      orderBy: [{ orderNo: "asc" }, { createdAt: "asc" }]
    })) as Array<{ id: string; slug: string; icon: string; scope: string; moduleId: string | null; titleEn: string; titleFa: string; titlePs: string; orderNo: number; isActive: boolean; createdAt: Date; updatedAt: Date }>;

    return {
      data: items.map((c) => ({
        id: c.id,
        slug: c.slug,
        icon: c.icon,
        tutorial_scope: c.scope,
        module_id: c.moduleId ?? null,
        title_en: c.titleEn,
        title_dr: c.titleFa,
        title_ps: c.titlePs,
        order_no: c.orderNo,
        is_active: c.isActive,
        created_at: c.createdAt,
        updated_at: c.updatedAt
      }))
    };
  }

  @Post("tutorial-categories")
  async ownerCreateTutorialCategory(@Body() body: UpsertTutorialCategoryDto) {
    const prismaAny = this.prisma as unknown as { tutorialCategory?: { create: (args: unknown) => Promise<unknown> } };
    if (!prismaAny.tutorialCategory) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);

    const scope = body.scope;
    const moduleId = scope === "module" ? (body.moduleId ?? "").trim() : "";
    if (scope === "module" && !moduleId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const slug = toSlug(body.slug);
    const created = (await prismaAny.tutorialCategory.create({
      data: {
        slug,
        icon: (body.icon ?? "").trim() || "layers",
        scope,
        moduleId: scope === "module" ? moduleId : null,
        titleEn: body.titleEn.trim(),
        titleFa: body.titleFa.trim(),
        titlePs: body.titlePs.trim(),
        orderNo: body.orderNo ?? 0,
        isActive: body.isActive ?? true
      },
      select: { id: true, slug: true }
    })) as { id: string; slug: string };

    return { data: { success: true, id: created.id, slug: created.slug } };
  }

  @Patch("tutorial-categories/:id")
  async ownerUpdateTutorialCategory(@Param("id") id: string, @Body() body: UpsertTutorialCategoryDto) {
    const prismaAny = this.prisma as unknown as { tutorialCategory?: { update: (args: unknown) => Promise<unknown> } };
    if (!prismaAny.tutorialCategory) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);

    const scope = body.scope;
    const moduleId = scope === "module" ? (body.moduleId ?? "").trim() : "";
    if (scope === "module" && !moduleId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const slug = toSlug(body.slug);
    await prismaAny.tutorialCategory.update({
      where: { id },
      data: {
        slug,
        icon: (body.icon ?? "").trim() || "layers",
        scope,
        moduleId: scope === "module" ? moduleId : null,
        titleEn: body.titleEn.trim(),
        titleFa: body.titleFa.trim(),
        titlePs: body.titlePs.trim(),
        orderNo: body.orderNo ?? 0,
        isActive: body.isActive ?? true
      }
    });

    return { data: { success: true } };
  }

  @Delete("tutorial-categories/:id")
  async ownerDeleteTutorialCategory(@Param("id") id: string) {
    const prismaAny = this.prisma as unknown as { tutorialCategory?: { delete: (args: unknown) => Promise<unknown> } };
    if (!prismaAny.tutorialCategory) return { data: { success: true } };
    await prismaAny.tutorialCategory.delete({ where: { id } });
    return { data: { success: true } };
  }

  @Get("tutorial-series")
  async ownerListTutorialSeries() {
    const prismaAny = this.prisma as unknown as { tutorialSeries?: { findMany: (args: unknown) => Promise<unknown[]> } };
    if (!prismaAny.tutorialSeries) return { data: [] };

    const items = (await prismaAny.tutorialSeries.findMany({
      select: {
        id: true,
        slug: true,
        scope: true,
        moduleId: true,
        categoryId: true,
        titleEn: true,
        titleFa: true,
        titlePs: true,
        descriptionEn: true,
        descriptionFa: true,
        descriptionPs: true,
        thumbnailUrl: true,
        orderNo: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: [{ orderNo: "asc" }, { createdAt: "asc" }]
    })) as Array<any>;

    return {
      data: items.map((s) => ({
        id: s.id,
        slug: s.slug,
        tutorial_scope: s.scope,
        module_id: s.moduleId ?? null,
        category_id: s.categoryId ?? null,
        title_en: s.titleEn,
        title_dr: s.titleFa,
        title_ps: s.titlePs,
        description_en: s.descriptionEn ?? null,
        description_dr: s.descriptionFa ?? null,
        description_ps: s.descriptionPs ?? null,
        thumbnail_url: s.thumbnailUrl ?? null,
        order_no: s.orderNo,
        is_active: s.isActive,
        created_at: s.createdAt,
        updated_at: s.updatedAt
      }))
    };
  }

  @Post("tutorial-series")
  async ownerCreateTutorialSeries(@Body() body: UpsertTutorialSeriesDto) {
    const prismaAny = this.prisma as unknown as { tutorialSeries?: { create: (args: unknown) => Promise<unknown> } };
    if (!prismaAny.tutorialSeries) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);

    const scope = body.scope;
    const moduleId = scope === "module" ? (body.moduleId ?? "").trim() : "";
    if (scope === "module" && !moduleId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const slug = toSlug(body.slug);
    const created = (await prismaAny.tutorialSeries.create({
      data: {
        slug,
        scope,
        moduleId: scope === "module" ? moduleId : null,
        categoryId: (body.categoryId ?? "").trim() || null,
        titleEn: body.titleEn.trim(),
        titleFa: body.titleFa.trim(),
        titlePs: body.titlePs.trim(),
        descriptionEn: body.descriptionEn?.trim() || null,
        descriptionFa: body.descriptionFa?.trim() || null,
        descriptionPs: body.descriptionPs?.trim() || null,
        thumbnailUrl: body.thumbnailUrl?.trim() || null,
        orderNo: body.orderNo ?? 0,
        isActive: body.isActive ?? true
      },
      select: { id: true, slug: true }
    })) as { id: string; slug: string };

    return { data: { success: true, id: created.id, slug: created.slug } };
  }

  @Patch("tutorial-series/:id")
  async ownerUpdateTutorialSeries(@Param("id") id: string, @Body() body: UpsertTutorialSeriesDto) {
    const prismaAny = this.prisma as unknown as { tutorialSeries?: { update: (args: unknown) => Promise<unknown> } };
    if (!prismaAny.tutorialSeries) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);

    const scope = body.scope;
    const moduleId = scope === "module" ? (body.moduleId ?? "").trim() : "";
    if (scope === "module" && !moduleId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const slug = toSlug(body.slug);
    await prismaAny.tutorialSeries.update({
      where: { id },
      data: {
        slug,
        scope,
        moduleId: scope === "module" ? moduleId : null,
        categoryId: (body.categoryId ?? "").trim() || null,
        titleEn: body.titleEn.trim(),
        titleFa: body.titleFa.trim(),
        titlePs: body.titlePs.trim(),
        descriptionEn: body.descriptionEn?.trim() || null,
        descriptionFa: body.descriptionFa?.trim() || null,
        descriptionPs: body.descriptionPs?.trim() || null,
        thumbnailUrl: body.thumbnailUrl?.trim() || null,
        orderNo: body.orderNo ?? 0,
        isActive: body.isActive ?? true
      }
    });

    return { data: { success: true } };
  }

  @Delete("tutorial-series/:id")
  async ownerDeleteTutorialSeries(@Param("id") id: string) {
    const prismaAny = this.prisma as unknown as { tutorialSeries?: { delete: (args: unknown) => Promise<unknown> } };
    if (!prismaAny.tutorialSeries) return { data: { success: true } };
    await prismaAny.tutorialSeries.delete({ where: { id } });
    return { data: { success: true } };
  }

  @Get("tutorials")
  async ownerListTutorials(
    @Query()
    query: {
      q?: string;
      scope?: string;
      moduleId?: string;
      categoryId?: string;
      seriesId?: string;
      difficulty?: string;
      language?: string;
      visibility?: string;
      featured?: string;
      page?: string;
      pageSize?: string;
    }
  ) {
    const prismaAny = this.prisma as unknown as { tutorial?: { findMany: (args: unknown) => Promise<unknown[]>; count: (args: unknown) => Promise<number> } };
    if (!prismaAny.tutorial) return { data: [], meta: { page: 1, pageSize: 30, total: 0 } };

    const q = (query.q ?? "").trim();
    const where: Record<string, unknown> = {};
    if ((query.scope ?? "").trim()) where.scope = query.scope?.trim();
    if ((query.moduleId ?? "").trim()) where.moduleId = query.moduleId?.trim();
    if ((query.categoryId ?? "").trim()) where.categoryId = query.categoryId?.trim();
    if ((query.seriesId ?? "").trim()) where.seriesId = query.seriesId?.trim();
    if ((query.difficulty ?? "").trim()) where.difficulty = query.difficulty?.trim();
    if ((query.language ?? "").trim()) where.language = query.language?.trim();
    if ((query.visibility ?? "").trim()) where.visibility = query.visibility?.trim();
    if ((query.featured ?? "").trim()) where.isFeatured = query.featured === "1";
    if (q) {
      where.OR = [
        { slug: { contains: q, mode: "insensitive" } },
        { titleEn: { contains: q, mode: "insensitive" } },
        { titleFa: { contains: q, mode: "insensitive" } },
        { titlePs: { contains: q, mode: "insensitive" } },
        { descriptionEn: { contains: q, mode: "insensitive" } },
        { descriptionFa: { contains: q, mode: "insensitive" } },
        { descriptionPs: { contains: q, mode: "insensitive" } }
      ];
    }

    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize ?? "30", 10) || 30));
    const skip = (page - 1) * pageSize;

    const [total, rows] = await Promise.all([
      prismaAny.tutorial.count({ where }),
      prismaAny.tutorial.findMany({
        where,
        skip,
        take: pageSize,
        select: {
          id: true,
          slug: true,
          scope: true,
          moduleId: true,
          categoryId: true,
          seriesId: true,
          stepNo: true,
          orderNo: true,
          titleEn: true,
          titleFa: true,
          titlePs: true,
          descriptionEn: true,
          descriptionFa: true,
          descriptionPs: true,
          youtubeUrl: true,
          youtubeVideoId: true,
          thumbnailUrl: true,
          difficulty: true,
          language: true,
          durationSec: true,
          tags: true,
          views: true,
          visibility: true,
          isFeatured: true,
          isActive: true,
          createdAt: true,
          updatedAt: true
        },
        orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }]
      })
    ]);

    const items = rows as any[];
    return {
      data: items.map((t) => ({
        id: t.id,
        slug: t.slug,
        tutorial_scope: t.scope,
        module_id: t.moduleId ?? null,
        category_id: t.categoryId ?? null,
        series_id: t.seriesId ?? null,
        step_no: t.stepNo ?? null,
        order_no: t.orderNo,
        title_en: t.titleEn,
        title_dr: t.titleFa,
        title_ps: t.titlePs,
        description_en: t.descriptionEn ?? null,
        description_dr: t.descriptionFa ?? null,
        description_ps: t.descriptionPs ?? null,
        youtube_url: t.youtubeUrl,
        thumbnail_url: t.thumbnailUrl ?? null,
        youtube_video_id: t.youtubeVideoId ?? null,
        difficulty: t.difficulty,
        language: t.language,
        duration_sec: t.durationSec ?? null,
        tags: Array.isArray(t.tags) ? t.tags : [],
        views: t.views,
        visibility: t.visibility,
        is_featured: t.isFeatured,
        is_active: t.isActive,
        created_at: t.createdAt,
        updated_at: t.updatedAt
      })),
      meta: { page, pageSize, total }
    };
  }

  @Post("tutorials")
  async ownerCreateTutorial(@Body() body: UpsertTutorialDto) {
    const prismaAny = this.prisma as unknown as {
      tutorial?: { create: (args: unknown) => Promise<unknown> };
      tutorialRelation?: { createMany: (args: unknown) => Promise<unknown>; deleteMany: (args: unknown) => Promise<unknown> };
    };
    if (!prismaAny.tutorial) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);

    const scope = body.scope;
    const moduleId = scope === "module" ? (body.moduleId ?? "").trim() : "";
    if (scope === "module" && !moduleId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const slug = toSlug(body.slug);
    const youtube = body.youtubeUrl.trim();
    const youtubeVideoId = extractYouTubeVideoId(youtube);

    const created = (await prismaAny.tutorial.create({
      data: {
        slug,
        scope,
        moduleId: scope === "module" ? moduleId : null,
        categoryId: (body.categoryId ?? "").trim() || null,
        seriesId: (body.seriesId ?? "").trim() || null,
        stepNo: (body.seriesId ?? "").trim() ? (body.stepNo ?? null) : null,
        orderNo: body.orderNo ?? 0,
        titleEn: body.titleEn.trim(),
        titleFa: body.titleFa.trim(),
        titlePs: body.titlePs.trim(),
        descriptionEn: body.descriptionEn?.trim() || null,
        descriptionFa: body.descriptionFa?.trim() || null,
        descriptionPs: body.descriptionPs?.trim() || null,
        youtubeUrl: youtube,
        youtubeVideoId,
        thumbnailUrl: body.thumbnailUrl?.trim() || null,
        difficulty: body.difficulty,
        language: body.language,
        durationSec: body.durationSec ?? null,
        tags: (body.tags ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 30),
        visibility: body.visibility,
        isFeatured: body.isFeatured ?? false,
        isActive: body.isActive ?? true
      },
      select: { id: true, slug: true }
    })) as { id: string; slug: string };

    if (prismaAny.tutorialRelation && Array.isArray(body.relatedSlugs) && body.relatedSlugs.length > 0) {
      const relatedSlugs = body.relatedSlugs.map((x) => toSlug(x)).filter(Boolean).slice(0, 30);
      const otherIds = await resolveTutorialIdsBySlugs(this.prisma, relatedSlugs);
      if (otherIds.length > 0) {
        await prismaAny.tutorialRelation.createMany({
          data: otherIds.map((relatedTutorialId: string, idx: number) => ({ tutorialId: created.id, relatedTutorialId, orderNo: idx })),
          skipDuplicates: true
        });
      }
    }

    return { data: { success: true, id: created.id, slug: created.slug } };
  }

  @Patch("tutorials/:id")
  async ownerUpdateTutorial(@Param("id") id: string, @Body() body: UpsertTutorialDto) {
    const prismaAny = this.prisma as unknown as {
      tutorial?: { update: (args: unknown) => Promise<unknown> };
      tutorialRelation?: { createMany: (args: unknown) => Promise<unknown>; deleteMany: (args: unknown) => Promise<unknown> };
    };
    if (!prismaAny.tutorial) throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);

    const scope = body.scope;
    const moduleId = scope === "module" ? (body.moduleId ?? "").trim() : "";
    if (scope === "module" && !moduleId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const slug = toSlug(body.slug);
    const youtube = body.youtubeUrl.trim();
    const youtubeVideoId = extractYouTubeVideoId(youtube);

    await prismaAny.tutorial.update({
      where: { id },
      data: {
        slug,
        scope,
        moduleId: scope === "module" ? moduleId : null,
        categoryId: (body.categoryId ?? "").trim() || null,
        seriesId: (body.seriesId ?? "").trim() || null,
        stepNo: (body.seriesId ?? "").trim() ? (body.stepNo ?? null) : null,
        orderNo: body.orderNo ?? 0,
        titleEn: body.titleEn.trim(),
        titleFa: body.titleFa.trim(),
        titlePs: body.titlePs.trim(),
        descriptionEn: body.descriptionEn?.trim() || null,
        descriptionFa: body.descriptionFa?.trim() || null,
        descriptionPs: body.descriptionPs?.trim() || null,
        youtubeUrl: youtube,
        youtubeVideoId,
        thumbnailUrl: body.thumbnailUrl?.trim() || null,
        difficulty: body.difficulty,
        language: body.language,
        durationSec: body.durationSec ?? null,
        tags: (body.tags ?? []).map((x) => x.trim()).filter(Boolean).slice(0, 30),
        visibility: body.visibility,
        isFeatured: body.isFeatured ?? false,
        isActive: body.isActive ?? true
      }
    });

    if (prismaAny.tutorialRelation) {
      await prismaAny.tutorialRelation.deleteMany({ where: { tutorialId: id } });
      const relatedSlugs = (body.relatedSlugs ?? []).map((x) => toSlug(x)).filter(Boolean).slice(0, 30);
      const otherIds = await resolveTutorialIdsBySlugs(this.prisma, relatedSlugs);
      if (otherIds.length > 0) {
        await prismaAny.tutorialRelation.createMany({
          data: otherIds.map((relatedTutorialId: string, idx: number) => ({ tutorialId: id, relatedTutorialId, orderNo: idx })),
          skipDuplicates: true
        });
      }
    }

    return { data: { success: true } };
  }

  @Delete("tutorials/:id")
  async ownerDeleteTutorial(@Param("id") id: string) {
    const prismaAny = this.prisma as unknown as { tutorial?: { delete: (args: unknown) => Promise<unknown> } };
    if (!prismaAny.tutorial) return { data: { success: true } };
    await prismaAny.tutorial.delete({ where: { id } });
    return { data: { success: true } };
  }

  @Get("contact-submissions")
  async ownerListContactSubmissions(
    @Query()
    query: {
      q?: string;
      page?: string;
      pageSize?: string;
    }
  ) {
    const prismaAny = this.prisma as unknown as {
      publicContactSubmission?: {
        count: (args: unknown) => Promise<number>;
        findMany: (args: unknown) => Promise<unknown[]>;
      };
    };
    if (!prismaAny.publicContactSubmission) return { data: [], meta: { page: 1, pageSize: 30, total: 0 } };

    const q = (query.q ?? "").trim();
    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(100, Math.max(1, Number.parseInt(query.pageSize ?? "30", 10) || 30));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {};
    if (q) {
      where.OR = [
        { fullName: { contains: q, mode: "insensitive" } },
        { organizationName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phoneNumber: { contains: q, mode: "insensitive" } },
        { serviceType: { contains: q, mode: "insensitive" } },
        { message: { contains: q, mode: "insensitive" } }
      ];
    }

    const [total, rows] = await Promise.all([
      prismaAny.publicContactSubmission.count({ where }),
      prismaAny.publicContactSubmission.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fullName: true,
          organizationName: true,
          email: true,
          phoneNumber: true,
          serviceType: true,
          message: true,
          locale: true,
          ip: true,
          userAgent: true,
          createdAt: true
        }
      })
    ]);

    const items = rows as Array<{
      id: string;
      fullName: string;
      organizationName: string | null;
      email: string;
      phoneNumber: string;
      serviceType: string;
      message: string;
      locale: string | null;
      ip: string | null;
      userAgent: string | null;
      createdAt: Date;
    }>;

    return {
      data: items.map((x) => ({
        id: x.id,
        full_name: x.fullName,
        organization_name: x.organizationName ?? null,
        email: x.email,
        phone_number: x.phoneNumber,
        service_type: x.serviceType,
        message: x.message,
        locale: x.locale ?? null,
        ip: x.ip ?? null,
        user_agent: x.userAgent ?? null,
        created_at: x.createdAt
      })),
      meta: { page, pageSize, total }
    };
  }
}

function toSlug(value: string): string {
  return (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+/, "")
    .replace(/-+$/, "")
    .slice(0, 80);
}

function extractYouTubeVideoId(url: string): string | null {
  const raw = (url ?? "").trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const host = u.hostname.replace(/^www\./, "");
    if (host === "youtu.be") {
      const id = u.pathname.replace(/^\/+/, "").split("/")[0] ?? "";
      return id || null;
    }
    if (host.endsWith("youtube.com")) {
      const v = u.searchParams.get("v");
      if (v) return v;
      const parts = u.pathname.split("/").filter(Boolean);
      const idx = parts.findIndex((p) => p === "embed" || p === "shorts");
      if (idx >= 0 && parts[idx + 1]) return parts[idx + 1]!;
    }
  } catch {}
  return null;
}

async function resolveTutorialIdsBySlugs(prisma: PrismaService, slugs: string[]): Promise<string[]> {
  if (slugs.length === 0) return [];
  const prismaAny = prisma as unknown as { tutorial?: { findMany: (args: unknown) => Promise<unknown[]> } };
  if (!prismaAny.tutorial) return [];
  const rows = (await prismaAny.tutorial.findMany({ where: { slug: { in: slugs } }, select: { id: true, slug: true } })) as Array<{ id: string; slug: string }>;
  const bySlug = new Map(rows.map((r) => [r.slug, r.id]));
  return slugs.map((s) => bySlug.get(s)).filter(Boolean) as string[];
}
