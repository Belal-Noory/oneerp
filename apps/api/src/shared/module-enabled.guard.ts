import { CanActivate, ExecutionContext, HttpException, Injectable, mixin } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

type RequestWithTenant = { tenantId?: string };

const fuelPermissionsBackfilledTenants = new Set<string>();
const mspPermissionsBackfilledTenants = new Set<string>();
const printPressPermissionsBackfilledTenants = new Set<string>();

const fuelPermissionKeys = [
  "fuel.tanks.view",
  "fuel.tanks.manage",
  "fuel.pumps.view",
  "fuel.pumps.manage",
  "fuel.shifts.view",
  "fuel.shifts.manage",
  "fuel.sales.view",
  "fuel.sales.create",
  "fuel.reports.view"
];

const mspPermissionKeys = [
  "msp.dashboard.view",
  "msp.exchange.view",
  "msp.exchange.manage",
  "msp.hawala.view",
  "msp.hawala.manage",
  "msp.customers.view",
  "msp.customers.manage",
  "msp.partners.view",
  "msp.partners.manage",
  "msp.branches.view",
  "msp.branches.manage",
  "msp.ledger.view",
  "msp.ledger.manage",
  "msp.cash.view",
  "msp.cash.manage",
  "msp.settlements.view",
  "msp.settlements.manage",
  "msp.reports.view",
  "msp.reports.export",
  "msp.audit.view",
  "msp.audit.export",
  "msp.settings.view",
  "msp.settings.manage"
];

const printPressPermissionKeys = [
  "printpress.dashboard.view",
  "printpress.customers.view",
  "printpress.customers.manage",
  "printpress.jobs.view",
  "printpress.jobs.manage",
  "printpress.quotations.view",
  "printpress.quotations.manage",
  "printpress.reports.view",
  "printpress.reports.export",
  "printpress.settings.view",
  "printpress.settings.manage"
];

export async function ensureFuelDefaultRolePermissions(prisma: PrismaService, tenantId: string): Promise<void> {
  if (fuelPermissionsBackfilledTenants.has(tenantId)) return;

  await prisma.permissionCatalog.createMany({
    data: fuelPermissionKeys.map((key) => ({
      key,
      labelKey: `permission.${key}`,
      descriptionKey: `permission.${key}.desc`
    })),
    skipDuplicates: true
  });

  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({
      where: { tenantId, isSystem: true, name: { in: ["Admin", "Manager", "Staff", "ReadOnly"] } },
      select: { id: true, name: true }
    }),
    prisma.permissionCatalog.findMany({ select: { key: true } })
  ]);

  const fuelKeys = permissions.map((p: { key: string }) => p.key).filter((k: string) => k.startsWith("fuel."));
  if (roles.length === 0 || fuelKeys.length === 0) {
    fuelPermissionsBackfilledTenants.add(tenantId);
    return;
  }

  const fuelViewKeys = fuelKeys.filter((k: string) => k.endsWith(".view"));
  const byRoleName: Record<string, string[]> = {
    Admin: fuelKeys,
    Manager: fuelKeys,
    Staff: fuelKeys,
    ReadOnly: fuelViewKeys
  };

  const data: { tenantId: string; roleId: string; permissionKey: string }[] = [];
  for (const role of roles) {
    const keys = byRoleName[role.name] ?? [];
    for (const permissionKey of keys) data.push({ tenantId, roleId: role.id, permissionKey });
  }

  if (data.length > 0) {
    await prisma.rolePermission.createMany({ data, skipDuplicates: true });
  }

  const membershipsWithExplicitModules = await prisma.membership.findMany({
    where: { tenantId, status: "active", enabledModules: { some: {} }, role: { is: { name: { not: "Owner" } } } },
    select: { id: true }
  });
  if (membershipsWithExplicitModules.length > 0) {
    await prisma.membershipEnabledModule.createMany({
      data: membershipsWithExplicitModules.map((m: { id: string }) => ({ tenantId, membershipId: m.id, moduleId: "fuel" })),
      skipDuplicates: true
    });
  }

  fuelPermissionsBackfilledTenants.add(tenantId);
}

