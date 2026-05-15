import { Body, Controller, Get, HttpException, Param, Post, Query, Req } from "@nestjs/common";
import { randomUUID } from "crypto";
import { PrismaService } from "../../prisma/prisma.service";
import { PublicContactDto, WaitlistDto } from "./dto/waitlist.dto";

@Controller("public")
export class PublicController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("modules")
  async listModules() {
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

    const modules = await this.prisma.moduleCatalog.findMany({
      select: {
        id: true,
        version: true,
        nameKey: true,
        descriptionKey: true,
        category: true,
        icon: true,
        isActive: true
      },
      orderBy: { id: "asc" }
    });

    return {
      data: modules.map((m: { id: string; version: string; nameKey: string; descriptionKey: string; category: string; icon: string; isActive: boolean }) => ({
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

  @Get("plans")
  async listPlans() {
    const plans = await this.prisma.planCatalog.findMany({
      select: { code: true, nameKey: true, descriptionKey: true, isActive: true },
      orderBy: { code: "asc" }
    });

    return {
      data: plans.map((p: { code: string; nameKey: string; descriptionKey: string; isActive: boolean }) => ({
        code: p.code,
        name_key: p.nameKey,
        description_key: p.descriptionKey,
        is_active: p.isActive
      }))
    };
  }

  @Post("waitlist")
  async joinWaitlist(@Body() body: WaitlistDto) {
    const email = body.email.toLowerCase();
    try {
      await this.prisma.waitlistSignup.create({
        data: {
          email,
          name: body.name,
          company: body.company,
          moduleId: body.moduleId ?? null,
          locale: body.locale ?? null
        }
      });
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002") {
        return { data: { success: true } };
      }
      throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);
    }

    return { data: { success: true } };
  }

  @Post("contact")
  async submitContact(@Body() body: PublicContactDto, @Req() req: { headers: Record<string, string | string[] | undefined>; ip?: string }) {
    const website = (body.website ?? "").trim();
    if (website) return { data: { success: true } };

    const email = body.email.toLowerCase().trim();
    const ip = getIp(req);
    const userAgent = getHeader(req.headers, "user-agent");

    try {
      const data = {
        fullName: body.fullName.trim(),
        organizationName: body.organizationName?.trim() || null,
        email,
        phoneNumber: body.phoneNumber.trim(),
        serviceType: body.serviceType,
        message: body.message.trim(),
        locale: body.locale ?? null,
        ip,
        userAgent
      };

      const prismaAny = this.prisma as unknown as {
        publicContactSubmission?: { create: (args: { data: typeof data }) => Promise<unknown> };
      };
      if (prismaAny.publicContactSubmission) {
        await prismaAny.publicContactSubmission.create({ data });
      } else {
        const id = randomUUID();
        const createdAt = new Date();
        await this.prisma.$executeRaw`
          INSERT INTO "PublicContactSubmission"
            ("id","fullName","organizationName","email","phoneNumber","serviceType","message","locale","ip","userAgent","createdAt")
          VALUES
            (${id},${data.fullName},${data.organizationName},${data.email},${data.phoneNumber},${data.serviceType},${data.message},${data.locale},${data.ip},${data.userAgent},${createdAt})
        `;
      }
    } catch {
      throw new HttpException({ error: { code: "INTERNAL_ERROR", message_key: "errors.internal" } }, 500);
    }

    await notifyContactWebhook({
      fullName: body.fullName.trim(),
      organizationName: body.organizationName?.trim() || null,
      email,
      phoneNumber: body.phoneNumber.trim(),
      serviceType: body.serviceType,
      message: body.message.trim(),
      locale: body.locale ?? null,
      ip,
      userAgent
    });

    return { data: { success: true } };
  }

  @Get("tutorial-categories")
  async listTutorialCategories() {
    const prismaAny = this.prisma as unknown as {
      tutorialCategory?: { findMany: (args: unknown) => Promise<unknown[]> };
    };
    if (!prismaAny.tutorialCategory) {
      return { data: [] };
    }

    const items = (await prismaAny.tutorialCategory.findMany({
      where: { isActive: true },
      select: { id: true, slug: true, icon: true, titleEn: true, titleFa: true, titlePs: true, orderNo: true },
      orderBy: [{ orderNo: "asc" }, { createdAt: "asc" }]
    })) as Array<{ id: string; slug: string; icon: string; titleEn: string; titleFa: string; titlePs: string; orderNo: number }>;

    return {
      data: items.map((c) => ({
        id: c.id,
        slug: c.slug,
        icon: c.icon,
        title_en: c.titleEn,
        title_dr: c.titleFa,
        title_ps: c.titlePs,
        order_no: c.orderNo
      }))
    };
  }

  @Get("tutorials")
  async listTutorials(
    @Query()
    query: {
      q?: string;
      scope?: string;
      moduleId?: string;
      categoryId?: string;
      difficulty?: string;
      language?: string;
      featured?: string;
      sort?: string;
      page?: string;
      pageSize?: string;
    }
  ) {
    const prismaAny = this.prisma as unknown as {
      tutorial?: { findMany: (args: unknown) => Promise<unknown[]>; count: (args: unknown) => Promise<number> };
    };
    if (!prismaAny.tutorial) return { data: [], meta: { page: 1, pageSize: 24, total: 0 } };

    const q = (query.q ?? "").trim();
    const scope = (query.scope ?? "").trim();
    const moduleId = (query.moduleId ?? "").trim();
    const categoryId = (query.categoryId ?? "").trim();
    const difficulty = (query.difficulty ?? "").trim();
    const language = (query.language ?? "").trim();
    const featured = (query.featured ?? "").trim();
    const sort = (query.sort ?? "latest").trim();

    const page = Math.max(1, Number.parseInt(query.page ?? "1", 10) || 1);
    const pageSize = Math.min(60, Math.max(1, Number.parseInt(query.pageSize ?? "24", 10) || 24));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { visibility: "public", isActive: true };
    if (scope) where.scope = scope;
    if (moduleId) where.moduleId = moduleId;
    if (categoryId) where.categoryId = categoryId;
    if (difficulty) where.difficulty = difficulty;
    if (language) where.language = language;
    if (featured) where.isFeatured = featured === "1";
    if (q) {
      const tokens = q
        .split(/\s+/)
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 6);
      where.OR = [
        { titleEn: { contains: q, mode: "insensitive" } },
        { titleFa: { contains: q, mode: "insensitive" } },
        { titlePs: { contains: q, mode: "insensitive" } },
        { descriptionEn: { contains: q, mode: "insensitive" } },
        { descriptionFa: { contains: q, mode: "insensitive" } },
        { descriptionPs: { contains: q, mode: "insensitive" } },
        ...(tokens.length ? [{ tags: { hasSome: tokens } }] : [])
      ];
    }

    const orderBy =
      sort === "mostViewed"
        ? [{ views: "desc" }, { createdAt: "desc" }]
        : [{ createdAt: "desc" }, { orderNo: "asc" }, { updatedAt: "desc" }];

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
          isFeatured: true,
          createdAt: true,
          updatedAt: true
        }
      })
    ]);

    const items = rows as Array<{
      id: string;
      slug: string;
      scope: string;
      moduleId: string | null;
      categoryId: string | null;
      seriesId: string | null;
      stepNo: number | null;
      orderNo: number;
      titleEn: string;
      titleFa: string;
      titlePs: string;
      descriptionEn: string | null;
      descriptionFa: string | null;
      descriptionPs: string | null;
      youtubeUrl: string;
      youtubeVideoId: string | null;
      thumbnailUrl: string | null;
      difficulty: string;
      language: string;
      durationSec: number | null;
      tags: string[];
      views: number;
      isFeatured: boolean;
      createdAt: Date;
      updatedAt: Date;
    }>;

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
        thumbnail_url: resolveTutorialThumbnailUrl(t.thumbnailUrl, t.youtubeVideoId),
        difficulty: t.difficulty,
        language: t.language,
        duration_sec: t.durationSec ?? null,
        tags: Array.isArray(t.tags) ? t.tags : [],
        views: t.views,
        is_featured: t.isFeatured,
        created_at: t.createdAt,
        updated_at: t.updatedAt
      })),
      meta: { page, pageSize, total }
    };
  }

  @Get("tutorials/:slug")
  async getTutorial(@Param("slug") slug: string) {
    const prismaAny = this.prisma as unknown as {
      tutorial?: { findUnique: (args: unknown) => Promise<unknown>; findMany: (args: unknown) => Promise<unknown[]> };
      tutorialRelation?: { findMany: (args: unknown) => Promise<unknown[]> };
    };
    if (!prismaAny.tutorial) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const row = (await prismaAny.tutorial.findUnique({
      where: { slug },
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
        isFeatured: true,
        createdAt: true,
        updatedAt: true,
        series: { select: { slug: true, titleEn: true, titleFa: true, titlePs: true } },
        category: { select: { slug: true, icon: true, titleEn: true, titleFa: true, titlePs: true } },
        module: { select: { id: true, nameKey: true } }
      }
    })) as
      | null
      | {
          id: string;
          slug: string;
          scope: string;
          moduleId: string | null;
          categoryId: string | null;
          seriesId: string | null;
          stepNo: number | null;
          orderNo: number;
          titleEn: string;
          titleFa: string;
          titlePs: string;
          descriptionEn: string | null;
          descriptionFa: string | null;
          descriptionPs: string | null;
          youtubeUrl: string;
          youtubeVideoId: string | null;
          thumbnailUrl: string | null;
          difficulty: string;
          language: string;
          durationSec: number | null;
          tags: string[];
          views: number;
          isFeatured: boolean;
          createdAt: Date;
          updatedAt: Date;
          series: null | { slug: string; titleEn: string; titleFa: string; titlePs: string };
          category: null | { slug: string; icon: string; titleEn: string; titleFa: string; titlePs: string };
          module: null | { id: string; nameKey: string };
        };

    if (!row) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (row.scope !== "general" && row.scope !== "module") {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }
    if (row.scope === "module" && !row.moduleId) {
      throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    }

    const relatedRows = prismaAny.tutorialRelation
      ? ((await prismaAny.tutorialRelation.findMany({
          where: { tutorialId: row.id },
          orderBy: [{ orderNo: "asc" }, { createdAt: "asc" }],
          select: {
            relatedTutorial: {
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
                youtubeVideoId: true,
                thumbnailUrl: true,
                difficulty: true,
                language: true,
                durationSec: true,
                views: true,
                isFeatured: true,
                createdAt: true
              }
            }
          }
        })) as Array<{ relatedTutorial: any }>)
      : [];

    const related = relatedRows
      .map((x) => x.relatedTutorial)
      .filter(Boolean)
      .map((t) => ({
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
        thumbnail_url: resolveTutorialThumbnailUrl(t.thumbnailUrl, t.youtubeVideoId),
        difficulty: t.difficulty,
        language: t.language,
        duration_sec: t.durationSec ?? null,
        views: t.views,
        is_featured: t.isFeatured,
        created_at: t.createdAt
      }));

    let prev: null | { slug: string; titleEn: string; titleFa: string; titlePs: string } = null;
    let next: null | { slug: string; titleEn: string; titleFa: string; titlePs: string } = null;
    let continueList: Array<{ slug: string; titleEn: string; titleFa: string; titlePs: string; stepNo: number | null; thumbnailUrl: string | null; youtubeVideoId: string | null }> = [];
    if (row.seriesId && prismaAny.tutorial) {
      const seriesItems = (await prismaAny.tutorial.findMany({
        where: { visibility: "public", isActive: true, seriesId: row.seriesId },
        select: { slug: true, titleEn: true, titleFa: true, titlePs: true, stepNo: true, orderNo: true, thumbnailUrl: true, youtubeVideoId: true },
        orderBy: [{ stepNo: "asc" }, { orderNo: "asc" }, { createdAt: "asc" }]
      })) as Array<{ slug: string; titleEn: string; titleFa: string; titlePs: string; stepNo: number | null; orderNo: number; thumbnailUrl: string | null; youtubeVideoId: string | null }>;

      const idx = seriesItems.findIndex((x) => x.slug === row.slug);
      if (idx >= 0) {
        const p = seriesItems[idx - 1] ?? null;
        const n = seriesItems[idx + 1] ?? null;
        prev = p ? { slug: p.slug, titleEn: p.titleEn, titleFa: p.titleFa, titlePs: p.titlePs } : null;
        next = n ? { slug: n.slug, titleEn: n.titleEn, titleFa: n.titleFa, titlePs: n.titlePs } : null;
      }
      continueList = seriesItems.slice(0, 12);
    }

    return {
      data: {
        id: row.id,
        slug: row.slug,
        tutorial_scope: row.scope,
        module_id: row.moduleId ?? null,
        category_id: row.categoryId ?? null,
        series_id: row.seriesId ?? null,
        step_no: row.stepNo ?? null,
        order_no: row.orderNo,
        title_en: row.titleEn,
        title_dr: row.titleFa,
        title_ps: row.titlePs,
        description_en: row.descriptionEn ?? null,
        description_dr: row.descriptionFa ?? null,
        description_ps: row.descriptionPs ?? null,
        youtube_url: row.youtubeUrl,
        youtube_video_id: row.youtubeVideoId ?? null,
        thumbnail_url: resolveTutorialThumbnailUrl(row.thumbnailUrl, row.youtubeVideoId),
        difficulty: row.difficulty,
        language: row.language,
        duration_sec: row.durationSec ?? null,
        tags: Array.isArray(row.tags) ? row.tags : [],
        views: row.views,
        is_featured: row.isFeatured,
        created_at: row.createdAt,
        updated_at: row.updatedAt,
        category: row.category
          ? { slug: row.category.slug, icon: row.category.icon, title_en: row.category.titleEn, title_dr: row.category.titleFa, title_ps: row.category.titlePs }
          : null,
        series: row.series ? { slug: row.series.slug, title_en: row.series.titleEn, title_dr: row.series.titleFa, title_ps: row.series.titlePs } : null,
        module: row.module ? { id: row.module.id, name_key: row.module.nameKey } : null,
        related,
        previous: prev ? { slug: prev.slug, title_en: prev.titleEn, title_dr: prev.titleFa, title_ps: prev.titlePs } : null,
        next: next ? { slug: next.slug, title_en: next.titleEn, title_dr: next.titleFa, title_ps: next.titlePs } : null,
        continue_learning: continueList.map((x) => ({
          slug: x.slug,
          title_en: x.titleEn,
          title_dr: x.titleFa,
          title_ps: x.titlePs,
          step_no: x.stepNo ?? null,
          thumbnail_url: resolveTutorialThumbnailUrl(x.thumbnailUrl, x.youtubeVideoId)
        }))
      }
    };
  }

  @Post("tutorials/:slug/view")
  async trackTutorialView(@Param("slug") slug: string) {
    const prismaAny = this.prisma as unknown as {
      tutorial?: { update: (args: unknown) => Promise<unknown>; findUnique: (args: unknown) => Promise<unknown> };
    };
    if (!prismaAny.tutorial) return { data: { success: true } };

    const existing = (await prismaAny.tutorial.findUnique({ where: { slug }, select: { id: true, visibility: true, isActive: true } })) as
      | null
      | { id: string; visibility: string; isActive: boolean };
    if (!existing || !existing.isActive || existing.visibility !== "public") {
      return { data: { success: true } };
    }

    try {
      await prismaAny.tutorial.update({ where: { slug }, data: { views: { increment: 1 } } });
    } catch {}
    return { data: { success: true } };
  }
}

