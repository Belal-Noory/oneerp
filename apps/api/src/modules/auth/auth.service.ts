import { ConflictException, Injectable, UnauthorizedException } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import * as argon2 from "argon2";
import { createHash, randomBytes } from "crypto";
import type { Prisma } from "@prisma/client";
import type { SignOptions } from "jsonwebtoken";
import { PrismaService } from "../../prisma/prisma.service";
import { RegisterDto } from "./dto/register.dto";
import { LoginDto } from "./dto/login.dto";

type AuthTokens = {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
};

const DEFAULT_TRIAL_DAYS = 14;
const DEFAULT_ACCESS_EXPIRES_SECONDS = 7 * 24 * 60 * 60;

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

function parseDurationSeconds(raw: string | undefined, fallbackSeconds: number): number {
  if (!raw) return fallbackSeconds;
  const v = raw.trim();
  const m = v.match(/^(\d+)\s*([smhd])$/i);
  if (!m) return fallbackSeconds;
  const n = Number(m[1]);
  const u = m[2].toLowerCase();
  if (!Number.isFinite(n) || n <= 0) return fallbackSeconds;
  if (u === "s") return n;
  if (u === "m") return n * 60;
  if (u === "h") return n * 60 * 60;
  if (u === "d") return n * 24 * 60 * 60;
  return fallbackSeconds;
}

type Tx = Prisma.TransactionClient | PrismaService;

function normalizeReferralCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

