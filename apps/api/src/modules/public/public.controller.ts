import { Body, Controller, Get, HttpException, Post } from "@nestjs/common";
import { PrismaService } from "../../prisma/prisma.service";
import { WaitlistDto } from "./dto/waitlist.dto";

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
}