function resolveTutorialThumbnailUrl(thumbnailUrl: string | null, youtubeVideoId: string | null): string | null {
  const t = (thumbnailUrl ?? "").trim();
  if (t) return t;
  const id = (youtubeVideoId ?? "").trim();
  if (!id) return null;
  return `https://i.ytimg.com/vi/${encodeURIComponent(id)}/hqdefault.jpg`;
}

function getHeader(headers: Record<string, string | string[] | undefined>, key: string): string | null {
  const v = headers[key];
  if (!v) return null;
  if (Array.isArray(v)) return v[0] ?? null;
  return v;
}

function getIp(req: { headers: Record<string, string | string[] | undefined>; ip?: string }): string | null {
  const xff = getHeader(req.headers, "x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.ip ?? null;
}

async function notifyContactWebhook(payload: {
  fullName: string;
  organizationName: string | null;
  email: string;
  phoneNumber: string;
  serviceType: string;
  message: string;
  locale: string | null;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  const url = process.env.CONTACT_NOTIFY_WEBHOOK_URL?.trim();
  if (!url) return;

  const secret = process.env.CONTACT_NOTIFY_WEBHOOK_SECRET?.trim();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(secret ? { "X-OneERP-Webhook-Secret": secret } : {})
      },
      body: JSON.stringify({ type: "public.contact", data: payload }),
      signal: controller.signal
    });
  } catch {
  } finally {
    clearTimeout(timeout);
  }
}
