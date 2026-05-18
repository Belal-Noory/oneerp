import { Body, Controller, Get, HttpException, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantGuard } from "../../shared/tenant.guard";

type ApplyReferralDto = { code?: string };
type FeedbackDto = { subject?: string; message?: string; isBetaFeedback?: boolean };

function normalizeReferralCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "").toUpperCase();
}

function buildReferralLink(publicWebBaseUrl: string, code: string): string {
  const base = publicWebBaseUrl.trim().replace(/\/+$/, "");
  return `${base}/register?ref=${encodeURIComponent(code)}`;
}

function resolvePublicWebBaseUrl(headers?: Record<string, unknown>): string {
  const fromEnv = (process.env.PUBLIC_WEB_URL ?? process.env.PUBLIC_WEB_BASE_URL ?? "").trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  const protoRaw = typeof headers?.["x-forwarded-proto"] === "string" ? (headers["x-forwarded-proto"] as string) : null;
  const hostRaw =
    (typeof headers?.["x-forwarded-host"] === "string" ? (headers["x-forwarded-host"] as string) : null) ??
    (typeof headers?.origin === "string" ? (headers.origin as string) : null) ??
    (typeof headers?.host === "string" ? (headers.host as string) : null);

  const host = hostRaw?.split(",")[0]?.trim() ?? null;
  const proto = (protoRaw?.split(",")[0]?.trim() ?? "").toLowerCase() === "https" ? "https" : "http";
  if (host) {
    const bare = host.replace(/^https?:\/\//i, "").replace(/\/.*$/, "").replace(/^(www|app|owner|api)\./, "");
    return `${proto}://${bare}`;
  }

  return "http://localhost:3000";
}

function isPrismaUniqueViolation(err: unknown): boolean {
  return typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002";
}

function makeCandidateCode(prefix: string): string {
  const clean = prefix.replace(/[^A-Z0-9]/g, "").slice(0, 8);
  const suffix = String(Math.floor(1000 + Math.random() * 9000));
  return `${clean || "ONEERP"}-${suffix}`;
}

@Controller("referrals")
export class ReferralsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("dashboard")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async getDashboard(@Req() req: { tenantId: string; user: { id: string }; headers?: Record<string, unknown> }) {
    const publicWebBaseUrl = resolvePublicWebBaseUrl(req.headers);

    const settings = await this.prisma.platformReferralSettings.upsert({
      where: { id: "default" },
      update: {},
      create: { id: "default" }
    });

    const partnerProfile = await this.prisma.tenantPartnerProfile.upsert({
      where: { tenantId: req.tenantId },
      update: {},
      create: { tenantId: req.tenantId }
    });

    const [tenant, existingTenantCode] = await Promise.all([
      this.prisma.tenant.findUnique({ where: { id: req.tenantId }, select: { slug: true } }),
      this.prisma.referralCode.findUnique({ where: { tenantId: req.tenantId }, select: { code: true } })
    ]);

    const tenantSlug = tenant?.slug ?? "oneerp";
    const tenantReferralCode = existingTenantCode?.code ?? (await this.ensureTenantReferralCode(req.tenantId, tenantSlug));
    const referralLink = buildReferralLink(publicWebBaseUrl, tenantReferralCode);

    const [totalReferrals, successfulReferrals, pendingReferrals, awaitingPayment, paymentReceived, rejectedReferrals] = await Promise.all([
      this.prisma.referral.count({ where: { referrerTenantId: req.tenantId } }),
      this.prisma.referral.count({ where: { referrerTenantId: req.tenantId, activatedAt: { not: null } } }),
      this.prisma.referral.count({ where: { referrerTenantId: req.tenantId, status: "pending" } }),
      this.prisma.referral.count({ where: { referrerTenantId: req.tenantId, status: "awaiting_payment_confirmation" } }),
      this.prisma.referral.count({ where: { referrerTenantId: req.tenantId, status: "payment_received" } }),
      this.prisma.referral.count({ where: { referrerTenantId: req.tenantId, status: "rejected" } })
    ]);

    const activeModules = await this.prisma.subscriptionItem.count({ where: { tenantId: req.tenantId, endedAt: null, status: "active" } });
    const bundleEligibleCount = Math.max(0, activeModules - 1);
    const bundlePercent = Math.min(settings.bundleMaxPercent, bundleEligibleCount * settings.bundleStepPercent);
    const hasLoyaltyExtra = await this.prisma.referralRewardGrant.findFirst({
      where: { tenantId: req.tenantId, rewardType: "loyalty_extra_5" },
      select: { id: true }
    });
    const loyaltyPercent = hasLoyaltyExtra ? settings.loyaltyExtraPercent : 0;
    const totalDiscountPercent = bundlePercent + loyaltyPercent;

    const referralForTenant = await this.prisma.referral.findFirst({
      where: { referredTenantId: req.tenantId, status: { not: "rejected" } },
      select: { id: true }
    });
    const firstActivationEligible = activeModules === 0;
    const firstActivationPercent = firstActivationEligible ? (referralForTenant ? 10 : 5) : 0;

    const milestone = successfulReferrals >= settings.loyaltyExtraAtReferrals ? "loyalty_extra_5" : successfulReferrals >= settings.premiumPartnerAtReferrals ? "premium_partner" : successfulReferrals >= settings.freeMonthAtReferrals ? "free_month" : successfulReferrals >= 1 ? "invoice_discount_10" : "none";

    const nextMilestone =
      successfulReferrals < 1
        ? { at: 1, reward: "invoice_discount_10" }
        : successfulReferrals < settings.freeMonthAtReferrals
          ? { at: settings.freeMonthAtReferrals, reward: "free_month" }
          : successfulReferrals < settings.premiumPartnerAtReferrals
            ? { at: settings.premiumPartnerAtReferrals, reward: "premium_partner" }
            : successfulReferrals < settings.loyaltyExtraAtReferrals
              ? { at: settings.loyaltyExtraAtReferrals, reward: "loyalty_extra_5" }
              : null;

    return {
      data: {
        referralCode: tenantReferralCode,
        referralLink,
        stats: {
          total: totalReferrals,
          successful: successfulReferrals,
          pending: pendingReferrals,
          awaitingPaymentConfirmation: awaitingPayment,
          paymentReceived,
          rejected: rejectedReferrals
        },
        discounts: {
          bundlePercent,
          loyaltyPercent,
          totalPercent: totalDiscountPercent
        },
        firstActivationDiscount: {
          eligible: firstActivationEligible,
          percent: firstActivationPercent,
          type: !firstActivationEligible ? "none" : referralForTenant ? "referral" : "default"
        },
        rewards: {
          milestone,
          next: nextMilestone ? { ...nextMilestone, remaining: Math.max(0, nextMilestone.at - successfulReferrals) } : null
        },
        premiumPartner: {
          enabled: partnerProfile.isPremiumPartner,
          betaAccessEnabled: partnerProfile.betaAccessEnabled
        }
      }
    };
  }

  @Get("history")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async history(@Req() req: { tenantId: string }) {
    const items = await this.prisma.referral.findMany({
      where: { referrerTenantId: req.tenantId },
      select: {
        id: true,
        status: true,
        moduleId: true,
        registeredAt: true,
        moduleRequestedAt: true,
        paymentReceivedAt: true,
        activatedAt: true,
        rewardGrantedAt: true,
        rejectedAt: true,
        rejectedReason: true,
        referredTenant: { select: { slug: true, displayName: true } }
      },
      orderBy: [{ registeredAt: "desc" }, { id: "desc" }]
    });

    return {
      data: items.map((i) => ({
        id: i.id,
        referredTenantSlug: i.referredTenant.slug,
        referredTenantDisplayName: i.referredTenant.displayName,
        status: i.status,
        moduleId: i.moduleId,
        registeredAt: i.registeredAt,
        moduleRequestedAt: i.moduleRequestedAt,
        paymentReceivedAt: i.paymentReceivedAt,
        activatedAt: i.activatedAt,
        rewardGrantedAt: i.rewardGrantedAt,
        rejectedAt: i.rejectedAt,
        rejectedReason: i.rejectedReason
      }))
    };
  }

  @Post("apply")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async apply(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: ApplyReferralDto) {
    const raw = typeof body?.code === "string" ? body.code : "";
    const code = normalizeReferralCode(raw);
    if (!code) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const existing = await this.prisma.referral.findUnique({ where: { referredTenantId: req.tenantId }, select: { id: true } });
    if (existing) return { data: { success: true, alreadyApplied: true } };

    const referrer = await this.prisma.referralCode.findUnique({
      where: { code },
      select: { id: true, tenantId: true, userId: true, isActive: true }
    });
    if (!referrer || !referrer.isActive) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }
    if (referrer.tenantId === req.tenantId || referrer.userId === req.user.id) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const derivedTenantId =
      referrer.tenantId ??
      (referrer.userId
        ? (
            await this.prisma.membership.findFirst({
              where: { userId: referrer.userId, status: "active" },
              select: { tenantId: true },
              orderBy: { createdAt: "asc" }
            })
          )?.tenantId ??
          null
        : null);

    await this.prisma.referral.create({
      data: {
        referrerCodeId: referrer.id,
        referrerTenantId: derivedTenantId ?? undefined,
        referrerUserId: referrer.userId ?? undefined,
        referredTenantId: req.tenantId,
        referredUserId: req.user.id,
        source: "onboarding",
        status: "pending"
      }
    });

    return { data: { success: true, alreadyApplied: false } };
  }

  @Get("feedback")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async listFeedback(@Req() req: { tenantId: string; user: { id: string } }) {
    const items = await this.prisma.partnerFeedback.findMany({
      where: { tenantId: req.tenantId, userId: req.user.id },
      select: { id: true, subject: true, message: true, isBetaFeedback: true, status: true, createdAt: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
    return {
      data: items.map((i) => ({
        id: i.id,
        subject: i.subject,
        message: i.message,
        isBetaFeedback: i.isBetaFeedback,
        status: i.status,
        createdAt: i.createdAt
      }))
    };
  }

  @Post("feedback")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async submitFeedback(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: FeedbackDto) {
    const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
    const message = typeof body?.message === "string" ? body.message.trim() : "";
    const isBetaFeedback = typeof body?.isBetaFeedback === "boolean" ? body.isBetaFeedback : false;
    if (!subject || !message) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const profile = await this.prisma.tenantPartnerProfile.findUnique({ where: { tenantId: req.tenantId }, select: { isPremiumPartner: true } });
    if (!profile?.isPremiumPartner) {
      throw new HttpException({ error: { code: "PERMISSION_DENIED", message_key: "errors.permissionDenied" } }, 403);
    }

    const created = await this.prisma.partnerFeedback.create({
      data: { tenantId: req.tenantId, userId: req.user.id, subject, message, isBetaFeedback }
    });

    return { data: { success: true, id: created.id } };
  }

  private async ensureTenantReferralCode(tenantId: string, tenantSlug: string): Promise<string> {
    const prefix = normalizeReferralCode(tenantSlug);
    for (let i = 0; i < 12; i += 1) {
      const candidate = makeCandidateCode(prefix);
      try {
        const created = await this.prisma.referralCode.create({ data: { tenantId, code: candidate } });
        return created.code;
      } catch (err) {
        if (!isPrismaUniqueViolation(err)) throw err;
      }
    }
    const fallback = `ONEERP-${randomDigits(8)}`;
    const created = await this.prisma.referralCode.create({ data: { tenantId, code: fallback } });
    return created.code;
  }
}

function randomDigits(len: number): string {
  let out = "";
  for (let i = 0; i < len; i += 1) out += String(Math.floor(Math.random() * 10));
  return out;
}
