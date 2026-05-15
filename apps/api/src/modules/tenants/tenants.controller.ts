import { Body, Controller, Get, HttpException, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantGuard } from "../../shared/tenant.guard";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/permissions.decorator";
import { ensureFuelDefaultRolePermissions, ensureMspDefaultRolePermissions, ensurePrintPressDefaultRolePermissions } from "../../shared/module-enabled.guard";
import { UpdateTenantBrandingDto, UpdateTenantDto } from "./dto/update-tenant.dto";
import { InviteUserDto, UpdateMembershipDto } from "./dto/team.dto";

@Controller("tenants")
export class TenantsController {
  constructor(private readonly prisma: PrismaService) {}

  private async ensureCoreModuleCatalog(): Promise<void> {
    await this.prisma.moduleCatalog.upsert({
      where: { id: "msp" },
      update: { version: "1.0.0", category: "operations", icon: "msp", isActive: true, nameKey: "module.msp.name", descriptionKey: "module.msp.description", manifestJson: {} },
      create: { id: "msp", version: "1.0.0", category: "operations", icon: "msp", isActive: true, nameKey: "module.msp.name", descriptionKey: "module.msp.description", manifestJson: {} }
    });
    await this.prisma.moduleCatalog.upsert({
      where: { id: "printpress" },
      update: {
        version: "1.0.0",
        category: "operations",
        icon: "printpress",
        isActive: true,
        nameKey: "module.printpress.name",
        descriptionKey: "module.printpress.description",
        manifestJson: {}
      },
      create: {
        id: "printpress",
        version: "1.0.0",
        category: "operations",
        icon: "printpress",
        isActive: true,
        nameKey: "module.printpress.name",
        descriptionKey: "module.printpress.description",
        manifestJson: {}
      }
    });
  }

  private resolvePublicWebBaseUrl(headers?: Record<string, unknown>): string {
    const fromEnv = (process.env.PUBLIC_WEB_URL ?? process.env.PUBLIC_WEB_BASE_URL ?? "").trim();
    if (fromEnv) return fromEnv.replace(/\/+$/, "");

    const protoRaw = typeof headers?.["x-forwarded-proto"] === "string" ? (headers["x-forwarded-proto"] as string) : null;
    const hostRaw =
      (typeof headers?.["x-forwarded-host"] === "string" ? (headers["x-forwarded-host"] as string) : null) ??
      (typeof headers?.host === "string" ? (headers.host as string) : null);

    const host = hostRaw?.split(",")[0]?.trim() ?? null;
    const proto = (protoRaw?.split(",")[0]?.trim() ?? "").toLowerCase() === "https" ? "https" : "http";
    if (host) {
      const bare = host.replace(/^(www|app|owner|api)\./, "");
      return `${proto}://${bare}`;
    }
    return "http://localhost:3000";
  }

