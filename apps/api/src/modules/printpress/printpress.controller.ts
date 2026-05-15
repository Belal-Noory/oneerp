import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { ModuleEnabledGuard } from "../../shared/module-enabled.guard";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/permissions.decorator";
import { TenantGuard } from "../../shared/tenant.guard";

@Controller("printpress")
export class PrintPressController {
  @Get("dashboard/summary")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.dashboard.view")
  async dashboardSummary(@Req() _req: { tenantId: string }) {
    return {
      data: {
        todayIncome: "0",
        todayExpenses: "0",
        monthlyRevenue: "0",
        pendingPayments: 0,
        pendingJobs: 0,
        completedJobs: 0,
        urgentOrders: 0,
        lowStockAlerts: 0,
        profitSummary: "0",
        taxSummary: "0"
      }
    };
  }

  @Get("customers")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.customers.view")
  async listCustomers(@Req() _req: { tenantId: string }) {
    return { data: { items: [] as Array<unknown> } };
  }

  @Get("jobs")
  @UseGuards(AuthGuard("jwt"), TenantGuard, PermissionsGuard, ModuleEnabledGuard("printpress"))
  @RequirePermissions("printpress.jobs.view")
  async listJobs(@Req() _req: { tenantId: string }) {
    return { data: { items: [] as Array<unknown> } };
  }
}

