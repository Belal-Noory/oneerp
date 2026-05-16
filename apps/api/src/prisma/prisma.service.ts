import { Injectable, OnModuleDestroy, OnModuleInit } from "@nestjs/common";
import "./prisma.env";
import { PrismaClient } from "@prisma/client";

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
    await this.ensureLearningCenterSeeded();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  private async ensureLearningCenterSeeded() {
    const prismaAny = this as unknown as {
      moduleCatalog?: { findMany: (args: unknown) => Promise<Array<{ id: string }>> };
      tutorialCategory?: { count: (args?: unknown) => Promise<number>; upsert: (args: unknown) => Promise<unknown> };
      tutorialSeries?: { upsert: (args: unknown) => Promise<unknown> };
    };
    if (!prismaAny.moduleCatalog || !prismaAny.tutorialCategory || !prismaAny.tutorialSeries) return;

    try {
      await prismaAny.tutorialCategory.count();
    } catch {
      return;
    }

    const modules = await prismaAny.moduleCatalog.findMany({ where: { isActive: true }, select: { id: true } });

    const generalCategories = [
      { slug: "getting-started", title: "Getting Started", icon: "sparkles", orderNo: 10 },
      { slug: "account-access", title: "Account & Access", icon: "user", orderNo: 20 },
      { slug: "platform-basics", title: "Platform Basics", icon: "layers", orderNo: 30 }
    ];

    for (const c of generalCategories) {
      await prismaAny.tutorialCategory.upsert({
        where: { slug: c.slug },
        update: {},
        create: {
          slug: c.slug,
          icon: c.icon,
          scope: "general",
          moduleId: null,
          titleEn: c.title,
          titleFa: c.title,
          titlePs: c.title,
          orderNo: c.orderNo,
          isActive: true
        }
      });
    }

    const moduleCategoryKinds = [
      { suffix: "Training", slugSuffix: "training", icon: "book-open", orderNo: 10 },
      { suffix: "Sales", slugSuffix: "sales", icon: "trending-up", orderNo: 20 },
      { suffix: "Inventory", slugSuffix: "inventory", icon: "package", orderNo: 30 },
      { suffix: "Reports", slugSuffix: "reports", icon: "bar-chart-2", orderNo: 40 }
    ];

    for (const m of modules) {
      const base = titleCase(m.id);
      for (const k of moduleCategoryKinds) {
        await prismaAny.tutorialCategory.upsert({
          where: { slug: `${m.id}-${k.slugSuffix}` },
          update: {},
          create: {
            slug: `${m.id}-${k.slugSuffix}`,
            icon: k.icon,
            scope: "module",
            moduleId: m.id,
            titleEn: `${base} ${k.suffix}`,
            titleFa: `${base} ${k.suffix}`,
            titlePs: `${base} ${k.suffix}`,
            orderNo: k.orderNo,
            isActive: true
          }
        });
      }
    }

    for (const s of [
      { slug: "getting-started-series", title: "Getting Started Series", orderNo: 10, categorySlug: "getting-started" },
      { slug: "account-setup-guide", title: "Account Setup Guide", orderNo: 20, categorySlug: "account-access" }
    ]) {
      await prismaAny.tutorialSeries.upsert({
        where: { slug: s.slug },
        update: {},
        create: {
          slug: s.slug,
          scope: "general",
          moduleId: null,
          categoryId: null,
          titleEn: s.title,
          titleFa: s.title,
          titlePs: s.title,
          descriptionEn: null,
          descriptionFa: null,
          descriptionPs: null,
          thumbnailUrl: null,
          orderNo: s.orderNo,
          isActive: true
        }
      });
    }

    for (const m of modules) {
      const base = titleCase(m.id);
      const seriesToCreate = [
        { slug: `${m.id}-getting-started`, title: `${base} Getting Started`, orderNo: 10 },
        { slug: `${m.id}-full-training`, title: `${base} Full Training`, orderNo: 20 },
        { slug: `${m.id}-workflow`, title: `${base} Workflow`, orderNo: 30 }
      ];
      for (const s of seriesToCreate) {
        await prismaAny.tutorialSeries.upsert({
          where: { slug: s.slug },
          update: {},
          create: {
            slug: s.slug,
            scope: "module",
            moduleId: m.id,
            categoryId: null,
            titleEn: s.title,
            titleFa: s.title,
            titlePs: s.title,
            descriptionEn: null,
            descriptionFa: null,
            descriptionPs: null,
            thumbnailUrl: null,
            orderNo: s.orderNo,
            isActive: true
          }
        });
      }
    }
  }
}

function titleCase(value: string): string {
  return (value ?? "")
    .trim()
    .replace(/[_-]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}