function makeCandidateReferralCode(prefix: string): string {
  const clean = prefix.replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `${clean || "ONEERP"}-${suffix}`;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService
  ) {}

  async register(input: RegisterDto) {
    const passwordHash = await argon2.hash(input.account.password);

    try {
      const result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        const user = await tx.user.create({
          data: {
            fullName: input.account.fullName,
            email: input.account.email.toLowerCase(),
            passwordHash
          },
          select: { id: true, fullName: true, email: true }
        });

        const tenant = await tx.tenant.create({
          data: {
            slug: input.tenant.slug,
            legalName: input.tenant.legalName,
            displayName: input.tenant.displayName,
            defaultLocale: input.tenant.defaultLocale
          },
          select: { id: true, slug: true, displayName: true, defaultLocale: true }
        });

        await tx.tenantBranding.create({
          data: {
            tenantId: tenant.id,
            address: input.tenant.address,
            phone: input.tenant.phone,
            email: input.tenant.email
          }
        });

        await tx.tenantSettings.create({
          data: {
            tenantId: tenant.id
          }
        });

        const roles = await this.createDefaultRoles(tx, tenant.id);
        await this.assignDefaultRolePermissions(tx, tenant.id, roles);

        const ownerRole = roles.owner;

        const membership = await tx.membership.create({
          data: {
            tenantId: tenant.id,
            userId: user.id,
            roleId: ownerRole.id
          },
          select: { id: true }
        });

        const now = new Date();
        const trialEndsAt = addDays(now, DEFAULT_TRIAL_DAYS);

        await tx.subscription.create({
          data: {
            tenantId: tenant.id,
            planCode: "basic",
            status: "trialing",
            trialEndsAt
          }
        });

        await tx.tenantPartnerProfile.create({ data: { tenantId: tenant.id } });

        await this.ensureReferralCodesForNewTenant(tx, {
          tenantId: tenant.id,
          tenantSlug: tenant.slug,
          userId: user.id,
          userFullName: user.fullName
        });

        const rawReferralCode = typeof input.referralCode === "string" ? input.referralCode : "";
        const referralCode = normalizeReferralCode(rawReferralCode);
        if (referralCode) {
          await this.applyReferralCodeForTenant(tx, { tenantId: tenant.id, userId: user.id, referralCode, source: "registration" });
        }

        await tx.auditLog.createMany({
          data: [
            { tenantId: tenant.id, actorUserId: user.id, action: "auth.register", metadataJson: {} },
            { tenantId: tenant.id, actorUserId: user.id, action: "tenant.create", entityType: "tenant", entityId: tenant.id, metadataJson: {} },
            { tenantId: tenant.id, actorUserId: user.id, action: "membership.create", entityType: "membership", entityId: membership.id, metadataJson: {} }
          ]
        });

        const tokens = await this.issueTokens(tx, user.id, tenant.id);

        return { user, tenant, membership, tokens };
      });

      return {
        data: {
          user: result.user,
          tenant: result.tenant,
          membership: { id: result.membership.id, role: "Owner" },
          auth: result.tokens,
          redirect: { path: `/t/${result.tenant.slug}/onboarding` }
        }
      };
    } catch (err: unknown) {
      if (this.isPrismaUniqueViolation(err)) {
        throw new ConflictException();
      }
      throw err;
    }
  }

  async login(input: LoginDto) {
    const user = await this.prisma.user.findUnique({
      where: { email: input.email.toLowerCase() },
      select: { id: true, fullName: true, email: true, passwordHash: true, isActive: true }
    });

    if (!user || !user.isActive) throw new UnauthorizedException();
    const ok = await argon2.verify(user.passwordHash, input.password);
    if (!ok) throw new UnauthorizedException();

    const memberships = await this.prisma.membership.findMany({
      where: { userId: user.id, status: "active" },
      select: { tenant: { select: { id: true, slug: true, displayName: true } } },
      orderBy: { createdAt: "asc" }
    });

    const tenants = memberships.map((m: { tenant: { id: string; slug: string; displayName: string } }) => m.tenant);
    const firstTenant = tenants[0] ?? null;
    const tokens = await this.issueTokens(this.prisma, user.id, firstTenant?.id ?? null);

    await this.prisma.auditLog.createMany({
      data: tenants.length
        ? [{ tenantId: firstTenant!.id, actorUserId: user.id, action: "auth.login.success", metadataJson: {} }]
        : []
    });

    return {
      data: {
        user: { id: user.id, fullName: user.fullName, email: user.email ?? undefined },
        auth: tokens,
        tenants,
        redirect: firstTenant ? { path: `/t/${firstTenant.slug}/dashboard` } : null
      }
    };
  }

  async logout(refreshToken: string) {
    const payload = this.verifyRefreshToken(refreshToken);
    await this.prisma.authSession.updateMany({
      where: { id: payload.sid, userId: payload.sub, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    return { data: { success: true } };
  }

  async refresh(refreshToken: string) {
    const payload = this.verifyRefreshToken(refreshToken);

    const session = await this.prisma.authSession.findUnique({
      where: { id: payload.sid },
      select: { id: true, userId: true, tenantId: true, refreshTokenHash: true, revokedAt: true }
    });
    if (!session || session.revokedAt) throw new UnauthorizedException();

    const expectedHash = this.hashToken(refreshToken);
    if (session.refreshTokenHash !== expectedHash) throw new UnauthorizedException();

    const tokens = await this.issueTokens(this.prisma, session.userId, session.tenantId ?? null, session.id);
    return { data: tokens };
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
      select: { id: true }
    });

    if (user) {
      const token = randomBytes(32).toString("hex");
      const tokenHash = this.hashToken(token);
      const expiresAt = addDays(new Date(), 1);

      await this.prisma.passwordResetToken.create({
        data: { userId: user.id, tokenHash, expiresAt }
      });
    }

    return { data: { success: true } };
  }

  async confirmPasswordReset(token: string, newPassword: string) {
    const tokenHash = this.hashToken(token);
    const now = new Date();

    const record = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
      select: { id: true, userId: true, tenantId: true }
    });
    if (!record) throw new UnauthorizedException();

    const passwordHash = await argon2.hash(newPassword);
    await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      await tx.passwordResetToken.update({ where: { id: record.id }, data: { usedAt: now } });
      if (record.tenantId) {
        await tx.membership.updateMany({
          where: { tenantId: record.tenantId, userId: record.userId, status: "invited" },
          data: { status: "active" }
        });
        await tx.auditLog.create({
          data: { tenantId: record.tenantId, actorUserId: record.userId, action: "membership.activate", metadataJson: {} }
        });
      }
    });

    return { data: { success: true } };
  }

  private async createDefaultRoles(tx: Tx, tenantId: string) {
    const [owner, admin, manager, staff, readOnly] = await Promise.all([
      tx.role.create({ data: { tenantId, name: "Owner", isSystem: true } }),
      tx.role.create({ data: { tenantId, name: "Admin", isSystem: true } }),
      tx.role.create({ data: { tenantId, name: "Manager", isSystem: true } }),
      tx.role.create({ data: { tenantId, name: "Staff", isSystem: true } }),
      tx.role.create({ data: { tenantId, name: "ReadOnly", isSystem: true } })
    ]);

    return { owner, admin, manager, staff, readOnly };
  }

  private async assignDefaultRolePermissions(
    tx: Tx,
    tenantId: string,
    roles: { owner: { id: string }; admin: { id: string }; manager: { id: string }; staff: { id: string }; readOnly: { id: string } }
  ) {
    const allPermissions = await tx.permissionCatalog.findMany({ select: { key: true } });
    const keys = allPermissions.map((p: { key: string }) => p.key);
    const platformKeys = keys.filter((k: string) => k.startsWith("platform."));
    const shopKeys = keys.filter((k: string) => k.startsWith("shop."));
    const fuelKeys = keys.filter((k: string) => k.startsWith("fuel."));
    const fuelViewKeys = fuelKeys.filter((k: string) => k.endsWith(".view"));

    const adminKeys = [...platformKeys, ...shopKeys, ...fuelKeys];
    const managerKeys = [
      "platform.users.read",
      "platform.memberships.read",
      ...shopKeys.filter((k: string) => !k.endsWith(".delete")),
      ...fuelKeys
    ];
    const staffKeys = [...shopKeys.filter((k: string) => !k.endsWith(".delete") && !k.endsWith(".export")), ...fuelKeys];
    const readOnlyKeys = [...shopKeys.filter((k: string) => k.endsWith(".read")), ...fuelViewKeys];

    const data: { tenantId: string; roleId: string; permissionKey: string }[] = [];

    for (const permissionKey of keys) data.push({ tenantId, roleId: roles.owner.id, permissionKey });
    for (const permissionKey of adminKeys) data.push({ tenantId, roleId: roles.admin.id, permissionKey });
    for (const permissionKey of managerKeys) data.push({ tenantId, roleId: roles.manager.id, permissionKey });
    for (const permissionKey of staffKeys) data.push({ tenantId, roleId: roles.staff.id, permissionKey });
    for (const permissionKey of readOnlyKeys) data.push({ tenantId, roleId: roles.readOnly.id, permissionKey });

    await tx.rolePermission.createMany({ data, skipDuplicates: true });
  }

  private async issueTokens(tx: Tx, userId: string, tenantId: string | null, existingSessionId?: string): Promise<AuthTokens> {
    const accessToken = await this.jwt.signAsync({ sub: userId });
    const refreshSecret = process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret";
    const refreshExpiresIn = process.env.TOKEN_TTL_REFRESH ?? "30d";
    const accessExpiresInSeconds = parseDurationSeconds(process.env.TOKEN_TTL_ACCESS ?? "7d", DEFAULT_ACCESS_EXPIRES_SECONDS);

    const sessionId = existingSessionId ?? (await tx.authSession.create({
      data: { userId, tenantId, refreshTokenHash: "" },
      select: { id: true }
    })).id;

    const refreshToken = await this.jwt.signAsync(
      { sub: userId, sid: sessionId },
      { secret: refreshSecret, expiresIn: refreshExpiresIn as unknown as SignOptions["expiresIn"] }
    );

    await tx.authSession.update({
      where: { id: sessionId },
      data: { refreshTokenHash: this.hashToken(refreshToken), revokedAt: null, tenantId }
    });

    return { accessToken, refreshToken, expiresInSeconds: accessExpiresInSeconds };
  }

  private verifyRefreshToken(token: string): { sub: string; sid: string } {
    try {
      const refreshSecret = process.env.JWT_REFRESH_SECRET ?? "dev-refresh-secret";
      return this.jwt.verify(token, { secret: refreshSecret }) as { sub: string; sid: string };
    } catch {
      throw new UnauthorizedException();
    }
  }

  private hashToken(value: string): string {
    return createHash("sha256").update(value).digest("hex");
  }

  private async ensureReferralCodesForNewTenant(
    tx: Prisma.TransactionClient,
    args: { tenantId: string; tenantSlug: string; userId: string; userFullName: string }
  ) {
    await Promise.all([
      this.ensureReferralCode(tx, { tenantId: args.tenantId, prefix: args.tenantSlug }),
      this.ensureReferralCode(tx, { userId: args.userId, prefix: args.userFullName })
    ]);
  }

  private async ensureReferralCode(
    tx: Prisma.TransactionClient,
    args: { tenantId?: string; userId?: string; prefix: string }
  ): Promise<void> {
    if (!args.tenantId && !args.userId) return;
    const existing = await tx.referralCode.findFirst({
      where: { ...(args.tenantId ? { tenantId: args.tenantId } : {}), ...(args.userId ? { userId: args.userId } : {}) },
      select: { id: true }
    });
    if (existing) return;

    const prefix = normalizeReferralCode(args.prefix);
    for (let i = 0; i < 12; i += 1) {
      const code = makeCandidateReferralCode(prefix);
      try {
        await tx.referralCode.create({ data: { code, tenantId: args.tenantId, userId: args.userId } });
        return;
      } catch (err) {
        if (!this.isPrismaUniqueViolation(err)) throw err;
      }
    }
    await tx.referralCode.create({
      data: { code: `ONEERP-${randomBytes(4).toString("hex").toUpperCase()}`, tenantId: args.tenantId, userId: args.userId }
    });
  }

  private async applyReferralCodeForTenant(
    tx: Prisma.TransactionClient,
    args: { tenantId: string; userId: string; referralCode: string; source: string }
  ) {
    const existing = await tx.referral.findUnique({ where: { referredTenantId: args.tenantId }, select: { id: true } });
    if (existing) return;

    const referrer = await tx.referralCode.findUnique({
      where: { code: args.referralCode },
      select: { id: true, isActive: true, tenantId: true, userId: true }
    });
    if (!referrer || !referrer.isActive) return;
    if (referrer.tenantId === args.tenantId || referrer.userId === args.userId) return;

    const derivedTenantId =
      referrer.tenantId ??
      (referrer.userId
        ? (
            await tx.membership.findFirst({
              where: { userId: referrer.userId, status: "active" },
              select: { tenantId: true },
              orderBy: { createdAt: "asc" }
            })
          )?.tenantId ??
          null
        : null);

    await tx.referral.create({
      data: {
        referrerCodeId: referrer.id,
        referrerTenantId: derivedTenantId ?? undefined,
        referrerUserId: referrer.userId ?? undefined,
        referredTenantId: args.tenantId,
        referredUserId: args.userId,
        source: args.source,
        status: "pending"
      }
    });
  }

  private isPrismaUniqueViolation(err: unknown): boolean {
    return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002";
  }
}