  @Get("current/modules")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard)
  @RequirePermissions("platform.modules.catalog.read", "platform.modules.enabled.read")
  async listModulesForTenant(@Req() req: { tenantId: string }) {
    await this.ensureCoreModuleCatalog();

    const [catalog, enabled, subscription] = await Promise.all([
      this.prisma.moduleCatalog.findMany({
        select: { id: true, nameKey: true, descriptionKey: true, icon: true, category: true, isActive: true, version: true },
        orderBy: { id: "asc" }
      }),
      this.prisma.tenantEnabledModule.findMany({
        where: { tenantId: req.tenantId },
        select: { moduleId: true, status: true }
      }),
      this.prisma.subscription.findUnique({
        where: { tenantId: req.tenantId },
        select: { id: true, items: { select: { moduleId: true, status: true, billingCycle: true, currentPeriodEndAt: true, graceEndsAt: true, lockedAt: true } } }
      })
    ]);

    const map = new Map(enabled.map((m) => [m.moduleId, m.status]));
    const items = subscription?.items ?? [];
    const requestMap = new Map(items.map((i) => [i.moduleId, i]));
    const now = new Date();

    return {
      data: catalog.map((m) => {
        const enabledStatus = map.get(m.id) ?? null;
        const item = requestMap.get(m.id) ?? null;
        const currentPeriodEndAt = item?.currentPeriodEndAt ?? null;
        const graceEndsAt = item?.graceEndsAt ?? (currentPeriodEndAt ? new Date(currentPeriodEndAt.getTime() + 3 * 24 * 60 * 60 * 1000) : null);
        const lockedAt = item?.lockedAt ?? null;

        const status = (() => {
          if (enabledStatus === "enabled") {
            if (!item) return "pending";
            if (item.status === "requested") return "requested";
            if (lockedAt) return "locked";
            if (item.status !== "active") return "pending";
            if (item.billingCycle === "monthly" && currentPeriodEndAt) {
              const grace = graceEndsAt ?? new Date(currentPeriodEndAt.getTime() + 3 * 24 * 60 * 60 * 1000);
              if (now.getTime() > grace.getTime()) return "locked";
            }
            return "enabled";
          }
          if (item?.status === "requested") return "requested";
          return "disabled";
        })();

        return {
          id: m.id,
          version: m.version,
          name_key: m.nameKey,
          description_key: m.descriptionKey,
          icon: m.icon,
          category: m.category,
          is_catalog_active: m.isActive,
          current_period_end_at: currentPeriodEndAt ? currentPeriodEndAt.toISOString() : null,
          grace_ends_at: graceEndsAt ? graceEndsAt.toISOString() : null,
          locked_at: lockedAt ? lockedAt.toISOString() : null,
          status
        };
      })
    };
  }

  @Post("current/modules/:moduleId/enable")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard)
  @RequirePermissions("platform.modules.enable")
  async enableModule(@Req() req: { tenantId: string; user: { id: string } }, @Param("moduleId") moduleId: string) {
    await this.ensureCoreModuleCatalog();

    const mod = await this.prisma.moduleCatalog.findUnique({ where: { id: moduleId }, select: { id: true, isActive: true } });
    if (!mod) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }
    if (!mod.isActive) {
      throw new HttpException({ error: { code: "MODULE_DISABLED", message_key: "errors.moduleDisabled" } }, 400);
    }

    await this.prisma.tenantEnabledModule.upsert({
      where: { tenantId_moduleId: { tenantId: req.tenantId, moduleId } },
      update: { status: "enabled", enabledAt: new Date(), disabledAt: null },
      create: { tenantId: req.tenantId, moduleId, status: "enabled", enabledAt: new Date() }
    });

    const membershipsWithExplicitModules = await this.prisma.membership.findMany({
      where: { tenantId: req.tenantId, status: "active", enabledModules: { some: {} }, role: { is: { name: { not: "Owner" } } } },
      select: { id: true }
    });
    if (membershipsWithExplicitModules.length > 0) {
      await this.prisma.membershipEnabledModule.createMany({
        data: membershipsWithExplicitModules.map((m) => ({ tenantId: req.tenantId, membershipId: m.id, moduleId })),
        skipDuplicates: true
      });
    }

    if (moduleId === "fuel") {
      await ensureFuelDefaultRolePermissions(this.prisma, req.tenantId);
    }
    if (moduleId === "msp") {
      await ensureMspDefaultRolePermissions(this.prisma, req.tenantId);
    }
    if (moduleId === "printpress") {
      await ensurePrintPressDefaultRolePermissions(this.prisma, req.tenantId);
    }

    if (moduleId === "shop") {
      const tenantSettings = await this.prisma.tenantSettings.upsert({
        where: { tenantId: req.tenantId },
        update: {},
        create: { tenantId: req.tenantId, baseCurrencyCode: "USD" },
        select: { baseCurrencyCode: true }
      });
      await this.prisma.shopSettings.upsert({
        where: { tenantId: req.tenantId },
        update: {},
        create: { tenantId: req.tenantId, buyCurrencyCode: tenantSettings.baseCurrencyCode, sellCurrencyCode: tenantSettings.baseCurrencyCode }
      });

      const existingUnits = await this.prisma.shopUnit.count({ where: { tenantId: req.tenantId } });
      if (existingUnits === 0) {
        const units = [
          { name: "Piece", symbol: "pc" },
          { name: "Kilogram", symbol: "kg" },
          { name: "Gram", symbol: "g" },
          { name: "Liter", symbol: "L" },
          { name: "Milliliter", symbol: "ml" },
          { name: "Pack", symbol: "pack" },
          { name: "Box", symbol: "box" },
          { name: "Carton", symbol: "ctn" }
        ];
        await this.prisma.shopUnit.createMany({
          data: units.map((u) => ({ tenantId: req.tenantId, name: u.name, symbol: u.symbol })),
          skipDuplicates: true
        });
        await this.prisma.auditLog.create({
          data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "shop.unit.seed", metadataJson: {} }
        });
      }

      const existingLocations = await this.prisma.shopLocation.count({ where: { tenantId: req.tenantId } });
      if (existingLocations === 0) {
        const location = await this.prisma.shopLocation.create({
          data: { tenantId: req.tenantId, name: "Main Store" },
          select: { id: true }
        });
        await this.prisma.auditLog.create({
          data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "shop.location.seed", entityType: "shopLocation", entityId: location.id, metadataJson: {} }
        });
      }

      const existingPaymentMethods = await this.prisma.shopPaymentMethod.count({ where: { tenantId: req.tenantId } });
      if (existingPaymentMethods === 0) {
        const methods = [{ name: "Cash" }, { name: "Card" }, { name: "Bank Transfer" }, { name: "Mobile Money" }];
        await this.prisma.shopPaymentMethod.createMany({
          data: methods.map((m) => ({ tenantId: req.tenantId, name: m.name })),
          skipDuplicates: true
        });
        await this.prisma.auditLog.create({
          data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "shop.paymentMethod.seed", metadataJson: {} }
        });
      }

      const existingCount = await this.prisma.shopCategory.count({ where: { tenantId: req.tenantId } });
      if (existingCount === 0) {
        const names = [
          "Beverages",
          "Bakery",
          "Dairy",
          "Fruits & Vegetables",
          "Meat & Seafood",
          "Snacks",
          "Household",
          "Personal Care",
          "Frozen",
          "Pantry",
          "Baby",
          "Electronics",
          "Stationery",
          "Pet"
        ];
        await this.prisma.shopCategory.createMany({
          data: names.map((name) => ({ tenantId: req.tenantId, name })),
          skipDuplicates: true
        });
        await this.prisma.auditLog.create({
          data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "shop.category.seed", metadataJson: {} }
        });
      }
    }

    await this.prisma.auditLog.create({
      data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "module.enable", entityType: "module", entityId: moduleId, metadataJson: {} }
    });

    return { data: { success: true } };
  }

  @Post("current/modules/:moduleId/disable")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard)
  @RequirePermissions("platform.modules.disable")
  async disableModule(@Req() req: { tenantId: string; user: { id: string } }, @Param("moduleId") moduleId: string) {
    const mod = await this.prisma.moduleCatalog.findUnique({ where: { id: moduleId }, select: { id: true } });
    if (!mod) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    await this.prisma.tenantEnabledModule.upsert({
      where: { tenantId_moduleId: { tenantId: req.tenantId, moduleId } },
      update: { status: "disabled", disabledAt: new Date() },
      create: { tenantId: req.tenantId, moduleId, status: "disabled", disabledAt: new Date() }
    });

    await this.prisma.auditLog.create({
      data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "module.disable", entityType: "module", entityId: moduleId, metadataJson: {} }
    });

    return { data: { success: true } };
  }

  @Post("current/modules/:moduleId/request")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard)
  @RequirePermissions("platform.modules.enabled.read", "platform.modules.catalog.read")
  async requestModule(@Req() req: { tenantId: string; user: { id: string } }, @Param("moduleId") moduleId: string) {
    await this.ensureCoreModuleCatalog();

    const mod = await this.prisma.moduleCatalog.findUnique({ where: { id: moduleId }, select: { id: true, isActive: true } });
    if (!mod) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }
    if (!mod.isActive) {
      throw new HttpException({ error: { code: "MODULE_DISABLED", message_key: "errors.moduleDisabled" } }, 400);
    }

    const subscription = await this.prisma.subscription.findUnique({ where: { tenantId: req.tenantId }, select: { id: true } });
    if (!subscription) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    await this.prisma.subscriptionItem.upsert({
      where: { tenantId_subscriptionId_moduleId: { tenantId: req.tenantId, subscriptionId: subscription.id, moduleId } },
      update: { status: "requested", endedAt: null, lockedAt: null, startedAt: new Date() },
      create: { tenantId: req.tenantId, subscriptionId: subscription.id, moduleId, status: "requested" }
    });

    await this.prisma.auditLog.create({
      data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "module.request", entityType: "module", entityId: moduleId, metadataJson: {} }
    });

    return { data: { success: true } };
  }

  @Patch("current")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard)
  @RequirePermissions("platform.tenant.update")
  async updateCurrentTenant(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: UpdateTenantDto) {
    if (!body.displayName && !body.defaultLocale) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    await this.prisma.tenant.update({
      where: { id: req.tenantId },
      data: {
        ...(body.displayName ? { displayName: body.displayName } : {}),
        ...(body.defaultLocale ? { defaultLocale: body.defaultLocale } : {})
      }
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: req.tenantId,
        actorUserId: req.user.id,
        action: "tenant.update",
        entityType: "tenant",
        entityId: req.tenantId,
        metadataJson: {}
      }
    });

    return { data: { success: true } };
  }

  @Patch("current/branding")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard)
  @RequirePermissions("platform.tenant.branding.update")
  async updateBranding(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: UpdateTenantBrandingDto) {
    const tenantUpdates: Record<string, unknown> = {};
    if (body.legalName) tenantUpdates.legalName = body.legalName;
    if (body.displayName) tenantUpdates.displayName = body.displayName;

    if (Object.keys(tenantUpdates).length > 0) {
      await this.prisma.tenant.update({
        where: { id: req.tenantId },
        data: tenantUpdates
      });
    }

    await this.prisma.tenantBranding.upsert({
      where: { tenantId: req.tenantId },
      update: {
        ...(body.logoFileId ? { logoFileId: body.logoFileId } : {}),
        ...(body.address ? { address: body.address } : {}),
        ...(body.phone ? { phone: body.phone } : {}),
        ...(body.email ? { email: body.email } : {})
      },
      create: {
        tenantId: req.tenantId,
        logoFileId: body.logoFileId,
        address: body.address,
        phone: body.phone,
        email: body.email
      }
    });

    await this.prisma.auditLog.create({
      data: {
        tenantId: req.tenantId,
        actorUserId: req.user.id,
        action: "tenant.branding.update",
        entityType: "tenant",
        entityId: req.tenantId,
        metadataJson: {}
      }
    });

    return { data: { success: true } };
  }

  @Get("current/team")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard)
  @RequirePermissions("platform.users.read", "platform.memberships.read", "platform.roles.read")
  async team(@Req() req: { tenantId: string }) {
    const [memberships, roles, enabledModules] = await Promise.all([
      this.prisma.membership.findMany({
        where: { tenantId: req.tenantId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          user: { select: { id: true, fullName: true, email: true } },
          role: { select: { id: true, name: true } },
          enabledModules: { select: { moduleId: true } }
        },
        orderBy: { createdAt: "asc" }
      }),
      this.prisma.role.findMany({ where: { tenantId: req.tenantId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      this.prisma.tenantEnabledModule.findMany({
        where: { tenantId: req.tenantId, status: "enabled" },
        select: { module: { select: { id: true, nameKey: true } } },
        orderBy: { enabledAt: "asc" }
      })
    ]);

    return {
      data: {
        roles,
        enabledModules: enabledModules.map((m) => ({ id: m.module.id, nameKey: m.module.nameKey })),
        members: memberships.map((m) => ({
          id: m.id,
          status: m.status,
          createdAt: m.createdAt,
          user: { id: m.user.id, fullName: m.user.fullName, email: m.user.email },
          role: { id: m.role.id, name: m.role.name },
          moduleIds: m.enabledModules.map((x) => x.moduleId)
        }))
      }
    };
  }

  @Get("current/apps")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async currentApps(@Req() req: { tenantId: string; user: { id: string } }) {
    const tenantId = req.tenantId;
    const userId = req.user.id;

    const membership = await this.prisma.membership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { id: true, status: true, role: { select: { name: true } }, enabledModules: { select: { moduleId: true } } }
    });
    if (!membership || membership.status !== "active") {
      throw new HttpException({ error: { code: "TENANT_ACCESS_DENIED", message_key: "errors.tenantAccessDenied" } }, 403);
    }

    const enabled = await this.prisma.tenantEnabledModule.findMany({
      where: { tenantId, status: "enabled" },
      select: { module: { select: { id: true, nameKey: true } } },
      orderBy: { enabledAt: "asc" }
    });

    const items = await this.prisma.subscriptionItem.findMany({
      where: { tenantId, endedAt: null, moduleId: { in: enabled.map((m) => m.module.id) } },
      select: { moduleId: true, status: true, billingCycle: true, currentPeriodEndAt: true, graceEndsAt: true, lockedAt: true }
    });
    const now = new Date();
    const itemMap = new Map(items.map((i) => [i.moduleId, i]));
    const lockedSet = new Set(
      enabled
        .map((m) => m.module.id)
        .filter((moduleId) => {
          const i = itemMap.get(moduleId);
          if (!i) return true;
          if (i.lockedAt) return true;
          if (i.status !== "active") return true;
          if (i.billingCycle === "monthly" && i.currentPeriodEndAt) {
            const grace = i.graceEndsAt ?? new Date(i.currentPeriodEndAt.getTime() + 3 * 24 * 60 * 60 * 1000);
            return now.getTime() > grace.getTime();
          }
          return false;
        })
    );

    const enabledIds = enabled.map((m) => m.module.id);
    const assigned = membership.enabledModules.map((m) => m.moduleId);
    const allowAll = membership.role.name === "Owner" || assigned.length === 0;
    const allowedSet = new Set((allowAll ? enabledIds : enabledIds.filter((id) => assigned.includes(id))).filter((id) => !lockedSet.has(id)));

    return { data: { modules: enabled.map((m) => ({ id: m.module.id, nameKey: m.module.nameKey, allowed: allowedSet.has(m.module.id) })) } };
  }

  @Post("current/team/invite")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard)
  @RequirePermissions("platform.users.invite", "platform.memberships.update")
  async invite(@Req() req: { tenantId: string; user: { id: string }; headers?: Record<string, unknown> }, @Body() body: InviteUserDto) {
    const email = body.email.toLowerCase();
    const fullName = body.fullName?.trim() || "Invited User";
    const roleName = body.roleName ?? "Staff";

    const role = await this.prisma.role.findFirst({ where: { tenantId: req.tenantId, name: roleName }, select: { id: true, name: true } });
    if (!role) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const user = await this.prisma.user.findUnique({ where: { email }, select: { id: true } });
    const userId =
      user?.id ??
      (
        await this.prisma.user.create({
          data: { email, fullName, passwordHash: await argon2.hash(randomBytes(32).toString("hex")) },
          select: { id: true }
        })
      ).id;

    let membershipId: string;
    try {
      membershipId = (
        await this.prisma.membership.create({
          data: { tenantId: req.tenantId, userId, roleId: role.id, status: "invited" },
          select: { id: true }
        })
      ).id;
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002") {
        throw new HttpException({ error: { code: "CONFLICT", message_key: "errors.conflict" } }, 409);
      }
      throw err;
    }

    const tenantEnabled = await this.prisma.tenantEnabledModule.findMany({
      where: { tenantId: req.tenantId, status: "enabled" },
      select: { moduleId: true }
    });
    const tenantEnabledIds = new Set(tenantEnabled.map((m) => m.moduleId));
    const requested = (body.moduleIds ?? []).map((x) => x.trim()).filter(Boolean);
    const moduleIds = requested.length ? requested : tenantEnabled.map((m) => m.moduleId);
    if (moduleIds.some((m) => !tenantEnabledIds.has(m))) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }
    if (role.name !== "Owner") {
      await this.prisma.membershipEnabledModule.createMany({
        data: moduleIds.map((moduleId) => ({ tenantId: req.tenantId, membershipId, moduleId })),
        skipDuplicates: true
      });
    }

    const token = randomBytes(32).toString("hex");
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await this.prisma.passwordResetToken.create({
      data: { userId, tenantId: req.tenantId, tokenHash, expiresAt }
    });

    await this.prisma.auditLog.createMany({
      data: [
        { tenantId: req.tenantId, actorUserId: req.user.id, action: "team.invite", entityType: "user", entityId: userId, metadataJson: {} },
        { tenantId: req.tenantId, actorUserId: req.user.id, action: "membership.invite", entityType: "membership", entityId: membershipId, metadataJson: {} }
      ]
    });

    const publicWebBaseUrl = this.resolvePublicWebBaseUrl(req.headers);
    const inviteUrl = `${publicWebBaseUrl}/invite?token=${token}`;
    return { data: { inviteUrl } };
  }

  @Patch("current/team/memberships/:membershipId")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard)
  @RequirePermissions("platform.memberships.update")
  async updateMembership(
    @Req() req: { tenantId: string; user: { id: string } },
    @Param("membershipId") membershipId: string,
    @Body() body: UpdateMembershipDto
  ) {
    if (!body.roleName && !body.status && body.moduleIds === undefined) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const membership = await this.prisma.membership.findFirst({
      where: { id: membershipId, tenantId: req.tenantId },
      select: { id: true }
    });
    if (!membership) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    const updates: Record<string, unknown> = {};
    if (body.status) updates.status = body.status;
    if (body.roleName) {
      const role = await this.prisma.role.findFirst({ where: { tenantId: req.tenantId, name: body.roleName }, select: { id: true } });
      if (!role) {
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }
      updates.roleId = role.id;
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(updates).length) await tx.membership.update({ where: { id: membershipId }, data: updates });

      if (body.moduleIds !== undefined) {
        const requested = body.moduleIds.map((x) => x.trim()).filter(Boolean);
        if (requested.length === 0) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

        const tenantEnabled = await tx.tenantEnabledModule.findMany({
          where: { tenantId: req.tenantId, status: "enabled" },
          select: { moduleId: true }
        });
        const tenantEnabledIds = new Set(tenantEnabled.map((m) => m.moduleId));
        if (requested.some((m) => !tenantEnabledIds.has(m))) {
          throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        }

        const current = await tx.membership.findFirst({ where: { id: membershipId, tenantId: req.tenantId }, select: { role: { select: { name: true } } } });
        if (!current) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
        if (current.role.name !== "Owner") {
          await tx.membershipEnabledModule.deleteMany({ where: { tenantId: req.tenantId, membershipId } });
          await tx.membershipEnabledModule.createMany({
            data: requested.map((moduleId) => ({ tenantId: req.tenantId, membershipId, moduleId })),
            skipDuplicates: true
          });
        }
      }

      await tx.auditLog.create({
        data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "membership.update", entityType: "membership", entityId: membershipId, metadataJson: {} }
      });
    });

    return { data: { success: true } };
  }
}