export async function ensureMspDefaultRolePermissions(prisma: PrismaService, tenantId: string): Promise<void> {
  if (mspPermissionsBackfilledTenants.has(tenantId)) return;

  await prisma.permissionCatalog.createMany({
    data: mspPermissionKeys.map((key) => ({
      key,
      labelKey: `permission.${key}`,
      descriptionKey: `permission.${key}.desc`
    })),
    skipDuplicates: true
  });

  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({
      where: { tenantId, isSystem: true, name: { in: ["Admin", "Manager", "Staff", "ReadOnly"] } },
      select: { id: true, name: true }
    }),
    prisma.permissionCatalog.findMany({ select: { key: true } })
  ]);

  const mspKeys = permissions.map((p: { key: string }) => p.key).filter((k: string) => k.startsWith("msp."));
  if (roles.length === 0 || mspKeys.length === 0) {
    mspPermissionsBackfilledTenants.add(tenantId);
    return;
  }

  const mspViewKeys = mspKeys.filter((k: string) => k.endsWith(".view"));
  const byRoleName: Record<string, string[]> = {
    Admin: mspKeys,
    Manager: mspKeys,
    Staff: mspKeys,
    ReadOnly: mspViewKeys
  };

  const data: { tenantId: string; roleId: string; permissionKey: string }[] = [];
  for (const role of roles) {
    const keys = byRoleName[role.name] ?? [];
    for (const permissionKey of keys) data.push({ tenantId, roleId: role.id, permissionKey });
  }

  if (data.length > 0) {
    await prisma.rolePermission.createMany({ data, skipDuplicates: true });
  }

  const membershipsWithExplicitModules = await prisma.membership.findMany({
    where: { tenantId, status: "active", enabledModules: { some: {} }, role: { is: { name: { not: "Owner" } } } },
    select: { id: true }
  });
  if (membershipsWithExplicitModules.length > 0) {
    await prisma.membershipEnabledModule.createMany({
      data: membershipsWithExplicitModules.map((m: { id: string }) => ({ tenantId, membershipId: m.id, moduleId: "msp" })),
      skipDuplicates: true
    });
  }

  mspPermissionsBackfilledTenants.add(tenantId);
}

export async function ensurePrintPressDefaultRolePermissions(prisma: PrismaService, tenantId: string): Promise<void> {
  if (printPressPermissionsBackfilledTenants.has(tenantId)) return;

  await prisma.permissionCatalog.createMany({
    data: printPressPermissionKeys.map((key) => ({
      key,
      labelKey: `permission.${key}`,
      descriptionKey: `permission.${key}.desc`
    })),
    skipDuplicates: true
  });

  const [roles, permissions] = await Promise.all([
    prisma.role.findMany({
      where: { tenantId, isSystem: true, name: { in: ["Admin", "Manager", "Staff", "ReadOnly"] } },
      select: { id: true, name: true }
    }),
    prisma.permissionCatalog.findMany({ select: { key: true } })
  ]);

  const keys = permissions.map((p: { key: string }) => p.key).filter((k: string) => k.startsWith("printpress."));
  if (roles.length === 0 || keys.length === 0) {
    printPressPermissionsBackfilledTenants.add(tenantId);
    return;
  }

  const viewKeys = keys.filter((k: string) => k.endsWith(".view"));
  const byRoleName: Record<string, string[]> = {
    Admin: keys,
    Manager: keys,
    Staff: keys,
    ReadOnly: viewKeys
  };

  const data: { tenantId: string; roleId: string; permissionKey: string }[] = [];
  for (const role of roles) {
    const roleKeys = byRoleName[role.name] ?? [];
    for (const permissionKey of roleKeys) data.push({ tenantId, roleId: role.id, permissionKey });
  }

  if (data.length > 0) {
    await prisma.rolePermission.createMany({ data, skipDuplicates: true });
  }

  const membershipsWithExplicitModules = await prisma.membership.findMany({
    where: { tenantId, status: "active", enabledModules: { some: {} }, role: { is: { name: { not: "Owner" } } } },
    select: { id: true }
  });
  if (membershipsWithExplicitModules.length > 0) {
    await prisma.membershipEnabledModule.createMany({
      data: membershipsWithExplicitModules.map((m: { id: string }) => ({ tenantId, membershipId: m.id, moduleId: "printpress" })),
      skipDuplicates: true
    });
  }

  printPressPermissionsBackfilledTenants.add(tenantId);
}

export function ModuleEnabledGuard(moduleId: string) {
  @Injectable()
  class Guard implements CanActivate {
    constructor(private readonly prisma: PrismaService) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
      const req = context.switchToHttp().getRequest<RequestWithTenant>();
      const tenantId = req.tenantId ?? null;
      if (!tenantId) {
        throw new HttpException({ error: { code: "TENANT_REQUIRED", message_key: "errors.tenantRequired" } }, 400);
      }

      const enabled = await this.prisma.tenantEnabledModule.findFirst({
        where: { tenantId, moduleId, status: "enabled" },
        select: { id: true }
      });
      if (!enabled) {
        throw new HttpException({ error: { code: "MODULE_DISABLED", message_key: "errors.moduleDisabled" } }, 403);
      }

      const item = await this.prisma.subscriptionItem.findFirst({
        where: { tenantId, moduleId, endedAt: null },
        select: { status: true, billingCycle: true, currentPeriodEndAt: true, graceEndsAt: true, lockedAt: true }
      });
      if (item?.lockedAt) {
        throw new HttpException({ error: { code: "MODULE_LOCKED", message_key: "errors.moduleLocked" } }, 403);
      }
      if (!item || item.status !== "active") {
        throw new HttpException({ error: { code: "MODULE_DISABLED", message_key: "errors.moduleDisabled" } }, 403);
      }

      if (moduleId === "fuel") {
        await ensureFuelDefaultRolePermissions(this.prisma, tenantId);
      }
      if (moduleId === "msp") {
        await ensureMspDefaultRolePermissions(this.prisma, tenantId);
      }
      if (moduleId === "printpress") {
        await ensurePrintPressDefaultRolePermissions(this.prisma, tenantId);
      }

      return true;
    }
  }

  return mixin(Guard);
}
