import { Body, Controller, Get, Post, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantGuard } from "../../shared/tenant.guard";
import { Prisma, type ShopPaymentMethodKind } from "@prisma/client";
import * as argon2 from "argon2";
import crypto from "crypto";
import { promises as fs } from "fs";
import path from "path";

const MAX_FILE_BYTES = 5 * 1024 * 1024;
const STORAGE_ROOT = path.join(process.cwd(), "apps", "api", "storage");

function extFromContentType(contentType: string): string | null {
  const ct = contentType.trim().toLowerCase();
  if (ct === "image/png") return ".png";
  if (ct === "image/jpeg" || ct === "image/jpg") return ".jpg";
  if (ct === "image/webp") return ".webp";
  if (ct === "image/gif") return ".gif";
  if (ct === "image/svg+xml") return ".svg";
  return null;
}

function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function resolvePublicWebBaseUrl(headers?: Record<string, unknown>): string {
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

function uuidFromString(input: string): string {
  const hash = crypto.createHash("sha256").update(input).digest();
  const b = Buffer.from(hash.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function formatPurchaseNumber(moduleId: "shop" | "pharmacy", n: number): string {
  const s = String(n).padStart(6, "0");
  return moduleId === "pharmacy" ? `PIN-${s}` : `PINV-${s}`;
}

function formatPurchaseRefundNumber(moduleId: "shop" | "pharmacy", n: number): string {
  const s = String(n).padStart(6, "0");
  return moduleId === "pharmacy" ? `PCR-${s}` : `PRN-${s}`;
}

@Controller("offline")
export class OfflineController {
  constructor(private readonly prisma: PrismaService) {}

  private async loadShopSnapshot(tenantId: string, moduleId: "shop" | "pharmacy") {
    const [units, locations, categories, products, packagings, pharmacyProfiles, customers, stockItems, suppliers, paymentMethods, settings, lots, purchaseLotReceipts, invoiceLotAllocations] = await Promise.all([
      this.prisma.shopUnit.findMany({ where: { tenantId, moduleId }, select: { id: true, name: true, symbol: true, isActive: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, take: 5000 }),
      this.prisma.shopLocation.findMany({ where: { tenantId, moduleId }, select: { id: true, name: true, isActive: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, take: 5000 }),
      this.prisma.shopCategory.findMany({ where: { tenantId, moduleId }, select: { id: true, name: true, parentId: true, isActive: true, updatedAt: true }, orderBy: { updatedAt: "asc" }, take: 5000 }),
      this.prisma.shopProduct.findMany({
        where: { tenantId, moduleId },
        select: {
          id: true,
          name: true,
          sku: true,
          description: true,
          categoryId: true,
          unitId: true,
          imageFileId: true,
          sellPrice: true,
          costPrice: true,
          parentProductId: true,
          variantLabel: true,
          variantAttributesJson: true,
          isActive: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
          barcodes: { select: { code: true }, orderBy: { createdAt: "asc" } }
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 5000
      }),
      this.prisma.shopProductPackaging.findMany({
        where: { tenantId, product: { is: { moduleId } } },
        select: { id: true, productId: true, label: true, multiplier: true, barcode: true, updatedAt: true },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 5000
      }),
      this.prisma.shopProductPharmacyProfile.findMany({
        where: { tenantId, product: { is: { moduleId } } },
        select: { productId: true, trackLots: true, requiresPrescription: true, isControlled: true, form: true, strength: true, updatedAt: true },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 5000
      }),
      this.prisma.shopCustomer.findMany({
        where: { tenantId, moduleId },
        select: { id: true, name: true, phone: true, email: true, address: true, notes: true, isActive: true, deletedAt: true, updatedAt: true },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 5000
      }),
      this.prisma.shopStockItem.findMany({
        where: { tenantId, product: { is: { moduleId } }, location: { is: { moduleId } } },
        select: { productId: true, locationId: true, onHandQty: true, avgCost: true, updatedAt: true },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 5000
      }),
      this.prisma.shopSupplier.findMany({
        where: { tenantId, moduleId },
        select: { id: true, name: true, phone: true, email: true, address: true, notes: true, isActive: true, deletedAt: true, updatedAt: true },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 5000
      }),
      this.prisma.shopPaymentMethod.findMany({
        where: { tenantId, moduleId },
        select: { id: true, name: true, kind: true, isActive: true, updatedAt: true },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 5000
      }),
      this.prisma.shopSettings.findUnique({
        where: { tenantId },
        select: {
          sellCurrencyCode: true,
          buyCurrencyCode: true,
          taxEnabled: true,
          taxRate: true,
          cashRoundingIncrement: true,
          pharmacyReceivingRequireLotNumber: true,
          pharmacyReceivingRequireExpiryDate: true,
          updatedAt: true
        }
      }),
      moduleId === "pharmacy"
        ? this.prisma.shopStockLot.findMany({
            where: { tenantId, product: { is: { moduleId } }, location: { is: { moduleId } } },
            select: { id: true, productId: true, locationId: true, lotNumber: true, expiryDate: true, onHandQty: true, createdAt: true, updatedAt: true },
            orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
            take: 5000
          })
        : Promise.resolve([]),
      moduleId === "pharmacy"
        ? this.prisma.shopPurchaseLotReceipt.findMany({
            where: { tenantId, invoice: { is: { moduleId } } },
            select: {
              id: true,
              purchaseInvoiceId: true,
              purchaseInvoiceLineId: true,
              quantity: true,
              unitCost: true,
              createdAt: true,
              lot: { select: { id: true, productId: true, locationId: true, lotNumber: true, expiryDate: true, onHandQty: true, createdAt: true, updatedAt: true } },
              invoice: { select: { id: true, purchaseNumber: true, status: true, postedAt: true, supplier: { select: { id: true, name: true } } } }
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 5000
          })
        : Promise.resolve([]),
      moduleId === "pharmacy"
        ? this.prisma.shopInvoiceLotAllocation.findMany({
            where: { tenantId, invoice: { is: { moduleId } } },
            select: {
              id: true,
              invoiceId: true,
              invoiceLineId: true,
              quantity: true,
              createdAt: true,
              lot: { select: { id: true, productId: true, locationId: true, lotNumber: true, expiryDate: true, onHandQty: true, createdAt: true, updatedAt: true } },
              line: { select: { productId: true } },
              invoice: { select: { id: true, invoiceNumber: true, kind: true, status: true, postedAt: true, customer: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } } }
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 5000
          })
        : Promise.resolve([])
    ]);

    const lotItems =
      moduleId === "pharmacy"
        ? (lots as Array<{ id: string; productId: string; locationId: string; lotNumber: string; expiryDate: Date; onHandQty: Prisma.Decimal; createdAt: Date; updatedAt: Date }>).map((l) => {
            const iso = l.expiryDate.toISOString();
            return {
              id: l.id,
              productId: l.productId,
              locationId: l.locationId,
              lotNumber: l.lotNumber,
              expiryDate: iso.startsWith("9999-12-31") ? null : iso,
              onHandQty: l.onHandQty.toString(),
              createdAt: l.createdAt.toISOString(),
              updatedAt: l.updatedAt.toISOString()
            };
          })
        : [];

    const purchaseLotReceiptItems =
      moduleId === "pharmacy"
        ? (purchaseLotReceipts as Array<{
            id: string;
            purchaseInvoiceId: string;
            purchaseInvoiceLineId: string;
            quantity: Prisma.Decimal;
            unitCost: Prisma.Decimal;
            createdAt: Date;
            lot: { id: string; productId: string; locationId: string; lotNumber: string; expiryDate: Date; onHandQty: Prisma.Decimal; createdAt: Date; updatedAt: Date };
            invoice: { id: string; purchaseNumber: string | null; status: string; postedAt: Date | null; supplier: { id: string; name: string } | null };
          }>).map((r) => {
            const lotIso = r.lot.expiryDate.toISOString();
            return {
              id: r.id,
              purchaseInvoice: { id: r.invoice.id, purchaseNumber: r.invoice.purchaseNumber, status: r.invoice.status, postedAt: r.invoice.postedAt ? r.invoice.postedAt.toISOString() : null, supplier: r.invoice.supplier ? { id: r.invoice.supplier.id, name: r.invoice.supplier.name } : null },
              purchaseInvoiceLineId: r.purchaseInvoiceLineId,
              quantity: r.quantity.toString(),
              unitCost: r.unitCost.toString(),
              createdAt: r.createdAt.toISOString(),
              lot: {
                id: r.lot.id,
                productId: r.lot.productId,
                locationId: r.lot.locationId,
                lotNumber: r.lot.lotNumber,
                expiryDate: lotIso.startsWith("9999-12-31") ? null : lotIso,
                onHandQty: r.lot.onHandQty.toString(),
                createdAt: r.lot.createdAt.toISOString(),
                updatedAt: r.lot.updatedAt.toISOString()
              }
            };
          })
        : [];

    const invoiceLotAllocationItems =
      moduleId === "pharmacy"
        ? (invoiceLotAllocations as Array<{
            id: string;
            invoiceId: string;
            invoiceLineId: string;
            quantity: Prisma.Decimal;
            createdAt: Date;
            lot: { id: string; productId: string; locationId: string; lotNumber: string; expiryDate: Date; onHandQty: Prisma.Decimal; createdAt: Date; updatedAt: Date };
            line: { productId: string };
            invoice: { id: string; invoiceNumber: string | null; kind: string; status: string; postedAt: Date | null; customer: { id: string; name: string } | null; location: { id: string; name: string } | null };
          }>).map((a) => {
            const lotIso = a.lot.expiryDate.toISOString();
            return {
              id: a.id,
              invoice: {
                id: a.invoice.id,
                invoiceNumber: a.invoice.invoiceNumber,
                kind: a.invoice.kind,
                status: a.invoice.status,
                postedAt: a.invoice.postedAt ? a.invoice.postedAt.toISOString() : null,
                customer: a.invoice.customer ? { id: a.invoice.customer.id, name: a.invoice.customer.name } : null,
                location: a.invoice.location ? { id: a.invoice.location.id, name: a.invoice.location.name } : null
              },
              invoiceLineId: a.invoiceLineId,
              productId: a.line.productId,
              quantity: a.quantity.toString(),
              createdAt: a.createdAt.toISOString(),
              lot: {
                id: a.lot.id,
                productId: a.lot.productId,
                locationId: a.lot.locationId,
                lotNumber: a.lot.lotNumber,
                expiryDate: lotIso.startsWith("9999-12-31") ? null : lotIso,
                onHandQty: a.lot.onHandQty.toString(),
                createdAt: a.lot.createdAt.toISOString(),
                updatedAt: a.lot.updatedAt.toISOString()
              }
            };
          })
        : [];

    return {
      units: units.map((u) => ({ ...u, updatedAt: u.updatedAt.toISOString() })),
      locations: locations.map((l) => ({ ...l, updatedAt: l.updatedAt.toISOString() })),
      categories: categories.map((c) => ({ ...c, updatedAt: c.updatedAt.toISOString() })),
      products: products.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        description: p.description,
        categoryId: p.categoryId,
        unitId: p.unitId,
        imageFileId: p.imageFileId,
        sellPrice: p.sellPrice.toString(),
        costPrice: p.costPrice?.toString() ?? null,
        parentProductId: p.parentProductId,
        variantLabel: p.variantLabel,
        variantAttributes: p.variantAttributesJson,
        barcodes: p.barcodes.map((b) => b.code),
        isActive: p.isActive,
        deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
        createdAt: p.createdAt.toISOString(),
        updatedAt: p.updatedAt.toISOString()
      })),
      packagings: packagings.map((p) => ({ id: p.id, productId: p.productId, label: p.label, multiplier: p.multiplier.toString(), barcode: p.barcode, updatedAt: p.updatedAt.toISOString() })),
      pharmacyProfiles: pharmacyProfiles.map((p) => ({
        productId: p.productId,
        trackLots: p.trackLots,
        requiresPrescription: p.requiresPrescription,
        isControlled: p.isControlled,
        form: p.form,
        strength: p.strength,
        updatedAt: p.updatedAt.toISOString()
      })),
      customers: customers.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        address: c.address,
        notes: c.notes,
        isActive: c.isActive,
        deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
        updatedAt: c.updatedAt.toISOString()
      })),
      stockItems: stockItems.map((s) => ({ productId: s.productId, locationId: s.locationId, onHandQty: s.onHandQty.toString(), avgCost: s.avgCost.toString(), updatedAt: s.updatedAt.toISOString() })),
      suppliers: suppliers.map((s) => ({
        id: s.id,
        name: s.name,
        phone: s.phone,
        email: s.email,
        address: s.address,
        notes: s.notes,
        isActive: s.isActive,
        deletedAt: s.deletedAt ? s.deletedAt.toISOString() : null,
        updatedAt: s.updatedAt.toISOString()
      })),
      paymentMethods: paymentMethods.map((m) => ({ id: m.id, name: m.name, kind: m.kind, isActive: m.isActive, updatedAt: m.updatedAt.toISOString() })),
      settings: settings
        ? {
            baseCurrencyCode: "AFN",
            sellCurrencyCode: settings.sellCurrencyCode,
            buyCurrencyCode: settings.buyCurrencyCode,
            taxEnabled: settings.taxEnabled,
            taxRate: settings.taxRate.toString(),
            cashRoundingIncrement: settings.cashRoundingIncrement.toString(),
            pharmacyReceivingRequireLotNumber: settings.pharmacyReceivingRequireLotNumber,
            pharmacyReceivingRequireExpiryDate: settings.pharmacyReceivingRequireExpiryDate,
            updatedAt: settings.updatedAt.toISOString()
          }
        : {
            baseCurrencyCode: "AFN",
            sellCurrencyCode: "AFN",
            buyCurrencyCode: "AFN",
            taxEnabled: false,
            taxRate: "0",
            cashRoundingIncrement: "0",
            pharmacyReceivingRequireLotNumber: true,
            pharmacyReceivingRequireExpiryDate: true,
            updatedAt: new Date().toISOString()
          },
      lots: lotItems,
      purchaseLotReceipts: purchaseLotReceiptItems,
      invoiceLotAllocations: invoiceLotAllocationItems
    };
  }

  private async computeEntitlements(tenantId: string, allModuleIds?: string[]) {
    const [enabled, items] = await Promise.all([
      this.prisma.tenantEnabledModule.findMany({ where: { tenantId }, select: { moduleId: true, status: true } }),
      this.prisma.subscriptionItem.findMany({
        where: { tenantId, endedAt: null },
        select: { moduleId: true, status: true, billingCycle: true, currentPeriodEndAt: true, graceEndsAt: true, lockedAt: true }
      })
    ]);

    const enabledMap = new Map(enabled.map((m) => [m.moduleId, m.status]));
    const itemMap = new Map(items.map((i) => [i.moduleId, i]));
    const now = new Date();

    const moduleIds = allModuleIds ? new Set(allModuleIds) : new Set<string>([...enabled.map((m) => m.moduleId), ...items.map((i) => i.moduleId)]);

    const modules = [...moduleIds].map((moduleId) => {
      const enabledStatus = enabledMap.get(moduleId) ?? null;
      const item = itemMap.get(moduleId) ?? null;

      const currentPeriodEndAt = item?.currentPeriodEndAt ?? null;
      const graceEndsAt = item?.graceEndsAt ?? (currentPeriodEndAt ? addDays(currentPeriodEndAt, 3) : null);
      const lockedAt = item?.lockedAt ?? null;
      const isExpired = item?.billingCycle === "monthly" && graceEndsAt && now.getTime() > graceEndsAt.getTime();
      const effectiveLockedAt = lockedAt ?? (isExpired ? graceEndsAt : null);

      const status = (() => {
        if (enabledStatus === "enabled") {
          if (!item) return "pending";
          if (item.status === "requested") return "requested";
          if (effectiveLockedAt) return "locked";
          if (item.status !== "active") return "pending";
          if (isExpired) return "locked";
          return "enabled";
        }
        if (item?.status === "requested") return "requested";
        return "disabled";
      })();

      return {
        moduleId,
        status,
        currentPeriodEndAt: currentPeriodEndAt ? currentPeriodEndAt.toISOString() : null,
        graceEndsAt: graceEndsAt ? graceEndsAt.toISOString() : null,
        lockedAt: effectiveLockedAt ? effectiveLockedAt.toISOString() : null
      };
    });

    return modules;
  }

  @Get("entitlements")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async entitlements(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    const modules = await this.computeEntitlements(tenantId);

    return { data: { tenantId, modules } };
  }

  @Post("bootstrap")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async bootstrap(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    const [tenant, catalog] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true, slug: true, legalName: true, displayName: true, defaultLocale: true, status: true, branding: { select: { address: true, phone: true, email: true, logoFileId: true } } }
      }),
      this.prisma.moduleCatalog.findMany({
        select: { id: true, version: true, nameKey: true, descriptionKey: true, icon: true, category: true, isActive: true, updatedAt: true },
        orderBy: { id: "asc" }
      })
    ]);

    const effectiveCatalog =
      catalog.length > 0
        ? catalog
        : [
            {
              id: "shop",
              version: "1.0.0",
              nameKey: "module.shop.name",
              descriptionKey: "module.shop.description",
              icon: "shop",
              category: "operations",
              isActive: true,
              updatedAt: new Date()
            },
            {
              id: "pharmacy",
              version: "1.0.0",
              nameKey: "module.pharmacy.name",
              descriptionKey: "module.pharmacy.description",
              icon: "pharmacy",
              category: "operations",
              isActive: true,
              updatedAt: new Date()
            },
            {
              id: "fuel",
              version: "1.0.0",
              nameKey: "module.fuel.name",
              descriptionKey: "module.fuel.description",
              icon: "fuel",
              category: "operations",
              isActive: false,
              updatedAt: new Date()
            },
            {
              id: "msp",
              version: "1.0.0",
              nameKey: "module.msp.name",
              descriptionKey: "module.msp.description",
              icon: "msp",
              category: "operations",
              isActive: true,
              updatedAt: new Date()
            }
          ];

    const moduleIds = effectiveCatalog.map((c) => c.id);
    const entitlements = await this.computeEntitlements(tenantId, moduleIds);
    const enabledModuleIds = new Set(entitlements.filter((m) => m.status === "enabled").map((m) => m.moduleId));
    const shopEnabled = enabledModuleIds.has("shop");
    const pharmacyEnabled = enabledModuleIds.has("pharmacy");
    const [shop, pharmacy] = await Promise.all([
      shopEnabled ? this.loadShopSnapshot(tenantId, "shop") : Promise.resolve(null),
      pharmacyEnabled ? this.loadShopSnapshot(tenantId, "pharmacy") : Promise.resolve(null)
    ]);

    const [teamMemberships, teamRoles] = await Promise.all([
      this.prisma.membership.findMany({
        where: { tenantId },
        select: {
          id: true,
          status: true,
          createdAt: true,
          updatedAt: true,
          user: { select: { id: true, fullName: true, email: true } },
          role: { select: { id: true, name: true } },
          enabledModules: { select: { moduleId: true } }
        },
        orderBy: { createdAt: "asc" }
      }),
      this.prisma.role.findMany({ where: { tenantId }, select: { id: true, name: true, updatedAt: true }, orderBy: { name: "asc" } })
    ]);

    return {
      data: {
        tenant: tenant
          ? {
              id: tenant.id,
              slug: tenant.slug,
              legalName: tenant.legalName,
              displayName: tenant.displayName,
              defaultLocale: tenant.defaultLocale,
              status: tenant.status,
              branding: {
                logoUrl: tenant.branding?.logoFileId ? `/api/files/${tenant.branding.logoFileId}` : null,
                address: tenant.branding?.address ?? null,
                phone: tenant.branding?.phone ?? null,
                email: tenant.branding?.email ?? null
              }
            }
          : null,
        catalog: effectiveCatalog.map((m) => ({
          id: m.id,
          version: m.version,
          nameKey: m.nameKey,
          descriptionKey: m.descriptionKey,
          icon: m.icon,
          category: m.category,
          isActive: m.isActive,
          updatedAt: m.updatedAt.toISOString()
        })),
        entitlements,
        team: {
          roles: teamRoles.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt.toISOString() })),
          members: teamMemberships.map((m) => ({
            id: m.id,
            status: m.status,
            createdAt: m.createdAt.toISOString(),
            updatedAt: m.updatedAt.toISOString(),
            user: { id: m.user.id, fullName: m.user.fullName, email: m.user.email },
            role: { id: m.role.id, name: m.role.name },
            moduleIds: m.enabledModules.map((x) => x.moduleId)
          }))
        },
        shop,
        pharmacy
      }
    };
  }

  @Post("push")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async push(
    @Req() req: { tenantId: string; user: { id: string }; headers?: Record<string, unknown> },
    @Body()
    body: {
      events?: Array<{
        id: string;
        moduleId: string;
        entityType: string;
        entityLocalId: string;
        operation:
          | "create"
          | "update"
          | "delete"
          | "post"
          | "void"
          | "receive"
          | "approve"
          | "convert"
          | "open"
          | "close"
          | "cash_in"
          | "cash_out"
          | "refund_draft";
        payloadJson: string;
        createdAt: string;
      }>;
    }
  ) {
    const tenantId = req.tenantId;
    const events = Array.isArray(body?.events) ? body.events : [];
    if (!events.length) return { data: { processed: 0 } };

    const supported = events.filter(
      (e) =>
        e &&
        (((e.moduleId === "shop" || e.moduleId === "pharmacy") &&
          ((e.entityType === "shop_product" && (e.operation === "create" || e.operation === "update" || e.operation === "delete")) ||
            (e.entityType === "shop_unit" && (e.operation === "create" || e.operation === "update" || e.operation === "delete")) ||
            (e.entityType === "shop_location" && (e.operation === "create" || e.operation === "update" || e.operation === "delete")) ||
            (e.entityType === "shop_category" && (e.operation === "create" || e.operation === "update" || e.operation === "delete")) ||
            (e.entityType === "file" && e.operation === "create") ||
            (e.entityType === "shop_product_packaging" && (e.operation === "create" || e.operation === "delete")) ||
            (e.entityType === "shop_product_pharmacy_profile" && e.operation === "update") ||
            (e.entityType === "shop_customer" && (e.operation === "create" || e.operation === "update" || e.operation === "delete")) ||
            (e.entityType === "shop_supplier" && (e.operation === "create" || e.operation === "update" || e.operation === "delete")) ||
            (e.entityType === "shop_payment_method" && (e.operation === "create" || e.operation === "update" || e.operation === "delete")) ||
            (e.entityType === "shop_settings" && e.operation === "update") ||
            (e.entityType === "shop_cash_session" && (e.operation === "open" || e.operation === "close")) ||
            (e.entityType === "shop_cash_session_event" && (e.operation === "cash_in" || e.operation === "cash_out")) ||
            (e.entityType === "shop_stock_movement" && e.operation === "create") ||
            (e.entityType === "shop_invoice" && (e.operation === "create" || e.operation === "update" || e.operation === "post" || e.operation === "void" || e.operation === "refund_draft")) ||
            (e.entityType === "shop_invoice_payment" && e.operation === "create") ||
            (e.entityType === "shop_purchase_order" && (e.operation === "create" || e.operation === "update" || e.operation === "approve" || e.operation === "convert")) ||
            (e.entityType === "shop_purchase_invoice" &&
              (e.operation === "create" || e.operation === "update" || e.operation === "receive" || e.operation === "post" || e.operation === "void" || e.operation === "refund_draft")) ||
            (e.entityType === "shop_purchase_invoice_payment" && e.operation === "create"))) ||
          (e.moduleId === "tenant" &&
            ((e.entityType === "tenant_membership" && e.operation === "update") ||
              (e.entityType === "tenant_invite" && e.operation === "create") ||
              (e.entityType === "tenant_module_request" && e.operation === "create") ||
              (e.entityType === "tenant_info" && e.operation === "update") ||
              (e.entityType === "file" && e.operation === "create"))))
    );
    if (!supported.length) return { data: { processed: 0 } };

    const processedIds: string[] = [];
    const results: Array<{
      entityType: string;
      eventId: string;
      entityLocalId: string;
      operation: string;
      ok: boolean;
      inviteUrl?: string | null;
      errorKey?: string;
      errorDetails?: string;
    }> = [];

    const pushOk = (e: { id: string; entityType: string; entityLocalId: string; operation: string }, extra?: { inviteUrl?: string | null }) => {
      results.push({ entityType: e.entityType, eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: true, ...(extra ?? {}) });
    };
    const pushErr = (e: { id: string; entityType: string; entityLocalId: string; operation: string }, errorKey: string, errorDetails?: string) => {
      results.push({ entityType: e.entityType, eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: false, errorKey, ...(errorDetails ? { errorDetails } : {}) });
    };

    await this.prisma.$transaction(async (tx) => {
      for (const e of supported) {
        let payload: unknown = null;
        try {
          payload = JSON.parse(e.payloadJson);
        } catch {
          payload = null;
        }
        const shopModuleId = e.moduleId === "pharmacy" ? "pharmacy" : "shop";

        if (e.entityType === "file" && e.operation === "create") {
          const p = payload as { id?: string; purpose?: string; contentType?: string; originalName?: string; sizeBytes?: number; base64?: string };
          const id = (p.id ?? e.entityLocalId).trim();
          const purpose = (p.purpose ?? "").trim();
          const contentType = (p.contentType ?? "").trim() || "application/octet-stream";
          const originalName = (p.originalName ?? "upload").trim() || "upload";
          const base64 = typeof p.base64 === "string" ? p.base64 : "";
          if (!id || !base64) {
            results.push({ entityType: "file", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: false, errorKey: "errors.validationError" });
            processedIds.push(e.id);
            continue;
          }
          if (purpose !== "tenant_logo" && purpose !== "shop_product_image") {
            results.push({ entityType: "file", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: false, errorKey: "errors.validationError" });
            processedIds.push(e.id);
            continue;
          }
          if (!contentType.startsWith("image/")) {
            results.push({ entityType: "file", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: false, errorKey: "errors.validationError" });
            processedIds.push(e.id);
            continue;
          }
          const ext = extFromContentType(contentType);
          if (!ext) {
            results.push({ entityType: "file", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: false, errorKey: "errors.validationError" });
            processedIds.push(e.id);
            continue;
          }
          const bytes = Buffer.from(base64, "base64");
          if (bytes.length <= 0 || bytes.length > MAX_FILE_BYTES) {
            results.push({ entityType: "file", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: false, errorKey: "errors.validationError" });
            processedIds.push(e.id);
            continue;
          }

          const storageKey = path.posix.join(tenantId, `${id}${ext}`);
          const diskPath = path.join(STORAGE_ROOT, tenantId, `${id}${ext}`);
          await fs.mkdir(path.dirname(diskPath), { recursive: true });
          await fs.writeFile(diskPath, bytes);
          await tx.file.upsert({
            where: { id },
            update: {},
            create: { id, tenantId, purpose, originalName, contentType, sizeBytes: bytes.length, storageProvider: "local", storageKey }
          });
          await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.file.create", entityType: "file", entityId: id, metadataJson: { eventId: e.id } } });
          results.push({ entityType: "file", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: true });
          processedIds.push(e.id);
          continue;
        }

        if (e.moduleId === "tenant" && e.entityType === "tenant_invite" && e.operation === "create") {
          const p = payload as { email?: string; fullName?: string; roleName?: string; moduleIds?: string[] };
          const email = typeof p.email === "string" ? p.email.toLowerCase().trim() : "";
          const fullName = typeof p.fullName === "string" && p.fullName.trim().length ? p.fullName.trim() : "Invited User";
          const roleName = typeof p.roleName === "string" && p.roleName.trim().length ? p.roleName.trim() : "Staff";
          const moduleIds = Array.isArray(p.moduleIds) ? p.moduleIds.map((x) => String(x).trim()).filter(Boolean) : [];
          if (!email.includes("@") || moduleIds.length === 0) {
            results.push({ entityType: "tenant_invite", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: false, errorKey: "errors.validationError" });
            processedIds.push(e.id);
            continue;
          }

          const role = await tx.role.findFirst({ where: { tenantId, name: roleName }, select: { id: true, name: true } });
          if (!role) {
            results.push({ entityType: "tenant_invite", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: false, errorKey: "errors.validationError" });
            processedIds.push(e.id);
            continue;
          }

          const tenantEnabled = await tx.tenantEnabledModule.findMany({ where: { tenantId, status: "enabled" }, select: { moduleId: true } });
          const tenantEnabledIds = new Set(tenantEnabled.map((m) => m.moduleId));
          if (moduleIds.some((m) => !tenantEnabledIds.has(m))) {
            results.push({ entityType: "tenant_invite", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: false, errorKey: "errors.validationError" });
            processedIds.push(e.id);
            continue;
          }

          try {
            const existingUser = await tx.user.findUnique({ where: { email }, select: { id: true } });
            const userId =
              existingUser?.id ??
              (
                await tx.user.create({
                  data: { email, fullName, passwordHash: await argon2.hash(crypto.randomBytes(32).toString("hex")) },
                  select: { id: true }
                })
              ).id;

            const membershipId = (
              await tx.membership.create({
                data: { tenantId, userId, roleId: role.id, status: "invited" },
                select: { id: true }
              })
            ).id;

            if (role.name !== "Owner") {
              await tx.membershipEnabledModule.createMany({ data: moduleIds.map((moduleId) => ({ tenantId, membershipId, moduleId })), skipDuplicates: true });
            }

            const token = crypto.randomBytes(32).toString("hex");
            const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
            const expiresAt = addDays(new Date(), 7);
            await tx.passwordResetToken.create({ data: { userId, tenantId, tokenHash, expiresAt } });

            await tx.auditLog.createMany({
              data: [
                { tenantId, actorUserId: req.user.id, action: "offline.tenant.invite.user", entityType: "user", entityId: userId, metadataJson: { eventId: e.id } },
                { tenantId, actorUserId: req.user.id, action: "offline.tenant.invite.membership", entityType: "membership", entityId: membershipId, metadataJson: { eventId: e.id } }
              ]
            });

            const publicWebBaseUrl = resolvePublicWebBaseUrl(req.headers as Record<string, unknown> | undefined);
            const inviteUrl = `${publicWebBaseUrl}/invite?token=${token}`;
            results.push({ entityType: "tenant_invite", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: true, inviteUrl });
            processedIds.push(e.id);
            continue;
          } catch (err: unknown) {
            if (typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002") {
              results.push({ entityType: "tenant_invite", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: false, errorKey: "errors.conflict" });
              processedIds.push(e.id);
              continue;
            }
            results.push({ entityType: "tenant_invite", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: false, errorKey: "errors.internal" });
            processedIds.push(e.id);
            continue;
          }
        }

        if (e.moduleId === "tenant" && e.entityType === "tenant_module_request" && e.operation === "create") {
          const p = payload as { moduleId?: string };
          const moduleId = typeof p.moduleId === "string" ? p.moduleId.trim() : e.entityLocalId.trim();
          if (!moduleId) {
            results.push({ entityType: "tenant_module_request", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: false, errorKey: "errors.validationError" });
            processedIds.push(e.id);
            continue;
          }

          const mod = await tx.moduleCatalog.findUnique({ where: { id: moduleId }, select: { id: true, isActive: true } });
          if (!mod || !mod.isActive) {
            results.push({ entityType: "tenant_module_request", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: false, errorKey: "errors.validationError" });
            processedIds.push(e.id);
            continue;
          }

          const subscription = await tx.subscription.findUnique({ where: { tenantId }, select: { id: true } });
          if (!subscription) {
            results.push({ entityType: "tenant_module_request", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: false, errorKey: "errors.validationError" });
            processedIds.push(e.id);
            continue;
          }

          await tx.subscriptionItem.upsert({
            where: { tenantId_subscriptionId_moduleId: { tenantId, subscriptionId: subscription.id, moduleId } },
            update: { status: "requested", endedAt: null },
            create: { tenantId, subscriptionId: subscription.id, moduleId, status: "requested" }
          });

          await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.module.request", entityType: "module", entityId: moduleId, metadataJson: { eventId: e.id } } });
          results.push({ entityType: "tenant_module_request", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: true });
          processedIds.push(e.id);
          continue;
        }

        if (e.moduleId === "tenant" && e.entityType === "tenant_info" && e.operation === "update") {
          const p = payload as {
            legalName?: string;
            displayName?: string;
            defaultLocale?: string;
            address?: string | null;
            phone?: string | null;
            email?: string | null;
            logoFileId?: string | null;
          };
          const tenantUpdates: Record<string, unknown> = {};
          if (p.legalName !== undefined) tenantUpdates.legalName = p.legalName ? String(p.legalName).trim() : "";
          if (p.displayName !== undefined) tenantUpdates.displayName = p.displayName ? String(p.displayName).trim() : "";
          if (p.defaultLocale !== undefined) tenantUpdates.defaultLocale = p.defaultLocale ? String(p.defaultLocale).trim() : "";
          if (Object.keys(tenantUpdates).length) {
            await tx.tenant.update({ where: { id: tenantId }, data: tenantUpdates });
          }

          const brandingUpdates: Record<string, unknown> = {};
          if (p.address !== undefined) brandingUpdates.address = p.address === null ? null : p.address ? String(p.address).trim() : null;
          if (p.phone !== undefined) brandingUpdates.phone = p.phone === null ? null : p.phone ? String(p.phone).trim() : null;
          if (p.email !== undefined) brandingUpdates.email = p.email === null ? null : p.email ? String(p.email).trim() : null;
          if (p.logoFileId !== undefined) {
            const logoFileId = p.logoFileId === null ? null : p.logoFileId ? String(p.logoFileId).trim() : null;
            if (logoFileId) {
              const ok = await tx.file.findFirst({ where: { id: logoFileId, tenantId }, select: { id: true } });
              if (ok) brandingUpdates.logoFileId = logoFileId;
            } else {
              brandingUpdates.logoFileId = null;
            }
          }

          if (Object.keys(brandingUpdates).length) {
            await tx.tenantBranding.upsert({
              where: { tenantId },
              update: brandingUpdates,
              create: { tenantId, ...brandingUpdates }
            });
          }

          await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.tenant.update", entityType: "tenant", entityId: tenantId, metadataJson: { eventId: e.id } } });
          results.push({ entityType: "tenant_info", eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: true });
          processedIds.push(e.id);
          continue;
        }

        if (e.moduleId === "tenant" && e.entityType === "tenant_membership" && e.operation === "update") {
          const p = payload as { id?: string; roleName?: string; status?: "active" | "invited" | "suspended"; moduleIds?: string[] };
          const membershipId = (p.id ?? e.entityLocalId).trim();
          if (!membershipId) {
            pushErr(e, "errors.validationError", "membershipId missing");
            processedIds.push(e.id);
            continue;
          }

          const updates: Record<string, unknown> = {};
          if (p.status) updates.status = p.status;
          if (p.roleName) {
            const role = await tx.role.findFirst({ where: { tenantId, name: p.roleName }, select: { id: true, name: true } });
            if (role) updates.roleId = role.id;
          }

          const membership = await tx.membership.findFirst({ where: { id: membershipId, tenantId }, select: { id: true } });
          if (!membership) {
            pushErr(e, "errors.notFound", "membership not found");
            processedIds.push(e.id);
            continue;
          }

          if (Object.keys(updates).length) await tx.membership.update({ where: { id: membershipId }, data: updates });

          if (p.moduleIds !== undefined) {
            const requested = (p.moduleIds ?? []).map((x) => x.trim()).filter(Boolean);
            if (requested.length > 0) {
              const tenantEnabled = await tx.tenantEnabledModule.findMany({ where: { tenantId, status: "enabled" }, select: { moduleId: true } });
              const enabledSet = new Set(tenantEnabled.map((m) => m.moduleId));
              if (requested.every((m) => enabledSet.has(m))) {
                const current = await tx.membership.findFirst({ where: { id: membershipId, tenantId }, select: { role: { select: { name: true } } } });
                if (current && current.role.name !== "Owner") {
                  await tx.membershipEnabledModule.deleteMany({ where: { tenantId, membershipId } });
                  await tx.membershipEnabledModule.createMany({ data: requested.map((moduleId) => ({ tenantId, membershipId, moduleId })), skipDuplicates: true });
                }
              }
            }
          }

          await tx.auditLog.create({
            data: { tenantId, actorUserId: req.user.id, action: "offline.tenant.membership.update", entityType: "membership", entityId: membershipId, metadataJson: { eventId: e.id } }
          });
          pushOk(e);
          processedIds.push(e.id);
          continue;
        }

        if (e.entityType === "shop_product") {
          const p = payload as {
            id?: string;
            name?: string;
            sku?: string | null;
            description?: string | null;
            unitId?: string | null;
            categoryId?: string | null;
            imageFileId?: string | null;
            sellPrice?: string;
            costPrice?: string | null;
            parentProductId?: string | null;
            variantLabel?: string | null;
            variantAttributes?: unknown;
            barcodes?: string[];
          };
          const id = (p.id ?? e.entityLocalId).trim();
          const name = (p.name ?? "").trim();
          const sku = p.sku !== undefined ? (p.sku ? p.sku.trim() : null) : null;
          const sellPrice = typeof p.sellPrice === "string" ? p.sellPrice : null;
          const description = p.description !== undefined ? (p.description === null ? null : String(p.description)) : null;
          const unitId = p.unitId !== undefined ? (p.unitId ? String(p.unitId) : null) : null;
          const categoryId = p.categoryId !== undefined ? (p.categoryId ? String(p.categoryId) : null) : null;
          const imageFileId = p.imageFileId !== undefined ? (p.imageFileId ? String(p.imageFileId) : null) : null;
          const costPrice = p.costPrice !== undefined ? (p.costPrice ? String(p.costPrice) : null) : null;
          const parentProductId = p.parentProductId !== undefined ? (p.parentProductId ? String(p.parentProductId) : null) : null;
          const variantLabel = p.variantLabel !== undefined ? (p.variantLabel ? String(p.variantLabel) : null) : null;
          const variantAttributesJson = p.variantAttributes !== undefined ? (p.variantAttributes === null ? Prisma.JsonNull : (p.variantAttributes as Prisma.InputJsonValue)) : Prisma.DbNull;
          const barcodes = Array.isArray(p.barcodes) ? p.barcodes.map((x) => String(x).trim()).filter(Boolean) : [];

          if (!id) {
            pushErr(e, "errors.validationError", "product id missing");
            processedIds.push(e.id);
            continue;
          }
          if (e.operation !== "delete" && (name.length < 2 || !sellPrice)) {
            pushErr(e, "errors.validationError", "product payload invalid");
            processedIds.push(e.id);
            continue;
          }

          if (e.operation === "delete") {
            await tx.shopProduct.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } }).catch(() => null);
          } else {
            await tx.shopProduct.upsert({
              where: { id },
              update: {
                name,
                sku,
                description,
                unitId,
                categoryId,
                imageFileId,
                sellPrice: new Prisma.Decimal(sellPrice!),
                costPrice: costPrice ? new Prisma.Decimal(costPrice) : null,
                parentProductId,
                variantLabel,
                variantAttributesJson
              },
              create: {
                id,
                tenantId,
                moduleId: shopModuleId,
                name,
                sku,
                description,
                unitId,
                categoryId,
                imageFileId,
                sellPrice: new Prisma.Decimal(sellPrice!),
                costPrice: costPrice ? new Prisma.Decimal(costPrice) : null,
                parentProductId,
                variantLabel,
                variantAttributesJson
              }
            });

            await tx.shopProductBarcode.deleteMany({ where: { tenantId, productId: id } });
            if (barcodes.length) {
              await tx.shopProductBarcode.createMany({ data: barcodes.map((code) => ({ tenantId, productId: id, code })), skipDuplicates: true });
            }
          }

          await tx.auditLog.create({
            data: {
              tenantId,
              actorUserId: req.user.id,
              action: e.operation === "create" ? "offline.shop.product.create" : e.operation === "update" ? "offline.shop.product.update" : "offline.shop.product.delete",
              entityType: "shopProduct",
              entityId: id,
              metadataJson: { eventId: e.id }
            }
          });

          pushOk(e);
          processedIds.push(e.id);
          continue;
        }

        if (e.entityType === "shop_unit") {
          const p = payload as { id?: string; name?: string; symbol?: string | null; isActive?: boolean };
          const id = (p.id ?? e.entityLocalId).trim();
          if (!id) {
            pushErr(e, "errors.validationError", "unit id missing");
            processedIds.push(e.id);
            continue;
          }
          if (e.operation === "delete") {
            await tx.shopUnit.update({ where: { id }, data: { isActive: false } }).catch(() => null);
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.unit.delete", entityType: "shopUnit", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }
          const name = (p.name ?? "").trim();
          if (!name) {
            pushErr(e, "errors.validationError", "unit name missing");
            processedIds.push(e.id);
            continue;
          }
          const symbol = p.symbol === undefined ? null : p.symbol === null ? null : String(p.symbol);
          const isActive = p.isActive !== undefined ? Boolean(p.isActive) : true;
          await tx.shopUnit.upsert({ where: { id }, update: { name, symbol, isActive }, create: { id, tenantId, moduleId: shopModuleId, name, symbol, isActive } });
          await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: e.operation === "create" ? "offline.shop.unit.create" : "offline.shop.unit.update", entityType: "shopUnit", entityId: id, metadataJson: { eventId: e.id } } });
          pushOk(e);
          processedIds.push(e.id);
          continue;
        }

        if (e.entityType === "shop_location") {
          const p = payload as { id?: string; name?: string; isActive?: boolean };
          const id = (p.id ?? e.entityLocalId).trim();
          if (!id) {
            pushErr(e, "errors.validationError", "location id missing");
            processedIds.push(e.id);
            continue;
          }
          if (e.operation === "delete") {
            await tx.shopLocation.update({ where: { id }, data: { isActive: false } }).catch(() => null);
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.location.delete", entityType: "shopLocation", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }
          const name = (p.name ?? "").trim();
          if (!name) {
            pushErr(e, "errors.validationError", "location name missing");
            processedIds.push(e.id);
            continue;
          }
          const isActive = p.isActive !== undefined ? Boolean(p.isActive) : true;
          await tx.shopLocation.upsert({ where: { id }, update: { name, isActive }, create: { id, tenantId, moduleId: shopModuleId, name, isActive } });
          await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: e.operation === "create" ? "offline.shop.location.create" : "offline.shop.location.update", entityType: "shopLocation", entityId: id, metadataJson: { eventId: e.id } } });
          pushOk(e);
          processedIds.push(e.id);
          continue;
        }

        if (e.entityType === "shop_category") {
          const p = payload as { id?: string; name?: string; parentId?: string | null; isActive?: boolean };
          const id = (p.id ?? e.entityLocalId).trim();
          if (!id) {
            pushErr(e, "errors.validationError", "category id missing");
            processedIds.push(e.id);
            continue;
          }
          if (e.operation === "delete") {
            await tx.shopCategory.update({ where: { id }, data: { isActive: false } }).catch(() => null);
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.category.delete", entityType: "shopCategory", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }
          const name = (p.name ?? "").trim();
          if (!name) {
            pushErr(e, "errors.validationError", "category name missing");
            processedIds.push(e.id);
            continue;
          }
          const parentId = p.parentId === undefined ? null : p.parentId === null ? null : String(p.parentId);
          const isActive = p.isActive !== undefined ? Boolean(p.isActive) : true;
          await tx.shopCategory.upsert({ where: { id }, update: { name, parentId, isActive }, create: { id, tenantId, moduleId: shopModuleId, name, parentId, isActive } });
          await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: e.operation === "create" ? "offline.shop.category.create" : "offline.shop.category.update", entityType: "shopCategory", entityId: id, metadataJson: { eventId: e.id } } });
          pushOk(e);
          processedIds.push(e.id);
          continue;
        }

        if (e.entityType === "shop_product_packaging") {
          const p = payload as { id?: string; productId?: string; label?: string; multiplier?: string; barcode?: string | null };
          const id = (p.id ?? e.entityLocalId).trim();
          const productId = (p.productId ?? "").trim();
          const label = (p.label ?? "").trim();
          const multiplier = typeof p.multiplier === "string" ? p.multiplier : null;
          const barcode = p.barcode !== undefined ? (p.barcode ? String(p.barcode).trim() : null) : null;
          if (!id || !productId) {
            pushErr(e, "errors.validationError", "packaging id/productId missing");
            processedIds.push(e.id);
            continue;
          }

          if (e.operation === "delete") {
            await tx.shopProductPackaging.delete({ where: { id } }).catch(() => null);
          } else {
            if (!label || !multiplier) {
              pushErr(e, "errors.validationError", "packaging label/multiplier missing");
              processedIds.push(e.id);
              continue;
            }
            await tx.shopProductPackaging.upsert({
              where: { id },
              update: { label, multiplier: new Prisma.Decimal(multiplier), barcode },
              create: { id, tenantId, productId, label, multiplier: new Prisma.Decimal(multiplier), barcode }
            });
          }

          await tx.auditLog.create({
            data: { tenantId, actorUserId: req.user.id, action: e.operation === "create" ? "offline.shop.packaging.create" : "offline.shop.packaging.delete", entityType: "shopProductPackaging", entityId: id, metadataJson: { eventId: e.id } }
          });
          pushOk(e);
          processedIds.push(e.id);
          continue;
        }

        if (e.entityType === "shop_product_pharmacy_profile") {
          const p = payload as { id?: string; productId?: string; trackLots?: boolean; requiresPrescription?: boolean; isControlled?: boolean; form?: string | null; strength?: string | null; body?: unknown };
          const productId = (p.productId ?? p.id ?? e.entityLocalId).trim();
          if (!productId) {
            pushErr(e, "errors.validationError", "productId missing");
            processedIds.push(e.id);
            continue;
          }
          const src = (p.body ?? p) as Record<string, unknown>;
          const trackLots = Boolean(src.trackLots ?? true);
          const requiresPrescription = Boolean(src.requiresPrescription ?? false);
          const isControlled = Boolean(src.isControlled ?? false);
          const form = src.form === null ? null : typeof src.form === "string" ? src.form : null;
          const strength = src.strength === null ? null : typeof src.strength === "string" ? src.strength : null;

          await tx.shopProductPharmacyProfile.upsert({
            where: { productId },
            update: { trackLots, requiresPrescription, isControlled, form, strength },
            create: { tenantId, productId, trackLots, requiresPrescription, isControlled, form, strength }
          });

          await tx.auditLog.create({
            data: { tenantId, actorUserId: req.user.id, action: "offline.shop.pharmacyProfile.update", entityType: "shopProductPharmacyProfile", entityId: productId, metadataJson: { eventId: e.id } }
          });

          pushOk(e);
          processedIds.push(e.id);
          continue;
        }

        if (e.entityType === "shop_customer") {
          const p = payload as { id?: string; name?: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null };
          const id = (p.id ?? e.entityLocalId).trim();
          if (!id) {
            pushErr(e, "errors.validationError", "customer id missing");
            processedIds.push(e.id);
            continue;
          }

          if (e.operation === "delete") {
            await tx.shopCustomer.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } }).catch(() => null);
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.customer.delete", entityType: "shopCustomer", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }

          const name = (p.name ?? "").trim();
          if (name.length < 2) {
            pushErr(e, "errors.validationError", "customer name invalid");
            processedIds.push(e.id);
            continue;
          }
          const phone = p.phone !== undefined ? (p.phone ? String(p.phone).trim() : null) : null;
          const email = p.email !== undefined ? (p.email ? String(p.email).trim() : null) : null;
          const address = p.address !== undefined ? (p.address ? String(p.address).trim() : null) : null;
          const notes = p.notes !== undefined ? (p.notes ? String(p.notes).trim() : null) : null;

          await tx.shopCustomer.upsert({
            where: { id },
            update: { name, phone, email, address, notes },
            create: { id, tenantId, moduleId: shopModuleId, name, phone, email, address, notes }
          });

          await tx.auditLog.create({
            data: { tenantId, actorUserId: req.user.id, action: e.operation === "create" ? "offline.shop.customer.create" : "offline.shop.customer.update", entityType: "shopCustomer", entityId: id, metadataJson: { eventId: e.id } }
          });
          pushOk(e);
          processedIds.push(e.id);
          continue;
        }

        if (e.entityType === "shop_supplier") {
          const p = payload as { id?: string; name?: string; phone?: string | null; email?: string | null; address?: string | null; notes?: string | null };
          const id = (p.id ?? e.entityLocalId).trim();
          if (!id) {
            pushErr(e, "errors.validationError", "supplier id missing");
            processedIds.push(e.id);
            continue;
          }

          if (e.operation === "delete") {
            await tx.shopSupplier.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } }).catch(() => null);
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.supplier.delete", entityType: "shopSupplier", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }

          const name = (p.name ?? "").trim();
          if (name.length < 2) {
            pushErr(e, "errors.validationError", "supplier name invalid");
            processedIds.push(e.id);
            continue;
          }
          const phone = p.phone !== undefined ? (p.phone ? String(p.phone).trim() : null) : null;
          const email = p.email !== undefined ? (p.email ? String(p.email).trim() : null) : null;
          const address = p.address !== undefined ? (p.address ? String(p.address).trim() : null) : null;
          const notes = p.notes !== undefined ? (p.notes ? String(p.notes).trim() : null) : null;

          await tx.shopSupplier.upsert({
            where: { id },
            update: { name, phone, email, address, notes },
            create: { id, tenantId, moduleId: shopModuleId, name, phone, email, address, notes }
          });

          await tx.auditLog.create({
            data: { tenantId, actorUserId: req.user.id, action: e.operation === "create" ? "offline.shop.supplier.create" : "offline.shop.supplier.update", entityType: "shopSupplier", entityId: id, metadataJson: { eventId: e.id } }
          });
          pushOk(e);
          processedIds.push(e.id);
          continue;
        }

        if (e.entityType === "shop_payment_method") {
          const p = payload as { id?: string; name?: string; kind?: string; isActive?: boolean };
          const id = (p.id ?? e.entityLocalId).trim();
          if (!id) {
            pushErr(e, "errors.validationError", "payment method id missing");
            processedIds.push(e.id);
            continue;
          }
          if (e.operation === "delete") {
            await tx.shopPaymentMethod.update({ where: { id }, data: { isActive: false } }).catch(() => null);
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.paymentMethod.delete", entityType: "shopPaymentMethod", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }
          const name = (p.name ?? "").trim();
          const kindRaw = (p.kind ?? "cash").trim().toLowerCase();
          const kind: ShopPaymentMethodKind = (["cash", "card", "bank", "mobile", "other"].includes(kindRaw) ? kindRaw : "cash") as ShopPaymentMethodKind;
          if (!name) {
            pushErr(e, "errors.validationError", "payment method name missing");
            processedIds.push(e.id);
            continue;
          }
          const isActive = p.isActive !== undefined ? Boolean(p.isActive) : true;
          await tx.shopPaymentMethod.upsert({
            where: { id },
            update: { name, kind, isActive },
            create: { id, tenantId, moduleId: shopModuleId, name, kind, isActive }
          });
          await tx.auditLog.create({
            data: { tenantId, actorUserId: req.user.id, action: e.operation === "create" ? "offline.shop.paymentMethod.create" : "offline.shop.paymentMethod.update", entityType: "shopPaymentMethod", entityId: id, metadataJson: { eventId: e.id } }
          });
          pushOk(e);
          processedIds.push(e.id);
          continue;
        }

        if (e.entityType === "shop_settings") {
          const p = payload as {
            sellCurrencyCode?: string;
            buyCurrencyCode?: string;
            taxEnabled?: boolean;
            taxRate?: string;
            cashRoundingIncrement?: string;
            pharmacyReceivingRequireLotNumber?: boolean;
            pharmacyReceivingRequireExpiryDate?: boolean;
          };
          const sellCurrencyCode = typeof p.sellCurrencyCode === "string" ? p.sellCurrencyCode : undefined;
          const buyCurrencyCode = typeof p.buyCurrencyCode === "string" ? p.buyCurrencyCode : undefined;
          const taxEnabled = p.taxEnabled !== undefined ? Boolean(p.taxEnabled) : undefined;
          const taxRate = typeof p.taxRate === "string" ? p.taxRate : undefined;
          const cashRoundingIncrement = typeof p.cashRoundingIncrement === "string" ? p.cashRoundingIncrement : undefined;
          const pharmacyReceivingRequireLotNumber = p.pharmacyReceivingRequireLotNumber !== undefined ? Boolean(p.pharmacyReceivingRequireLotNumber) : undefined;
          const pharmacyReceivingRequireExpiryDate = p.pharmacyReceivingRequireExpiryDate !== undefined ? Boolean(p.pharmacyReceivingRequireExpiryDate) : undefined;
          await tx.shopSettings.upsert({
            where: { tenantId },
            update: {
              ...(sellCurrencyCode ? { sellCurrencyCode } : {}),
              ...(buyCurrencyCode ? { buyCurrencyCode } : {}),
              ...(taxEnabled !== undefined ? { taxEnabled } : {}),
              ...(taxRate !== undefined ? { taxRate: new Prisma.Decimal(taxRate) } : {}),
              ...(cashRoundingIncrement !== undefined ? { cashRoundingIncrement: new Prisma.Decimal(cashRoundingIncrement) } : {}),
              ...(pharmacyReceivingRequireLotNumber !== undefined ? { pharmacyReceivingRequireLotNumber } : {}),
              ...(pharmacyReceivingRequireExpiryDate !== undefined ? { pharmacyReceivingRequireExpiryDate } : {})
            },
            create: {
              tenantId,
              sellCurrencyCode: sellCurrencyCode ?? "AFN",
              buyCurrencyCode: buyCurrencyCode ?? "AFN",
              taxEnabled: taxEnabled ?? false,
              taxRate: taxRate ? new Prisma.Decimal(taxRate) : new Prisma.Decimal(0),
              cashRoundingIncrement: cashRoundingIncrement ? new Prisma.Decimal(cashRoundingIncrement) : new Prisma.Decimal(0),
              pharmacyReceivingRequireLotNumber: pharmacyReceivingRequireLotNumber ?? true,
              pharmacyReceivingRequireExpiryDate: pharmacyReceivingRequireExpiryDate ?? true
            }
          });
          await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.settings.update", entityType: "shopSettings", entityId: tenantId, metadataJson: { eventId: e.id } } });
          pushOk(e);
          processedIds.push(e.id);
          continue;
        }

        if (e.entityType === "shop_cash_session") {
          const p = payload as { id?: string; locationId?: string; openingCash?: string; countedCash?: string };
          const id = (p.id ?? e.entityLocalId).trim();
          if (!id) {
            pushErr(e, "errors.validationError", "cash session id missing");
            processedIds.push(e.id);
            continue;
          }
          if (e.operation === "open") {
            const locationId = (p.locationId ?? "").trim();
            const openingCash = p.openingCash ? new Prisma.Decimal(p.openingCash) : new Prisma.Decimal(0);
            if (!locationId) {
              pushErr(e, "errors.validationError", "cash session locationId missing");
              processedIds.push(e.id);
              continue;
            }
            const existing = await tx.shopCashSession.findUnique({ where: { id }, select: { id: true } });
            if (existing) {
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }
            await tx.shopCashSession.create({
              data: {
                id,
                tenantId,
                moduleId: shopModuleId,
                locationId,
                status: "open",
                openingCash,
                expectedCash: openingCash,
                countedCash: new Prisma.Decimal(0),
                discrepancy: new Prisma.Decimal(0),
                openedByUserId: req.user.id
              }
            });
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.cashSession.open", entityType: "shopCashSession", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }
          if (e.operation === "close") {
            const countedCash = p.countedCash ? new Prisma.Decimal(p.countedCash) : new Prisma.Decimal(0);
            const session = await tx.shopCashSession.findUnique({ where: { id }, select: { expectedCash: true } });
            if (!session) {
              pushErr(e, "errors.notFound", "cash session not found");
              processedIds.push(e.id);
              continue;
            }
            const discrepancy = countedCash.sub(session.expectedCash).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
            await tx.shopCashSession.update({
              where: { id },
              data: { status: "closed", closedAt: new Date(), countedCash, discrepancy, closedByUserId: req.user.id }
            });
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.cashSession.close", entityType: "shopCashSession", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }
        }

        if (e.entityType === "shop_cash_session_event") {
          const p = payload as { id?: string; sessionId?: string; amount?: string; note?: string | null };
          const id = (p.id ?? e.entityLocalId).trim();
          const sessionId = (p.sessionId ?? "").trim();
          const amount = p.amount ? new Prisma.Decimal(p.amount) : new Prisma.Decimal(0);
          const note = p.note !== undefined ? (p.note ? String(p.note).trim() : null) : null;
          if (!id || !sessionId) {
            pushErr(e, "errors.validationError", "cash session event id/sessionId missing");
            processedIds.push(e.id);
            continue;
          }
          const existing = await tx.shopCashSessionEvent.findUnique({ where: { id }, select: { id: true } });
          if (existing) {
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }
          const type = e.operation === "cash_in" ? "cash_in" : e.operation === "cash_out" ? "cash_out" : null;
          if (!type || amount.lte(0)) {
            pushErr(e, "errors.validationError", "cash session event type/amount invalid");
            processedIds.push(e.id);
            continue;
          }
          const session = await tx.shopCashSession.findUnique({ where: { id: sessionId }, select: { expectedCash: true } });
          if (!session) {
            pushErr(e, "errors.notFound", "cash session not found");
            processedIds.push(e.id);
            continue;
          }
          const delta = type === "cash_in" ? amount : amount.mul(new Prisma.Decimal(-1));
          const nextExpected = session.expectedCash.add(delta).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          await tx.shopCashSessionEvent.create({ data: { id, tenantId, sessionId, type, amount, note, actorUserId: req.user.id } });
          await tx.shopCashSession.update({ where: { id: sessionId }, data: { expectedCash: nextExpected } });
          await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: type === "cash_in" ? "offline.shop.cashSession.cashIn" : "offline.shop.cashSession.cashOut", entityType: "shopCashSessionEvent", entityId: id, metadataJson: { eventId: e.id } } });
          pushOk(e);
          processedIds.push(e.id);
          continue;
        }

        if (e.entityType === "shop_stock_movement") {
          const p = payload as {
            type?: string;
            productId?: string;
            locationId?: string;
            qty?: string;
            mode?: "set" | "delta";
            note?: string | null;
            fromLocationId?: string;
            toLocationId?: string;
            lots?: Array<{ lotNumber?: string; expiryDate?: string | null; qty?: string }>;
          };
          const type = (p.type ?? "").trim();
          const note = p.note !== undefined ? (p.note ? String(p.note).trim() : null) : null;

          if (type === "receive") {
            const qty = new Prisma.Decimal(p.qty ?? "0");
            if (qty.lte(0)) {
              pushErr(e, "errors.validationError", "qty must be > 0");
              processedIds.push(e.id);
              continue;
            }
            const locationId = (p.locationId ?? "").trim();
            const productId = (p.productId ?? "").trim();
            if (!locationId || !productId) {
              pushErr(e, "errors.validationError", "locationId/productId missing");
              processedIds.push(e.id);
              continue;
            }
            const existing = await tx.shopStockMovement.findUnique({ where: { id: e.id }, select: { id: true } });
            if (existing) {
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }
            const product = await tx.shopProduct.findFirst({ where: { id: productId, tenantId, moduleId: shopModuleId, deletedAt: null }, select: { costPrice: true } });
            if (!product) {
              pushErr(e, "errors.notFound", "product not found");
              processedIds.push(e.id);
              continue;
            }
            const item = await tx.shopStockItem.upsert({
              where: { tenantId_productId_locationId: { tenantId, productId, locationId } },
              update: {},
              create: { tenantId, productId, locationId, onHandQty: new Prisma.Decimal(0), avgCost: new Prisma.Decimal(0) },
              select: { id: true, onHandQty: true, avgCost: true }
            });
            const before = item.onHandQty;
            const beforeAvgCost = item.avgCost;
            const after = before.add(qty);
            let nextAvgCost = beforeAvgCost;
            if (after.lte(0)) nextAvgCost = new Prisma.Decimal(0);
            else {
              const unitCost = product.costPrice ?? new Prisma.Decimal(0);
              if (before.lte(0) || beforeAvgCost.lte(0)) nextAvgCost = unitCost;
              else nextAvgCost = before.mul(beforeAvgCost).add(qty.mul(unitCost)).div(after);
              nextAvgCost = nextAvgCost.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
            }
            const created = await tx.shopStockMovement
              .create({ data: { id: e.id, tenantId, type: "receive", productId, locationId, deltaQty: qty, beforeQty: before, afterQty: after, note, actorUserId: req.user.id } })
              .then(() => true)
              .catch((err: unknown) => {
                if (typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002") return false;
                throw err;
              });
            if (!created) {
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }
            await tx.shopStockItem.update({ where: { id: item.id }, data: { onHandQty: after, avgCost: nextAvgCost } });
            if (shopModuleId === "pharmacy") {
              const farExpiry = new Date("9999-12-31T00:00:00.000Z");
              await tx.shopStockLot.upsert({
                where: { tenantId_productId_locationId_lotNumber_expiryDate: { tenantId, productId, locationId, lotNumber: "ADJUST", expiryDate: farExpiry } },
                update: { onHandQty: { increment: qty } },
                create: { id: crypto.randomUUID(), tenantId, productId, locationId, lotNumber: "ADJUST", expiryDate: farExpiry, onHandQty: qty }
              });
            }
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.stock.receive", entityType: "shopStockMovement", entityId: e.id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }

          if (type === "adjust") {
            const mode = p.mode === "set" ? "set" : "delta";
            const qty = new Prisma.Decimal(p.qty ?? "0");
            if (mode === "delta" && qty.eq(0)) {
              pushErr(e, "errors.validationError", "qty must be non-zero");
              processedIds.push(e.id);
              continue;
            }
            if (mode === "set" && qty.lt(0)) {
              pushErr(e, "errors.validationError", "qty must be >= 0");
              processedIds.push(e.id);
              continue;
            }
            const locationId = (p.locationId ?? "").trim();
            const productId = (p.productId ?? "").trim();
            if (!locationId || !productId) {
              pushErr(e, "errors.validationError", "locationId/productId missing");
              processedIds.push(e.id);
              continue;
            }
            const existing = await tx.shopStockMovement.findUnique({ where: { id: e.id }, select: { id: true } });
            if (existing) {
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }
            const product = await tx.shopProduct.findFirst({ where: { id: productId, tenantId, moduleId: shopModuleId, deletedAt: null }, select: { costPrice: true } });
            if (!product) {
              pushErr(e, "errors.notFound", "product not found");
              processedIds.push(e.id);
              continue;
            }
            const item = await tx.shopStockItem.upsert({
              where: { tenantId_productId_locationId: { tenantId, productId, locationId } },
              update: {},
              create: { tenantId, productId, locationId, onHandQty: new Prisma.Decimal(0), avgCost: new Prisma.Decimal(0) },
              select: { id: true, onHandQty: true, avgCost: true }
            });
            const before = item.onHandQty;
            const beforeAvgCost = item.avgCost;
            const after = mode === "set" ? qty : before.add(qty);
            if (after.lt(0)) {
              pushErr(e, "errors.validationError", "insufficient stock for adjust");
              processedIds.push(e.id);
              continue;
            }
            const delta = after.sub(before);
            if (shopModuleId === "pharmacy" && !delta.eq(0)) {
              const profile = await tx.shopProductPharmacyProfile.findUnique({ where: { productId }, select: { trackLots: true } });
              const trackLots = profile?.trackLots ?? true;
              if (trackLots) {
                const farExpiry = new Date("9999-12-31T00:00:00.000Z");
                if (delta.gt(0)) {
                  await tx.shopStockLot.upsert({
                    where: { tenantId_productId_locationId_lotNumber_expiryDate: { tenantId, productId, locationId, lotNumber: "ADJUST", expiryDate: farExpiry } },
                    update: { onHandQty: { increment: delta } },
                    create: { id: crypto.randomUUID(), tenantId, productId, locationId, lotNumber: "ADJUST", expiryDate: farExpiry, onHandQty: delta }
                  });
                } else if (delta.lt(0)) {
                  const want = delta.mul(new Prisma.Decimal(-1));
                  const day0 = new Date();
                  day0.setUTCHours(0, 0, 0, 0);
                  const lots = await tx.shopStockLot.findMany({
                    where: { tenantId, productId, locationId, expiryDate: { gte: day0 }, onHandQty: { gt: new Prisma.Decimal(0) } },
                    orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }]
                  });
                  let remaining = want;
                  for (const lot of lots) {
                    if (remaining.lte(0)) break;
                    const take = Prisma.Decimal.min(remaining, lot.onHandQty);
                    if (take.lte(0)) continue;
                    await tx.shopStockLot.update({ where: { id: lot.id }, data: { onHandQty: lot.onHandQty.sub(take) } });
                    remaining = remaining.sub(take);
                  }
                  if (remaining.gt(0)) {
                    const adjustLot = await tx.shopStockLot.upsert({
                      where: { tenantId_productId_locationId_lotNumber_expiryDate: { tenantId, productId, locationId, lotNumber: "ADJUST", expiryDate: farExpiry } },
                      update: {},
                      create: { id: crypto.randomUUID(), tenantId, productId, locationId, lotNumber: "ADJUST", expiryDate: farExpiry, onHandQty: new Prisma.Decimal(0) }
                    });
                    await tx.shopStockLot.update({ where: { id: adjustLot.id }, data: { onHandQty: adjustLot.onHandQty.sub(remaining) } });
                  }
                }
              }
            }
            let nextAvgCost = beforeAvgCost;
            if (after.lte(0)) nextAvgCost = new Prisma.Decimal(0);
            else if (delta.gt(0)) {
              const productCost = product.costPrice ?? new Prisma.Decimal(0);
              const unitCost = productCost.gt(0) ? productCost : beforeAvgCost;
              if (before.lte(0) || beforeAvgCost.lte(0)) nextAvgCost = unitCost;
              else nextAvgCost = before.mul(beforeAvgCost).add(delta.mul(unitCost)).div(after);
              nextAvgCost = nextAvgCost.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
            }
            const created = await tx.shopStockMovement
              .create({ data: { id: e.id, tenantId, type: "adjust", productId, locationId, deltaQty: delta, beforeQty: before, afterQty: after, note, actorUserId: req.user.id } })
              .then(() => true)
              .catch((err: unknown) => {
                if (typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002") return false;
                throw err;
              });
            if (!created) {
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }
            await tx.shopStockItem.update({ where: { id: item.id }, data: { onHandQty: after, avgCost: nextAvgCost } });
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.stock.adjust", entityType: "shopStockMovement", entityId: e.id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }

          if (type === "transfer") {
            const qty = new Prisma.Decimal(p.qty ?? "0");
            if (qty.lte(0)) {
              pushErr(e, "errors.validationError", "qty must be > 0");
              processedIds.push(e.id);
              continue;
            }
            const fromLocationId = (p.fromLocationId ?? "").trim();
            const toLocationId = (p.toLocationId ?? "").trim();
            const productId = (p.productId ?? "").trim();
            if (!fromLocationId || !toLocationId || !productId) {
              pushErr(e, "errors.validationError", "fromLocationId/toLocationId/productId missing");
              processedIds.push(e.id);
              continue;
            }
            if (fromLocationId === toLocationId) {
              pushErr(e, "errors.validationError", "from/to location cannot be the same");
              processedIds.push(e.id);
              continue;
            }
            const outId = uuidFromString(`${e.id}:transfer_out`);
            const inId = uuidFromString(`${e.id}:transfer_in`);
            const existing = await tx.shopStockMovement.findUnique({ where: { id: outId }, select: { id: true } });
            if (existing) {
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }
            const product = await tx.shopProduct.findFirst({ where: { id: productId, tenantId, moduleId: shopModuleId, deletedAt: null }, select: { costPrice: true } });
            if (!product) {
              pushErr(e, "errors.notFound", "product not found");
              processedIds.push(e.id);
              continue;
            }
            const fromItem = await tx.shopStockItem.upsert({
              where: { tenantId_productId_locationId: { tenantId, productId, locationId: fromLocationId } },
              update: {},
              create: { tenantId, productId, locationId: fromLocationId, onHandQty: new Prisma.Decimal(0), avgCost: new Prisma.Decimal(0) },
              select: { id: true, onHandQty: true, avgCost: true }
            });
            const toItem = await tx.shopStockItem.upsert({
              where: { tenantId_productId_locationId: { tenantId, productId, locationId: toLocationId } },
              update: {},
              create: { tenantId, productId, locationId: toLocationId, onHandQty: new Prisma.Decimal(0), avgCost: new Prisma.Decimal(0) },
              select: { id: true, onHandQty: true, avgCost: true }
            });
            const fromBefore = fromItem.onHandQty;
            const fromAvgCost = fromItem.avgCost;
            const fromAfter = fromBefore.sub(qty);
            if (fromAfter.lt(0)) {
              pushErr(e, "errors.stockInsufficient", "insufficient stock");
              processedIds.push(e.id);
              continue;
            }

            if (shopModuleId === "pharmacy") {
              const profile = await tx.shopProductPharmacyProfile.findUnique({ where: { productId }, select: { trackLots: true } });
              const trackLots = profile?.trackLots ?? true;
              if (trackLots) {
                const farExpiry = new Date("9999-12-31T00:00:00.000Z");
                const lotsInput = Array.isArray(p.lots)
                  ? p.lots
                      .map((x) => ({
                        lotNumber: typeof x.lotNumber === "string" ? x.lotNumber.trim() : "",
                        expiryDate: x.expiryDate === null ? null : typeof x.expiryDate === "string" ? x.expiryDate : null,
                        qty: x.qty ? new Prisma.Decimal(String(x.qty)) : new Prisma.Decimal(0)
                      }))
                      .filter((x) => x.lotNumber && x.qty.gt(0))
                  : [];

                const allocations: Array<{ lotNumber: string; expiryDate: Date; qty: Prisma.Decimal }> = [];
                if (lotsInput.length) {
                  const totalLots = lotsInput.reduce((sum, x) => sum.add(x.qty), new Prisma.Decimal(0));
                  if (!totalLots.eq(qty)) {
                    pushErr(e, "errors.validationError", "lots quantities do not match qty");
                    processedIds.push(e.id);
                    continue;
                  }
                  for (const x of lotsInput) {
                    const exp = x.expiryDate ? new Date(x.expiryDate) : farExpiry;
                    allocations.push({ lotNumber: x.lotNumber, expiryDate: exp, qty: x.qty });
                  }
                } else {
                  const day0 = new Date();
                  day0.setUTCHours(0, 0, 0, 0);
                  const lots = await tx.shopStockLot.findMany({
                    where: { tenantId, productId, locationId: fromLocationId, expiryDate: { gte: day0 }, onHandQty: { gt: new Prisma.Decimal(0) } },
                    orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }]
                  });
                  let remaining = qty;
                  for (const lot of lots) {
                    if (remaining.lte(0)) break;
                    const take = Prisma.Decimal.min(remaining, lot.onHandQty);
                    if (take.lte(0)) continue;
                    allocations.push({ lotNumber: lot.lotNumber, expiryDate: lot.expiryDate ?? farExpiry, qty: take });
                    remaining = remaining.sub(take);
                  }
                  if (remaining.gt(0)) allocations.push({ lotNumber: "ADJUST", expiryDate: farExpiry, qty: remaining });
                }

                for (const a of allocations) {
                  const fromLot = await tx.shopStockLot.upsert({
                    where: { tenantId_productId_locationId_lotNumber_expiryDate: { tenantId, productId, locationId: fromLocationId, lotNumber: a.lotNumber, expiryDate: a.expiryDate } },
                    update: {},
                    create: { id: crypto.randomUUID(), tenantId, productId, locationId: fromLocationId, lotNumber: a.lotNumber, expiryDate: a.expiryDate, onHandQty: new Prisma.Decimal(0) }
                  });
                  await tx.shopStockLot.update({ where: { id: fromLot.id }, data: { onHandQty: fromLot.onHandQty.sub(a.qty) } });

                  const toLot = await tx.shopStockLot.upsert({
                    where: { tenantId_productId_locationId_lotNumber_expiryDate: { tenantId, productId, locationId: toLocationId, lotNumber: a.lotNumber, expiryDate: a.expiryDate } },
                    update: {},
                    create: { id: crypto.randomUUID(), tenantId, productId, locationId: toLocationId, lotNumber: a.lotNumber, expiryDate: a.expiryDate, onHandQty: new Prisma.Decimal(0) }
                  });
                  await tx.shopStockLot.update({ where: { id: toLot.id }, data: { onHandQty: toLot.onHandQty.add(a.qty) } });
                }
              }
            }
            const toBefore = toItem.onHandQty;
            const toAvgCost = toItem.avgCost;
            const toAfter = toBefore.add(qty);
            const unitCost = fromAvgCost.gt(0) ? fromAvgCost : product.costPrice ?? new Prisma.Decimal(0);
            let nextFromAvgCost = fromAvgCost;
            if (fromAfter.lte(0)) nextFromAvgCost = new Prisma.Decimal(0);
            let nextToAvgCost = toAvgCost;
            if (toAfter.lte(0)) nextToAvgCost = new Prisma.Decimal(0);
            else if (qty.gt(0)) {
              if (toBefore.lte(0) || toAvgCost.lte(0)) nextToAvgCost = unitCost;
              else nextToAvgCost = toBefore.mul(toAvgCost).add(qty.mul(unitCost)).div(toAfter);
              nextToAvgCost = nextToAvgCost.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
            }
            await tx.shopStockItem.update({ where: { id: fromItem.id }, data: { onHandQty: fromAfter, avgCost: nextFromAvgCost } });
            await tx.shopStockItem.update({ where: { id: toItem.id }, data: { onHandQty: toAfter, avgCost: nextToAvgCost } });
            await tx.shopStockMovement.createMany({
              data: [
                {
                  id: outId,
                  tenantId,
                  type: "transfer_out",
                  productId,
                  locationId: fromLocationId,
                  relatedLocationId: toLocationId,
                  deltaQty: qty.mul(new Prisma.Decimal(-1)),
                  beforeQty: fromBefore,
                  afterQty: fromAfter,
                  note,
                  actorUserId: req.user.id
                },
                { id: inId, tenantId, type: "transfer_in", productId, locationId: toLocationId, relatedLocationId: fromLocationId, deltaQty: qty, beforeQty: toBefore, afterQty: toAfter, note, actorUserId: req.user.id }
              ]
            });
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.stock.transfer", entityType: "shopStockMovement", entityId: e.id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }
        }

        if (e.entityType === "shop_invoice") {
          const p = payload as {
            id?: string;
            locationId?: string;
            customerId?: string | null;
            kind?: "sale" | "refund";
            refundOfId?: string | null;
            restockOnRefund?: boolean;
            notes?: string | null;
            taxEnabled?: boolean;
            taxRate?: string;
            invoiceDiscountAmount?: string;
            lines?: Array<{ id?: string; productId: string; quantity: string; unitPrice: string; discountAmount: string }>;
          };
          const id = (p.id ?? e.entityLocalId).trim();
          if (!id) {
            pushErr(e, "errors.validationError", "invoice id missing");
            processedIds.push(e.id);
            continue;
          }

          if (e.operation === "create") {
            await tx.shopInvoice.upsert({
              where: { id },
              update: {},
              create: {
                id,
                tenantId,
                moduleId: shopModuleId,
                kind: p.kind ?? "sale",
                status: "draft",
                currencyCode: "AFN",
                locationId: p.locationId ?? null,
                customerId: p.customerId ?? null,
                subtotal: new Prisma.Decimal(0),
                grossSubtotal: new Prisma.Decimal(0),
                invoiceDiscountAmount: new Prisma.Decimal(0),
                discountTotal: new Prisma.Decimal(0),
                taxEnabled: false,
                taxRate: new Prisma.Decimal(0),
                taxTotal: new Prisma.Decimal(0),
                roundingAdjustment: new Prisma.Decimal(0),
                paidTotal: new Prisma.Decimal(0)
              }
            });
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.invoice.create", entityType: "shopInvoice", entityId: id, metadataJson: { eventId: e.id } } });
          } else if (e.operation === "update") {
            const existing = await tx.shopInvoice.findUnique({ where: { id }, select: { status: true } });
            if (!existing) {
              pushErr(e, "errors.notFound", "invoice not found");
              processedIds.push(e.id);
              continue;
            }
            if (existing.status === "posted" || existing.status === "void") {
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }

            const lines = Array.isArray(p.lines) ? p.lines : [];
            let subtotal = new Prisma.Decimal(0);
            const keepIds: string[] = [];
            for (const l of lines) {
              const qty = new Prisma.Decimal(l.quantity ?? "0");
              const price = new Prisma.Decimal(l.unitPrice ?? "0");
              const disc = new Prisma.Decimal(l.discountAmount ?? "0");
              const lineTotal = qty.mul(price).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).sub(disc).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
              subtotal = subtotal.add(lineTotal);
              const providedLineId = typeof l.id === "string" ? l.id.trim() : "";
              const effectiveLineId = providedLineId || uuidFromString(`${id}:line:${String(l.productId ?? "").trim()}`);
              keepIds.push(effectiveLineId);
              await tx.shopInvoiceLine.upsert({
                where: { id: effectiveLineId },
                update: { productId: l.productId, quantity: qty, unitPrice: price, discountAmount: disc, lineTotal, netTotal: lineTotal },
                create: { id: effectiveLineId, tenantId, invoiceId: id, productId: l.productId, quantity: qty, unitPrice: price, discountAmount: disc, lineTotal, netTotal: lineTotal }
              });
            }
            if (keepIds.length) {
              await tx.shopInvoiceLine.deleteMany({ where: { tenantId, invoiceId: id, id: { notIn: keepIds } } });
            } else {
              await tx.shopInvoiceLine.deleteMany({ where: { tenantId, invoiceId: id } });
            }
            const invDisc = p.invoiceDiscountAmount ? new Prisma.Decimal(p.invoiceDiscountAmount) : new Prisma.Decimal(0);
            const netSubtotal = subtotal.sub(invDisc).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
            const notes = p.notes === undefined ? undefined : p.notes ? String(p.notes) : null;
            const taxEnabled = p.taxEnabled === undefined ? undefined : Boolean(p.taxEnabled);
            const taxRate = p.taxRate === undefined ? undefined : new Prisma.Decimal(p.taxRate ?? "0");
            const restockOnRefund = p.restockOnRefund === undefined ? undefined : Boolean(p.restockOnRefund);
            await tx.shopInvoice.update({
              where: { id },
              data: {
                locationId: p.locationId ?? null,
                customerId: p.customerId ?? null,
                grossSubtotal: subtotal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
                invoiceDiscountAmount: invDisc.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP),
                subtotal: netSubtotal,
                ...(notes !== undefined ? { notes } : {}),
                ...(taxEnabled !== undefined ? { taxEnabled } : {}),
                ...(taxRate !== undefined ? { taxRate } : {}),
                ...(restockOnRefund !== undefined ? { restockOnRefund } : {})
              }
            });
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.invoice.update", entityType: "shopInvoice", entityId: id, metadataJson: { eventId: e.id } } });
          } else if (e.operation === "refund_draft") {
            const refundOfId = (p.refundOfId ?? "").trim();
            if (!refundOfId) {
              pushErr(e, "errors.validationError", "refundOfId missing");
              processedIds.push(e.id);
              continue;
            }
            const existingRefund = await tx.shopInvoice.findUnique({ where: { id }, select: { id: true } });
            if (existingRefund) {
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }
            const original = await tx.shopInvoice.findUnique({ where: { id: refundOfId }, include: { lines: true } });
            if (!original) {
              pushErr(e, "errors.notFound", "original invoice not found");
              processedIds.push(e.id);
              continue;
            }
            const restockOnRefund = p.restockOnRefund !== undefined ? Boolean(p.restockOnRefund) : true;

            const reqLines = Array.isArray(p.lines) ? p.lines : [];
            const originalLineMap = new Map(original.lines.map((l) => [l.productId, l]));
            let grossSubtotal = new Prisma.Decimal(0);
            await tx.shopInvoice.upsert({
              where: { id },
              update: {},
              create: {
                id,
                tenantId,
                moduleId: shopModuleId,
                kind: "refund",
                status: "draft",
                refundOfId,
                restockOnRefund,
                currencyCode: original.currencyCode,
                locationId: original.locationId,
                customerId: original.customerId,
                grossSubtotal: new Prisma.Decimal(0),
                invoiceDiscountAmount: new Prisma.Decimal(0),
                discountTotal: new Prisma.Decimal(0),
                taxEnabled: original.taxEnabled,
                taxRate: original.taxRate,
                taxTotal: new Prisma.Decimal(0),
                roundingAdjustment: new Prisma.Decimal(0),
                subtotal: new Prisma.Decimal(0),
                paidTotal: new Prisma.Decimal(0)
              }
            });

            for (const l of reqLines) {
              const productId = (l.productId ?? "").trim();
              const qty = new Prisma.Decimal(l.quantity ?? "0");
              if (!productId || qty.lte(0)) continue;
              const src = originalLineMap.get(productId) ?? null;
              const unitPrice = src?.unitPrice ?? new Prisma.Decimal(0);
              const srcQty = src?.quantity ?? new Prisma.Decimal(0);
              const perUnitDisc = srcQty.gt(0) ? (src?.discountAmount ?? new Prisma.Decimal(0)).div(srcQty) : new Prisma.Decimal(0);
              const disc = perUnitDisc.mul(qty).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
              const lineTotal = qty.mul(unitPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).sub(disc).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
              grossSubtotal = grossSubtotal.add(lineTotal);
              await tx.shopInvoiceLine.create({
                data: { id: crypto.randomUUID(), tenantId, invoiceId: id, productId, quantity: qty, unitPrice, discountAmount: disc, lineTotal, netTotal: lineTotal }
              });
            }

            await tx.shopInvoice.update({ where: { id }, data: { grossSubtotal, subtotal: grossSubtotal } });
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.invoice.refundDraft", entityType: "shopInvoice", entityId: id, metadataJson: { eventId: e.id } } });
          } else if (e.operation === "post") {
            const inv = await tx.shopInvoice.findUnique({ where: { id }, include: { lines: true } });
            if (!inv) {
              pushErr(e, "errors.notFound", "invoice not found");
              processedIds.push(e.id);
              continue;
            }
            if (inv.status === "posted") {
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }
            if (inv.status === "void") {
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }
            await tx.shopInvoice.update({ where: { id }, data: { status: "posted", postedAt: new Date() } });
            const locationId = inv.locationId ?? null;
            let refundAvailabilityByProduct: Map<string, Array<{ lotId: string; availableQty: Prisma.Decimal }>> | null = null;
            if (shopModuleId === "pharmacy" && inv.kind === "refund" && inv.restockOnRefund && inv.refundOfId) {
              const [originalAlloc, refundedAlloc] = await Promise.all([
                tx.shopInvoiceLotAllocation.findMany({
                  where: { tenantId, invoiceId: inv.refundOfId },
                  select: { lotId: true, quantity: true, line: { select: { productId: true } } }
                }),
                tx.shopInvoiceLotAllocation.findMany({
                  where: { tenantId, invoice: { is: { kind: "refund", status: "posted", refundOfId: inv.refundOfId } } },
                  select: { lotId: true, quantity: true, line: { select: { productId: true } } }
                })
              ]);

              const refundedMap = new Map<string, Prisma.Decimal>();
              for (const r of refundedAlloc) {
                const key = `${r.line.productId}::${r.lotId}`;
                const prev = refundedMap.get(key) ?? new Prisma.Decimal(0);
                refundedMap.set(key, prev.add(r.quantity));
              }

              const lotIds = [...new Set(originalAlloc.map((x) => x.lotId))];
              const lotMeta = lotIds.length
                ? await tx.shopStockLot.findMany({ where: { tenantId, id: { in: lotIds } }, select: { id: true, expiryDate: true, createdAt: true } })
                : [];
              const lotMetaMap = new Map(lotMeta.map((l) => [l.id, l]));

              refundAvailabilityByProduct = new Map();
              for (const r of originalAlloc) {
                const key = `${r.line.productId}::${r.lotId}`;
                const used = refundedMap.get(key) ?? new Prisma.Decimal(0);
                const available = r.quantity.sub(used);
                if (available.lte(0)) continue;
                const list = refundAvailabilityByProduct.get(r.line.productId) ?? [];
                list.push({ lotId: r.lotId, availableQty: available });
                refundAvailabilityByProduct.set(r.line.productId, list);
              }

              for (const [, list] of refundAvailabilityByProduct.entries()) {
                list.sort((a, b) => {
                  const la = lotMetaMap.get(a.lotId);
                  const lb = lotMetaMap.get(b.lotId);
                  const ea = la?.expiryDate?.toISOString() ?? "9999-12-31T00:00:00.000Z";
                  const eb = lb?.expiryDate?.toISOString() ?? "9999-12-31T00:00:00.000Z";
                  if (ea < eb) return -1;
                  if (ea > eb) return 1;
                  const ca = la?.createdAt?.toISOString() ?? "";
                  const cb = lb?.createdAt?.toISOString() ?? "";
                  if (ca < cb) return -1;
                  if (ca > cb) return 1;
                  return a.lotId.localeCompare(b.lotId);
                });
              }
            }
            if (locationId) {
              for (const l of inv.lines) {
                const item = await tx.shopStockItem.findUnique({ where: { tenantId_productId_locationId: { tenantId, productId: l.productId, locationId } } });
                const beforeQty = item?.onHandQty ?? new Prisma.Decimal(0);
                const shouldRestockRefund = inv.kind === "refund" ? inv.restockOnRefund : false;
                const deltaQty = inv.kind === "sale" ? l.quantity.mul(new Prisma.Decimal(-1)) : shouldRestockRefund ? l.quantity : new Prisma.Decimal(0);
                if (deltaQty.eq(0)) continue;

                if (shopModuleId === "pharmacy") {
                  const profile = await tx.shopProductPharmacyProfile.findUnique({ where: { productId: l.productId }, select: { trackLots: true } });
                  const trackLots = profile?.trackLots ?? true;
                  if (trackLots) {
                    if (inv.kind === "sale") {
                      const day0 = new Date();
                      day0.setUTCHours(0, 0, 0, 0);
                      const lots = await tx.shopStockLot.findMany({
                        where: { tenantId, productId: l.productId, locationId, expiryDate: { gte: day0 }, onHandQty: { gt: new Prisma.Decimal(0) } },
                        orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }]
                      });
                      let remaining = l.quantity;
                      for (const lot of lots) {
                        if (remaining.lte(0)) break;
                        const take = Prisma.Decimal.min(remaining, lot.onHandQty);
                        if (take.lte(0)) continue;
                        await tx.shopStockLot.update({ where: { id: lot.id }, data: { onHandQty: lot.onHandQty.sub(take) } });
                        await tx.shopInvoiceLotAllocation.create({ data: { id: crypto.randomUUID(), tenantId, invoiceId: id, invoiceLineId: l.id, lotId: lot.id, quantity: take } });
                        remaining = remaining.sub(take);
                      }
                      if (remaining.gt(0)) {
                        const farExpiry = new Date("9999-12-31T00:00:00.000Z");
                        const adjustLot = await tx.shopStockLot.upsert({
                          where: { tenantId_productId_locationId_lotNumber_expiryDate: { tenantId, productId: l.productId, locationId, lotNumber: "ADJUST", expiryDate: farExpiry } },
                          update: {},
                          create: { id: crypto.randomUUID(), tenantId, productId: l.productId, locationId, lotNumber: "ADJUST", expiryDate: farExpiry, onHandQty: new Prisma.Decimal(0) }
                        });
                        await tx.shopStockLot.update({ where: { id: adjustLot.id }, data: { onHandQty: adjustLot.onHandQty.sub(remaining) } });
                        await tx.shopInvoiceLotAllocation.create({ data: { id: crypto.randomUUID(), tenantId, invoiceId: id, invoiceLineId: l.id, lotId: adjustLot.id, quantity: remaining } });
                      }
                    } else if (shouldRestockRefund) {
                      let remaining = l.quantity;
                      const list = refundAvailabilityByProduct?.get(l.productId) ?? [];
                      for (const src of list) {
                        if (remaining.lte(0)) break;
                        const take = Prisma.Decimal.min(remaining, src.availableQty);
                        if (take.lte(0)) continue;
                        await tx.shopStockLot.update({ where: { id: src.lotId }, data: { onHandQty: { increment: take } } });
                        await tx.shopInvoiceLotAllocation.create({ data: { id: crypto.randomUUID(), tenantId, invoiceId: id, invoiceLineId: l.id, lotId: src.lotId, quantity: take } });
                        src.availableQty = src.availableQty.sub(take);
                        remaining = remaining.sub(take);
                      }
                      if (remaining.gt(0)) {
                        const farExpiry = new Date("9999-12-31T00:00:00.000Z");
                        const adjustLot = await tx.shopStockLot.upsert({
                          where: { tenantId_productId_locationId_lotNumber_expiryDate: { tenantId, productId: l.productId, locationId, lotNumber: "ADJUST", expiryDate: farExpiry } },
                          update: {},
                          create: { id: crypto.randomUUID(), tenantId, productId: l.productId, locationId, lotNumber: "ADJUST", expiryDate: farExpiry, onHandQty: new Prisma.Decimal(0) }
                        });
                        await tx.shopStockLot.update({ where: { id: adjustLot.id }, data: { onHandQty: { increment: remaining } } });
                        await tx.shopInvoiceLotAllocation.create({ data: { id: crypto.randomUUID(), tenantId, invoiceId: id, invoiceLineId: l.id, lotId: adjustLot.id, quantity: remaining } });
                      }
                    }
                  }
                }

                const afterQty = beforeQty.add(deltaQty);
                if (item) {
                  await tx.shopStockItem.update({ where: { tenantId_productId_locationId: { tenantId, productId: l.productId, locationId } }, data: { onHandQty: afterQty } });
                } else {
                  await tx.shopStockItem.create({ data: { tenantId, productId: l.productId, locationId, onHandQty: afterQty, avgCost: new Prisma.Decimal(0) } });
                }
                await tx.shopStockMovement.create({
                  data: {
                    tenantId,
                    type: inv.kind === "sale" ? "sale" : "sale_refund",
                    productId: l.productId,
                    locationId,
                    deltaQty,
                    beforeQty,
                    afterQty,
                    actorUserId: req.user.id
                  }
                });
              }
            }
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.invoice.post", entityType: "shopInvoice", entityId: id, metadataJson: { eventId: e.id } } });
          } else if (e.operation === "void") {
            const inv = await tx.shopInvoice.findUnique({ where: { id }, include: { lines: true } });
            if (!inv) {
              pushErr(e, "errors.notFound", "invoice not found");
              processedIds.push(e.id);
              continue;
            }
            if (inv.status === "void") {
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }
            if (shopModuleId === "pharmacy") {
              const allocs = await tx.shopInvoiceLotAllocation.findMany({ where: { tenantId, invoiceId: id }, select: { lotId: true, quantity: true } });
              for (const a of allocs) {
                if (inv.kind === "sale") {
                  await tx.shopStockLot.update({ where: { id: a.lotId }, data: { onHandQty: { increment: a.quantity } } }).catch(() => null);
                } else if (inv.kind === "refund" && inv.restockOnRefund) {
                  await tx.shopStockLot.update({ where: { id: a.lotId }, data: { onHandQty: { increment: a.quantity.mul(new Prisma.Decimal(-1)) } } }).catch(() => null);
                }
              }
              await tx.shopInvoiceLotAllocation.deleteMany({ where: { tenantId, invoiceId: id } });
            }
            if (inv.status === "posted" && inv.locationId) {
              for (const l of inv.lines) {
                const item = await tx.shopStockItem.findUnique({ where: { tenantId_productId_locationId: { tenantId, productId: l.productId, locationId: inv.locationId } } });
                const beforeQty = item?.onHandQty ?? new Prisma.Decimal(0);
                const shouldRestockRefund = inv.kind === "refund" ? inv.restockOnRefund : false;
                const deltaQty = inv.kind === "sale" ? l.quantity : shouldRestockRefund ? l.quantity.mul(new Prisma.Decimal(-1)) : new Prisma.Decimal(0);
                if (deltaQty.eq(0)) continue;
                const afterQty = beforeQty.add(deltaQty);
                if (item) {
                  await tx.shopStockItem.update({ where: { tenantId_productId_locationId: { tenantId, productId: l.productId, locationId: inv.locationId } }, data: { onHandQty: afterQty } });
                } else {
                  await tx.shopStockItem.create({ data: { tenantId, productId: l.productId, locationId: inv.locationId, onHandQty: afterQty, avgCost: new Prisma.Decimal(0) } });
                }
                await tx.shopStockMovement.create({
                  data: {
                    tenantId,
                    type: inv.kind === "sale" ? "sale_void" : "sale_refund_void",
                    productId: l.productId,
                    locationId: inv.locationId,
                    deltaQty,
                    beforeQty,
                    afterQty,
                    actorUserId: req.user.id
                  }
                });
              }
            }
            await tx.shopInvoice.update({ where: { id }, data: { status: "void" } });
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.invoice.void", entityType: "shopInvoice", entityId: id, metadataJson: { eventId: e.id } } });
          }
          pushOk(e);
          processedIds.push(e.id);
          continue;
        }

        if (e.entityType === "shop_invoice_payment") {
          const p = payload as { id?: string; invoiceId?: string; direction?: "in" | "out"; method?: string; amount?: string; note?: string | null };
          const id = (p.id ?? e.entityLocalId).trim();
          const invoiceId = (p.invoiceId ?? "").trim();
          const method = (p.method ?? "Cash").trim();
          const amount = p.amount ? new Prisma.Decimal(p.amount) : new Prisma.Decimal(0);
          if (!id || !invoiceId) {
            pushErr(e, "errors.validationError", "invoice payment id/invoiceId missing");
            processedIds.push(e.id);
            continue;
          }
          const existing = await tx.shopInvoicePayment.findUnique({ where: { id }, select: { id: true } });
          if (existing) {
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }
          const inv = await tx.shopInvoice.findUnique({ where: { id: invoiceId }, select: { kind: true } });
          if (!inv) {
            pushErr(e, "errors.notFound", "invoice not found");
            processedIds.push(e.id);
            continue;
          }
          const direction = p.direction === "out" ? "out" : p.direction === "in" ? "in" : inv?.kind === "refund" ? "out" : "in";
          const note = p.note !== undefined ? (p.note ? String(p.note).trim() : null) : null;
          await tx.shopInvoicePayment.create({ data: { id, tenantId, invoiceId, method, amount, direction, note, actorUserId: req.user.id } });
          const [inAgg, outAgg] = await Promise.all([
            tx.shopInvoicePayment.aggregate({ where: { tenantId, invoiceId, direction: "in" }, _sum: { amount: true } }),
            tx.shopInvoicePayment.aggregate({ where: { tenantId, invoiceId, direction: "out" }, _sum: { amount: true } })
          ]);
          const inTotal = (inAgg._sum.amount ?? new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          const outTotal = (outAgg._sum.amount ?? new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          const paidTotal = inTotal.sub(outTotal).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          await tx.shopInvoice.update({ where: { id: invoiceId }, data: { paidTotal } });
          await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.invoice.payment.create", entityType: "shopInvoicePayment", entityId: id, metadataJson: { eventId: e.id } } });
          pushOk(e);
          processedIds.push(e.id);
          continue;
        }

        if (e.entityType === "shop_purchase_order") {
          const p = payload as { id?: string; locationId?: string; supplierId?: string | null; currencyCode?: string; notes?: string | null; lines?: Array<{ productId: string; quantity: string; unitCost: string }> };
          const id = (p.id ?? e.entityLocalId).trim();
          if (!id) {
            pushErr(e, "errors.validationError", "purchase order id missing");
            processedIds.push(e.id);
            continue;
          }
          if (e.operation === "create") {
            const locationId = (p.locationId ?? "").trim();
            const currencyCode = (p.currencyCode ?? "AFN").trim();
            if (!locationId) {
              pushErr(e, "errors.validationError", "locationId missing");
              processedIds.push(e.id);
              continue;
            }
            await tx.shopPurchaseOrder.upsert({
              where: { id },
              update: {},
              create: { id, tenantId, moduleId: shopModuleId, status: "draft", locationId, currencyCode }
            });
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.purchaseOrder.create", entityType: "shopPurchaseOrder", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }
          if (e.operation === "update") {
            const supplierId = p.supplierId === undefined ? undefined : p.supplierId ? String(p.supplierId) : null;
            const notes = p.notes === undefined ? undefined : p.notes ? String(p.notes) : null;
            const lines = Array.isArray(p.lines) ? p.lines : [];
            await tx.shopPurchaseOrderLine.deleteMany({ where: { tenantId, orderId: id } });
            let subtotal = new Prisma.Decimal(0);
            for (const l of lines) {
              const qty = new Prisma.Decimal(l.quantity ?? "0");
              const unitCost = new Prisma.Decimal(l.unitCost ?? "0");
              const lineTotal = qty.mul(unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
              subtotal = subtotal.add(lineTotal);
              await tx.shopPurchaseOrderLine.create({ data: { id: crypto.randomUUID(), tenantId, orderId: id, productId: l.productId, quantity: qty, unitCost, lineTotal } });
            }
            await tx.shopPurchaseOrder.update({ where: { id }, data: { supplierId, notes, subtotal } });
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.purchaseOrder.update", entityType: "shopPurchaseOrder", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }
          if (e.operation === "approve") {
            await tx.shopPurchaseOrder.update({ where: { id }, data: { status: "approved", approvedAt: new Date(), approvedByUserId: req.user.id } });
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.purchaseOrder.approve", entityType: "shopPurchaseOrder", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }
          if (e.operation === "convert") {
            await tx.shopPurchaseOrder.update({ where: { id }, data: { status: "closed", closedAt: new Date(), closedByUserId: req.user.id } }).catch(() => null);
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.purchaseOrder.convert", entityType: "shopPurchaseOrder", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }
        }

        if (e.entityType === "shop_purchase_invoice") {
          const p = payload as {
            id?: string;
            kind?: "purchase" | "refund";
            supplierId?: string | null;
            locationId?: string;
            currencyCode?: string;
            notes?: string | null;
            purchaseOrderId?: string | null;
            refundOfId?: string | null;
            lines?: Array<{ productId: string; quantity: string; unitCost: string }>;
            receive?: { lines?: Array<{ productId: string; qty: string; unitCost?: string | null }>; note?: string | null };
          };
          const id = (p.id ?? e.entityLocalId).trim();
          if (!id) {
            pushErr(e, "errors.validationError", "purchase invoice id missing");
            processedIds.push(e.id);
            continue;
          }

          if (e.operation === "create") {
            const kind = p.kind ?? "purchase";
            const locationId = (p.locationId ?? "").trim();
            const currencyCode = (p.currencyCode ?? "AFN").trim();
            if (!locationId) {
              pushErr(e, "errors.validationError", "locationId missing");
              processedIds.push(e.id);
              continue;
            }
            await tx.shopPurchaseInvoice.upsert({
              where: { id },
              update: {},
              create: {
                id,
                tenantId,
                moduleId: shopModuleId,
                kind,
                status: "draft",
                supplierId: p.supplierId ? String(p.supplierId) : null,
                locationId,
                currencyCode,
                notes: p.notes ? String(p.notes) : null,
                refundOfId: p.refundOfId ? String(p.refundOfId) : null,
                purchaseOrderId: p.purchaseOrderId ? String(p.purchaseOrderId) : null
              }
            });
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.purchaseInvoice.create", entityType: "shopPurchaseInvoice", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }

          if (e.operation === "refund_draft") {
            const refundOfId = p.refundOfId ? String(p.refundOfId) : null;
            if (!refundOfId) {
              pushErr(e, "errors.validationError", "refundOfId missing");
              processedIds.push(e.id);
              continue;
            }
            const existingRefund = await tx.shopPurchaseInvoice.findUnique({ where: { id }, select: { id: true } });
            if (existingRefund) {
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }
            const original = await tx.shopPurchaseInvoice.findUnique({ where: { id: refundOfId }, select: { supplierId: true, locationId: true, currencyCode: true } });
            if (!original) {
              pushErr(e, "errors.notFound", "original purchase invoice not found");
              processedIds.push(e.id);
              continue;
            }
            await tx.shopPurchaseInvoice.upsert({
              where: { id },
              update: {},
              create: {
                id,
                tenantId,
                moduleId: shopModuleId,
                kind: "refund",
                status: "draft",
                refundOfId,
                supplierId: original.supplierId,
                locationId: original.locationId,
                currencyCode: original.currencyCode
              }
            });
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.purchaseInvoice.refundDraft", entityType: "shopPurchaseInvoice", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }

          if (e.operation === "update") {
            const supplierId = p.supplierId === undefined ? undefined : p.supplierId ? String(p.supplierId) : null;
            const locationIdRaw = p.locationId === undefined ? undefined : String(p.locationId ?? "").trim();
            const locationId = locationIdRaw ? locationIdRaw : undefined;
            const notes = p.notes === undefined ? undefined : p.notes ? String(p.notes) : null;
            const lines = Array.isArray(p.lines) ? p.lines : [];
            let subtotal = new Prisma.Decimal(0);
            const keepIds: string[] = [];
            for (const l of lines) {
              const lineId = typeof (l as { id?: unknown }).id === "string" ? String((l as { id?: string }).id).trim() : "";
              const effectiveLineId = lineId || crypto.randomUUID();
              keepIds.push(effectiveLineId);
              const qty = new Prisma.Decimal(l.quantity ?? "0");
              const unitCost = new Prisma.Decimal(l.unitCost ?? "0");
              const lineTotal = qty.mul(unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
              subtotal = subtotal.add(lineTotal);
              await tx.shopPurchaseInvoiceLine.upsert({
                where: { id: effectiveLineId },
                update: { productId: l.productId, quantity: qty, unitCost, lineTotal },
                create: { id: effectiveLineId, tenantId, invoiceId: id, productId: l.productId, quantity: qty, unitCost, lineTotal }
              });
            }
            if (keepIds.length) {
              await tx.shopPurchaseInvoiceLine.deleteMany({ where: { tenantId, invoiceId: id, id: { notIn: keepIds } } });
            } else {
              await tx.shopPurchaseInvoiceLine.deleteMany({ where: { tenantId, invoiceId: id } });
            }
            await tx.shopPurchaseInvoice.update({
              where: { id },
              data: { ...(supplierId !== undefined ? { supplierId } : {}), ...(locationId !== undefined ? { locationId } : {}), ...(notes !== undefined ? { notes } : {}), subtotal }
            });
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.purchaseInvoice.update", entityType: "shopPurchaseInvoice", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }

          if (e.operation === "receive") {
            const recv = (p.receive ?? p) as Record<string, unknown>;
            const lines = Array.isArray(recv.lines) ? (recv.lines as Array<Record<string, unknown>>) : [];
            const note = recv.note === null ? null : typeof recv.note === "string" ? recv.note : null;
            const invoice = await tx.shopPurchaseInvoice.findUnique({ where: { id }, select: { locationId: true } });
            if (!invoice?.locationId) {
              pushErr(e, "errors.notFound", "purchase invoice location not found");
              processedIds.push(e.id);
              continue;
            }
            for (const l of lines) {
              if (shopModuleId === "pharmacy") {
                const lineId = typeof l.lineId === "string" ? l.lineId : "";
                const qtyReq = new Prisma.Decimal(typeof l.qty === "string" ? l.qty : "0");
                const lotNumber = typeof l.lotNumber === "string" ? l.lotNumber.trim() : "";
                const expiryDateStr = typeof l.expiryDate === "string" ? l.expiryDate.trim() : "";
                if (!lineId || qtyReq.lte(0)) continue;
                const line = await tx.shopPurchaseInvoiceLine.findFirst({
                  where: { tenantId, invoiceId: id, id: lineId },
                  select: { id: true, productId: true, quantity: true, receivedQty: true, unitCost: true }
                });
                if (!line) continue;
                const remaining = line.quantity.sub(line.receivedQty ?? new Prisma.Decimal(0));
                const qty = Prisma.Decimal.min(qtyReq, remaining);
                if (qty.lte(0)) continue;

                const product = await tx.shopProduct.findFirst({ where: { id: line.productId, tenantId, moduleId: shopModuleId, deletedAt: null }, select: { costPrice: true } });
                if (!product) continue;

                const farExpiry = new Date("9999-12-31T00:00:00.000Z");
                const expiryCandidate = expiryDateStr ? new Date(expiryDateStr.includes("T") ? expiryDateStr : `${expiryDateStr}T00:00:00.000Z`) : farExpiry;
                const expiryDate = Number.isNaN(expiryCandidate.getTime()) ? farExpiry : expiryCandidate;
                const receiptKey = `${e.id}:purchase_receive:${id}:${line.id}:${lotNumber || "NOLOT"}:${expiryDate.toISOString()}`;
                const receiptId = uuidFromString(`receipt:${receiptKey}`);
                const movementId = uuidFromString(`movement:${receiptKey}`);
                const existingReceipt = await tx.shopPurchaseLotReceipt.findUnique({ where: { id: receiptId }, select: { id: true } });
                if (existingReceipt) continue;

                const lot = await tx.shopStockLot.upsert({
                  where: { tenantId_productId_locationId_lotNumber_expiryDate: { tenantId, productId: line.productId, locationId: invoice.locationId, lotNumber: lotNumber || "NOLOT", expiryDate } },
                  update: { onHandQty: { increment: qty } },
                  create: { id: crypto.randomUUID(), tenantId, productId: line.productId, locationId: invoice.locationId, lotNumber: lotNumber || "NOLOT", expiryDate, onHandQty: qty }
                });
                await tx.shopPurchaseLotReceipt.create({
                  data: { id: receiptId, tenantId, lotId: lot.id, purchaseInvoiceId: id, purchaseInvoiceLineId: line.id, quantity: qty, unitCost: line.unitCost, createdAt: new Date() }
                });

                const item = await tx.shopStockItem.upsert({
                  where: { tenantId_productId_locationId: { tenantId, productId: line.productId, locationId: invoice.locationId } },
                  update: {},
                  create: { tenantId, productId: line.productId, locationId: invoice.locationId, onHandQty: new Prisma.Decimal(0), avgCost: new Prisma.Decimal(0) },
                  select: { id: true, onHandQty: true, avgCost: true }
                });
                const before = item.onHandQty;
                const beforeAvgCost = item.avgCost;
                const after = before.add(qty);
                const cost = line.unitCost ?? product.costPrice ?? new Prisma.Decimal(0);
                let nextAvg = beforeAvgCost;
                if (after.lte(0)) nextAvg = new Prisma.Decimal(0);
                else if (before.lte(0) || beforeAvgCost.lte(0)) nextAvg = cost;
                else nextAvg = before.mul(beforeAvgCost).add(qty.mul(cost)).div(after);
                nextAvg = nextAvg.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
                await tx.shopStockItem.update({ where: { id: item.id }, data: { onHandQty: after, avgCost: nextAvg } });
                await tx.shopStockMovement.create({ data: { id: movementId, tenantId, type: "receive", productId: line.productId, locationId: invoice.locationId, deltaQty: qty, beforeQty: before, afterQty: after, note, actorUserId: req.user.id } });
                await tx.shopPurchaseInvoiceLine.update({ where: { id: line.id }, data: { receivedQty: { increment: qty } } });
              } else {
                const productId = typeof l.productId === "string" ? l.productId : "";
                const qty = new Prisma.Decimal(typeof l.qty === "string" ? l.qty : "0");
                if (!productId || qty.lte(0)) continue;
                const unitCost = l.unitCost === null ? null : typeof l.unitCost === "string" ? new Prisma.Decimal(l.unitCost) : null;
                const product = await tx.shopProduct.findFirst({ where: { id: productId, tenantId, moduleId: shopModuleId, deletedAt: null }, select: { costPrice: true } });
                if (!product) continue;
                const movementId = uuidFromString(`purchase_receive:${e.id}:${id}:${productId}:${qty.toFixed(4)}`);
                const existingMove = await tx.shopStockMovement.findUnique({ where: { id: movementId }, select: { id: true } });
                if (existingMove) continue;
                const item = await tx.shopStockItem.upsert({
                  where: { tenantId_productId_locationId: { tenantId, productId, locationId: invoice.locationId } },
                  update: {},
                  create: { tenantId, productId, locationId: invoice.locationId, onHandQty: new Prisma.Decimal(0), avgCost: new Prisma.Decimal(0) },
                  select: { id: true, onHandQty: true, avgCost: true }
                });
                const before = item.onHandQty;
                const beforeAvgCost = item.avgCost;
                const after = before.add(qty);
                const cost = unitCost ?? product.costPrice ?? new Prisma.Decimal(0);
                let nextAvg = beforeAvgCost;
                if (after.lte(0)) nextAvg = new Prisma.Decimal(0);
                else if (before.lte(0) || beforeAvgCost.lte(0)) nextAvg = cost;
                else nextAvg = before.mul(beforeAvgCost).add(qty.mul(cost)).div(after);
                nextAvg = nextAvg.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
                const created = await tx.shopStockMovement
                  .create({ data: { id: movementId, tenantId, type: "receive", productId, locationId: invoice.locationId, deltaQty: qty, beforeQty: before, afterQty: after, note, actorUserId: req.user.id } })
                  .then(() => true)
                  .catch((err: unknown) => {
                    if (typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002") return false;
                    throw err;
                  });
                if (!created) continue;
                await tx.shopStockItem.update({ where: { id: item.id }, data: { onHandQty: after, avgCost: nextAvg } });
                await tx.shopPurchaseInvoiceLine.updateMany({ where: { tenantId, invoiceId: id, productId }, data: { receivedQty: { increment: qty } } });
              }
            }
            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.purchaseInvoice.receive", entityType: "shopPurchaseInvoice", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }

          if (e.operation === "post") {
            const inv = await tx.shopPurchaseInvoice.findUnique({
              where: { id },
              select: { id: true, status: true, kind: true, purchaseNumber: true, refundOfId: true, locationId: true }
            });
            if (!inv) {
              pushErr(e, "errors.notFound", "purchase invoice not found");
              processedIds.push(e.id);
              continue;
            }
            if (inv.status === "posted") {
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }
            if (inv.status === "void") {
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }

            const now = new Date();

            if (inv.kind === "purchase") {
              if (!inv.purchaseNumber) {
                const settings = await tx.shopSettings.upsert({
                  where: { tenantId },
                  update: {},
                  create: { tenantId, sellCurrencyCode: "AFN", buyCurrencyCode: "AFN" },
                  select: { nextPurchaseNumber: true }
                });
                const purchaseNumber = formatPurchaseNumber(shopModuleId, settings.nextPurchaseNumber);
                await tx.shopSettings.update({ where: { tenantId }, data: { nextPurchaseNumber: settings.nextPurchaseNumber + 1 } });
                await tx.shopPurchaseInvoice.update({ where: { id }, data: { status: "posted", postedAt: now, purchaseNumber } });
              } else {
                await tx.shopPurchaseInvoice.update({ where: { id }, data: { status: "posted", postedAt: now } });
              }
              await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.purchaseInvoice.post", entityType: "shopPurchaseInvoice", entityId: id, metadataJson: { eventId: e.id } } });
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }

            const refundOfId = inv.refundOfId ?? null;
            const locationId = inv.locationId ?? null;
            if (!refundOfId || !locationId) {
              pushErr(e, "errors.validationError", "refundOfId/locationId missing");
              processedIds.push(e.id);
              continue;
            }
            const original = await tx.shopPurchaseInvoice.findUnique({ where: { id: refundOfId }, select: { id: true, kind: true, status: true } });
            if (!original || original.kind !== "purchase" || original.status !== "posted") {
              pushErr(e, "errors.validationError", "original purchase invoice must be posted purchase");
              processedIds.push(e.id);
              continue;
            }

            const lines = await tx.shopPurchaseInvoiceLine.findMany({ where: { tenantId, invoiceId: id }, select: { id: true, productId: true, quantity: true, unitCost: true } });
            if (!lines.length) {
              pushErr(e, "errors.validationError", "purchase invoice lines missing");
              processedIds.push(e.id);
              continue;
            }

            const purchasedLines = await tx.shopPurchaseInvoiceLine.findMany({ where: { tenantId, invoiceId: refundOfId }, select: { productId: true, quantity: true } });
            const purchasedQtyByProduct = new Map<string, Prisma.Decimal>();
            for (const l of purchasedLines) purchasedQtyByProduct.set(l.productId, (purchasedQtyByProduct.get(l.productId) ?? new Prisma.Decimal(0)).add(l.quantity));

            const refundedLines = await tx.shopPurchaseInvoiceLine.findMany({
              where: { tenantId, invoice: { is: { refundOfId, kind: "refund", status: "posted", moduleId: shopModuleId } } },
              select: { productId: true, quantity: true }
            });
            const refundedQtyByProduct = new Map<string, Prisma.Decimal>();
            for (const l of refundedLines) refundedQtyByProduct.set(l.productId, (refundedQtyByProduct.get(l.productId) ?? new Prisma.Decimal(0)).add(l.quantity));

            const day0 = new Date();
            day0.setUTCHours(0, 0, 0, 0);
            const plan: Array<{
              lineId: string;
              productId: string;
              qty: Prisma.Decimal;
              unitCost: Prisma.Decimal;
              stockItemId: string;
              beforeQty: Prisma.Decimal;
              afterQty: Prisma.Decimal;
              avgCost: Prisma.Decimal;
              lotAllocations: Array<{ lotId: string; beforeLotQty: Prisma.Decimal; take: Prisma.Decimal }>;
            }> = [];
            let errorKey: string | null = null;
            let errorDetail: string | null = null;

            for (const l of lines) {
              if (l.quantity.lte(0)) continue;
              const purchased = purchasedQtyByProduct.get(l.productId) ?? new Prisma.Decimal(0);
              const refunded = refundedQtyByProduct.get(l.productId) ?? new Prisma.Decimal(0);
              const remaining = purchased.sub(refunded);
              if (l.quantity.gt(remaining)) {
                errorKey = "errors.validationError";
                errorDetail = "purchase refund qty exceeds remaining";
                break;
              }

              const item = await tx.shopStockItem.findUnique({
                where: { tenantId_productId_locationId: { tenantId, productId: l.productId, locationId } },
                select: { id: true, onHandQty: true, avgCost: true }
              });
              if (!item || item.onHandQty.lt(l.quantity)) {
                errorKey = "errors.stockInsufficient";
                errorDetail = "insufficient stock for purchase refund";
                break;
              }

              const lotAllocations: Array<{ lotId: string; beforeLotQty: Prisma.Decimal; take: Prisma.Decimal }> = [];
              if (shopModuleId === "pharmacy") {
                const profile = await tx.shopProductPharmacyProfile.findUnique({ where: { productId: l.productId }, select: { trackLots: true } });
                const trackLots = profile?.trackLots ?? true;
                if (trackLots) {
                  const lots = await tx.shopStockLot.findMany({
                    where: { tenantId, productId: l.productId, locationId, expiryDate: { gte: day0 }, onHandQty: { gt: new Prisma.Decimal(0) } },
                    orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
                    select: { id: true, onHandQty: true }
                  });
                  const totalLots = lots.reduce((sum, x) => sum.add(x.onHandQty), new Prisma.Decimal(0));
                  if (totalLots.lt(l.quantity)) {
                    errorKey = "errors.stockInsufficient";
                    errorDetail = "insufficient lots for purchase refund";
                    break;
                  }
                  let remainingQty = l.quantity;
                  for (const lot of lots) {
                    if (remainingQty.lte(0)) break;
                    const take = Prisma.Decimal.min(remainingQty, lot.onHandQty);
                    if (take.lte(0)) continue;
                    lotAllocations.push({ lotId: lot.id, beforeLotQty: lot.onHandQty, take });
                    remainingQty = remainingQty.sub(take);
                  }
                  if (remainingQty.gt(0)) {
                    errorKey = "errors.stockInsufficient";
                    errorDetail = "insufficient lots for purchase refund";
                    break;
                  }
                }
              }

              plan.push({
                lineId: l.id,
                productId: l.productId,
                qty: l.quantity,
                unitCost: l.unitCost,
                stockItemId: item.id,
                beforeQty: item.onHandQty,
                afterQty: item.onHandQty.sub(l.quantity),
                avgCost: item.avgCost,
                lotAllocations
              });
            }

            if (errorKey) {
              pushErr(e, errorKey, errorDetail ?? undefined);
              processedIds.push(e.id);
              continue;
            }

            for (const p2 of plan) {
              for (const a of p2.lotAllocations) {
                await tx.shopStockLot.update({ where: { id: a.lotId }, data: { onHandQty: a.beforeLotQty.sub(a.take) } });
                const receiptId = uuidFromString(`purchase_refund_receipt:${e.id}:${id}:${p2.lineId}:${a.lotId}`);
                await tx.shopPurchaseLotReceipt
                  .create({
                    data: {
                      id: receiptId,
                      tenantId,
                      lotId: a.lotId,
                      purchaseInvoiceId: id,
                      purchaseInvoiceLineId: p2.lineId,
                      quantity: a.take.mul(new Prisma.Decimal(-1)),
                      unitCost: p2.unitCost,
                      createdAt: now
                    }
                  })
                  .catch(() => null);
              }

              await tx.shopStockItem.update({ where: { id: p2.stockItemId }, data: { onHandQty: p2.afterQty, avgCost: p2.avgCost } });
              const movementId = uuidFromString(`purchase_refund_move:${e.id}:${id}:${p2.lineId}`);
              await tx.shopStockMovement
                .create({
                  data: {
                    id: movementId,
                    tenantId,
                    type: "supplier_return",
                    productId: p2.productId,
                    locationId,
                    deltaQty: p2.qty.negated(),
                    beforeQty: p2.beforeQty,
                    afterQty: p2.afterQty,
                    note: `PURCHASE_REFUND:${refundOfId}`,
                    actorUserId: req.user.id
                  }
                })
                .catch(() => null);
            }

            if (!inv.purchaseNumber) {
              const settings = await tx.shopSettings.upsert({
                where: { tenantId },
                update: {},
                create: { tenantId, sellCurrencyCode: "AFN", buyCurrencyCode: "AFN" },
                select: { nextPurchaseRefundNumber: true }
              });
              const purchaseNumber = formatPurchaseRefundNumber(shopModuleId, settings.nextPurchaseRefundNumber);
              await tx.shopSettings.update({ where: { tenantId }, data: { nextPurchaseRefundNumber: settings.nextPurchaseRefundNumber + 1 } });
              await tx.shopPurchaseInvoice.update({ where: { id }, data: { status: "posted", postedAt: now, purchaseNumber } });
            } else {
              await tx.shopPurchaseInvoice.update({ where: { id }, data: { status: "posted", postedAt: now } });
            }

            await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.purchaseInvoice.refund.post", entityType: "shopPurchaseInvoice", entityId: id, metadataJson: { eventId: e.id } } });
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }

          if (e.operation === "void") {
            const inv = await tx.shopPurchaseInvoice.findUnique({
              where: { id },
              select: { id: true, status: true, kind: true, refundOfId: true, locationId: true }
            });
            if (!inv) {
              pushErr(e, "errors.notFound", "purchase invoice not found");
              processedIds.push(e.id);
              continue;
            }
            if (inv.status === "void") {
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }
            if (inv.status === "draft") {
              if (inv.kind === "purchase") {
                const anyReceived = await tx.shopPurchaseInvoiceLine.findFirst({ where: { tenantId, invoiceId: id, receivedQty: { gt: new Prisma.Decimal(0) } }, select: { id: true } });
                if (anyReceived) {
                  pushErr(e, "errors.validationError", "cannot void purchase invoice with received lines");
                  processedIds.push(e.id);
                  continue;
                }
              }
              await tx.shopPurchaseInvoice.update({ where: { id }, data: { status: "void" } });
              await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.purchaseInvoice.void", entityType: "shopPurchaseInvoice", entityId: id, metadataJson: { eventId: e.id } } });
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }

            if (inv.status === "posted" && inv.kind === "refund") {
              const locationId = inv.locationId ?? "";
              const refundOfId = inv.refundOfId ?? "";
              if (!locationId || !refundOfId) {
                pushErr(e, "errors.validationError", "refundOfId/locationId missing");
                processedIds.push(e.id);
                continue;
              }

              const lines = await tx.shopPurchaseInvoiceLine.findMany({ where: { tenantId, invoiceId: id }, select: { productId: true, quantity: true } });
              const receipts = await tx.shopPurchaseLotReceipt.findMany({ where: { tenantId, purchaseInvoiceId: id }, select: { lotId: true, quantity: true } });
              const qtyByLotId = new Map<string, Prisma.Decimal>();
              for (const r of receipts) qtyByLotId.set(r.lotId, (qtyByLotId.get(r.lotId) ?? new Prisma.Decimal(0)).add(r.quantity));

              for (const [lotId, qty] of qtyByLotId.entries()) {
                if (qty.isZero()) continue;
                await tx.shopStockLot.update({ where: { id: lotId }, data: { onHandQty: { increment: qty.negated() } } }).catch(() => null);
              }
              if (receipts.length) {
                await tx.shopPurchaseLotReceipt.deleteMany({ where: { tenantId, purchaseInvoiceId: id } });
              }

              for (const l of lines) {
                if (l.quantity.lte(0)) continue;
                const item = await tx.shopStockItem.findUnique({
                  where: { tenantId_productId_locationId: { tenantId, productId: l.productId, locationId } },
                  select: { id: true, onHandQty: true, avgCost: true }
                });
                if (!item) {
                  await tx.shopStockItem.create({ data: { tenantId, productId: l.productId, locationId, onHandQty: l.quantity, avgCost: new Prisma.Decimal(0) } }).catch(() => null);
                } else {
                  await tx.shopStockItem.update({ where: { id: item.id }, data: { onHandQty: item.onHandQty.add(l.quantity), avgCost: item.avgCost } });
                }
              }

              await tx.shopPurchaseInvoice.update({ where: { id }, data: { status: "void" } });
              await tx.auditLog.create({
                data: {
                  tenantId,
                  actorUserId: req.user.id,
                  action: "offline.shop.purchaseInvoice.refund.void",
                  entityType: "shopPurchaseInvoice",
                  entityId: id,
                  metadataJson: { eventId: e.id, refundOfId }
                }
              });
              pushOk(e);
              processedIds.push(e.id);
              continue;
            }

            pushErr(e, "errors.validationError", "only draft purchase invoices can be voided");
            processedIds.push(e.id);
            continue;
          }
        }

        if (e.entityType === "shop_purchase_invoice_payment") {
          const p = payload as { id?: string; invoiceId?: string; direction?: "in" | "out"; method?: string; amount?: string; note?: string | null };
          const id = (p.id ?? e.entityLocalId).trim();
          const invoiceId = (p.invoiceId ?? "").trim();
          if (!id || !invoiceId) {
            pushErr(e, "errors.validationError", "purchase invoice payment id/invoiceId missing");
            processedIds.push(e.id);
            continue;
          }
          const existing = await tx.shopPurchaseInvoicePayment.findUnique({ where: { id }, select: { id: true } });
          if (existing) {
            pushOk(e);
            processedIds.push(e.id);
            continue;
          }
          const inv = await tx.shopPurchaseInvoice.findUnique({ where: { id: invoiceId }, select: { id: true } });
          if (!inv) {
            pushErr(e, "errors.notFound", "purchase invoice not found");
            processedIds.push(e.id);
            continue;
          }
          const direction = p.direction === "in" ? "in" : "out";
          const method = (p.method ?? "Cash").trim();
          const amount = p.amount ? new Prisma.Decimal(p.amount) : new Prisma.Decimal(0);
          const note = p.note !== undefined ? (p.note ? String(p.note).trim() : null) : null;
          await tx.shopPurchaseInvoicePayment.create({ data: { id, tenantId, invoiceId, direction, method, amount, note, actorUserId: req.user.id } });
          const agg = await tx.shopPurchaseInvoicePayment.aggregate({ where: { tenantId, invoiceId, direction: "out" }, _sum: { amount: true } });
          const paidTotal = (agg._sum.amount ?? new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          await tx.shopPurchaseInvoice.update({ where: { id: invoiceId }, data: { paidTotal } });
          await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "offline.shop.purchaseInvoice.payment.create", entityType: "shopPurchaseInvoicePayment", entityId: id, metadataJson: { eventId: e.id } } });
          pushOk(e);
          processedIds.push(e.id);
          continue;
        }
      }
    });

    const processedSet = new Set(processedIds);
    const resultSet = new Set(results.map((r) => r.eventId));
    for (const e of supported) {
      if (!processedSet.has(e.id)) continue;
      if (resultSet.has(e.id)) continue;
      results.push({ entityType: e.entityType, eventId: e.id, entityLocalId: e.entityLocalId, operation: e.operation, ok: false, errorKey: "errors.internal", errorDetails: "Missing result row for processed event" });
    }

    return { data: { processed: processedIds.length, processedIds, results } };
  }

  @Post("pull")
  @UseGuards(AuthGuard("jwt"), TenantGuard)
  async pull(@Req() req: { tenantId: string }, @Body() body: { moduleId?: string; cursor?: string | null }) {
    const tenantId = req.tenantId;
    const moduleId = body?.moduleId ?? "shop";
    const cursorRaw = body?.cursor ?? null;
    const cursor = cursorRaw ? new Date(cursorRaw) : null;

    if (moduleId === "tenant") {
      const [memberships, roles] = await Promise.all([
        this.prisma.membership.findMany({
          where: { tenantId },
          select: {
            id: true,
            status: true,
            createdAt: true,
            updatedAt: true,
            user: { select: { id: true, fullName: true, email: true } },
            role: { select: { id: true, name: true } },
            enabledModules: { select: { moduleId: true } }
          },
          orderBy: { updatedAt: "asc" },
          take: 500
        }),
        this.prisma.role.findMany({
          where: { tenantId },
          select: { id: true, name: true, updatedAt: true },
          orderBy: { updatedAt: "asc" },
          take: 500
        })
      ]);
      const serverTime = new Date().toISOString();
      const maxDate = [...memberships.map((m) => m.updatedAt), ...roles.map((r) => r.updatedAt)].reduce<Date | null>((acc, d) => (acc && acc > d ? acc : d), null);
      return {
        data: {
          moduleId,
          cursor: (maxDate ?? new Date(serverTime)).toISOString(),
          serverTime,
          team: {
            roles: roles.map((r) => ({ id: r.id, name: r.name, updatedAt: r.updatedAt.toISOString() })),
            members: memberships.map((m) => ({
              id: m.id,
              status: m.status,
              createdAt: m.createdAt.toISOString(),
              updatedAt: m.updatedAt.toISOString(),
              user: { id: m.user.id, fullName: m.user.fullName, email: m.user.email },
              role: { id: m.role.id, name: m.role.name },
              moduleIds: m.enabledModules.map((x) => x.moduleId)
            }))
          }
        }
      };
    }

    if (moduleId !== "shop" && moduleId !== "pharmacy") {
      return {
        data: {
          moduleId,
          cursor: cursorRaw,
          serverTime: new Date().toISOString(),
          units: [],
          locations: [],
          categories: [],
          products: [],
          packagings: [],
          pharmacyProfiles: [],
          customers: [],
          suppliers: [],
          paymentMethods: [],
          stockItems: [],
          settings: null
        }
      };
    }

    const shopModuleId = moduleId === "pharmacy" ? "pharmacy" : "shop";

    const [units, locations, categories, products, packagings, pharmacyProfiles, customers, suppliers, paymentMethods, stockItems, settings, lots, purchaseLotReceipts, invoiceLotAllocations] = await Promise.all([
      this.prisma.shopUnit.findMany({
        where: { tenantId, moduleId: shopModuleId, ...(cursor ? { updatedAt: { gt: cursor } } : {}) },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 500
      }),
      this.prisma.shopLocation.findMany({
        where: { tenantId, moduleId: shopModuleId, ...(cursor ? { updatedAt: { gt: cursor } } : {}) },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 500
      }),
      this.prisma.shopCategory.findMany({
        where: { tenantId, moduleId: shopModuleId, ...(cursor ? { updatedAt: { gt: cursor } } : {}) },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 500
      }),
      this.prisma.shopProduct.findMany({
        where: { tenantId, moduleId: shopModuleId, ...(cursor ? { updatedAt: { gt: cursor } } : {}) },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 500,
        include: { barcodes: { select: { code: true }, orderBy: { createdAt: "asc" } } }
      }),
      this.prisma.shopProductPackaging.findMany({
        where: { tenantId, product: { is: { moduleId: shopModuleId } }, ...(cursor ? { updatedAt: { gt: cursor } } : {}) },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 500
      }),
      this.prisma.shopProductPharmacyProfile.findMany({
        where: { tenantId, product: { is: { moduleId: shopModuleId } }, ...(cursor ? { updatedAt: { gt: cursor } } : {}) },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 500
      }),
      this.prisma.shopCustomer.findMany({
        where: { tenantId, moduleId: shopModuleId, ...(cursor ? { updatedAt: { gt: cursor } } : {}) },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 500
      }),
      this.prisma.shopSupplier.findMany({
        where: { tenantId, moduleId: shopModuleId, ...(cursor ? { updatedAt: { gt: cursor } } : {}) },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 500
      }),
      this.prisma.shopPaymentMethod.findMany({
        where: { tenantId, moduleId: shopModuleId, ...(cursor ? { updatedAt: { gt: cursor } } : {}) },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 500
      }),
      this.prisma.shopStockItem.findMany({
        where: { tenantId, product: { is: { moduleId: shopModuleId } }, location: { is: { moduleId: shopModuleId } }, ...(cursor ? { updatedAt: { gt: cursor } } : {}) },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: 500
      }),
      this.prisma.shopSettings.findUnique({
        where: { tenantId },
        select: {
          sellCurrencyCode: true,
          buyCurrencyCode: true,
          taxEnabled: true,
          taxRate: true,
          cashRoundingIncrement: true,
          pharmacyReceivingRequireLotNumber: true,
          pharmacyReceivingRequireExpiryDate: true,
          updatedAt: true
        }
      }),
      moduleId === "pharmacy"
        ? this.prisma.shopStockLot.findMany({
            where: { tenantId, product: { is: { moduleId: shopModuleId } }, location: { is: { moduleId: shopModuleId } }, ...(cursor ? { updatedAt: { gt: cursor } } : {}) },
            select: { id: true, productId: true, locationId: true, lotNumber: true, expiryDate: true, onHandQty: true, createdAt: true, updatedAt: true },
            orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
            take: 500
          })
        : Promise.resolve([]),
      moduleId === "pharmacy"
        ? this.prisma.shopPurchaseLotReceipt.findMany({
            where: { tenantId, invoice: { is: { moduleId: shopModuleId } }, ...(cursor ? { createdAt: { gt: cursor } } : {}) },
            select: {
              id: true,
              purchaseInvoiceId: true,
              purchaseInvoiceLineId: true,
              quantity: true,
              unitCost: true,
              createdAt: true,
              lot: { select: { id: true, productId: true, locationId: true, lotNumber: true, expiryDate: true, onHandQty: true, createdAt: true, updatedAt: true } },
              invoice: { select: { id: true, purchaseNumber: true, status: true, postedAt: true, supplier: { select: { id: true, name: true } } } }
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 500
          })
        : Promise.resolve([]),
      moduleId === "pharmacy"
        ? this.prisma.shopInvoiceLotAllocation.findMany({
            where: { tenantId, invoice: { is: { moduleId: shopModuleId } }, ...(cursor ? { createdAt: { gt: cursor } } : {}) },
            select: {
              id: true,
              invoiceId: true,
              invoiceLineId: true,
              quantity: true,
              createdAt: true,
              lot: { select: { id: true, productId: true, locationId: true, lotNumber: true, expiryDate: true, onHandQty: true, createdAt: true, updatedAt: true } },
              line: { select: { productId: true } },
              invoice: { select: { id: true, invoiceNumber: true, kind: true, status: true, postedAt: true, customer: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } } }
            },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            take: 500
          })
        : Promise.resolve([])
    ]);

    const serverTime = new Date().toISOString();
    const unitItems = units.map((u) => ({ id: u.id, name: u.name, symbol: u.symbol, isActive: u.isActive, updatedAt: u.updatedAt.toISOString() }));
    const locationItems = locations.map((l) => ({ id: l.id, name: l.name, isActive: l.isActive, updatedAt: l.updatedAt.toISOString() }));
    const categoryItems = categories.map((c) => ({ id: c.id, name: c.name, parentId: c.parentId, isActive: c.isActive, updatedAt: c.updatedAt.toISOString() }));

    const productItems = products.map((p) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      description: p.description,
      unitId: p.unitId,
      categoryId: p.categoryId,
      imageFileId: p.imageFileId,
      sellPrice: p.sellPrice.toString(),
      costPrice: p.costPrice?.toString() ?? null,
      parentProductId: p.parentProductId,
      variantLabel: p.variantLabel,
      variantAttributes: p.variantAttributesJson,
      barcodes: p.barcodes.map((b) => b.code),
      isActive: p.isActive,
      deletedAt: p.deletedAt ? p.deletedAt.toISOString() : null,
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString()
    }));
    const packagingItems = packagings.map((p) => ({ id: p.id, productId: p.productId, label: p.label, multiplier: p.multiplier.toString(), barcode: p.barcode, updatedAt: p.updatedAt.toISOString() }));
    const pharmacyProfileItems = pharmacyProfiles.map((p) => ({
      productId: p.productId,
      trackLots: p.trackLots,
      requiresPrescription: p.requiresPrescription,
      isControlled: p.isControlled,
      form: p.form,
      strength: p.strength,
      updatedAt: p.updatedAt.toISOString()
    }));

    const customerItems = customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      address: c.address,
      notes: c.notes,
      isActive: c.isActive,
      deletedAt: c.deletedAt ? c.deletedAt.toISOString() : null,
      updatedAt: c.updatedAt.toISOString()
    }));
    const supplierItems = suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      phone: s.phone,
      email: s.email,
      address: s.address,
      notes: s.notes,
      isActive: s.isActive,
      deletedAt: s.deletedAt ? s.deletedAt.toISOString() : null,
      updatedAt: s.updatedAt.toISOString()
    }));
    const paymentMethodItems = paymentMethods.map((m) => ({ id: m.id, name: m.name, kind: m.kind, isActive: m.isActive, updatedAt: m.updatedAt.toISOString() }));
    const stockItemItems = stockItems.map((s) => ({
      productId: s.productId,
      locationId: s.locationId,
      onHandQty: s.onHandQty.toString(),
      avgCost: s.avgCost.toString(),
      updatedAt: s.updatedAt.toISOString()
    }));
    const settingsItem = settings
      ? {
          baseCurrencyCode: "AFN",
          sellCurrencyCode: settings.sellCurrencyCode,
          buyCurrencyCode: settings.buyCurrencyCode,
          taxEnabled: settings.taxEnabled,
          taxRate: settings.taxRate.toString(),
          cashRoundingIncrement: settings.cashRoundingIncrement.toString(),
          pharmacyReceivingRequireLotNumber: settings.pharmacyReceivingRequireLotNumber,
          pharmacyReceivingRequireExpiryDate: settings.pharmacyReceivingRequireExpiryDate,
          updatedAt: settings.updatedAt.toISOString()
        }
      : null;

    const lotItems =
      moduleId === "pharmacy"
        ? (lots as Array<{ id: string; productId: string; locationId: string; lotNumber: string; expiryDate: Date; onHandQty: Prisma.Decimal; createdAt: Date; updatedAt: Date }>).map((l) => {
            const iso = l.expiryDate.toISOString();
            return {
              id: l.id,
              productId: l.productId,
              locationId: l.locationId,
              lotNumber: l.lotNumber,
              expiryDate: iso.startsWith("9999-12-31") ? null : iso,
              onHandQty: l.onHandQty.toString(),
              createdAt: l.createdAt.toISOString(),
              updatedAt: l.updatedAt.toISOString()
            };
          })
        : [];

    const purchaseLotReceiptItems =
      moduleId === "pharmacy"
        ? (purchaseLotReceipts as Array<{
            id: string;
            purchaseInvoiceId: string;
            purchaseInvoiceLineId: string;
            quantity: Prisma.Decimal;
            unitCost: Prisma.Decimal;
            createdAt: Date;
            lot: { id: string; productId: string; locationId: string; lotNumber: string; expiryDate: Date; onHandQty: Prisma.Decimal; createdAt: Date; updatedAt: Date };
            invoice: { id: string; purchaseNumber: string | null; status: string; postedAt: Date | null; supplier: { id: string; name: string } | null };
          }>).map((r) => {
            const lotIso = r.lot.expiryDate.toISOString();
            return {
              id: r.id,
              purchaseInvoice: { id: r.invoice.id, purchaseNumber: r.invoice.purchaseNumber, status: r.invoice.status, postedAt: r.invoice.postedAt ? r.invoice.postedAt.toISOString() : null, supplier: r.invoice.supplier ? { id: r.invoice.supplier.id, name: r.invoice.supplier.name } : null },
              purchaseInvoiceLineId: r.purchaseInvoiceLineId,
              quantity: r.quantity.toString(),
              unitCost: r.unitCost.toString(),
              createdAt: r.createdAt.toISOString(),
              lot: {
                id: r.lot.id,
                productId: r.lot.productId,
                locationId: r.lot.locationId,
                lotNumber: r.lot.lotNumber,
                expiryDate: lotIso.startsWith("9999-12-31") ? null : lotIso,
                onHandQty: r.lot.onHandQty.toString(),
                createdAt: r.lot.createdAt.toISOString(),
                updatedAt: r.lot.updatedAt.toISOString()
              }
            };
          })
        : [];

    const invoiceLotAllocationItems =
      moduleId === "pharmacy"
        ? (invoiceLotAllocations as Array<{
            id: string;
            invoiceId: string;
            invoiceLineId: string;
            quantity: Prisma.Decimal;
            createdAt: Date;
            lot: { id: string; productId: string; locationId: string; lotNumber: string; expiryDate: Date; onHandQty: Prisma.Decimal; createdAt: Date; updatedAt: Date };
            line: { productId: string };
            invoice: { id: string; invoiceNumber: string | null; kind: string; status: string; postedAt: Date | null; customer: { id: string; name: string } | null; location: { id: string; name: string } | null };
          }>).map((a) => {
            const lotIso = a.lot.expiryDate.toISOString();
            return {
              id: a.id,
              invoice: {
                id: a.invoice.id,
                invoiceNumber: a.invoice.invoiceNumber,
                kind: a.invoice.kind,
                status: a.invoice.status,
                postedAt: a.invoice.postedAt ? a.invoice.postedAt.toISOString() : null,
                customer: a.invoice.customer ? { id: a.invoice.customer.id, name: a.invoice.customer.name } : null,
                location: a.invoice.location ? { id: a.invoice.location.id, name: a.invoice.location.name } : null
              },
              invoiceLineId: a.invoiceLineId,
              productId: a.line.productId,
              quantity: a.quantity.toString(),
              createdAt: a.createdAt.toISOString(),
              lot: {
                id: a.lot.id,
                productId: a.lot.productId,
                locationId: a.lot.locationId,
                lotNumber: a.lot.lotNumber,
                expiryDate: lotIso.startsWith("9999-12-31") ? null : lotIso,
                onHandQty: a.lot.onHandQty.toString(),
                createdAt: a.lot.createdAt.toISOString(),
                updatedAt: a.lot.updatedAt.toISOString()
              }
            };
          })
        : [];

    const candidates = [
      ...unitItems.map((x) => x.updatedAt),
      ...locationItems.map((x) => x.updatedAt),
      ...categoryItems.map((x) => x.updatedAt),
      ...productItems.map((x) => x.updatedAt),
      ...packagingItems.map((x) => x.updatedAt),
      ...pharmacyProfileItems.map((x) => x.updatedAt),
      ...customerItems.map((x) => x.updatedAt),
      ...supplierItems.map((x) => x.updatedAt),
      ...paymentMethodItems.map((x) => x.updatedAt),
      ...stockItemItems.map((x) => x.updatedAt),
      ...lotItems.map((x) => x.updatedAt),
      ...purchaseLotReceiptItems.map((x) => x.createdAt),
      ...invoiceLotAllocationItems.map((x) => x.createdAt)
    ].filter(Boolean);
    const nextCursor = candidates.length ? candidates.sort().at(-1)! : cursorRaw;
    return {
      data: {
        moduleId,
        cursor: nextCursor,
        serverTime,
        units: unitItems,
        locations: locationItems,
        categories: categoryItems,
        products: productItems,
        packagings: packagingItems,
        pharmacyProfiles: pharmacyProfileItems,
        customers: customerItems,
        suppliers: supplierItems,
        paymentMethods: paymentMethodItems,
        stockItems: stockItemItems,
        settings: settingsItem,
        lots: lotItems,
        purchaseLotReceipts: purchaseLotReceiptItems,
        invoiceLotAllocations: invoiceLotAllocationItems
      }
    };
  }
}
