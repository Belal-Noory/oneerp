import { Body, Controller, Delete, Get, HttpException, Param, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { AuthGuard } from "@nestjs/passport";
import type { Prisma as PrismaTypes } from "@prisma/client";
import { Decimal } from "@prisma/client/runtime/library";
import { PrismaService } from "../../prisma/prisma.service";
import { TenantGuard } from "../../shared/tenant.guard";
import { PermissionsGuard } from "../../shared/permissions.guard";
import { RequirePermissions } from "../../shared/permissions.decorator";
import { ModuleEnabledGuard } from "../../shared/module-enabled.guard";
import { MembershipModuleGuard } from "../../shared/membership-module.guard";
import { CreateCategoryDto, CreateProductDto, CreateUnitDto, ListProductsQueryDto, UpdateProductDto } from "../shop/dto/shop.dto";
import { CreatePackagingDto, CreateVariantDto, PosResolveQueryDto, UpdatePackagingDto } from "../shop/dto/product-variants-packaging.dto";
import { UpdateProductPharmacyProfileDto } from "../shop/dto/pharmacy.dto";
import { CreateInvoiceDto, CreateInvoicePaymentDto, CreateRefundDraftDto, ListInvoicesQueryDto, UpdateInvoiceDto } from "../shop/dto/invoices.dto";
import { CreateCustomerDto, ListCustomersQueryDto } from "../shop/dto/customers.dto";
import { CreateSupplierDto, ListSuppliersQueryDto, UpdateSupplierDto } from "../shop/dto/suppliers.dto";
import { SupplierLedgerQueryDto } from "../shop/dto/supplier-ledger.dto";
import { CreatePurchaseInvoiceDto, CreatePurchasePaymentDto, ListPurchaseInvoicesQueryDto, ReceivePurchaseInvoiceDto, UpdatePurchaseInvoiceDto } from "../shop/dto/purchases.dto";
import { UpdateShopSettingsDto } from "../shop/dto/shop-settings.dto";
import { AdjustStockDto, CreateLocationDto, ListInventoryQueryDto, ListLotsQueryDto, ListMovementsQueryDto, ReceiveStockDto, TransferStockDto, UpdateLocationDto } from "../shop/dto/inventory.dto";
import { LotTraceQueryDto, ReportsRangeQueryDto } from "../shop/dto/reports.dto";
import { ReportExportLogDto } from "../shop/dto/reports-export.dto";
import { CashSessionCashDto, CloseCashSessionDto, ListCashSessionsQueryDto, OpenCashSessionDto } from "../shop/dto/cash-sessions.dto";

const Prisma = { Decimal };

function toInt(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.floor(n));
}

function toDecimalOrZero(raw: string | undefined | null): Decimal {
  if (!raw) return new Decimal(0);
  try {
    const d = new Decimal(raw);
    if (!d.isFinite()) return new Decimal(0);
    return d;
  } catch {
    return new Decimal(0);
  }
}

function clampDecimal(value: Decimal, min: Decimal, max: Decimal): Decimal {
  if (value.lt(min)) return min;
  if (value.gt(max)) return max;
  return value;
}

function roundToIncrement(amount: Decimal, increment: Decimal): Decimal {
  if (increment.lte(0)) return amount;
  const q = amount.div(increment);
  const rq = q.toDecimalPlaces(0, Decimal.ROUND_HALF_UP);
  return rq.mul(increment).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

function formatInvoiceNumber(n: number): string {
  const s = String(n).padStart(6, "0");
  return `INV-${s}`;
}

function formatRefundNumber(n: number): string {
  const s = String(n).padStart(6, "0");
  return `CRN-${s}`;
}

function formatPurchaseNumber(n: number): string {
  const s = String(n).padStart(6, "0");
  return `PIN-${s}`;
}

function formatPurchaseRefundNumber(n: number): string {
  const s = String(n).padStart(6, "0");
  return `PCR-${s}`;
}

function parseDateOrNull(value: string | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function normalizeBarcodes(list: string[] | undefined): string[] {
  if (!list) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of list) {
    const v = raw.trim();
    if (!v) continue;
    if (v.length > 64) continue;
    if (seen.has(v)) continue;
    seen.add(v);
    out.push(v);
  }
  return out;
}

function defaultCategoryNames(): string[] {
  return [
    "Antibiotics",
    "Analgesics",
    "Antipyretics",
    "Antihistamines",
    "Antacids",
    "Vitamins & Supplements",
    "Cardiovascular",
    "Diabetes",
    "Respiratory",
    "Dermatology",
    "Ophthalmic",
    "ENT",
    "Gastrointestinal",
    "Neurology",
    "Pediatrics",
    "Women's Health",
    "Medical Devices",
    "First Aid"
  ];
}

function defaultUnits(): { name: string; symbol: string }[] {
  return [
    { name: "Tablet", symbol: "tab" },
    { name: "Capsule", symbol: "cap" },
    { name: "Strip", symbol: "strip" },
    { name: "Bottle", symbol: "btl" },
    { name: "Vial", symbol: "vial" },
    { name: "Ampoule", symbol: "amp" },
    { name: "Sachet", symbol: "sachet" },
    { name: "Tube", symbol: "tube" },
    { name: "Inhaler", symbol: "inh" },
    { name: "Syringe", symbol: "syr" },
    { name: "Patch", symbol: "patch" },
    { name: "Piece", symbol: "pc" },
    { name: "Milligram", symbol: "mg" },
    { name: "Gram", symbol: "g" },
    { name: "Kilogram", symbol: "kg" },
    { name: "Milliliter", symbol: "ml" },
    { name: "Liter", symbol: "L" },
    { name: "Pack", symbol: "pack" },
    { name: "Box", symbol: "box" }
  ];
}

function toDecimal(value: string): Decimal {
  return new Decimal(value);
}

@Controller("pharmacy")
@UseGuards(AuthGuard("jwt"), TenantGuard, ModuleEnabledGuard("pharmacy"), MembershipModuleGuard("pharmacy"), PermissionsGuard)
export class PharmacyController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("overview")
  @RequirePermissions("shop.products.read")
  async overview(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;

    const tenantSettings = await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId, baseCurrencyCode: "USD" },
      select: { baseCurrencyCode: true }
    });

    const shopSettings = await this.prisma.shopSettings.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId, buyCurrencyCode: tenantSettings.baseCurrencyCode, sellCurrencyCode: tenantSettings.baseCurrencyCode },
      select: { buyCurrencyCode: true, sellCurrencyCode: true }
    });

    const now = new Date();
    const startToday = new Date(now);
    startToday.setHours(0, 0, 0, 0);
    const endToday = new Date(startToday);
    endToday.setDate(endToday.getDate() + 1);
    const nearDays = 30;
    const nearCutoff = new Date(startToday);
    nearCutoff.setDate(nearCutoff.getDate() + nearDays);

    const [productsActive, productsArchived, categories, suppliers, locations, recent, expiredLots, nearLots, salesToday] = await Promise.all([
      this.prisma.shopProduct.count({ where: { tenantId, moduleId: "pharmacy", deletedAt: null } }),
      this.prisma.shopProduct.count({ where: { tenantId, moduleId: "pharmacy", deletedAt: { not: null } } }),
      this.prisma.shopCategory.count({ where: { tenantId, moduleId: "pharmacy", isActive: true } }),
      this.prisma.shopSupplier.count({ where: { tenantId, moduleId: "pharmacy", deletedAt: null, isActive: true } }),
      this.prisma.shopLocation.count({ where: { tenantId, moduleId: "pharmacy", isActive: true } }),
      this.prisma.shopProduct.findMany({
        where: { tenantId, moduleId: "pharmacy", deletedAt: null },
        select: { id: true, name: true, sellPrice: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5
      }),
      this.prisma.shopStockLot.count({
        where: {
          tenantId,
          onHandQty: { gt: new Prisma.Decimal(0) },
          expiryDate: { lt: startToday },
          product: { is: { moduleId: "pharmacy" } },
          location: { is: { moduleId: "pharmacy" } }
        }
      }),
      this.prisma.shopStockLot.count({
        where: {
          tenantId,
          onHandQty: { gt: new Prisma.Decimal(0) },
          expiryDate: { gte: startToday, lte: nearCutoff },
          product: { is: { moduleId: "pharmacy" } },
          location: { is: { moduleId: "pharmacy" } }
        }
      }),
      this.prisma.shopInvoice.aggregate({
        where: { tenantId, moduleId: "pharmacy", kind: "sale", status: "posted", postedAt: { gte: startToday, lt: endToday } },
        _sum: { subtotal: true },
        _count: { _all: true }
      })
    ]);

    return {
      data: {
        counts: { productsActive, productsArchived, categories, suppliers, locations },
        expiries: { nearDays, nearLots, expiredLots },
        salesToday: { count: salesToday._count._all, total: (salesToday._sum.subtotal ?? new Prisma.Decimal(0)).toString(), currency: shopSettings.sellCurrencyCode },
        currencies: { base: tenantSettings.baseCurrencyCode, sell: shopSettings.sellCurrencyCode, buy: shopSettings.buyCurrencyCode },
        recentMedicines: recent.map((p) => ({ id: p.id, name: p.name, sellPrice: p.sellPrice.toString(), createdAt: p.createdAt }))
      }
    };
  }

  @Get("locations")
  @RequirePermissions("shop.products.read")
  async listLocations(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    let items = await this.prisma.shopLocation.findMany({
      where: { tenantId, moduleId: "pharmacy", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    });
    if (items.length === 0) {
      await this.prisma.shopLocation.createMany({
        data: [{ tenantId, moduleId: "pharmacy", name: "Main Pharmacy" }],
        skipDuplicates: true
      });
      await this.prisma.auditLog.create({ data: { tenantId, actorUserId: null, action: "pharmacy.location.seed", metadataJson: {} } });
      items = await this.prisma.shopLocation.findMany({
        where: { tenantId, moduleId: "pharmacy", isActive: true },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      });
    }
    return { data: items };
  }

  @Post("locations")
  @RequirePermissions("shop.locations.create")
  async createLocation(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateLocationDto) {
    const name = body.name.trim();
    if (name.length < 2) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    try {
      const loc = await this.prisma.shopLocation.create({ data: { tenantId: req.tenantId, moduleId: "pharmacy", name }, select: { id: true, name: true, isActive: true } });
      await this.prisma.auditLog.create({
        data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "pharmacy.location.create", entityType: "shopLocation", entityId: loc.id, metadataJson: {} }
      });
      return { data: loc };
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002") {
        throw new HttpException({ error: { code: "CONFLICT", message_key: "errors.conflict" } }, 409);
      }
      throw err;
    }
  }

  @Patch("locations/:id")
  @RequirePermissions("shop.locations.update")
  async updateLocation(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: UpdateLocationDto) {
    const loc = await this.prisma.shopLocation.findFirst({ where: { id, tenantId: req.tenantId, moduleId: "pharmacy" }, select: { id: true } });
    if (!loc) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const updates: Record<string, unknown> = {};
    if (body.name !== undefined) updates.name = body.name.trim();
    if (body.isActive !== undefined) updates.isActive = body.isActive === "true";

    await this.prisma.shopLocation.update({ where: { id }, data: updates });
    await this.prisma.auditLog.create({
      data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "pharmacy.location.update", entityType: "shopLocation", entityId: id, metadataJson: {} }
    });

    return { data: { success: true } };
  }

  @Get("inventory")
  @RequirePermissions("shop.inventory.read")
  async inventory(@Req() req: { tenantId: string }, @Query() query: ListInventoryQueryDto) {
    const tenantId = req.tenantId;
    const q = query.q?.trim() || null;
    const locationId = query.locationId?.trim() || null;

    const locations = await this.prisma.shopLocation.findMany({
      where: { tenantId, moduleId: "pharmacy", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    });
    const effectiveLocationId = locationId ?? locations[0]?.id ?? null;

    const productWhere: Record<string, unknown> = { tenantId, moduleId: "pharmacy", deletedAt: null, isActive: true };
    if (q) {
      productWhere.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { barcodes: { some: { code: { contains: q, mode: "insensitive" } } } }
      ];
    }

    const products = await this.prisma.shopProduct.findMany({
      where: productWhere,
      select: { id: true, name: true, sku: true, imageFileId: true, unit: { select: { id: true, name: true, symbol: true } } },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      take: 200
    });

    const stockMap = new Map<string, Decimal>();
    if (effectiveLocationId) {
      const stock = await this.prisma.shopStockItem.findMany({
        where: { tenantId, locationId: effectiveLocationId, location: { is: { moduleId: "pharmacy" } }, product: { is: { moduleId: "pharmacy" } } },
        select: { productId: true, onHandQty: true }
      });
      for (const s of stock) stockMap.set(s.productId, s.onHandQty);
    }

    return {
      data: {
        locations,
        locationId: effectiveLocationId,
        items: products.map((p) => ({
          product: { id: p.id, name: p.name, sku: p.sku, image: p.imageFileId ? { id: p.imageFileId, url: `/api/files/${p.imageFileId}` } : null, unit: p.unit ? { id: p.unit.id, name: p.unit.name, symbol: p.unit.symbol } : null },
          onHandQty: (stockMap.get(p.id) ?? new Prisma.Decimal(0)).toString()
        }))
      }
    };
  }

  @Post("inventory/receive")
  @RequirePermissions("shop.inventory.adjust")
  async receive(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: ReceiveStockDto) {
    const tenantId = req.tenantId;
    const qty = toDecimal(body.qty);
    if (qty.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const location = await this.prisma.shopLocation.findFirst({ where: { id: body.locationId, tenantId, moduleId: "pharmacy", isActive: true }, select: { id: true } });
    if (!location) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    const product = await this.prisma.shopProduct.findFirst({ where: { id: body.productId, tenantId, moduleId: "pharmacy", deletedAt: null }, select: { id: true, costPrice: true } });
    if (!product) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      const profile = await tx.shopProductPharmacyProfile.findFirst({ where: { tenantId, productId: body.productId }, select: { trackLots: true } });
      const trackLots = profile ? profile.trackLots : true;
      if (trackLots) {
        const expiryDate = new Date("9999-12-31T00:00:00.000Z");
        const lot = await tx.shopStockLot.upsert({
          where: { tenantId_productId_locationId_lotNumber_expiryDate: { tenantId, productId: body.productId, locationId: body.locationId, lotNumber: "ADJUST", expiryDate } },
          update: { onHandQty: { increment: qty } },
          create: { tenantId, productId: body.productId, locationId: body.locationId, lotNumber: "ADJUST", expiryDate, onHandQty: qty },
          select: { id: true }
        });
        await tx.auditLog.create({
          data: { tenantId, actorUserId: req.user.id, action: "pharmacy.inventory.lot.receive", entityType: "shopStockLot", entityId: lot.id, metadataJson: { productId: body.productId, locationId: body.locationId, qty: qty.toString() } }
        });
      }

      const item = await tx.shopStockItem.upsert({
        where: { tenantId_productId_locationId: { tenantId, productId: body.productId, locationId: body.locationId } },
        update: {},
        create: { tenantId, productId: body.productId, locationId: body.locationId, onHandQty: new Prisma.Decimal(0), avgCost: new Prisma.Decimal(0) },
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
      await tx.shopStockItem.update({ where: { id: item.id }, data: { onHandQty: after, avgCost: nextAvgCost } });
      await tx.shopStockMovement.create({
        data: { tenantId, type: "receive", productId: body.productId, locationId: body.locationId, deltaQty: qty, beforeQty: before, afterQty: after, note: body.note?.trim() || null, actorUserId: req.user.id }
      });
    });

    return { data: { success: true } };
  }

  @Post("inventory/adjust")
  @RequirePermissions("shop.inventory.adjust")
  async adjust(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: AdjustStockDto) {
    const tenantId = req.tenantId;
    const qty = toDecimal(body.qty);
    const mode = body.mode === "set" ? "set" : "delta";
    if (mode === "delta" && qty.eq(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    if (mode === "set" && qty.lt(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const location = await this.prisma.shopLocation.findFirst({ where: { id: body.locationId, tenantId, moduleId: "pharmacy", isActive: true }, select: { id: true } });
    if (!location) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    const product = await this.prisma.shopProduct.findFirst({ where: { id: body.productId, tenantId, moduleId: "pharmacy", deletedAt: null }, select: { id: true, costPrice: true } });
    if (!product) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      const profile = await tx.shopProductPharmacyProfile.findFirst({ where: { tenantId, productId: body.productId }, select: { trackLots: true } });
      const trackLots = profile ? profile.trackLots : true;

      const item = await tx.shopStockItem.upsert({
        where: { tenantId_productId_locationId: { tenantId, productId: body.productId, locationId: body.locationId } },
        update: {},
        create: { tenantId, productId: body.productId, locationId: body.locationId, onHandQty: new Prisma.Decimal(0), avgCost: new Prisma.Decimal(0) },
        select: { id: true, onHandQty: true, avgCost: true }
      });
      const before = item.onHandQty;
      const beforeAvgCost = item.avgCost;
      const after = mode === "set" ? qty : before.add(qty);
      if (after.lt(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      const delta = after.sub(before);

      if (trackLots && delta.lt(0)) {
        let remaining = delta.negated();
        const lots = await tx.shopStockLot.findMany({
          where: { tenantId, productId: body.productId, locationId: body.locationId, onHandQty: { gt: new Prisma.Decimal(0) } },
          select: { id: true, onHandQty: true, expiryDate: true, createdAt: true },
          orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }]
        });
        lots.sort((a, b) => {
          if (!a.expiryDate && !b.expiryDate) return a.createdAt.getTime() - b.createdAt.getTime();
          if (!a.expiryDate) return 1;
          if (!b.expiryDate) return -1;
          const d = a.expiryDate.getTime() - b.expiryDate.getTime();
          if (d !== 0) return d;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });
        for (const lot of lots) {
          if (remaining.lte(0)) break;
          const take = lot.onHandQty.lt(remaining) ? lot.onHandQty : remaining;
          if (take.lte(0)) continue;
          await tx.shopStockLot.update({ where: { id: lot.id }, data: { onHandQty: lot.onHandQty.sub(take) } });
          remaining = remaining.sub(take);
        }
        if (remaining.gt(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      } else if (trackLots && delta.gt(0)) {
        const expiryDate = new Date("9999-12-31T00:00:00.000Z");
        await tx.shopStockLot.upsert({
          where: { tenantId_productId_locationId_lotNumber_expiryDate: { tenantId, productId: body.productId, locationId: body.locationId, lotNumber: "ADJUST", expiryDate } },
          update: { onHandQty: { increment: delta } },
          create: { tenantId, productId: body.productId, locationId: body.locationId, lotNumber: "ADJUST", expiryDate, onHandQty: delta }
        });
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
      await tx.shopStockItem.update({ where: { id: item.id }, data: { onHandQty: after, avgCost: nextAvgCost } });
      await tx.shopStockMovement.create({
        data: { tenantId, type: "adjust", productId: body.productId, locationId: body.locationId, deltaQty: delta, beforeQty: before, afterQty: after, note: body.note?.trim() || null, actorUserId: req.user.id }
      });
    });

    return { data: { success: true } };
  }

  @Post("inventory/transfer")
  @RequirePermissions("shop.inventory.transfer")
  async transfer(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: TransferStockDto) {
    const tenantId = req.tenantId;
    if (body.fromLocationId === body.toLocationId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    const qty = toDecimal(body.qty);
    if (qty.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const requestedLots = (body.lots ?? []).filter((l) => l && l.lotId && l.qty);
    const lotsRequested = requestedLots.length > 0;
    if (lotsRequested) {
      const lotIds = new Set<string>();
      let sum = new Prisma.Decimal(0);
      for (const l of requestedLots) {
        const id = l.lotId.trim();
        const q = toDecimal(l.qty);
        if (!id || q.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        if (lotIds.has(id)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        lotIds.add(id);
        sum = sum.add(q);
      }
      if (!sum.eq(qty)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const [fromLoc, toLoc] = await Promise.all([
      this.prisma.shopLocation.findFirst({ where: { id: body.fromLocationId, tenantId, moduleId: "pharmacy", isActive: true }, select: { id: true } }),
      this.prisma.shopLocation.findFirst({ where: { id: body.toLocationId, tenantId, moduleId: "pharmacy", isActive: true }, select: { id: true } })
    ]);
    if (!fromLoc || !toLoc) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    const product = await this.prisma.shopProduct.findFirst({ where: { id: body.productId, tenantId, moduleId: "pharmacy", deletedAt: null }, select: { id: true, costPrice: true } });
    if (!product) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      const profile = await tx.shopProductPharmacyProfile.findFirst({ where: { tenantId, productId: body.productId }, select: { trackLots: true } });
      const trackLots = profile ? profile.trackLots : true;

      const fromItem = await tx.shopStockItem.upsert({
        where: { tenantId_productId_locationId: { tenantId, productId: body.productId, locationId: body.fromLocationId } },
        update: {},
        create: { tenantId, productId: body.productId, locationId: body.fromLocationId, onHandQty: new Prisma.Decimal(0), avgCost: new Prisma.Decimal(0) },
        select: { id: true, onHandQty: true, avgCost: true }
      });
      const toItem = await tx.shopStockItem.upsert({
        where: { tenantId_productId_locationId: { tenantId, productId: body.productId, locationId: body.toLocationId } },
        update: {},
        create: { tenantId, productId: body.productId, locationId: body.toLocationId, onHandQty: new Prisma.Decimal(0), avgCost: new Prisma.Decimal(0) },
        select: { id: true, onHandQty: true, avgCost: true }
      });

      const fromBefore = fromItem.onHandQty;
      const fromAvgCost = fromItem.avgCost;
      const fromAfter = fromBefore.sub(qty);
      if (fromAfter.lt(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

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

      if (trackLots) {
        const requested = (body.lots ?? []).filter((l) => l && l.lotId && l.qty).map((l) => ({ lotId: l.lotId.trim(), qty: toDecimal(l.qty) }));
        const useRequestedLots = requested.length > 0;

        if (useRequestedLots) {
          const lotIds = requested.map((x) => x.lotId);
          const rows = await tx.shopStockLot.findMany({
            where: {
              tenantId,
              id: { in: lotIds },
              productId: body.productId,
              locationId: body.fromLocationId,
              onHandQty: { gt: new Prisma.Decimal(0) },
              product: { is: { moduleId: "pharmacy" } },
              location: { is: { moduleId: "pharmacy" } }
            },
            select: { id: true, lotNumber: true, expiryDate: true, onHandQty: true }
          });
          if (rows.length !== lotIds.length) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
          const byId = new Map(rows.map((r) => [r.id, r]));

          for (const r of requested) {
            const row = byId.get(r.lotId);
            if (!row) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
            if (r.qty.lte(0) || r.qty.gt(row.onHandQty)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
          }

          for (const r of requested) {
            const row = byId.get(r.lotId)!;
            await tx.shopStockLot.update({ where: { id: row.id }, data: { onHandQty: row.onHandQty.sub(r.qty) } });
            const existingToLot = await tx.shopStockLot.findFirst({
              where: { tenantId, productId: body.productId, locationId: body.toLocationId, lotNumber: row.lotNumber, expiryDate: row.expiryDate },
              select: { id: true, onHandQty: true }
            });
            if (existingToLot) {
              await tx.shopStockLot.update({ where: { id: existingToLot.id }, data: { onHandQty: existingToLot.onHandQty.add(r.qty) } });
            } else {
              await tx.shopStockLot.create({ data: { tenantId, productId: body.productId, locationId: body.toLocationId, lotNumber: row.lotNumber, expiryDate: row.expiryDate, onHandQty: r.qty } });
            }
          }
        } else {
          let remaining = qty;
          const lots = await tx.shopStockLot.findMany({
            where: { tenantId, productId: body.productId, locationId: body.fromLocationId, onHandQty: { gt: new Prisma.Decimal(0) } },
            select: { id: true, lotNumber: true, expiryDate: true, onHandQty: true, createdAt: true },
            orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }]
          });
          lots.sort((a, b) => {
            if (!a.expiryDate && !b.expiryDate) return a.createdAt.getTime() - b.createdAt.getTime();
            if (!a.expiryDate) return 1;
            if (!b.expiryDate) return -1;
            const d = a.expiryDate.getTime() - b.expiryDate.getTime();
            if (d !== 0) return d;
            return a.createdAt.getTime() - b.createdAt.getTime();
          });
          for (const lot of lots) {
            if (remaining.lte(0)) break;
            const take = lot.onHandQty.lt(remaining) ? lot.onHandQty : remaining;
            if (take.lte(0)) continue;
            await tx.shopStockLot.update({ where: { id: lot.id }, data: { onHandQty: lot.onHandQty.sub(take) } });
            const existingToLot = await tx.shopStockLot.findFirst({
              where: { tenantId, productId: body.productId, locationId: body.toLocationId, lotNumber: lot.lotNumber, expiryDate: lot.expiryDate },
              select: { id: true, onHandQty: true }
            });
            if (existingToLot) {
              await tx.shopStockLot.update({ where: { id: existingToLot.id }, data: { onHandQty: existingToLot.onHandQty.add(take) } });
            } else {
              await tx.shopStockLot.create({ data: { tenantId, productId: body.productId, locationId: body.toLocationId, lotNumber: lot.lotNumber, expiryDate: lot.expiryDate, onHandQty: take } });
            }
            remaining = remaining.sub(take);
          }
          if (remaining.gt(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        }
      }

      await tx.shopStockItem.update({ where: { id: fromItem.id }, data: { onHandQty: fromAfter, avgCost: nextFromAvgCost } });
      await tx.shopStockItem.update({ where: { id: toItem.id }, data: { onHandQty: toAfter, avgCost: nextToAvgCost } });

      const note = body.note?.trim() || null;
      await tx.shopStockMovement.createMany({
        data: [
          { tenantId, type: "transfer_out", productId: body.productId, locationId: body.fromLocationId, relatedLocationId: body.toLocationId, deltaQty: qty.negated(), beforeQty: fromBefore, afterQty: fromAfter, note, actorUserId: req.user.id },
          { tenantId, type: "transfer_in", productId: body.productId, locationId: body.toLocationId, relatedLocationId: body.fromLocationId, deltaQty: qty, beforeQty: toBefore, afterQty: toAfter, note, actorUserId: req.user.id }
        ]
      });
    });

    return { data: { success: true } };
  }

  @Get("inventory/movements")
  @RequirePermissions("shop.inventory.read")
  async movements(@Req() req: { tenantId: string }, @Query() query: ListMovementsQueryDto) {
    const tenantId = req.tenantId;
    const page = toInt(query.page, 1);
    const pageSize = Math.min(50, toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = { tenantId, product: { is: { moduleId: "pharmacy" } }, location: { is: { moduleId: "pharmacy" } } };
    if (query.productId?.trim()) where.productId = query.productId.trim();
    if (query.locationId?.trim()) where.locationId = query.locationId.trim();

    const [total, items] = await Promise.all([
      this.prisma.shopStockMovement.count({ where }),
      this.prisma.shopStockMovement.findMany({
        where,
        select: {
          id: true,
          type: true,
          deltaQty: true,
          beforeQty: true,
          afterQty: true,
          note: true,
          createdAt: true,
          product: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          relatedLocation: { select: { id: true, name: true } },
          actor: { select: { id: true, fullName: true } }
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize
      })
    ]);

    return {
      data: {
        page,
        pageSize,
        total,
        items: items.map((m) => ({
          id: m.id,
          type: m.type,
          deltaQty: m.deltaQty.toString(),
          beforeQty: m.beforeQty.toString(),
          afterQty: m.afterQty.toString(),
          note: m.note,
          createdAt: m.createdAt,
          product: { id: m.product.id, name: m.product.name },
          location: { id: m.location.id, name: m.location.name },
          relatedLocation: m.relatedLocation ? { id: m.relatedLocation.id, name: m.relatedLocation.name } : null,
          actor: m.actor ? { id: m.actor.id, fullName: m.actor.fullName } : null
        }))
      }
    };
  }

  @Get("inventory/lots")
  @RequirePermissions("shop.inventory.read")
  async lots(@Req() req: { tenantId: string }, @Query() query: ListLotsQueryDto) {
    const tenantId = req.tenantId;
    const page = toInt(query.page, 1);
    const pageSize = Math.min(50, toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const q = query.q?.trim() || null;
    const locationId = query.locationId?.trim() || null;
    const productId = query.productId?.trim() || null;
    const status = query.status === "expired" || query.status === "near" || query.status === "ok" || query.status === "no_expiry" ? query.status : "all";
    const nearDays = Math.min(365, toInt(query.nearDays, 30));

    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const nearLimit = new Date(now);
    nearLimit.setDate(now.getDate() + nearDays);
    const farDate = new Date("9999-12-31T00:00:00.000Z");

    const baseAnd: Record<string, unknown>[] = [];
    if (locationId) baseAnd.push({ locationId });
    if (productId) baseAnd.push({ productId });
    if (q) {
      baseAnd.push({
        OR: [
          { lotNumber: { contains: q, mode: "insensitive" } },
          { product: { is: { name: { contains: q, mode: "insensitive" } } } },
          { product: { is: { sku: { contains: q, mode: "insensitive" } } } },
          { product: { is: { barcodes: { some: { code: { contains: q, mode: "insensitive" } } } } } }
        ]
      });
    }

    const where: Record<string, unknown> = {
      tenantId,
      onHandQty: { gt: new Prisma.Decimal(0) },
      product: { is: { moduleId: "pharmacy" } },
      location: { is: { moduleId: "pharmacy" } }
    };
    const and: Record<string, unknown>[] = [...baseAnd];
    if (status === "expired") and.push({ expiryDate: { lt: now } });
    if (status === "near") and.push({ expiryDate: { gte: now, lte: nearLimit } });
    if (status === "ok") and.push({ expiryDate: { gt: nearLimit, lt: farDate } });
    if (status === "no_expiry") and.push({ OR: [{ expiryDate: null }, { expiryDate: farDate }] });
    if (and.length) where.AND = and;

    const summaryWhere: Record<string, unknown> = { ...where };
    const summaryAnd: Record<string, unknown>[] = [...baseAnd];
    if (summaryAnd.length) summaryWhere.AND = summaryAnd;
    delete (summaryWhere as Record<string, unknown>).expiryDate;

    const [total, items, expiredCount, nearCount, noExpiryCount, okCount] = await Promise.all([
      this.prisma.shopStockLot.count({ where }),
      this.prisma.shopStockLot.findMany({
        where,
        select: {
          id: true,
          lotNumber: true,
          expiryDate: true,
          onHandQty: true,
          createdAt: true,
          product: { select: { id: true, name: true, sku: true } },
          location: { select: { id: true, name: true } }
        },
        orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }],
        skip,
        take: pageSize
      }),
      this.prisma.shopStockLot.count({ where: { ...summaryWhere, expiryDate: { lt: now } } }),
      this.prisma.shopStockLot.count({ where: { ...summaryWhere, expiryDate: { gte: now, lte: nearLimit } } }),
      this.prisma.shopStockLot.count({ where: { ...summaryWhere, OR: [{ expiryDate: null }, { expiryDate: farDate }] } }),
      this.prisma.shopStockLot.count({ where: { ...summaryWhere, expiryDate: { gt: nearLimit, lt: farDate } } })
    ]);

    const msPerDay = 24 * 60 * 60 * 1000;
    const mapped = items.map((l) => {
      const exp = l.expiryDate ? new Date(l.expiryDate) : null;
      const noExpiry = !exp || exp.getTime() === farDate.getTime();
      let expiryStatus: "expired" | "near" | "ok" | "no_expiry" = "no_expiry";
      let daysToExpiry: number | null = null;
      if (!noExpiry && exp) {
        if (exp.getTime() < now.getTime()) expiryStatus = "expired";
        else if (exp.getTime() <= nearLimit.getTime()) expiryStatus = "near";
        else expiryStatus = "ok";
        daysToExpiry = Math.ceil((exp.getTime() - now.getTime()) / msPerDay);
      }
      return {
        id: l.id,
        lotNumber: l.lotNumber,
        expiryDate: noExpiry ? null : l.expiryDate,
        onHandQty: l.onHandQty.toString(),
        daysToExpiry,
        status: expiryStatus,
        product: { id: l.product.id, name: l.product.name, sku: l.product.sku },
        location: { id: l.location.id, name: l.location.name }
      };
    });

    return {
      data: {
        page,
        pageSize,
        total,
        nearDays,
        summary: { expired: expiredCount, near: nearCount, ok: okCount, noExpiry: noExpiryCount },
        items: mapped
      }
    };
  }

  @Get("reports/sales-summary")
  @RequirePermissions("shop.reports.read")
  async salesSummary(@Req() req: { tenantId: string }, @Query() query: ReportsRangeQueryDto) {
    const tenantId = req.tenantId;
    const from = parseDateOrNull(query.from);
    const to = parseDateOrNull(query.to);
    const locationId = query.locationId?.trim() || null;

    const where: Record<string, unknown> = { tenantId, moduleId: "pharmacy", status: "posted", kind: "sale" };
    if (locationId) where.locationId = locationId;
    if (from || to) {
      where.postedAt = {
        ...(from ? { gte: from } : {}),
        ...(to ? { lte: to } : {})
      };
    }

    const [count, aggregates] = await Promise.all([
      this.prisma.shopInvoice.count({ where }),
      this.prisma.shopInvoice.aggregate({ where, _sum: { subtotal: true, paidTotal: true } })
    ]);

    const subtotal = aggregates._sum.subtotal ?? new Prisma.Decimal(0);
    const paidTotal = aggregates._sum.paidTotal ?? new Prisma.Decimal(0);
    const outstanding = subtotal.sub(paidTotal);

    return { data: { invoicesCount: count, subtotal: subtotal.toString(), paidTotal: paidTotal.toString(), outstanding: outstanding.toString() } };
  }

  @Get("reports/cashflow-summary")
  @RequirePermissions("shop.reports.read")
  async cashflowSummary(@Req() req: { tenantId: string }, @Query() query: ReportsRangeQueryDto) {
    const tenantId = req.tenantId;
    const from = parseDateOrNull(query.from);
    const to = parseDateOrNull(query.to);
    const locationId = query.locationId?.trim() || null;

    const range = from || to ? { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } : null;

    const [inAgg, outAgg] = await Promise.all([
      this.prisma.shopInvoicePayment.aggregate({
        where: {
          tenantId,
          direction: "in",
          invoice: { is: { moduleId: "pharmacy", status: "posted", kind: "sale", ...(locationId ? { locationId } : {}) } },
          ...(range ? { createdAt: range } : {})
        },
        _sum: { amount: true }
      }),
      this.prisma.shopInvoicePayment.aggregate({
        where: {
          tenantId,
          direction: "out",
          invoice: { is: { moduleId: "pharmacy", status: "posted", kind: "refund", ...(locationId ? { locationId } : {}) } },
          ...(range ? { createdAt: range } : {})
        },
        _sum: { amount: true }
      })
    ]);

    const cashIn = inAgg._sum.amount ?? new Prisma.Decimal(0);
    const cashOut = outAgg._sum.amount ?? new Prisma.Decimal(0);
    const net = cashIn.sub(cashOut);

    return { data: { cashIn: cashIn.toString(), cashOut: cashOut.toString(), net: net.toString() } };
  }

  @Get("reports/payments-by-method")
  @RequirePermissions("shop.reports.read")
  async paymentsByMethod(@Req() req: { tenantId: string }, @Query() query: ReportsRangeQueryDto) {
    const tenantId = req.tenantId;
    const from = parseDateOrNull(query.from);
    const to = parseDateOrNull(query.to);
    const locationId = query.locationId?.trim() || null;

    const direction = query.direction === "out" ? "out" : "in";
    const where: Record<string, unknown> = {
      tenantId,
      direction,
      invoice: { is: { moduleId: "pharmacy", status: "posted", kind: direction === "out" ? "refund" : "sale", ...(locationId ? { locationId } : {}) } }
    };
    if (from || to) {
      where.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
    }

    const grouped = await this.prisma.shopInvoicePayment.groupBy({ by: ["method"], where, _sum: { amount: true }, _count: { _all: true } });
    const items = grouped
      .map((g) => ({ method: g.method, paymentsCount: g._count._all, totalAmount: (g._sum.amount ?? new Prisma.Decimal(0)).toString() }))
      .sort((a, b) => Number(b.totalAmount) - Number(a.totalAmount));

    return { data: { items } };
  }

  @Get("reports/top-products")
  @RequirePermissions("shop.reports.read")
  async topProducts(@Req() req: { tenantId: string }, @Query() query: ReportsRangeQueryDto) {
    const tenantId = req.tenantId;
    const from = parseDateOrNull(query.from);
    const to = parseDateOrNull(query.to);
    const locationId = query.locationId?.trim() || null;
    const limit = Math.min(50, toInt(query.limit, 10));

    const invoiceWhere: Record<string, unknown> = { tenantId, moduleId: "pharmacy", status: "posted", kind: "sale" };
    if (locationId) invoiceWhere.locationId = locationId;
    if (from || to) invoiceWhere.postedAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const grouped = await this.prisma.shopInvoiceLine.groupBy({
      by: ["productId"],
      where: { tenantId, invoice: { is: invoiceWhere } },
      _sum: { quantity: true, lineTotal: true }
    });

    const top = grouped
      .map((g) => ({ productId: g.productId, quantity: (g._sum.quantity ?? new Prisma.Decimal(0)).toString(), total: (g._sum.lineTotal ?? new Prisma.Decimal(0)).toString() }))
      .sort((a, b) => Number(b.total) - Number(a.total))
      .slice(0, limit);

    const products = await this.prisma.shopProduct.findMany({
      where: { tenantId, moduleId: "pharmacy", id: { in: top.map((t) => t.productId) }, deletedAt: null },
      select: { id: true, name: true, sku: true, unit: { select: { id: true, name: true, symbol: true } } }
    });
    const map = new Map(products.map((p) => [p.id, p]));

    return {
      data: {
        items: top.map((t) => {
          const p = map.get(t.productId);
          return {
            product: p ? { id: p.id, name: p.name, sku: p.sku, unit: p.unit ? { id: p.unit.id, name: p.unit.name, symbol: p.unit.symbol } : null } : { id: t.productId, name: "—", sku: null, unit: null },
            quantity: t.quantity,
            total: t.total
          };
        })
      }
    };
  }

  @Get("reports/low-stock")
  @RequirePermissions("shop.reports.read")
  async lowStock(@Req() req: { tenantId: string }, @Query() query: ReportsRangeQueryDto) {
    const tenantId = req.tenantId;
    const threshold = query.threshold ? new Prisma.Decimal(query.threshold) : new Prisma.Decimal(0);
    const locationId = query.locationId?.trim() || null;
    const limitRaw = query.limit?.trim() || null;
    const limit = limitRaw ? Math.min(5000, toInt(limitRaw, 500)) : null;

    const where: Record<string, unknown> = { tenantId, onHandQty: { lte: threshold }, product: { is: { moduleId: "pharmacy" } }, location: { is: { moduleId: "pharmacy" } } };
    if (locationId) where.locationId = locationId;

    const items = await this.prisma.shopStockItem.findMany({
      where,
      select: { onHandQty: true, location: { select: { id: true, name: true } }, product: { select: { id: true, name: true, sku: true, unit: { select: { id: true, name: true, symbol: true } } } } },
      orderBy: [{ onHandQty: "asc" }],
      ...(limit ? { take: limit } : {})
    });

    return {
      data: {
        items: items.map((i) => ({
          product: { id: i.product.id, name: i.product.name, sku: i.product.sku, unit: i.product.unit ? { id: i.product.unit.id, name: i.product.unit.name, symbol: i.product.unit.symbol } : null },
          location: i.location ? { id: i.location.id, name: i.location.name } : null,
          onHandQty: i.onHandQty.toString()
        }))
      }
    };
  }

  @Get("reports/stock-valuation")
  @RequirePermissions("shop.reports.read")
  async stockValuation(@Req() req: { tenantId: string }, @Query() query: ReportsRangeQueryDto) {
    const tenantId = req.tenantId;
    const locationId = query.locationId?.trim() || null;
    const limit = Math.min(2000, toInt(query.limit, 50));

    const settings = await this.prisma.shopSettings.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId, buyCurrencyCode: "USD", sellCurrencyCode: "USD" },
      select: { buyCurrencyCode: true }
    });

    const where: Record<string, unknown> = { tenantId, product: { is: { moduleId: "pharmacy" } }, location: { is: { moduleId: "pharmacy" } } };
    if (locationId) where.locationId = locationId;

    const rows = await this.prisma.shopStockItem.findMany({
      where,
      select: {
        onHandQty: true,
        avgCost: true,
        location: { select: { id: true, name: true } },
        product: { select: { id: true, name: true, sku: true, costPrice: true, unit: { select: { id: true, name: true, symbol: true } } } }
      }
    });

    const items = rows
      .map((r) => {
        const cost = r.avgCost.gt(0) ? r.avgCost : r.product.costPrice ?? new Prisma.Decimal(0);
        const value = r.onHandQty.mul(cost);
        return {
          product: { id: r.product.id, name: r.product.name, sku: r.product.sku, unit: r.product.unit ? { id: r.product.unit.id, name: r.product.unit.name, symbol: r.product.unit.symbol } : null },
          location: r.location ? { id: r.location.id, name: r.location.name } : null,
          onHandQty: r.onHandQty.toString(),
          costPrice: cost.toString(),
          value: value.toString()
        };
      })
      .sort((a, b) => Number(b.value) - Number(a.value));

    const totalValue = items.reduce((acc, i) => acc.add(new Prisma.Decimal(i.value)), new Prisma.Decimal(0));

    return { data: { currencyCode: settings.buyCurrencyCode, totalValue: totalValue.toString(), items: items.slice(0, limit) } };
  }

  @Get("reports/profit-summary")
  @RequirePermissions("shop.reports.read")
  async profitSummary(@Req() req: { tenantId: string }, @Query() query: ReportsRangeQueryDto) {
    const tenantId = req.tenantId;
    const from = parseDateOrNull(query.from);
    const to = parseDateOrNull(query.to);
    const locationId = query.locationId?.trim() || null;
    const limit = Math.min(2000, toInt(query.limit, 50));

    const settings = await this.prisma.shopSettings.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId, buyCurrencyCode: "USD", sellCurrencyCode: "USD" },
      select: { sellCurrencyCode: true }
    });

    const invoiceWhere: Record<string, unknown> = { tenantId, moduleId: "pharmacy", status: "posted", kind: { in: ["sale", "refund"] } };
    if (locationId) invoiceWhere.locationId = locationId;
    if (from || to) invoiceWhere.postedAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const [lines, allocations] = await Promise.all([
      this.prisma.shopInvoiceLine.findMany({
        where: { tenantId, invoice: { is: invoiceWhere } },
        select: { productId: true, netTotal: true, quantity: true, invoice: { select: { kind: true } } }
      }),
      this.prisma.shopInvoiceLotAllocation.findMany({
        where: { tenantId, invoice: { is: invoiceWhere } },
        select: { lotId: true, quantity: true, invoice: { select: { kind: true } }, lot: { select: { id: true, productId: true } } }
      })
    ]);

    const revenueByProduct = new Map<string, Decimal>();
    for (const l of lines) {
      const sign = l.invoice.kind === "refund" ? -1 : 1;
      const prev = revenueByProduct.get(l.productId) ?? new Prisma.Decimal(0);
      revenueByProduct.set(l.productId, prev.add(l.netTotal.mul(sign)));
    }

    const lotIds = Array.from(new Set(allocations.map((a) => a.lotId)));
    const receipts = lotIds.length
      ? await this.prisma.shopPurchaseLotReceipt.findMany({ where: { tenantId, lotId: { in: lotIds } }, select: { lotId: true, quantity: true, unitCost: true } })
      : [];

    const lotCost = new Map<string, { qty: Decimal; cost: Decimal }>();
    for (const r of receipts) {
      const prev = lotCost.get(r.lotId) ?? { qty: new Prisma.Decimal(0), cost: new Prisma.Decimal(0) };
      lotCost.set(r.lotId, { qty: prev.qty.add(r.quantity), cost: prev.cost.add(r.quantity.mul(r.unitCost)) });
    }

    const lots = lotIds.length ? await this.prisma.shopStockLot.findMany({ where: { tenantId, id: { in: lotIds } }, select: { id: true, productId: true } }) : [];
    const productIds = Array.from(new Set([...revenueByProduct.keys(), ...lots.map((l) => l.productId)]));
    const products = productIds.length
      ? await this.prisma.shopProduct.findMany({
          where: { tenantId, moduleId: "pharmacy", id: { in: productIds } },
          select: { id: true, name: true, sku: true, costPrice: true, unit: { select: { id: true, name: true, symbol: true } } }
        })
      : [];
    const productMap = new Map(products.map((p) => [p.id, p]));

    const cogsByProduct = new Map<string, Decimal>();
    let missingCostCount = 0;
    for (const a of allocations) {
      const pid = a.lot.productId;
      const sign = a.invoice.kind === "refund" ? -1 : 1;
      const bucket = lotCost.get(a.lotId);
      let unitCost = new Prisma.Decimal(0);
      if (bucket && bucket.qty.gt(0)) unitCost = bucket.cost.div(bucket.qty);
      else {
        const p = productMap.get(pid);
        unitCost = p?.costPrice ?? new Prisma.Decimal(0);
        missingCostCount += 1;
      }
      const prev = cogsByProduct.get(pid) ?? new Prisma.Decimal(0);
      cogsByProduct.set(pid, prev.add(a.quantity.mul(unitCost).mul(sign)));
    }

    const items: Array<{
      product: { id: string; name: string; sku: string | null; unit: { id: string; name: string; symbol: string | null } | null };
      revenue: string;
      cogs: string;
      grossProfit: string;
      marginPct: string;
    }> = [];
    for (const pid of productIds) {
      const p = productMap.get(pid);
      if (!p) continue;
      const revenue = revenueByProduct.get(pid) ?? new Prisma.Decimal(0);
      const cogs = cogsByProduct.get(pid) ?? new Prisma.Decimal(0);
      const grossProfit = revenue.sub(cogs);
      const marginPct = revenue.eq(0) ? new Prisma.Decimal(0) : grossProfit.div(revenue).mul(100);
      items.push({
        product: { id: p.id, name: p.name, sku: p.sku, unit: p.unit ? { id: p.unit.id, name: p.unit.name, symbol: p.unit.symbol } : null },
        revenue: revenue.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString(),
        cogs: cogs.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString(),
        grossProfit: grossProfit.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString(),
        marginPct: marginPct.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString()
      });
    }
    items.sort((a, b) => Number(b.grossProfit) - Number(a.grossProfit));

    const totalRevenue = items.reduce((acc, i) => acc.add(new Prisma.Decimal(i.revenue)), new Prisma.Decimal(0));
    const totalCogs = items.reduce((acc, i) => acc.add(new Prisma.Decimal(i.cogs)), new Prisma.Decimal(0));
    const totalGrossProfit = totalRevenue.sub(totalCogs);
    const totalMarginPct = totalRevenue.eq(0) ? new Prisma.Decimal(0) : totalGrossProfit.div(totalRevenue).mul(100);

    return {
      data: {
        currencyCode: settings.sellCurrencyCode,
        totals: {
          revenue: totalRevenue.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString(),
          cogs: totalCogs.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString(),
          grossProfit: totalGrossProfit.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString(),
          marginPct: totalMarginPct.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toString(),
          missingCostCount
        },
        items: items.slice(0, limit)
      }
    };
  }

  @Post("reports/export-log")
  @RequirePermissions("shop.reports.export")
  async reportExportLog(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: ReportExportLogDto) {
    const tenantId = req.tenantId;
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "pharmacy.report.export",
        entityType: "pharmacyReport",
        entityId: body.reportId,
        metadataJson: { format: body.format, from: body.from ?? null, to: body.to ?? null, locationId: body.locationId ?? null, threshold: body.threshold ?? null }
      }
    });
    return { data: { success: true } };
  }

  @Get("reports/lot-trace")
  @RequirePermissions("shop.reports.read")
  async lotTraceSearch(@Req() req: { tenantId: string }, @Query() query: LotTraceQueryDto) {
    const tenantId = req.tenantId;
    const q = query.q?.trim() || "";
    if (!q) return { data: { items: [], page: 1, pageSize: 20, total: 0 } };

    const page = toInt(query.page, 1);
    const pageSize = Math.min(50, toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const where: Record<string, unknown> = {
      tenantId,
      product: { is: { moduleId: "pharmacy" } },
      location: { is: { moduleId: "pharmacy" } }
    };

    if (query.locationId?.trim()) where.locationId = query.locationId.trim();
    if (query.productId?.trim()) where.productId = query.productId.trim();
    where.OR = [
      { lotNumber: { contains: q, mode: "insensitive" } },
      { product: { is: { name: { contains: q, mode: "insensitive" } } } },
      { product: { is: { sku: { contains: q, mode: "insensitive" } } } }
    ];

    const [total, items] = await Promise.all([
      this.prisma.shopStockLot.count({ where }),
      this.prisma.shopStockLot.findMany({
        where,
        select: {
          id: true,
          lotNumber: true,
          expiryDate: true,
          onHandQty: true,
          createdAt: true,
          product: { select: { id: true, name: true, sku: true } },
          location: { select: { id: true, name: true } }
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize
      })
    ]);

    return {
      data: {
        page,
        pageSize,
        total,
        items: items.map((l) => ({
          id: l.id,
          lotNumber: l.lotNumber,
          expiryDate: l.expiryDate,
          onHandQty: l.onHandQty.toString(),
          createdAt: l.createdAt,
          product: { id: l.product.id, name: l.product.name, sku: l.product.sku },
          location: { id: l.location.id, name: l.location.name }
        }))
      }
    };
  }

  @Get("reports/lot-trace/:lotId")
  @RequirePermissions("shop.reports.read")
  async lotTraceDetail(@Req() req: { tenantId: string }, @Param("lotId") lotId: string) {
    const tenantId = req.tenantId;
    const lot = await this.prisma.shopStockLot.findFirst({
      where: { id: lotId, tenantId, product: { is: { moduleId: "pharmacy" } }, location: { is: { moduleId: "pharmacy" } } },
      select: {
        id: true,
        lotNumber: true,
        expiryDate: true,
        onHandQty: true,
        createdAt: true,
        product: { select: { id: true, name: true, sku: true } },
        location: { select: { id: true, name: true } }
      }
    });
    if (!lot) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const [receipts, allocations] = await Promise.all([
      this.prisma.shopPurchaseLotReceipt.findMany({
        where: { tenantId, lotId, invoice: { is: { moduleId: "pharmacy" } } },
        select: {
          id: true,
          quantity: true,
          unitCost: true,
          createdAt: true,
          invoice: { select: { id: true, purchaseNumber: true, status: true, postedAt: true, supplier: { select: { id: true, name: true } } } }
        },
        orderBy: { createdAt: "desc" }
      }),
      this.prisma.shopInvoiceLotAllocation.findMany({
        where: { tenantId, lotId, invoice: { is: { moduleId: "pharmacy" } } },
        select: {
          id: true,
          quantity: true,
          createdAt: true,
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              kind: true,
              status: true,
              postedAt: true,
              customer: { select: { id: true, name: true } },
              location: { select: { id: true, name: true } }
            }
          }
        },
        orderBy: { createdAt: "desc" }
      })
    ]);

    const receivedTotal = receipts.reduce((sum, r) => sum.add(r.quantity), new Prisma.Decimal(0)).toString();
    const soldTotal = allocations.filter((a) => a.invoice.kind === "sale").reduce((sum, a) => sum.add(a.quantity), new Prisma.Decimal(0)).toString();
    const refundedTotal = allocations.filter((a) => a.invoice.kind === "refund").reduce((sum, a) => sum.add(a.quantity), new Prisma.Decimal(0)).toString();

    return {
      data: {
        lot: {
          id: lot.id,
          lotNumber: lot.lotNumber,
          expiryDate: lot.expiryDate,
          onHandQty: lot.onHandQty.toString(),
          createdAt: lot.createdAt,
          product: lot.product,
          location: lot.location
        },
        totals: { received: receivedTotal, sold: soldTotal, refunded: refundedTotal },
        receipts: receipts.map((r) => ({
          id: r.id,
          quantity: r.quantity.toString(),
          unitCost: r.unitCost.toString(),
          createdAt: r.createdAt,
          invoice: {
            id: r.invoice.id,
            purchaseNumber: r.invoice.purchaseNumber,
            status: r.invoice.status,
            postedAt: r.invoice.postedAt,
            supplier: r.invoice.supplier ? { id: r.invoice.supplier.id, name: r.invoice.supplier.name } : null
          }
        })),
        allocations: allocations.map((a) => ({
          id: a.id,
          quantity: a.quantity.toString(),
          createdAt: a.createdAt,
          invoice: {
            id: a.invoice.id,
            invoiceNumber: a.invoice.invoiceNumber,
            kind: a.invoice.kind,
            status: a.invoice.status,
            postedAt: a.invoice.postedAt,
            customer: a.invoice.customer ? { id: a.invoice.customer.id, name: a.invoice.customer.name } : null,
            location: a.invoice.location ? { id: a.invoice.location.id, name: a.invoice.location.name } : null
          }
        }))
      }
    };
  }

  @Get("payment-methods")
  @RequirePermissions("shop.invoices.read")
  async listPaymentMethods(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    let methods = await this.prisma.shopPaymentMethod.findMany({
      where: { tenantId, moduleId: "pharmacy", isActive: true },
      select: { id: true, name: true, kind: true },
      orderBy: { name: "asc" }
    });
    if (methods.length === 0) {
      await this.prisma.shopPaymentMethod.createMany({
        data: [
          { tenantId, moduleId: "pharmacy", name: "Cash", kind: "cash" },
          { tenantId, moduleId: "pharmacy", name: "Card", kind: "card" },
          { tenantId, moduleId: "pharmacy", name: "Bank Transfer", kind: "bank" },
          { tenantId, moduleId: "pharmacy", name: "Mobile Money", kind: "mobile" }
        ],
        skipDuplicates: true
      });
      await this.prisma.auditLog.create({ data: { tenantId, actorUserId: null, action: "pharmacy.paymentMethod.seed", metadataJson: {} } });
      methods = await this.prisma.shopPaymentMethod.findMany({
        where: { tenantId, moduleId: "pharmacy", isActive: true },
        select: { id: true, name: true, kind: true },
        orderBy: { name: "asc" }
      });
    }
    return { data: methods };
  }

  @Get("cash-sessions/current")
  @RequirePermissions("shop.cash.read")
  async currentCashSession(@Req() req: { tenantId: string }, @Query("locationId") locationIdRaw: string | undefined) {
    const tenantId = req.tenantId;
    const locationId = locationIdRaw?.trim() || null;
    if (!locationId) return { data: null };
    const s = await this.prisma.shopCashSession.findFirst({
      where: { tenantId, moduleId: "pharmacy", locationId, status: "open" },
      select: {
        id: true,
        status: true,
        openedAt: true,
        closedAt: true,
        openingCash: true,
        expectedCash: true,
        countedCash: true,
        discrepancy: true,
        note: true,
        location: { select: { id: true, name: true } }
      },
      orderBy: [{ openedAt: "desc" }, { id: "desc" }]
    });
    if (!s) return { data: null };
    return {
      data: {
        id: s.id,
        status: s.status,
        openedAt: s.openedAt,
        closedAt: s.closedAt,
        openingCash: s.openingCash.toString(),
        expectedCash: s.expectedCash.toString(),
        countedCash: s.countedCash.toString(),
        discrepancy: s.discrepancy.toString(),
        note: s.note,
        location: s.location
      }
    };
  }

  @Get("cash-sessions")
  @RequirePermissions("shop.cash.read")
  async listCashSessions(@Req() req: { tenantId: string }, @Query() query: ListCashSessionsQueryDto) {
    const tenantId = req.tenantId;
    const page = toInt(query.page, 1);
    const pageSize = Math.min(100, toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const status = query.status?.trim() || "all";
    const locationId = query.locationId?.trim() || null;
    const from = parseDateOrNull(query.from);
    const to = parseDateOrNull(query.to);

    const where: Record<string, unknown> = { tenantId, moduleId: "pharmacy" };
    if (locationId) where.locationId = locationId;
    if (status === "open" || status === "closed") where.status = status;
    if (from || to) where.openedAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const [total, items] = await Promise.all([
      this.prisma.shopCashSession.count({ where }),
      this.prisma.shopCashSession.findMany({
        where,
        select: {
          id: true,
          status: true,
          openedAt: true,
          closedAt: true,
          openingCash: true,
          expectedCash: true,
          countedCash: true,
          discrepancy: true,
          note: true,
          location: { select: { id: true, name: true } },
          openedBy: { select: { id: true, fullName: true } },
          closedBy: { select: { id: true, fullName: true } }
        },
        orderBy: [{ openedAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize
      })
    ]);

    return {
      data: {
        items: items.map((s) => ({
          id: s.id,
          status: s.status,
          openedAt: s.openedAt,
          closedAt: s.closedAt,
          openingCash: s.openingCash.toString(),
          expectedCash: s.expectedCash.toString(),
          countedCash: s.countedCash.toString(),
          discrepancy: s.discrepancy.toString(),
          note: s.note,
          location: s.location,
          openedBy: s.openedBy ? { id: s.openedBy.id, fullName: s.openedBy.fullName } : null,
          closedBy: s.closedBy ? { id: s.closedBy.id, fullName: s.closedBy.fullName } : null
        })),
        page,
        pageSize,
        total
      }
    };
  }

  @Post("cash-sessions/open")
  @RequirePermissions("shop.cash.open")
  async openCashSession(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: OpenCashSessionDto) {
    const tenantId = req.tenantId;
    const locationId = body.locationId.trim();
    const openingCash = toDecimal(body.openingCash);
    const note = body.note?.trim() || null;

    const location = await this.prisma.shopLocation.findFirst({ where: { tenantId, id: locationId, moduleId: "pharmacy", isActive: true }, select: { id: true } });
    if (!location) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    if (openingCash.lt(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const existing = await this.prisma.shopCashSession.findFirst({ where: { tenantId, moduleId: "pharmacy", locationId, status: "open" }, select: { id: true } });
    if (existing) throw new HttpException({ error: { code: "CONFLICT", message_key: "errors.conflict" } }, 409);

    const session = await this.prisma.shopCashSession.create({
      data: { tenantId, moduleId: "pharmacy", locationId, openingCash, openedByUserId: req.user.id, note },
      select: { id: true }
    });
    await this.prisma.auditLog.create({
      data: {
        tenantId,
        actorUserId: req.user.id,
        action: "pharmacy.cashSession.open",
        entityType: "shopCashSession",
        entityId: session.id,
        metadataJson: { locationId, openingCash: openingCash.toString() }
      }
    });

    return { data: { id: session.id } };
  }

  @Get("cash-sessions/:id")
  @RequirePermissions("shop.cash.read")
  async getCashSession(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const session = await this.prisma.shopCashSession.findFirst({
      where: { tenantId, id, moduleId: "pharmacy" },
      select: {
        id: true,
        status: true,
        openedAt: true,
        closedAt: true,
        openingCash: true,
        expectedCash: true,
        countedCash: true,
        discrepancy: true,
        note: true,
        location: { select: { id: true, name: true } },
        openedBy: { select: { id: true, fullName: true } },
        closedBy: { select: { id: true, fullName: true } },
        events: {
          select: { id: true, type: true, amount: true, note: true, createdAt: true, actor: { select: { id: true, fullName: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }]
        }
      }
    });
    if (!session) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const [eventsAgg, invoiceInAgg, invoiceOutAgg, purchaseInAgg, purchaseOutAgg] = await Promise.all([
      this.prisma.shopCashSessionEvent.groupBy({ by: ["type"], where: { tenantId, sessionId: id }, _sum: { amount: true } }),
      this.prisma.shopInvoicePayment.aggregate({ where: { tenantId, cashSessionId: id, direction: "in" }, _sum: { amount: true } }),
      this.prisma.shopInvoicePayment.aggregate({ where: { tenantId, cashSessionId: id, direction: "out" }, _sum: { amount: true } }),
      this.prisma.shopPurchaseInvoicePayment.aggregate({ where: { tenantId, cashSessionId: id, direction: "in" }, _sum: { amount: true } }),
      this.prisma.shopPurchaseInvoicePayment.aggregate({ where: { tenantId, cashSessionId: id, direction: "out" }, _sum: { amount: true } })
    ]);
    const cashIn = eventsAgg.find((r) => r.type === "cash_in")?._sum.amount ?? new Prisma.Decimal(0);
    const cashOut = eventsAgg.find((r) => r.type === "cash_out")?._sum.amount ?? new Prisma.Decimal(0);
    const paymentsIn = (invoiceInAgg._sum.amount ?? new Prisma.Decimal(0)).add(purchaseInAgg._sum.amount ?? new Prisma.Decimal(0));
    const paymentsOut = (invoiceOutAgg._sum.amount ?? new Prisma.Decimal(0)).add(purchaseOutAgg._sum.amount ?? new Prisma.Decimal(0));
    const paymentsTotal = paymentsIn.sub(paymentsOut);
    const expectedCashLive = session.openingCash.add(cashIn).sub(cashOut).add(paymentsIn).sub(paymentsOut).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    return {
      data: {
        id: session.id,
        status: session.status,
        openedAt: session.openedAt,
        closedAt: session.closedAt,
        openingCash: session.openingCash.toString(),
        expectedCash: session.expectedCash.toString(),
        expectedCashLive: expectedCashLive.toString(),
        countedCash: session.countedCash.toString(),
        discrepancy: session.discrepancy.toString(),
        note: session.note,
        location: session.location,
        openedBy: session.openedBy ? { id: session.openedBy.id, fullName: session.openedBy.fullName } : null,
        closedBy: session.closedBy ? { id: session.closedBy.id, fullName: session.closedBy.fullName } : null,
        cashIn: cashIn.toString(),
        cashOut: cashOut.toString(),
        paymentsIn: paymentsIn.toString(),
        paymentsOut: paymentsOut.toString(),
        paymentsTotal: paymentsTotal.toString(),
        events: session.events.map((e) => ({
          id: e.id,
          type: e.type,
          amount: e.amount.toString(),
          note: e.note,
          createdAt: e.createdAt,
          actor: e.actor ? { id: e.actor.id, fullName: e.actor.fullName } : null
        }))
      }
    };
  }

  @Post("cash-sessions/:id/cash-in")
  @RequirePermissions("shop.cash.adjust")
  async cashIn(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: CashSessionCashDto) {
    const tenantId = req.tenantId;
    const amount = toDecimal(body.amount);
    if (amount.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    const note = body.note?.trim() || null;

    const session = await this.prisma.shopCashSession.findFirst({ where: { tenantId, id, moduleId: "pharmacy" }, select: { id: true, status: true } });
    if (!session) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (session.status !== "open") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const e = await this.prisma.shopCashSessionEvent.create({ data: { tenantId, sessionId: id, type: "cash_in", amount, note, actorUserId: req.user.id }, select: { id: true } });
    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "pharmacy.cashSession.cashIn", entityType: "shopCashSession", entityId: id, metadataJson: { amount: amount.toString() } }
    });
    return { data: { id: e.id } };
  }

  @Post("cash-sessions/:id/cash-out")
  @RequirePermissions("shop.cash.adjust")
  async cashOut(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: CashSessionCashDto) {
    const tenantId = req.tenantId;
    const amount = toDecimal(body.amount);
    if (amount.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    const note = body.note?.trim() || null;

    const session = await this.prisma.shopCashSession.findFirst({ where: { tenantId, id, moduleId: "pharmacy" }, select: { id: true, status: true } });
    if (!session) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (session.status !== "open") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const e = await this.prisma.shopCashSessionEvent.create({ data: { tenantId, sessionId: id, type: "cash_out", amount, note, actorUserId: req.user.id }, select: { id: true } });
    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "pharmacy.cashSession.cashOut", entityType: "shopCashSession", entityId: id, metadataJson: { amount: amount.toString() } }
    });
    return { data: { id: e.id } };
  }

  @Post("cash-sessions/:id/close")
  @RequirePermissions("shop.cash.close")
  async closeCashSession(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: CloseCashSessionDto) {
    const tenantId = req.tenantId;
    const countedCash = toDecimal(body.countedCash);
    if (countedCash.lt(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    const note = body.note?.trim() || null;

    await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      const session = await tx.shopCashSession.findFirst({
        where: { tenantId, id, moduleId: "pharmacy" },
        select: { id: true, status: true, openingCash: true }
      });
      if (!session) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (session.status !== "open") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

      const [eventsAgg, invoiceInAgg, invoiceOutAgg, purchaseInAgg, purchaseOutAgg] = await Promise.all([
        tx.shopCashSessionEvent.groupBy({ by: ["type"], where: { tenantId, sessionId: id }, _sum: { amount: true } }),
        tx.shopInvoicePayment.aggregate({ where: { tenantId, cashSessionId: id, direction: "in" }, _sum: { amount: true } }),
        tx.shopInvoicePayment.aggregate({ where: { tenantId, cashSessionId: id, direction: "out" }, _sum: { amount: true } }),
        tx.shopPurchaseInvoicePayment.aggregate({ where: { tenantId, cashSessionId: id, direction: "in" }, _sum: { amount: true } }),
        tx.shopPurchaseInvoicePayment.aggregate({ where: { tenantId, cashSessionId: id, direction: "out" }, _sum: { amount: true } })
      ]);

      const cashIn = eventsAgg.find((r) => r.type === "cash_in")?._sum.amount ?? new Prisma.Decimal(0);
      const cashOut = eventsAgg.find((r) => r.type === "cash_out")?._sum.amount ?? new Prisma.Decimal(0);
      const paymentsIn = (invoiceInAgg._sum.amount ?? new Prisma.Decimal(0)).add(purchaseInAgg._sum.amount ?? new Prisma.Decimal(0));
      const paymentsOut = (invoiceOutAgg._sum.amount ?? new Prisma.Decimal(0)).add(purchaseOutAgg._sum.amount ?? new Prisma.Decimal(0));

      const expectedCash = session.openingCash.add(cashIn).sub(cashOut).add(paymentsIn).sub(paymentsOut).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const discrepancy = countedCash.sub(expectedCash).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      await tx.shopCashSession.update({ where: { id }, data: { status: "closed", closedAt: new Date(), expectedCash, countedCash, discrepancy, closedByUserId: req.user.id, note } });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: "pharmacy.cashSession.close",
          entityType: "shopCashSession",
          entityId: id,
          metadataJson: { expectedCash: expectedCash.toString(), countedCash: countedCash.toString(), discrepancy: discrepancy.toString() }
        }
      });
    });

    return { data: { success: true } };
  }

  @Get("customers")
  @RequirePermissions("shop.customers.read")
  async listCustomers(@Req() req: { tenantId: string }, @Query() query: ListCustomersQueryDto) {
    const page = toInt(query.page, 1);
    const pageSize = Math.min(50, toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const q = query.q?.trim() || null;
    const status = query.status === "archived" ? "archived" : "active";

    const where: Record<string, unknown> = { tenantId: req.tenantId, moduleId: "pharmacy" };
    if (status === "active") where.deletedAt = null;
    else where.deletedAt = { not: null };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } }
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.shopCustomer.count({ where }),
      this.prisma.shopCustomer.findMany({
        where,
        select: { id: true, name: true, phone: true, email: true, address: true, notes: true, deletedAt: true, createdAt: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize
      })
    ]);

    return {
      data: {
        items: items.map((c) => ({
          id: c.id,
          name: c.name,
          phone: c.phone,
          email: c.email,
          address: c.address,
          notes: c.notes,
          status: c.deletedAt ? "archived" : "active",
          createdAt: c.createdAt,
          updatedAt: c.updatedAt
        })),
        page,
        pageSize,
        total
      }
    };
  }

  @Post("customers")
  @RequirePermissions("shop.customers.create")
  async createCustomer(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateCustomerDto) {
    const name = body.name.trim();
    const phone = body.phone?.trim() || null;
    const email = body.email?.trim() || null;
    const address = body.address?.trim() || null;
    const notes = body.notes?.trim() || null;

    if (name.length < 2) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const customer = await this.prisma.shopCustomer.create({
      data: { tenantId: req.tenantId, moduleId: "pharmacy", name, phone, email, address, notes },
      select: { id: true, name: true, phone: true, email: true, address: true, notes: true, deletedAt: true, createdAt: true, updatedAt: true }
    });

    await this.prisma.auditLog.create({
      data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "pharmacy.customer.create", entityType: "shopCustomer", entityId: customer.id, metadataJson: {} }
    });

    return { data: { ...customer, status: "active" as const } };
  }

  @Get("suppliers")
  @RequirePermissions("shop.suppliers.read")
  async listSuppliers(@Req() req: { tenantId: string }, @Query() query: ListSuppliersQueryDto) {
    const page = toInt(query.page, 1);
    const pageSize = Math.min(50, toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const q = query.q?.trim() || null;
    const status = query.status === "archived" ? "archived" : "active";

    const where: Record<string, unknown> = { tenantId: req.tenantId, moduleId: "pharmacy" };
    if (status === "active") where.deletedAt = null;
    else where.deletedAt = { not: null };
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } }
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.shopSupplier.count({ where }),
      this.prisma.shopSupplier.findMany({
        where,
        select: { id: true, name: true, phone: true, email: true, address: true, notes: true, deletedAt: true, createdAt: true, updatedAt: true },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize
      })
    ]);

    return {
      data: {
        items: items.map((s) => ({
          id: s.id,
          name: s.name,
          phone: s.phone,
          email: s.email,
          address: s.address,
          notes: s.notes,
          status: s.deletedAt ? "archived" : "active",
          createdAt: s.createdAt,
          updatedAt: s.updatedAt
        })),
        page,
        pageSize,
        total
      }
    };
  }

  @Post("suppliers")
  @RequirePermissions("shop.suppliers.create")
  async createSupplier(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateSupplierDto) {
    const name = body.name.trim();
    const phone = body.phone?.trim() || null;
    const email = body.email?.trim() || null;
    const address = body.address?.trim() || null;
    const notes = body.notes?.trim() || null;

    if (name.length < 2) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const supplier = await this.prisma.shopSupplier.create({
      data: { tenantId: req.tenantId, moduleId: "pharmacy", name, phone, email, address, notes },
      select: { id: true, name: true, phone: true, email: true, address: true, notes: true, deletedAt: true, createdAt: true, updatedAt: true }
    });

    await this.prisma.auditLog.create({
      data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "pharmacy.supplier.create", entityType: "shopSupplier", entityId: supplier.id, metadataJson: {} }
    });

    return { data: { ...supplier, status: "active" as const } };
  }

  @Patch("suppliers/:id")
  @RequirePermissions("shop.suppliers.update")
  async updateSupplier(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: UpdateSupplierDto) {
    const existing = await this.prisma.shopSupplier.findFirst({ where: { tenantId: req.tenantId, id, moduleId: "pharmacy" }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const updates: Record<string, unknown> = {};
    if (typeof body.name === "string") updates.name = body.name.trim();
    if (body.phone !== undefined) updates.phone = body.phone ? body.phone.trim() : null;
    if (body.email !== undefined) updates.email = body.email ? body.email.trim() : null;
    if (body.address !== undefined) updates.address = body.address ? body.address.trim() : null;
    if (body.notes !== undefined) updates.notes = body.notes ? body.notes.trim() : null;

    await this.prisma.shopSupplier.update({ where: { id }, data: updates });
    await this.prisma.auditLog.create({
      data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "pharmacy.supplier.update", entityType: "shopSupplier", entityId: id, metadataJson: {} }
    });

    return { data: { success: true } };
  }

  @Delete("suppliers/:id")
  @RequirePermissions("shop.suppliers.delete")
  async deleteSupplier(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string) {
    const existing = await this.prisma.shopSupplier.findFirst({ where: { tenantId: req.tenantId, id, moduleId: "pharmacy" }, select: { id: true, deletedAt: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (existing.deletedAt) return { data: { success: true } };

    await this.prisma.shopSupplier.update({ where: { id }, data: { deletedAt: new Date() } });
    await this.prisma.auditLog.create({
      data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "pharmacy.supplier.delete", entityType: "shopSupplier", entityId: id, metadataJson: {} }
    });

    return { data: { success: true } };
  }

  @Get("suppliers/:id")
  @RequirePermissions("shop.suppliers.read")
  async getSupplier(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const supplier = await this.prisma.shopSupplier.findFirst({
      where: { tenantId, id, moduleId: "pharmacy" },
      select: { id: true, name: true, phone: true, email: true, address: true, notes: true, deletedAt: true, createdAt: true, updatedAt: true }
    });
    if (!supplier) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const [purchasesAgg, refundsAgg, paymentsOutAgg, paymentsInAgg] = await Promise.all([
      this.prisma.shopPurchaseInvoice.aggregate({ where: { tenantId, moduleId: "pharmacy", supplierId: id, kind: "purchase", status: "posted" }, _sum: { subtotal: true } }),
      this.prisma.shopPurchaseInvoice.aggregate({ where: { tenantId, moduleId: "pharmacy", supplierId: id, kind: "refund", status: "posted" }, _sum: { subtotal: true } }),
      this.prisma.shopPurchaseInvoicePayment.aggregate({ where: { tenantId, direction: "out", invoice: { is: { moduleId: "pharmacy", supplierId: id, status: "posted" } } }, _sum: { amount: true } }),
      this.prisma.shopPurchaseInvoicePayment.aggregate({ where: { tenantId, direction: "in", invoice: { is: { moduleId: "pharmacy", supplierId: id, status: "posted" } } }, _sum: { amount: true } })
    ]);
    const purchases = purchasesAgg._sum.subtotal ?? new Prisma.Decimal(0);
    const refunds = refundsAgg._sum.subtotal ?? new Prisma.Decimal(0);
    const paidOut = paymentsOutAgg._sum.amount ?? new Prisma.Decimal(0);
    const paidIn = paymentsInAgg._sum.amount ?? new Prisma.Decimal(0);
    const balance = purchases.sub(refunds).sub(paidOut).add(paidIn);

    return {
      data: {
        ...supplier,
        status: supplier.deletedAt ? "archived" : "active",
        totals: { purchases: purchases.toString(), refunds: refunds.toString(), paidOut: paidOut.toString(), paidIn: paidIn.toString(), balance: balance.toString() }
      }
    };
  }

  @Get("suppliers/:id/ledger")
  @RequirePermissions("shop.suppliers.read")
  async supplierLedger(@Req() req: { tenantId: string }, @Param("id") id: string, @Query() query: SupplierLedgerQueryDto) {
    const tenantId = req.tenantId;
    const from = parseDateOrNull(query.from);
    const to = parseDateOrNull(query.to);

    const supplier = await this.prisma.shopSupplier.findFirst({ where: { tenantId, id, moduleId: "pharmacy" }, select: { id: true } });
    if (!supplier) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const opening = from
      ? await (async () => {
          const [purchasesAgg, refundsAgg, paymentsOutAgg, paymentsInAgg] = await Promise.all([
            this.prisma.shopPurchaseInvoice.aggregate({
              where: { tenantId, moduleId: "pharmacy", supplierId: id, kind: "purchase", status: "posted", postedAt: { lt: from } },
              _sum: { subtotal: true }
            }),
            this.prisma.shopPurchaseInvoice.aggregate({
              where: { tenantId, moduleId: "pharmacy", supplierId: id, kind: "refund", status: "posted", postedAt: { lt: from } },
              _sum: { subtotal: true }
            }),
            this.prisma.shopPurchaseInvoicePayment.aggregate({
              where: { tenantId, direction: "out", createdAt: { lt: from }, invoice: { is: { moduleId: "pharmacy", supplierId: id, status: "posted" } } },
              _sum: { amount: true }
            }),
            this.prisma.shopPurchaseInvoicePayment.aggregate({
              where: { tenantId, direction: "in", createdAt: { lt: from }, invoice: { is: { moduleId: "pharmacy", supplierId: id, status: "posted" } } },
              _sum: { amount: true }
            })
          ]);
          const purchases = purchasesAgg._sum.subtotal ?? new Prisma.Decimal(0);
          const refunds = refundsAgg._sum.subtotal ?? new Prisma.Decimal(0);
          const paidOut = paymentsOutAgg._sum.amount ?? new Prisma.Decimal(0);
          const paidIn = paymentsInAgg._sum.amount ?? new Prisma.Decimal(0);
          return purchases.sub(refunds).sub(paidOut).add(paidIn);
        })()
      : new Prisma.Decimal(0);

    const purchaseWhere: Record<string, unknown> = { tenantId, moduleId: "pharmacy", supplierId: id, status: "posted" };
    if (from || to) purchaseWhere.postedAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const paymentWhere: Record<string, unknown> = { tenantId, invoice: { is: { moduleId: "pharmacy", supplierId: id, status: "posted" } } };
    if (from || to) paymentWhere.createdAt = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };

    const [purchases, payments] = await Promise.all([
      this.prisma.shopPurchaseInvoice.findMany({ where: purchaseWhere, select: { id: true, kind: true, purchaseNumber: true, postedAt: true, subtotal: true }, orderBy: { postedAt: "asc" } }),
      this.prisma.shopPurchaseInvoicePayment.findMany({
        where: paymentWhere,
        select: { id: true, direction: true, method: true, amount: true, createdAt: true, invoice: { select: { id: true, purchaseNumber: true, kind: true } } },
        orderBy: { createdAt: "asc" }
      })
    ]);

    type LedgerItem = { time: Date; type: "purchase" | "refund" | "payment_out" | "payment_in"; ref: string; method: string | null; debit: Decimal; credit: Decimal };
    const items: LedgerItem[] = [];
    for (const p of purchases) {
      items.push({
        time: p.postedAt ?? new Date(0),
        type: p.kind === "refund" ? "refund" : "purchase",
        ref: p.purchaseNumber ?? p.id,
        method: null,
        debit: p.kind === "refund" ? new Prisma.Decimal(0) : p.subtotal,
        credit: p.kind === "refund" ? p.subtotal : new Prisma.Decimal(0)
      });
    }
    for (const pay of payments) {
      items.push({
        time: pay.createdAt,
        type: pay.direction === "out" ? "payment_out" : "payment_in",
        ref: pay.invoice.purchaseNumber ?? pay.invoice.id,
        method: pay.method,
        debit: pay.direction === "out" ? new Prisma.Decimal(0) : pay.amount,
        credit: pay.direction === "out" ? pay.amount : new Prisma.Decimal(0)
      });
    }
    items.sort((a, b) => a.time.getTime() - b.time.getTime());

    let running = opening;
    const out = items.map((i) => {
      running = running.add(i.debit).sub(i.credit);
      return { time: i.time, type: i.type, ref: i.ref, method: i.method, debit: i.debit.toString(), credit: i.credit.toString(), balance: running.toString() };
    });

    return { data: { openingBalance: opening.toString(), closingBalance: running.toString(), items: out } };
  }

  @Get("purchases")
  @RequirePermissions("shop.purchases.read")
  async listPurchases(@Req() req: { tenantId: string }, @Query() query: ListPurchaseInvoicesQueryDto) {
    const tenantId = req.tenantId;
    const page = toInt(query.page, 1);
    const pageSize = Math.min(50, toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const q = query.q?.trim() || null;
    const status = query.status === "draft" || query.status === "posted" || query.status === "void" ? query.status : "all";
    const supplierId = query.supplierId?.trim() || null;
    const locationId = query.locationId?.trim() || null;

    const where: Record<string, unknown> = { tenantId, moduleId: "pharmacy" };
    if (status !== "all") where.status = status;
    if (supplierId) where.supplierId = supplierId;
    if (locationId) where.locationId = locationId;
    if (q) {
      where.OR = [
        { purchaseNumber: { contains: q, mode: "insensitive" } },
        { supplier: { is: { name: { contains: q, mode: "insensitive" } } } }
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.shopPurchaseInvoice.count({ where }),
      this.prisma.shopPurchaseInvoice.findMany({
        where,
        select: {
          id: true,
          kind: true,
          status: true,
          purchaseNumber: true,
          currencyCode: true,
          subtotal: true,
          paidTotal: true,
          createdAt: true,
          postedAt: true,
          supplier: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          refundOf: { select: { id: true, purchaseNumber: true } }
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize
      })
    ]);

    return {
      data: {
        page,
        pageSize,
        total,
        items: items.map((p) => ({
          id: p.id,
          kind: p.kind,
          status: p.status,
          purchaseNumber: p.purchaseNumber,
          currencyCode: p.currencyCode,
          subtotal: p.subtotal.toString(),
          paidTotal: p.paidTotal.toString(),
          createdAt: p.createdAt,
          postedAt: p.postedAt,
          supplier: p.supplier ? { id: p.supplier.id, name: p.supplier.name } : null,
          location: { id: p.location.id, name: p.location.name },
          refundOf: p.refundOf ? { id: p.refundOf.id, purchaseNumber: p.refundOf.purchaseNumber } : null
        }))
      }
    };
  }

  @Post("purchases")
  @RequirePermissions("shop.purchases.create")
  async createPurchase(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreatePurchaseInvoiceDto) {
    const tenantId = req.tenantId;
    const locationId = body.locationId.trim();
    const supplierId = body.supplierId?.trim() || null;

    const [settings, location] = await Promise.all([
      this.prisma.shopSettings.upsert({ where: { tenantId }, update: {}, create: { tenantId, buyCurrencyCode: "USD", sellCurrencyCode: "USD" }, select: { buyCurrencyCode: true } }),
      this.prisma.shopLocation.findFirst({ where: { tenantId, id: locationId, moduleId: "pharmacy", isActive: true }, select: { id: true } })
    ]);
    if (!location) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    if (supplierId) {
      const ok = await this.prisma.shopSupplier.findFirst({ where: { tenantId, id: supplierId, moduleId: "pharmacy", deletedAt: null }, select: { id: true } });
      if (!ok) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const invoice = await this.prisma.shopPurchaseInvoice.create({
      data: { tenantId, moduleId: "pharmacy", status: "draft", locationId, supplierId, currencyCode: settings.buyCurrencyCode, subtotal: new Prisma.Decimal(0), paidTotal: new Prisma.Decimal(0) },
      select: { id: true }
    });
    await this.prisma.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "pharmacy.purchase.create", entityType: "shopPurchaseInvoice", entityId: invoice.id, metadataJson: {} } });
    return { data: { id: invoice.id } };
  }

  @Get("purchases/:id")
  @RequirePermissions("shop.purchases.read")
  async getPurchase(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const inv = await this.prisma.shopPurchaseInvoice.findFirst({
      where: { tenantId, id, moduleId: "pharmacy" },
      select: {
        id: true,
        kind: true,
        status: true,
        purchaseNumber: true,
        refundOf: { select: { id: true, purchaseNumber: true } },
        currencyCode: true,
        notes: true,
        subtotal: true,
        paidTotal: true,
        createdAt: true,
        postedAt: true,
        supplier: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        lines: {
          select: {
            id: true,
            quantity: true,
            receivedQty: true,
            unitCost: true,
            lineTotal: true,
            product: { select: { id: true, name: true, sku: true } }
          }
        },
        payments: {
          select: { id: true, direction: true, method: true, amount: true, note: true, createdAt: true, actor: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: "desc" }
        }
      }
    });
    if (!inv) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    return {
      data: {
        id: inv.id,
        kind: inv.kind,
        status: inv.status,
        purchaseNumber: inv.purchaseNumber,
        refundOf: inv.refundOf ? { id: inv.refundOf.id, purchaseNumber: inv.refundOf.purchaseNumber } : null,
        currencyCode: inv.currencyCode,
        notes: inv.notes,
        subtotal: inv.subtotal.toString(),
        paidTotal: inv.paidTotal.toString(),
        createdAt: inv.createdAt,
        postedAt: inv.postedAt,
        supplier: inv.supplier ? { id: inv.supplier.id, name: inv.supplier.name } : null,
        location: { id: inv.location.id, name: inv.location.name },
        lines: inv.lines.map((l) => ({
          id: l.id,
          product: { id: l.product.id, name: l.product.name, sku: l.product.sku },
          quantity: l.quantity.toString(),
          receivedQty: l.receivedQty.toString(),
          unitCost: l.unitCost.toString(),
          lineTotal: l.lineTotal.toString()
        })),
        payments: inv.payments.map((p) => ({
          id: p.id,
          direction: p.direction,
          method: p.method,
          amount: p.amount.toString(),
          note: p.note,
          createdAt: p.createdAt,
          actor: p.actor ? { id: p.actor.id, fullName: p.actor.fullName } : null
        }))
      }
    };
  }

  @Patch("purchases/:id")
  @RequirePermissions("shop.purchases.update")
  async updatePurchase(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: UpdatePurchaseInvoiceDto) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.shopPurchaseInvoice.findFirst({
      where: { tenantId, id, moduleId: "pharmacy" },
      select: { id: true, kind: true, status: true, refundOfId: true, locationId: true, supplierId: true }
    });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (existing.status !== "draft") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    if (body.locationId !== undefined) {
      const locId = body.locationId.trim();
      if (existing.kind === "refund" && locId !== existing.locationId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      const ok = await this.prisma.shopLocation.findFirst({ where: { tenantId, id: locId, moduleId: "pharmacy", isActive: true }, select: { id: true } });
      if (!ok) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      await this.prisma.shopPurchaseInvoice.update({ where: { id }, data: { locationId: locId } });
    }

    if (body.supplierId !== undefined) {
      const supplierId = body.supplierId ? body.supplierId.trim() : null;
      if (existing.kind === "refund" && supplierId !== existing.supplierId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      if (supplierId) {
        const ok = await this.prisma.shopSupplier.findFirst({ where: { tenantId, id: supplierId, moduleId: "pharmacy", deletedAt: null }, select: { id: true } });
        if (!ok) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }
      await this.prisma.shopPurchaseInvoice.update({ where: { id }, data: { supplierId } });
    }

    if (body.notes !== undefined) {
      const notes = body.notes ? body.notes.trim() : null;
      await this.prisma.shopPurchaseInvoice.update({ where: { id }, data: { notes } });
    }

    const nextLines = body.lines;
    if (nextLines) {
      await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
        const inv = await tx.shopPurchaseInvoice.findFirst({ where: { tenantId, id, moduleId: "pharmacy" }, select: { id: true, kind: true, status: true, refundOfId: true, locationId: true } });
        if (!inv) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
        if (inv.status !== "draft") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

        await tx.shopPurchaseInvoiceLine.deleteMany({ where: { tenantId, invoiceId: id } });

        const allowedProductIds =
          inv.kind === "refund" && inv.refundOfId
            ? new Set(
                (
                  await tx.shopPurchaseInvoiceLine.findMany({
                    where: { tenantId, invoiceId: inv.refundOfId },
                    select: { productId: true }
                  })
                ).map((x) => x.productId)
              )
            : null;

        let subtotal = new Prisma.Decimal(0);
        for (const l of nextLines) {
          const productId = l.productId.trim();
          const qty = toDecimal(l.quantity);
          const unitCost = toDecimal(l.unitCost);
          if (qty.lte(0) || unitCost.lt(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
          if (allowedProductIds && !allowedProductIds.has(productId))
            throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
          const product = await tx.shopProduct.findFirst({ where: { tenantId, id: productId, moduleId: "pharmacy", deletedAt: null }, select: { id: true } });
          if (!product) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

          const lineTotal = qty.mul(unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
          subtotal = subtotal.add(lineTotal);
          await tx.shopPurchaseInvoiceLine.create({ data: { tenantId, invoiceId: id, productId, quantity: qty, unitCost, lineTotal } });
        }
        await tx.shopPurchaseInvoice.update({ where: { id }, data: { subtotal: subtotal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP) } });
      });
    }

    await this.prisma.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "pharmacy.purchase.update", entityType: "shopPurchaseInvoice", entityId: id, metadataJson: {} } });
    return { data: { success: true } };
  }

  @Post("purchases/:id/receive")
  @RequirePermissions("shop.inventory.adjust")
  async receivePurchase(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: ReceivePurchaseInvoiceDto) {
    const tenantId = req.tenantId;
    if (!body.lines?.length) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      const invoice = await tx.shopPurchaseInvoice.findFirst({
        where: { tenantId, id, moduleId: "pharmacy" },
        select: { id: true, moduleId: true, kind: true, status: true, locationId: true, purchaseNumber: true }
      });
      if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (invoice.status !== "draft") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      if (invoice.kind !== "purchase") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      const pharmacyEnabled = invoice.moduleId === "pharmacy";

      const lines = await tx.shopPurchaseInvoiceLine.findMany({
        where: { tenantId, invoiceId: id },
        select: { id: true, productId: true, quantity: true, receivedQty: true, unitCost: true }
      });
      const map = new Map(lines.map((l) => [l.id, l]));
      if (!lines.length) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

      const settings = pharmacyEnabled
        ? await tx.shopSettings.upsert({
            where: { tenantId },
            update: {},
            create: { tenantId, buyCurrencyCode: "USD", sellCurrencyCode: "USD" },
            select: { pharmacyReceivingRequireLotNumber: true, pharmacyReceivingRequireExpiryDate: true }
          })
        : null;
      const requireLotNumber = settings?.pharmacyReceivingRequireLotNumber ?? true;
      const requireExpiryDate = settings?.pharmacyReceivingRequireExpiryDate ?? true;

      const productIds = Array.from(new Set(lines.map((l) => l.productId)));
      const profiles = pharmacyEnabled
        ? await tx.shopProductPharmacyProfile.findMany({ where: { tenantId, productId: { in: productIds } }, select: { productId: true, trackLots: true } })
        : [];
      const trackLotsByProduct = new Map(productIds.map((pid) => [pid, true]));
      for (const p of profiles) trackLotsByProduct.set(p.productId, p.trackLots);

      for (const r of body.lines) {
        const l = map.get(r.lineId.trim()) ?? null;
        if (!l) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        const qty = toDecimal(r.qty);
        if (qty.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        const remaining = l.quantity.sub(l.receivedQty);
        if (qty.gt(remaining)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

        const trackLots = pharmacyEnabled ? (trackLotsByProduct.get(l.productId) ?? true) : false;
        if (trackLots) {
          const lotNumberRaw = r.lotNumber?.trim() || "";
          const expiryDateStr = r.expiryDate?.trim() || "";
          if (requireLotNumber && !lotNumberRaw) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
          if (requireExpiryDate && !expiryDateStr) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
          const lotNumber = lotNumberRaw || "NOLOT";
          let expiryDate: Date;
          if (expiryDateStr) {
            expiryDate = new Date(expiryDateStr);
            if (!Number.isFinite(expiryDate.getTime())) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
          } else {
            expiryDate = new Date("9999-12-31T00:00:00.000Z");
          }

          const lot = await tx.shopStockLot.upsert({
            where: {
              tenantId_productId_locationId_lotNumber_expiryDate: {
                tenantId,
                productId: l.productId,
                locationId: invoice.locationId,
                lotNumber,
                expiryDate
              }
            },
            update: {},
            create: { tenantId, productId: l.productId, locationId: invoice.locationId, lotNumber, expiryDate, onHandQty: new Prisma.Decimal(0) },
            select: { id: true, onHandQty: true }
          });
          await tx.shopStockLot.update({ where: { id: lot.id }, data: { onHandQty: lot.onHandQty.add(qty) } });
          await tx.shopPurchaseLotReceipt.create({
            data: { tenantId, purchaseInvoiceId: invoice.id, purchaseInvoiceLineId: l.id, lotId: lot.id, quantity: qty, unitCost: l.unitCost, actorUserId: req.user.id }
          });
        }

        const item = await tx.shopStockItem.upsert({
          where: { tenantId_productId_locationId: { tenantId, productId: l.productId, locationId: invoice.locationId } },
          update: {},
          create: { tenantId, productId: l.productId, locationId: invoice.locationId, onHandQty: new Prisma.Decimal(0), avgCost: new Prisma.Decimal(0) },
          select: { id: true, onHandQty: true, avgCost: true }
        });
        const before = item.onHandQty;
        const beforeAvgCost = item.avgCost;
        const after = before.add(qty);
        let nextAvgCost = beforeAvgCost;
        if (after.lte(0)) nextAvgCost = new Prisma.Decimal(0);
        else if (qty.gt(0)) {
          if (before.lte(0) || beforeAvgCost.lte(0)) nextAvgCost = l.unitCost;
          else nextAvgCost = before.mul(beforeAvgCost).add(qty.mul(l.unitCost)).div(after);
          nextAvgCost = nextAvgCost.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        }
        await tx.shopStockItem.update({ where: { id: item.id }, data: { onHandQty: after, avgCost: nextAvgCost } });
        await tx.shopStockMovement.create({
          data: { tenantId, type: "receive", productId: l.productId, locationId: invoice.locationId, deltaQty: qty, beforeQty: before, afterQty: after, note: invoice.purchaseNumber ?? `PURCHASE:${id}`, actorUserId: req.user.id }
        });

        await tx.shopPurchaseInvoiceLine.update({ where: { id: l.id }, data: { receivedQty: l.receivedQty.add(qty) } });
        await tx.shopProduct.update({ where: { id: l.productId }, data: { costPrice: l.unitCost } });
      }

      await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "pharmacy.purchase.receive", entityType: "shopPurchaseInvoice", entityId: id, metadataJson: {} } });
    });

    return { data: { success: true } };
  }

  @Post("purchases/:id/post")
  @RequirePermissions("shop.purchases.post")
  async postPurchase(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string) {
    const tenantId = req.tenantId;

    await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      const invoice = await tx.shopPurchaseInvoice.findFirst({
        where: { tenantId, id, moduleId: "pharmacy" },
        select: { id: true, kind: true, status: true, purchaseNumber: true, refundOfId: true, locationId: true }
      });
      if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (invoice.status !== "draft") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

      const lines = await tx.shopPurchaseInvoiceLine.findMany({
        where: { tenantId, invoiceId: id },
        select: { id: true, productId: true, quantity: true, receivedQty: true, unitCost: true }
      });
      if (!lines.length) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

      let subtotal = new Prisma.Decimal(0);
      for (const l of lines) {
        subtotal = subtotal.add(l.quantity.mul(l.unitCost).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP));
      }
      subtotal = subtotal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      await tx.shopPurchaseInvoice.update({ where: { id }, data: { subtotal } });

      if (invoice.kind === "purchase") {
        for (const l of lines) {
          if (l.receivedQty.lt(l.quantity)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        }
        if (invoice.purchaseNumber) return;

        const settings = await tx.shopSettings.upsert({
          where: { tenantId },
          update: {},
          create: { tenantId, buyCurrencyCode: "USD", sellCurrencyCode: "USD" },
          select: { nextPurchaseNumber: true }
        });
        const purchaseNumber = formatPurchaseNumber(settings.nextPurchaseNumber);
        await tx.shopSettings.update({ where: { tenantId }, data: { nextPurchaseNumber: settings.nextPurchaseNumber + 1 } });
        await tx.shopPurchaseInvoice.update({ where: { id }, data: { status: "posted", purchaseNumber, postedAt: new Date() } });
        await tx.auditLog.create({
          data: { tenantId, actorUserId: req.user.id, action: "pharmacy.purchase.post", entityType: "shopPurchaseInvoice", entityId: id, metadataJson: { purchaseNumber } }
        });
        return;
      }

      if (!invoice.refundOfId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

      const original = await tx.shopPurchaseInvoice.findFirst({
        where: { tenantId, id: invoice.refundOfId },
        select: { id: true, kind: true, status: true }
      });
      if (!original || original.kind !== "purchase" || original.status !== "posted")
        throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

      const purchasedLines = await tx.shopPurchaseInvoiceLine.findMany({
        where: { tenantId, invoiceId: invoice.refundOfId },
        select: { productId: true, quantity: true }
      });
      const purchasedQtyByProduct = new Map<string, Decimal>();
      for (const l of purchasedLines) purchasedQtyByProduct.set(l.productId, (purchasedQtyByProduct.get(l.productId) ?? new Prisma.Decimal(0)).add(l.quantity));

      const refundedLines = await tx.shopPurchaseInvoiceLine.findMany({
        where: { tenantId, invoice: { is: { refundOfId: invoice.refundOfId, kind: "refund", status: "posted", moduleId: "pharmacy" } } },
        select: { productId: true, quantity: true }
      });
      const refundedQtyByProduct = new Map<string, Decimal>();
      for (const l of refundedLines) refundedQtyByProduct.set(l.productId, (refundedQtyByProduct.get(l.productId) ?? new Prisma.Decimal(0)).add(l.quantity));

      const day0 = new Date();
      day0.setUTCHours(0, 0, 0, 0);

      const productIds = Array.from(new Set(lines.map((l) => l.productId)));
      const profiles = await tx.shopProductPharmacyProfile.findMany({
        where: { tenantId, productId: { in: productIds } },
        select: { productId: true, trackLots: true }
      });
      const trackLotsByProduct = new Map(productIds.map((pid) => [pid, true]));
      for (const p of profiles) trackLotsByProduct.set(p.productId, p.trackLots);

      for (const l of lines) {
        if (l.quantity.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        const purchased = purchasedQtyByProduct.get(l.productId) ?? new Prisma.Decimal(0);
        const refunded = refundedQtyByProduct.get(l.productId) ?? new Prisma.Decimal(0);
        const remaining = purchased.sub(refunded);
        if (l.quantity.gt(remaining)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

        const item = await tx.shopStockItem.findFirst({
          where: { tenantId, productId: l.productId, locationId: invoice.locationId },
          select: { id: true, onHandQty: true }
        });
        const before = item?.onHandQty ?? new Prisma.Decimal(0);
        if (before.lt(l.quantity)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        const after = before.sub(l.quantity);
        if (item) await tx.shopStockItem.update({ where: { id: item.id }, data: { onHandQty: after } });
        else await tx.shopStockItem.create({ data: { tenantId, productId: l.productId, locationId: invoice.locationId, onHandQty: after } });

        const trackLots = trackLotsByProduct.get(l.productId) ?? true;
        if (trackLots) {
          const lots = await tx.shopStockLot.findMany({
            where: { tenantId, productId: l.productId, locationId: invoice.locationId, expiryDate: { gte: day0 }, onHandQty: { gt: new Prisma.Decimal(0) } },
            orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }]
          });
          let remainingQty = l.quantity;
          for (const lot of lots) {
            if (remainingQty.lte(0)) break;
            const take = Prisma.Decimal.min(remainingQty, lot.onHandQty);
            if (take.lte(0)) continue;
            await tx.shopStockLot.update({ where: { id: lot.id }, data: { onHandQty: lot.onHandQty.sub(take) } });
            await tx.shopPurchaseLotReceipt.create({
              data: {
                tenantId,
                lotId: lot.id,
                purchaseInvoiceId: invoice.id,
                purchaseInvoiceLineId: l.id,
                quantity: take.mul(new Prisma.Decimal(-1)),
                unitCost: l.unitCost,
                actorUserId: req.user.id
              }
            });
            remainingQty = remainingQty.sub(take);
          }
          if (remainingQty.gt(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        }

        await tx.shopStockMovement.create({
          data: { tenantId, type: "supplier_return", productId: l.productId, locationId: invoice.locationId, deltaQty: l.quantity.negated(), beforeQty: before, afterQty: after, note: `PURCHASE_REFUND:${invoice.refundOfId}`, actorUserId: req.user.id }
        });
      }

      if (invoice.purchaseNumber) return;

      const settings = await tx.shopSettings.upsert({
        where: { tenantId },
        update: {},
        create: { tenantId, buyCurrencyCode: "USD", sellCurrencyCode: "USD" },
        select: { nextPurchaseRefundNumber: true }
      });
      const purchaseNumber = formatPurchaseRefundNumber(settings.nextPurchaseRefundNumber);
      await tx.shopSettings.update({ where: { tenantId }, data: { nextPurchaseRefundNumber: settings.nextPurchaseRefundNumber + 1 } });
      await tx.shopPurchaseInvoice.update({ where: { id }, data: { status: "posted", purchaseNumber, postedAt: new Date() } });
      await tx.auditLog.create({
        data: { tenantId, actorUserId: req.user.id, action: "pharmacy.purchase.refund.post", entityType: "shopPurchaseInvoice", entityId: id, metadataJson: { purchaseNumber, refundOfId: invoice.refundOfId } }
      });
    });

    return { data: { success: true } };
  }

  @Post("purchases/:id/payments")
  @RequirePermissions("shop.purchases.pay")
  async addPurchasePayment(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: CreatePurchasePaymentDto) {
    const tenantId = req.tenantId;
    const method = body.method.trim();
    const amount = toDecimal(body.amount);
    if (!method || amount.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    const note = body.note?.trim() || null;

    await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      const invoice = await tx.shopPurchaseInvoice.findFirst({
        where: { tenantId, id, moduleId: "pharmacy" },
        select: { id: true, kind: true, status: true, locationId: true, subtotal: true, paidTotal: true }
      });
      if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (invoice.status !== "posted") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

      const balance = invoice.subtotal.sub(invoice.paidTotal);
      if (balance.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.invoiceFullyPaid" } }, 400);
      if (amount.gt(balance)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.paymentExceedsBalance" } }, 400);

      const methodRow = await tx.shopPaymentMethod.findFirst({ where: { tenantId, moduleId: "pharmacy", name: method }, select: { kind: true } });
      const methodKind = methodRow?.kind ?? null;
      const cashSession =
        methodKind === "cash" && invoice.locationId
          ? await tx.shopCashSession.findFirst({
              where: { tenantId, moduleId: "pharmacy", locationId: invoice.locationId, status: "open" },
              select: { id: true },
              orderBy: [{ openedAt: "desc" }, { id: "desc" }]
            })
          : null;
      const cashSessionId = cashSession?.id ?? null;
      const direction = invoice.kind === "refund" ? "in" : "out";

      await tx.shopPurchaseInvoicePayment.create({ data: { tenantId, invoiceId: id, cashSessionId, direction, method, amount, note, actorUserId: req.user.id } });
      const paidTotal = invoice.paidTotal.add(amount);
      await tx.shopPurchaseInvoice.update({ where: { id }, data: { paidTotal } });
      await tx.auditLog.create({
        data: { tenantId, actorUserId: req.user.id, action: invoice.kind === "refund" ? "pharmacy.purchase.refund.payment.create" : "pharmacy.purchase.payment.create", entityType: "shopPurchaseInvoice", entityId: id, metadataJson: { amount: amount.toString(), method, direction } }
      });
    });

    return { data: { success: true } };
  }

  @Post("purchases/:id/void")
  @RequirePermissions("shop.purchases.void")
  async voidPurchase(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      const inv = await tx.shopPurchaseInvoice.findFirst({
        where: { tenantId, id, moduleId: "pharmacy" },
        select: { id: true, kind: true, status: true, refundOfId: true, locationId: true }
      });
      if (!inv) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (inv.status === "void") return;

      if (inv.status === "draft") {
        if (inv.kind === "purchase") {
          const anyReceived = await tx.shopPurchaseInvoiceLine.findFirst({ where: { tenantId, invoiceId: id, receivedQty: { gt: new Prisma.Decimal(0) } }, select: { id: true } });
          if (anyReceived) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        }
        await tx.shopPurchaseInvoice.update({ where: { id }, data: { status: "void" } });
        await tx.auditLog.create({ data: { tenantId, actorUserId: req.user.id, action: "pharmacy.purchase.void", entityType: "shopPurchaseInvoice", entityId: id, metadataJson: {} } });
        return;
      }

      if (inv.status === "posted" && inv.kind === "refund") {
        const refundOfId = inv.refundOfId ?? null;
        const locationId = inv.locationId ?? null;
        if (!refundOfId || !locationId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

        const lines = await tx.shopPurchaseInvoiceLine.findMany({ where: { tenantId, invoiceId: id }, select: { productId: true, quantity: true } });
        const receipts = await tx.shopPurchaseLotReceipt.findMany({ where: { tenantId, purchaseInvoiceId: id }, select: { lotId: true, quantity: true } });
        const qtyByLotId = new Map<string, Decimal>();
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
          const item = await tx.shopStockItem.upsert({
            where: { tenantId_productId_locationId: { tenantId, productId: l.productId, locationId } },
            update: {},
            create: { tenantId, productId: l.productId, locationId, onHandQty: new Prisma.Decimal(0), avgCost: new Prisma.Decimal(0) },
            select: { id: true, onHandQty: true, avgCost: true }
          });
          const beforeQty = item.onHandQty;
          const afterQty = beforeQty.add(l.quantity);
          await tx.shopStockItem.update({ where: { id: item.id }, data: { onHandQty: afterQty, avgCost: item.avgCost } });
          await tx.shopStockMovement.create({
            data: {
              tenantId,
              type: "supplier_return",
              productId: l.productId,
              locationId,
              deltaQty: l.quantity,
              beforeQty,
              afterQty,
              note: `VOID_PURCHASE_REFUND:${refundOfId}`,
              actorUserId: req.user.id
            }
          });
        }

        await tx.shopPurchaseInvoice.update({ where: { id }, data: { status: "void" } });
        await tx.auditLog.create({
          data: { tenantId, actorUserId: req.user.id, action: "pharmacy.purchase.refund.void", entityType: "shopPurchaseInvoice", entityId: id, metadataJson: { refundOfId } }
        });
        return;
      }

      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    });

    return { data: { success: true } };
  }

  @Get("pos/resolve")
  @RequirePermissions("shop.sales.create")
  async resolvePosCode(@Req() req: { tenantId: string }, @Query() query: PosResolveQueryDto) {
    const tenantId = req.tenantId;
    const code = query.code.trim();
    if (!code) return { data: { items: [] } };

    const [packMatches, prodMatches] = await Promise.all([
      this.prisma.shopProductPackaging.findMany({
        where: { tenantId, barcode: code, product: { deletedAt: null, isActive: true, moduleId: "pharmacy" } },
        select: {
          id: true,
          label: true,
          multiplier: true,
          product: {
            select: {
              id: true,
              name: true,
              sku: true,
              sellPrice: true,
              unit: { select: { id: true, name: true, symbol: true } },
              barcodes: { select: { code: true }, orderBy: { createdAt: "asc" } }
            }
          }
        }
      }),
      this.prisma.shopProduct.findMany({
        where: { tenantId, moduleId: "pharmacy", deletedAt: null, isActive: true, OR: [{ sku: code }, { barcodes: { some: { code } } }] },
        select: {
          id: true,
          name: true,
          sku: true,
          sellPrice: true,
          unit: { select: { id: true, name: true, symbol: true } },
          barcodes: { select: { code: true }, orderBy: { createdAt: "asc" } }
        }
      })
    ]);

    const items = [
      ...packMatches.map((m) => ({
        product: {
          id: m.product.id,
          name: m.product.name,
          sku: m.product.sku,
          unit: m.product.unit ? { id: m.product.unit.id, name: m.product.unit.name, symbol: m.product.unit.symbol } : null,
          sellPrice: m.product.sellPrice.toString(),
          barcodes: m.product.barcodes.map((b) => b.code)
        },
        multiplier: m.multiplier.toString(),
        packagingLabel: m.label
      })),
      ...prodMatches.map((p) => ({
        product: {
          id: p.id,
          name: p.name,
          sku: p.sku,
          unit: p.unit ? { id: p.unit.id, name: p.unit.name, symbol: p.unit.symbol } : null,
          sellPrice: p.sellPrice.toString(),
          barcodes: p.barcodes.map((b) => b.code)
        },
        multiplier: "1",
        packagingLabel: null as string | null
      }))
    ];

    return { data: { items } };
  }

  @Get("settings")
  @RequirePermissions("shop.products.read")
  async getSettings(@Req() req: { tenantId: string }) {
    const tenantId = req.tenantId;
    const tenantSettings = await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId, baseCurrencyCode: "USD" },
      select: { baseCurrencyCode: true }
    });
    const shopSettings = await this.prisma.shopSettings.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId, buyCurrencyCode: tenantSettings.baseCurrencyCode, sellCurrencyCode: tenantSettings.baseCurrencyCode },
      select: {
        buyCurrencyCode: true,
        sellCurrencyCode: true,
        taxEnabled: true,
        taxRate: true,
        cashRoundingIncrement: true,
        pharmacyReceivingRequireLotNumber: true,
        pharmacyReceivingRequireExpiryDate: true
      }
    });

    return {
      data: {
        baseCurrencyCode: tenantSettings.baseCurrencyCode,
        sellCurrencyCode: shopSettings.sellCurrencyCode,
        buyCurrencyCode: shopSettings.buyCurrencyCode,
        taxEnabled: shopSettings.taxEnabled,
        taxRate: shopSettings.taxRate.toString(),
        cashRoundingIncrement: shopSettings.cashRoundingIncrement.toString(),
        pharmacyReceivingRequireLotNumber: shopSettings.pharmacyReceivingRequireLotNumber,
        pharmacyReceivingRequireExpiryDate: shopSettings.pharmacyReceivingRequireExpiryDate
      }
    };
  }

  @Patch("settings")
  @RequirePermissions("shop.products.update")
  async updateSettings(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: UpdateShopSettingsDto) {
    if (
      body.buyCurrencyCode === undefined &&
      body.sellCurrencyCode === undefined &&
      body.taxEnabled === undefined &&
      body.taxRate === undefined &&
      body.cashRoundingIncrement === undefined &&
      body.pharmacyReceivingRequireLotNumber === undefined &&
      body.pharmacyReceivingRequireExpiryDate === undefined
    ) {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const tenantId = req.tenantId;
    const tenantSettings = await this.prisma.tenantSettings.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId, baseCurrencyCode: "USD" },
      select: { baseCurrencyCode: true }
    });

    const current = await this.prisma.shopSettings.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId, buyCurrencyCode: tenantSettings.baseCurrencyCode, sellCurrencyCode: tenantSettings.baseCurrencyCode },
      select: {
        buyCurrencyCode: true,
        sellCurrencyCode: true,
        taxEnabled: true,
        taxRate: true,
        cashRoundingIncrement: true,
        pharmacyReceivingRequireLotNumber: true,
        pharmacyReceivingRequireExpiryDate: true
      }
    });

    const nextBuy = body.buyCurrencyCode ?? tenantSettings.baseCurrencyCode;
    const nextSell = body.sellCurrencyCode ?? tenantSettings.baseCurrencyCode;
    const nextTaxEnabled = body.taxEnabled ?? current.taxEnabled;
    const nextTaxRate = body.taxRate !== undefined ? toDecimal(body.taxRate) : current.taxRate;
    const nextRounding = body.cashRoundingIncrement !== undefined ? toDecimal(body.cashRoundingIncrement) : current.cashRoundingIncrement;
    const nextRequireLot = body.pharmacyReceivingRequireLotNumber ?? current.pharmacyReceivingRequireLotNumber;
    const nextRequireExpiry = body.pharmacyReceivingRequireExpiryDate ?? current.pharmacyReceivingRequireExpiryDate;

    await this.prisma.shopSettings.upsert({
      where: { tenantId },
      update: {
        buyCurrencyCode: nextBuy,
        sellCurrencyCode: nextSell,
        taxEnabled: nextTaxEnabled,
        taxRate: nextTaxRate,
        cashRoundingIncrement: nextRounding,
        pharmacyReceivingRequireLotNumber: nextRequireLot,
        pharmacyReceivingRequireExpiryDate: nextRequireExpiry
      },
      create: {
        tenantId,
        buyCurrencyCode: nextBuy,
        sellCurrencyCode: nextSell,
        taxEnabled: nextTaxEnabled,
        taxRate: nextTaxRate,
        cashRoundingIncrement: nextRounding,
        pharmacyReceivingRequireLotNumber: nextRequireLot,
        pharmacyReceivingRequireExpiryDate: nextRequireExpiry
      }
    });

    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "pharmacy.settings.update", entityType: "shopSettings", entityId: tenantId, metadataJson: {} }
    });

    return { data: { success: true } };
  }

  @Get("categories")
  @RequirePermissions("shop.products.read")
  async listCategories(@Req() req: { tenantId: string }) {
    const categories = await this.prisma.shopCategory.findMany({
      where: { tenantId: req.tenantId, moduleId: "pharmacy", isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" }
    });
    return { data: categories };
  }

  @Post("categories/seed-default")
  @RequirePermissions("shop.products.create")
  async seedDefaultCategories(@Req() req: { tenantId: string; user: { id: string } }) {
    const count = await this.prisma.shopCategory.count({ where: { tenantId: req.tenantId, moduleId: "pharmacy" } });
    if (count === 0) {
      await this.prisma.shopCategory.createMany({
        data: defaultCategoryNames().map((name) => ({ tenantId: req.tenantId, moduleId: "pharmacy", name })),
        skipDuplicates: true
      });
      await this.prisma.auditLog.create({
        data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "pharmacy.category.seed", metadataJson: {} }
      });
    }
    return { data: { success: true } };
  }

  @Post("categories")
  @RequirePermissions("shop.products.create")
  async createCategory(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateCategoryDto) {
    const name = body.name.trim();
    const category = await this.prisma.shopCategory.create({
      data: { tenantId: req.tenantId, moduleId: "pharmacy", name },
      select: { id: true, name: true }
    });
    await this.prisma.auditLog.create({
      data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "pharmacy.category.create", entityType: "shopCategory", entityId: category.id, metadataJson: {} }
    });
    return { data: category };
  }

  @Get("units")
  @RequirePermissions("shop.products.read")
  async listUnits(@Req() req: { tenantId: string }) {
    const units = await this.prisma.shopUnit.findMany({
      where: { tenantId: req.tenantId, moduleId: "pharmacy", isActive: true },
      select: { id: true, name: true, symbol: true },
      orderBy: { name: "asc" }
    });
    return { data: units };
  }

  @Post("units/seed-default")
  @RequirePermissions("shop.products.create")
  async seedDefaultUnits(@Req() req: { tenantId: string; user: { id: string } }) {
    const count = await this.prisma.shopUnit.count({ where: { tenantId: req.tenantId, moduleId: "pharmacy" } });
    if (count === 0) {
      await this.prisma.shopUnit.createMany({
        data: defaultUnits().map((u) => ({ tenantId: req.tenantId, moduleId: "pharmacy", name: u.name, symbol: u.symbol })),
        skipDuplicates: true
      });
      await this.prisma.auditLog.create({
        data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "pharmacy.unit.seed", metadataJson: {} }
      });
    }
    return { data: { success: true } };
  }

  @Post("units")
  @RequirePermissions("shop.products.create")
  async createUnit(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateUnitDto) {
    const name = body.name.trim();
    const symbol = body.symbol?.trim() || null;
    if (!name) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    try {
      const unit = await this.prisma.shopUnit.create({
        data: { tenantId: req.tenantId, moduleId: "pharmacy", name, symbol },
        select: { id: true, name: true, symbol: true }
      });
      await this.prisma.auditLog.create({
        data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "pharmacy.unit.create", entityType: "shopUnit", entityId: unit.id, metadataJson: {} }
      });
      return { data: unit };
    } catch (err: unknown) {
      if (typeof err === "object" && err !== null && "code" in err && (err as { code?: unknown }).code === "P2002") {
        throw new HttpException({ error: { code: "CONFLICT", message_key: "errors.conflict" } }, 409);
      }
      throw err;
    }
  }

  @Get("products")
  @RequirePermissions("shop.products.read")
  async listProducts(@Req() req: { tenantId: string }, @Query() query: ListProductsQueryDto) {
    const page = toInt(query.page, 1);
    const pageSize = Math.min(50, toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const q = query.q?.trim() || null;
    const categoryId = query.categoryId?.trim() || null;
    const status = query.status === "archived" ? "archived" : "active";

    const where: Record<string, unknown> = { tenantId: req.tenantId, moduleId: "pharmacy" };
    if (status === "active") where.deletedAt = null;
    else where.deletedAt = { not: null };
    if (categoryId) where.categoryId = categoryId;
    if (!q) where.parentProductId = null;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: "insensitive" } },
        { sku: { contains: q, mode: "insensitive" } },
        { barcodes: { some: { code: { contains: q, mode: "insensitive" } } } },
        { packaging: { some: { barcode: { contains: q, mode: "insensitive" } } } }
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.shopProduct.count({ where }),
      this.prisma.shopProduct.findMany({
        where,
        select: {
          id: true,
          name: true,
          sku: true,
          description: true,
          unitId: true,
          imageFileId: true,
          sellPrice: true,
          costPrice: true,
          isActive: true,
          deletedAt: true,
          category: { select: { id: true, name: true } },
          unit: { select: { id: true, name: true, symbol: true } },
          barcodes: { select: { code: true }, orderBy: { createdAt: "asc" } },
          createdAt: true,
          updatedAt: true
        },
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize
      })
    ]);

    return {
      data: {
        items: items.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          description: p.description,
          unit: p.unit ? { id: p.unit.id, name: p.unit.name, symbol: p.unit.symbol } : null,
          image: p.imageFileId ? { id: p.imageFileId, url: `/api/files/${p.imageFileId}` } : null,
          sellPrice: p.sellPrice.toString(),
          costPrice: p.costPrice?.toString() ?? null,
          category: p.category ? { id: p.category.id, name: p.category.name } : null,
          barcodes: p.barcodes.map((b) => b.code),
          isActive: p.isActive,
          status: p.deletedAt ? "archived" : "active",
          createdAt: p.createdAt,
          updatedAt: p.updatedAt
        })),
        page,
        pageSize,
        total
      }
    };
  }

  @Get("products/:id")
  @RequirePermissions("shop.products.read")
  async getProduct(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const p = await this.prisma.shopProduct.findFirst({
      where: { tenantId: req.tenantId, id, moduleId: "pharmacy" },
      select: {
        id: true,
        name: true,
        sku: true,
        description: true,
        parentProductId: true,
        variantLabel: true,
        variantAttributesJson: true,
        unit: { select: { id: true, name: true, symbol: true } },
        imageFileId: true,
        sellPrice: true,
        costPrice: true,
        category: { select: { id: true, name: true } },
        barcodes: { select: { code: true }, orderBy: { createdAt: "asc" } },
        packaging: { select: { id: true, label: true, multiplier: true, barcode: true }, orderBy: { createdAt: "asc" } },
        deletedAt: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      }
    });
    if (!p) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    return {
      data: {
        id: p.id,
        name: p.name,
        sku: p.sku,
        description: p.description,
        parentProductId: p.parentProductId,
        variantLabel: p.variantLabel,
        variantAttributes: p.variantAttributesJson ?? null,
        unit: p.unit ? { id: p.unit.id, name: p.unit.name, symbol: p.unit.symbol } : null,
        image: p.imageFileId ? { id: p.imageFileId, url: `/api/files/${p.imageFileId}` } : null,
        sellPrice: p.sellPrice.toString(),
        costPrice: p.costPrice?.toString() ?? null,
        category: p.category ? { id: p.category.id, name: p.category.name } : null,
        barcodes: p.barcodes.map((b) => b.code),
        packaging: p.packaging.map((x) => ({ id: x.id, label: x.label, multiplier: x.multiplier.toString(), barcode: x.barcode })),
        status: p.deletedAt ? "archived" : "active",
        isActive: p.isActive,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt
      }
    };
  }

  @Post("products")
  @RequirePermissions("shop.products.create")
  async createProduct(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateProductDto) {
    const barcodes = normalizeBarcodes(body.barcodes);
    const name = body.name.trim();
    const sku = body.sku?.trim() || null;
    const description = body.description?.trim() || null;
    const categoryId = body.categoryId?.trim() || null;
    const unitId = body.unitId?.trim() || null;
    const imageFileId = body.imageFileId?.trim() || null;

    if (categoryId) {
      const exists = await this.prisma.shopCategory.findFirst({ where: { id: categoryId, tenantId: req.tenantId, moduleId: "pharmacy", isActive: true }, select: { id: true } });
      if (!exists) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    if (unitId) {
      const ok = await this.prisma.shopUnit.findFirst({ where: { id: unitId, tenantId: req.tenantId, moduleId: "pharmacy", isActive: true }, select: { id: true } });
      if (!ok) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    if (imageFileId) {
      const ok = await this.prisma.file.findFirst({ where: { id: imageFileId, tenantId: req.tenantId }, select: { id: true } });
      if (!ok) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const product = await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      const created = await tx.shopProduct.create({
        data: {
          tenantId: req.tenantId,
          moduleId: "pharmacy",
          name,
          sku,
          description,
          categoryId,
          unitId,
          imageFileId,
          sellPrice: body.sellPrice,
          costPrice: body.costPrice ?? null
        },
        select: { id: true }
      });

      if (barcodes.length) {
        await tx.shopProductBarcode.createMany({
          data: barcodes.map((code) => ({ tenantId: req.tenantId, productId: created.id, code })),
          skipDuplicates: true
        });
      }

      await tx.auditLog.create({
        data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "pharmacy.product.create", entityType: "shopProduct", entityId: created.id, metadataJson: {} }
      });

      return created;
    });

    const full = await this.prisma.shopProduct.findFirst({
      where: { tenantId: req.tenantId, id: product.id, moduleId: "pharmacy" },
      select: {
        id: true,
        name: true,
        sku: true,
        description: true,
        imageFileId: true,
        unit: { select: { id: true, name: true, symbol: true } },
        sellPrice: true,
        costPrice: true,
        category: { select: { id: true, name: true } },
        barcodes: { select: { code: true }, orderBy: { createdAt: "asc" } },
        createdAt: true,
        updatedAt: true,
        deletedAt: true,
        isActive: true
      }
    });

    return {
      data: {
        id: full!.id,
        name: full!.name,
        sku: full!.sku,
        description: full!.description,
        unit: full!.unit ? { id: full!.unit.id, name: full!.unit.name, symbol: full!.unit.symbol } : null,
        image: full!.imageFileId ? { id: full!.imageFileId, url: `/api/files/${full!.imageFileId}` } : null,
        sellPrice: full!.sellPrice.toString(),
        costPrice: full!.costPrice?.toString() ?? null,
        category: full!.category ? { id: full!.category.id, name: full!.category.name } : null,
        barcodes: full!.barcodes.map((b) => b.code),
        status: full!.deletedAt ? "archived" : "active",
        isActive: full!.isActive,
        createdAt: full!.createdAt,
        updatedAt: full!.updatedAt
      }
    };
  }

  @Patch("products/:id")
  @RequirePermissions("shop.products.update")
  async updateProduct(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: UpdateProductDto) {
    const existing = await this.prisma.shopProduct.findFirst({ where: { tenantId: req.tenantId, id, moduleId: "pharmacy" }, select: { id: true, deletedAt: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const updates: Record<string, unknown> = {};
    if (typeof body.name === "string") updates.name = body.name.trim();
    if (body.sku !== undefined) updates.sku = body.sku ? body.sku.trim() : null;
    if (body.description !== undefined) updates.description = body.description ? body.description.trim() : null;
    if (body.sellPrice !== undefined) updates.sellPrice = body.sellPrice;
    if (body.costPrice !== undefined) updates.costPrice = body.costPrice ?? null;
    if (body.categoryId !== undefined) {
      const categoryId = body.categoryId ? body.categoryId.trim() : null;
      if (categoryId) {
        const ok = await this.prisma.shopCategory.findFirst({ where: { id: categoryId, tenantId: req.tenantId, moduleId: "pharmacy", isActive: true }, select: { id: true } });
        if (!ok) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }
      updates.categoryId = categoryId;
    }

    if (body.unitId !== undefined) {
      const unitId = body.unitId ? body.unitId.trim() : null;
      if (unitId) {
        const ok = await this.prisma.shopUnit.findFirst({ where: { id: unitId, tenantId: req.tenantId, moduleId: "pharmacy", isActive: true }, select: { id: true } });
        if (!ok) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }
      updates.unitId = unitId;
    }

    if (body.imageFileId !== undefined) {
      const imageFileId = body.imageFileId ? body.imageFileId.trim() : null;
      if (imageFileId) {
        const ok = await this.prisma.file.findFirst({ where: { id: imageFileId, tenantId: req.tenantId }, select: { id: true } });
        if (!ok) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }
      updates.imageFileId = imageFileId;
    }

    const barcodes = body.barcodes ? normalizeBarcodes(body.barcodes) : null;

    await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      await tx.shopProduct.update({ where: { id }, data: updates });
      if (barcodes) {
        await tx.shopProductBarcode.deleteMany({ where: { tenantId: req.tenantId, productId: id } });
        if (barcodes.length) {
          await tx.shopProductBarcode.createMany({
            data: barcodes.map((code) => ({ tenantId: req.tenantId, productId: id, code })),
            skipDuplicates: true
          });
        }
      }

      await tx.auditLog.create({
        data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "pharmacy.product.update", entityType: "shopProduct", entityId: id, metadataJson: {} }
      });
    });

    return { data: { success: true } };
  }

  @Delete("products/:id")
  @RequirePermissions("shop.products.delete")
  async deleteProduct(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string) {
    const existing = await this.prisma.shopProduct.findFirst({ where: { tenantId: req.tenantId, id, moduleId: "pharmacy" }, select: { id: true, deletedAt: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (existing.deletedAt) return { data: { success: true } };

    await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      await tx.shopProduct.update({ where: { id }, data: { deletedAt: new Date(), isActive: false } });
      await tx.auditLog.create({
        data: { tenantId: req.tenantId, actorUserId: req.user.id, action: "pharmacy.product.archive", entityType: "shopProduct", entityId: id, metadataJson: {} }
      });
    });

    return { data: { success: true } };
  }

  @Get("products/:id/variants")
  @RequirePermissions("shop.products.read")
  async listVariants(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const items = await this.prisma.shopProduct.findMany({
      where: { tenantId, moduleId: "pharmacy", parentProductId: id, deletedAt: null, isActive: true },
      select: {
        id: true,
        name: true,
        sku: true,
        sellPrice: true,
        costPrice: true,
        description: true,
        unit: { select: { id: true, name: true, symbol: true } },
        imageFileId: true,
        barcodes: { select: { code: true }, orderBy: { createdAt: "asc" } },
        variantLabel: true,
        variantAttributesJson: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }]
    });
    return {
      data: {
        items: items.map((p) => ({
          id: p.id,
          name: p.name,
          sku: p.sku,
          description: p.description,
          unit: p.unit ? { id: p.unit.id, name: p.unit.name, symbol: p.unit.symbol } : null,
          image: p.imageFileId ? { id: p.imageFileId, url: `/api/files/${p.imageFileId}` } : null,
          sellPrice: p.sellPrice.toString(),
          costPrice: p.costPrice?.toString() ?? null,
          category: null,
          barcodes: p.barcodes.map((b) => b.code),
          isActive: true,
          status: "active",
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          variantLabel: p.variantLabel,
          variantAttributes: p.variantAttributesJson ?? null
        }))
      }
    };
  }

  @Post("products/:id/variants")
  @RequirePermissions("shop.products.create")
  async createVariant(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: CreateVariantDto) {
    const tenantId = req.tenantId;
    const parent = await this.prisma.shopProduct.findFirst({
      where: { tenantId, id, moduleId: "pharmacy", deletedAt: null, isActive: true },
      select: { id: true, name: true, categoryId: true, unitId: true, imageFileId: true, sellPrice: true, costPrice: true }
    });
    if (!parent) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const label = body.label.trim();
    const sku = body.sku?.trim() || null;
    const sellPrice = body.sellPrice ? toDecimal(body.sellPrice) : parent.sellPrice;

    let attrs: Record<string, string> | null = null;
    if (body.attributes?.trim()) {
      const obj: Record<string, string> = {};
      for (const part of body.attributes.split(",").map((p) => p.trim()).filter(Boolean)) {
        const idx = part.indexOf("=");
        if (idx <= 0) continue;
        const k = part.slice(0, idx).trim();
        const v = part.slice(idx + 1).trim();
        if (k && v) obj[k] = v;
      }
      attrs = Object.keys(obj).length ? obj : null;
    }

    const created = await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      const product = await tx.shopProduct.create({
        data: {
          tenantId,
          moduleId: "pharmacy",
          name: `${parent.name} - ${label}`.slice(0, 120),
          sku,
          description: null,
          categoryId: parent.categoryId,
          unitId: parent.unitId,
          imageFileId: parent.imageFileId,
          sellPrice,
          costPrice: parent.costPrice,
          parentProductId: parent.id,
          variantLabel: label,
          ...(attrs ? { variantAttributesJson: attrs } : {})
        },
        select: { id: true }
      });

      if (body.barcodes?.length) {
        const codes = body.barcodes.map((c) => c.trim()).filter(Boolean);
        for (const code of codes) {
          await tx.shopProductBarcode.create({ data: { tenantId, productId: product.id, code } });
        }
      }

      await tx.auditLog.create({
        data: { tenantId, actorUserId: req.user.id, action: "pharmacy.product.variant.create", entityType: "shopProduct", entityId: product.id, metadataJson: { parentProductId: parent.id } }
      });
      return product;
    });

    return { data: { id: created.id } };
  }

  @Get("products/:id/packaging")
  @RequirePermissions("shop.products.read")
  async listPackaging(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const items = await this.prisma.shopProductPackaging.findMany({
      where: { tenantId, productId: id, product: { is: { moduleId: "pharmacy" } } },
      select: { id: true, label: true, multiplier: true, barcode: true, createdAt: true },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }]
    });
    return { data: { items: items.map((p) => ({ id: p.id, label: p.label, multiplier: p.multiplier.toString(), barcode: p.barcode })) } };
  }

  @Post("products/:id/packaging")
  @RequirePermissions("shop.products.update")
  async createPackaging(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: CreatePackagingDto) {
    const tenantId = req.tenantId;
    const product = await this.prisma.shopProduct.findFirst({ where: { tenantId, id, moduleId: "pharmacy" }, select: { id: true } });
    if (!product) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    const created = await this.prisma.shopProductPackaging.create({
      data: { tenantId, productId: id, label: body.label.trim(), multiplier: toDecimal(body.multiplier), barcode: body.barcode ? body.barcode.trim() : null },
      select: { id: true }
    });
    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "pharmacy.product.packaging.create", entityType: "shopProduct", entityId: id, metadataJson: { packagingId: created.id } }
    });
    return { data: { id: created.id } };
  }

  @Patch("products/:id/packaging/:packagingId")
  @RequirePermissions("shop.products.update")
  async updatePackaging(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Param("packagingId") packagingId: string, @Body() body: UpdatePackagingDto) {
    const tenantId = req.tenantId;
    const product = await this.prisma.shopProduct.findFirst({ where: { tenantId, id, moduleId: "pharmacy" }, select: { id: true } });
    if (!product) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    const existing = await this.prisma.shopProductPackaging.findFirst({ where: { tenantId, id: packagingId, productId: id }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    const updates: Record<string, unknown> = {};
    if (body.label !== undefined) updates.label = body.label.trim();
    if (body.multiplier !== undefined) updates.multiplier = toDecimal(body.multiplier);
    if (body.barcode !== undefined) updates.barcode = body.barcode ? body.barcode.trim() : null;
    await this.prisma.shopProductPackaging.update({ where: { id: packagingId }, data: updates });
    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "pharmacy.product.packaging.update", entityType: "shopProduct", entityId: id, metadataJson: { packagingId } }
    });
    return { data: { success: true } };
  }

  @Delete("products/:id/packaging/:packagingId")
  @RequirePermissions("shop.products.update")
  async deletePackaging(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Param("packagingId") packagingId: string) {
    const tenantId = req.tenantId;
    const product = await this.prisma.shopProduct.findFirst({ where: { tenantId, id, moduleId: "pharmacy" }, select: { id: true } });
    if (!product) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    const existing = await this.prisma.shopProductPackaging.findFirst({ where: { tenantId, id: packagingId, productId: id }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    await this.prisma.shopProductPackaging.delete({ where: { id: packagingId } });
    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "pharmacy.product.packaging.delete", entityType: "shopProduct", entityId: id, metadataJson: { packagingId } }
    });
    return { data: { success: true } };
  }

  @Get("products/:id/pharmacy-profile")
  @RequirePermissions("shop.products.read")
  async getProductPharmacyProfile(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.shopProduct.findFirst({ where: { tenantId, id, moduleId: "pharmacy" }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const profile = await this.prisma.shopProductPharmacyProfile.findFirst({
      where: { tenantId, productId: id },
      select: { trackLots: true, requiresPrescription: true, isControlled: true, form: true, strength: true }
    });

    return { data: profile ?? { trackLots: false, requiresPrescription: false, isControlled: false, form: null, strength: null } };
  }

  @Patch("products/:id/pharmacy-profile")
  @RequirePermissions("shop.products.update")
  async upsertProductPharmacyProfile(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: UpdateProductPharmacyProfileDto) {
    const tenantId = req.tenantId;
    const existing = await this.prisma.shopProduct.findFirst({ where: { tenantId, id, moduleId: "pharmacy" }, select: { id: true } });
    if (!existing) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    const current = await this.prisma.shopProductPharmacyProfile.findFirst({
      where: { tenantId, productId: id },
      select: { trackLots: true, requiresPrescription: true, isControlled: true, form: true, strength: true }
    });

    const updates: Record<string, unknown> = {
      trackLots: body.trackLots ?? current?.trackLots ?? false,
      requiresPrescription: body.requiresPrescription ?? current?.requiresPrescription ?? false,
      isControlled: body.isControlled ?? current?.isControlled ?? false
    };
    if (body.form !== undefined) updates.form = body.form ? body.form.trim() : null;
    else if (!current) updates.form = null;
    if (body.strength !== undefined) updates.strength = body.strength ? body.strength.trim() : null;
    else if (!current) updates.strength = null;

    const isEmpty =
      updates.trackLots === false &&
      updates.requiresPrescription === false &&
      updates.isControlled === false &&
      updates.form === null &&
      updates.strength === null;

    if (isEmpty) {
      await this.prisma.shopProductPharmacyProfile.deleteMany({ where: { tenantId, productId: id } });
    } else {
      await this.prisma.shopProductPharmacyProfile.upsert({
        where: { productId: id },
        update: updates,
        create: { tenantId, productId: id, ...updates }
      });
    }

    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "pharmacy.product.pharmacyProfile.update", entityType: "shopProduct", entityId: id, metadataJson: {} }
    });

    return { data: { success: true } };
  }

  @Post("invoices")
  @RequirePermissions("shop.invoices.create")
  async createInvoice(@Req() req: { tenantId: string; user: { id: string } }, @Body() body: CreateInvoiceDto) {
    const tenantId = req.tenantId;

    const shopSettings = await this.prisma.shopSettings.upsert({
      where: { tenantId },
      update: {},
      create: { tenantId, buyCurrencyCode: "USD", sellCurrencyCode: "USD" },
      select: { sellCurrencyCode: true, taxEnabled: true, taxRate: true }
    });

    const locationId = body.locationId?.trim() || null;
    if (!locationId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    const ok = await this.prisma.shopLocation.findFirst({ where: { id: locationId, tenantId, moduleId: "pharmacy", isActive: true }, select: { id: true } });
    if (!ok) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const customerId = body.customerId?.trim() || null;
    if (customerId) {
      const c = await this.prisma.shopCustomer.findFirst({ where: { tenantId, id: customerId, moduleId: "pharmacy", deletedAt: null }, select: { id: true } });
      if (!c) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    const invoice = await this.prisma.shopInvoice.create({
      data: {
        tenantId,
        moduleId: "pharmacy",
        kind: "sale",
        status: "draft",
        locationId,
        customerId,
        currencyCode: shopSettings.sellCurrencyCode,
        grossSubtotal: new Prisma.Decimal(0),
        invoiceDiscountAmount: new Prisma.Decimal(0),
        discountTotal: new Prisma.Decimal(0),
        taxEnabled: shopSettings.taxEnabled,
        taxRate: shopSettings.taxRate,
        taxTotal: new Prisma.Decimal(0),
        roundingAdjustment: new Prisma.Decimal(0),
        subtotal: new Prisma.Decimal(0)
      },
      select: { id: true }
    });

    await this.prisma.auditLog.create({
      data: { tenantId, actorUserId: req.user.id, action: "pharmacy.invoice.create", entityType: "shopInvoice", entityId: invoice.id, metadataJson: {} }
    });

    return { data: { id: invoice.id } };
  }

  @Post("invoices/:id/refund-draft")
  @RequirePermissions("shop.invoices.create")
  async createRefundDraft(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: CreateRefundDraftDto) {
    const tenantId = req.tenantId;

    const original = await this.prisma.shopInvoice.findFirst({
      where: { tenantId, id, moduleId: "pharmacy" },
      select: {
        id: true,
        kind: true,
        status: true,
        locationId: true,
        customerId: true,
        currencyCode: true,
        invoiceNumber: true,
        lines: { select: { productId: true, quantity: true, unitPrice: true } }
      }
    });
    if (!original) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (original.kind !== "sale" || original.status !== "posted") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    if (!original.locationId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    if (original.lines.length === 0) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const refunded = await this.prisma.shopInvoiceLine.groupBy({
      by: ["productId"],
      where: { tenantId, invoice: { is: { refundOfId: original.id, kind: "refund", status: "posted", moduleId: "pharmacy" } } },
      _sum: { quantity: true }
    });
    const refundedMap = new Map(refunded.map((r) => [r.productId, r._sum.quantity ?? new Prisma.Decimal(0)]));

    const originalMap = new Map(original.lines.map((l) => [l.productId, l]));
    const availableMap = new Map<string, Decimal>();
    for (const l of original.lines) {
      const refundedQty = refundedMap.get(l.productId) ?? new Prisma.Decimal(0);
      const available = l.quantity.sub(refundedQty);
      if (available.gt(0)) availableMap.set(l.productId, available);
    }

    const requested = body.lines?.length
      ? body.lines.map((l) => ({ productId: l.productId.trim(), quantity: toDecimal(l.quantity) }))
      : Array.from(availableMap.entries()).map(([productId, quantity]) => ({ productId, quantity }));

    if (!requested.length) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const refundLines: { productId: string; quantity: Decimal; unitPrice: Decimal }[] = [];
    let subtotal = new Prisma.Decimal(0);
    for (const r of requested) {
      if (!r.productId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      if (r.quantity.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      const originalLine = originalMap.get(r.productId) ?? null;
      if (!originalLine) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      const available = availableMap.get(r.productId) ?? new Prisma.Decimal(0);
      if (r.quantity.gt(available)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      refundLines.push({ productId: r.productId, quantity: r.quantity, unitPrice: originalLine.unitPrice });
      subtotal = subtotal.add(r.quantity.mul(originalLine.unitPrice));
    }

    const refund = await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      const created = await tx.shopInvoice.create({
        data: {
          tenantId,
          moduleId: "pharmacy",
          kind: "refund",
          status: "draft",
          refundOfId: original.id,
          restockOnRefund: body.restockOnRefund ?? true,
          locationId: original.locationId,
          customerId: original.customerId,
          currencyCode: original.currencyCode,
          grossSubtotal: subtotal,
          invoiceDiscountAmount: new Prisma.Decimal(0),
          discountTotal: new Prisma.Decimal(0),
          taxEnabled: false,
          taxRate: new Prisma.Decimal(0),
          taxTotal: new Prisma.Decimal(0),
          roundingAdjustment: new Prisma.Decimal(0),
          subtotal
        },
        select: { id: true }
      });
      await tx.shopInvoiceLine.createMany({
        data: refundLines.map((l) => ({
          tenantId,
          invoiceId: created.id,
          productId: l.productId,
          quantity: l.quantity,
          unitPrice: l.unitPrice,
          lineTotal: l.quantity.mul(l.unitPrice),
          discountAmount: new Prisma.Decimal(0),
          netTotal: l.quantity.mul(l.unitPrice)
        }))
      });
      await tx.auditLog.create({
        data: { tenantId, actorUserId: req.user.id, action: "pharmacy.invoice.refundDraft.create", entityType: "shopInvoice", entityId: created.id, metadataJson: { refundOfId: original.id, refundOfNumber: original.invoiceNumber } }
      });
      return created;
    });

    return { data: { id: refund.id } };
  }

  @Patch("invoices/:id")
  @RequirePermissions("shop.invoices.update")
  async updateInvoice(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: UpdateInvoiceDto) {
    const tenantId = req.tenantId;
    const invoice = await this.prisma.shopInvoice.findFirst({
      where: { tenantId, id, moduleId: "pharmacy" },
      select: { id: true, kind: true, status: true, locationId: true, taxEnabled: true, taxRate: true, invoiceDiscountAmount: true }
    });
    if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (invoice.status !== "draft") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const updates: Record<string, unknown> = {};
    if (body.notes !== undefined) updates.notes = body.notes ? body.notes.trim() : null;
    if (body.locationId !== undefined) updates.locationId = body.locationId ? body.locationId.trim() : null;

    const locationId = updates.locationId as string | null | undefined;
    if (locationId) {
      const ok = await this.prisma.shopLocation.findFirst({ where: { id: locationId, tenantId, moduleId: "pharmacy", isActive: true }, select: { id: true } });
      if (!ok) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    if (body.customerId !== undefined) {
      const customerId = body.customerId ? body.customerId.trim() : null;
      if (customerId) {
        const ok = await this.prisma.shopCustomer.findFirst({ where: { tenantId, id: customerId, moduleId: "pharmacy", deletedAt: null }, select: { id: true } });
        if (!ok) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }
      updates.customerId = customerId;
    }

    const lines = body.lines ?? null;
    const nextLines = lines
      ? lines.map((l) => ({
          productId: l.productId.trim(),
          quantity: toDecimal(l.quantity),
          unitPrice: toDecimal(l.unitPrice),
          discountAmount: toDecimalOrZero(l.discountAmount)
        }))
      : null;

    const needsTotalsRecalc = nextLines !== null || body.invoiceDiscountAmount !== undefined || body.taxEnabled !== undefined || body.taxRate !== undefined;
    let calcLines =
      nextLines ??
      (needsTotalsRecalc
        ? await this.prisma.shopInvoiceLine.findMany({ where: { tenantId, invoiceId: id }, select: { productId: true, quantity: true, unitPrice: true, discountAmount: true } })
        : null);

    if (calcLines) {
      if (calcLines.length) {
        const productIds = Array.from(new Set(calcLines.map((l) => l.productId)));
        const products = await this.prisma.shopProduct.findMany({
          where: { tenantId, moduleId: "pharmacy", id: { in: productIds }, deletedAt: null },
          select: { id: true }
        });
        if (products.length !== productIds.length) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      }

      let grossSubtotal = new Prisma.Decimal(0);
      let lineDiscountTotal = new Prisma.Decimal(0);
      const normalizedLines: { productId: string; quantity: Decimal; unitPrice: Decimal; lineTotal: Decimal; discountAmount: Decimal; netTotal: Decimal }[] =
        [];

      for (const l of calcLines) {
        if (l.quantity.lte(0) || l.unitPrice.lt(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        const lineTotal = l.quantity.mul(l.unitPrice).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const discountAmount = clampDecimal(l.discountAmount ?? new Prisma.Decimal(0), new Prisma.Decimal(0), lineTotal).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        const netTotal = lineTotal.sub(discountAmount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        grossSubtotal = grossSubtotal.add(lineTotal);
        lineDiscountTotal = lineDiscountTotal.add(discountAmount);
        normalizedLines.push({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice, lineTotal, discountAmount, netTotal });
      }

      const invoiceDiscountAmount =
        body.invoiceDiscountAmount !== undefined ? toDecimalOrZero(body.invoiceDiscountAmount) : (invoice.invoiceDiscountAmount ?? new Prisma.Decimal(0));

      const netSubtotal = grossSubtotal.sub(lineDiscountTotal);
      const normalizedInvoiceDiscount = clampDecimal(invoiceDiscountAmount, new Prisma.Decimal(0), netSubtotal).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const discountedSubtotal = netSubtotal.sub(normalizedInvoiceDiscount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      const taxEnabled = body.taxEnabled !== undefined ? body.taxEnabled : invoice.taxEnabled;
      const taxRate = body.taxRate !== undefined ? toDecimalOrZero(body.taxRate) : invoice.taxRate;
      const normalizedTaxRate = clampDecimal(taxRate, new Prisma.Decimal(0), new Prisma.Decimal(100)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      const taxTotal = (taxEnabled ? discountedSubtotal.mul(normalizedTaxRate).div(100) : new Prisma.Decimal(0)).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      const total = discountedSubtotal.add(taxTotal).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

      updates.grossSubtotal = grossSubtotal.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      updates.invoiceDiscountAmount = normalizedInvoiceDiscount;
      updates.discountTotal = lineDiscountTotal.add(normalizedInvoiceDiscount).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
      updates.taxEnabled = taxEnabled;
      updates.taxRate = normalizedTaxRate;
      updates.taxTotal = taxTotal;
      updates.roundingAdjustment = new Prisma.Decimal(0);
      updates.subtotal = total;

      if (nextLines) {
        calcLines = normalizedLines;
      }
    }

    await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      await tx.shopInvoice.update({ where: { id }, data: updates });
      if (nextLines) {
        await tx.shopInvoiceLine.deleteMany({ where: { tenantId, invoiceId: id } });
        if (calcLines && calcLines.length) {
          await tx.shopInvoiceLine.createMany({
            data: (calcLines as { productId: string; quantity: Decimal; unitPrice: Decimal; lineTotal: Decimal; discountAmount: Decimal; netTotal: Decimal }[]).map((l) => ({
              tenantId,
              invoiceId: id,
              productId: l.productId,
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              lineTotal: l.lineTotal,
              discountAmount: l.discountAmount,
              netTotal: l.netTotal
            }))
          });
        }
      }
      await tx.auditLog.create({
        data: { tenantId, actorUserId: req.user.id, action: "pharmacy.invoice.update", entityType: "shopInvoice", entityId: id, metadataJson: {} }
      });
    });

    return { data: { success: true } };
  }

  @Post("invoices/:id/post")
  @RequirePermissions("shop.invoices.post")
  async postInvoice(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string) {
    const tenantId = req.tenantId;

    const invoice = await this.prisma.shopInvoice.findFirst({
      where: { tenantId, id, moduleId: "pharmacy" },
      select: { id: true, kind: true, status: true, locationId: true, refundOfId: true, restockOnRefund: true }
    });
    if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
    if (invoice.status !== "draft") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    if (!invoice.locationId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const lines = await this.prisma.shopInvoiceLine.findMany({
      where: { tenantId, invoiceId: id },
      select: { id: true, productId: true, quantity: true }
    });
    if (lines.length === 0) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    let original: { id: string; kind: "sale" | "refund"; status: "draft" | "posted" | "void"; locationId: string | null; lines: { productId: string; quantity: Decimal }[] } | null = null;

    if (invoice.kind === "sale") {
      const stock = await this.prisma.shopStockItem.findMany({
        where: { tenantId, locationId: invoice.locationId, productId: { in: lines.map((l) => l.productId) } },
        select: { productId: true, onHandQty: true, id: true }
      });
      const stockMap = new Map(stock.map((s) => [s.productId, s]));
      for (const l of lines) {
        const s = stockMap.get(l.productId);
        const before = s?.onHandQty ?? new Prisma.Decimal(0);
        const after = before.sub(l.quantity);
        if (after.lt(0)) {
          throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.stockInsufficient" } }, 400);
        }
      }
    } else if (invoice.kind === "refund") {
      if (!invoice.refundOfId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      original = await this.prisma.shopInvoice.findFirst({
        where: { tenantId, id: invoice.refundOfId, moduleId: "pharmacy" },
        select: { id: true, kind: true, status: true, locationId: true, lines: { select: { productId: true, quantity: true } } }
      });
      if (!original) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (original.kind !== "sale" || original.status !== "posted") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      if (!original.locationId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      if (original.locationId !== invoice.locationId) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
      if (original.lines.length === 0) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

      const refunded = await this.prisma.shopInvoiceLine.groupBy({
        by: ["productId"],
        where: { tenantId, invoice: { is: { refundOfId: original.id, kind: "refund", status: "posted", moduleId: "pharmacy" } } },
        _sum: { quantity: true }
      });
      const refundedMap = new Map(refunded.map((r) => [r.productId, r._sum.quantity ?? new Prisma.Decimal(0)]));
      const originalMap = new Map(original.lines.map((l) => [l.productId, l.quantity]));

      for (const l of lines) {
        const originalQty = originalMap.get(l.productId) ?? null;
        if (!originalQty) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        const alreadyRefunded = refundedMap.get(l.productId) ?? new Prisma.Decimal(0);
        const available = originalQty.sub(alreadyRefunded);
        if (l.quantity.lte(0) || l.quantity.gt(available)) {
          throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
        }
      }
    } else {
      throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);
    }

    await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      const settings = await tx.shopSettings.upsert({
        where: { tenantId },
        update: {},
        create: { tenantId, buyCurrencyCode: "USD", sellCurrencyCode: "USD" },
        select: { nextInvoiceNumber: true, nextRefundNumber: true }
      });
      const invoiceNumber = invoice.kind === "refund" ? formatRefundNumber(settings.nextRefundNumber) : formatInvoiceNumber(settings.nextInvoiceNumber);

      await tx.shopSettings.update({
        where: { tenantId },
        data: invoice.kind === "refund" ? { nextRefundNumber: settings.nextRefundNumber + 1 } : { nextInvoiceNumber: settings.nextInvoiceNumber + 1 }
      });
      await tx.shopInvoice.update({ where: { id }, data: { status: "posted", invoiceNumber, postedAt: new Date() } });

      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: invoice.kind === "refund" ? "pharmacy.invoice.refund.post" : "pharmacy.invoice.post",
          entityType: "shopInvoice",
          entityId: id,
          metadataJson: { invoiceNumber, restockOnRefund: invoice.kind === "refund" ? invoice.restockOnRefund : null }
        }
      });

      if (invoice.kind === "refund" && invoice.restockOnRefund === false) return;

      const stockRows = await tx.shopStockItem.findMany({
        where: { tenantId, locationId: invoice.locationId!, productId: { in: lines.map((l) => l.productId) } },
        select: { id: true, productId: true, onHandQty: true }
      });
      const map2 = new Map(stockRows.map((s) => [s.productId, s]));

      const productIds = Array.from(new Set(lines.map((l) => l.productId)));
      const profiles = await tx.shopProductPharmacyProfile.findMany({
        where: { tenantId, productId: { in: productIds } },
        select: { productId: true, trackLots: true }
      });
      const trackLotsByProduct = new Map(productIds.map((pid) => [pid, true]));
      for (const p of profiles) trackLotsByProduct.set(p.productId, p.trackLots);

      const originalAllocRows =
        invoice.kind === "refund" && invoice.refundOfId
          ? await tx.shopInvoiceLotAllocation.findMany({
              where: { tenantId, invoiceId: invoice.refundOfId, line: { is: { productId: { in: productIds } } } },
              select: { lotId: true, quantity: true, line: { select: { productId: true } }, lot: { select: { id: true, expiryDate: true, createdAt: true } } }
            })
          : [];

      const previousRefundInvoiceIds =
        invoice.kind === "refund" && invoice.refundOfId
          ? (
              await tx.shopInvoice.findMany({
                where: { tenantId, moduleId: "pharmacy", refundOfId: invoice.refundOfId, kind: "refund", status: "posted", id: { not: id } },
                select: { id: true }
              })
            ).map((r) => r.id)
          : [];

      const refundedAllocRows =
        invoice.kind === "refund" && previousRefundInvoiceIds.length
          ? await tx.shopInvoiceLotAllocation.findMany({
              where: { tenantId, invoiceId: { in: previousRefundInvoiceIds }, line: { is: { productId: { in: productIds } } } },
              select: { lotId: true, quantity: true, line: { select: { productId: true } } }
            })
          : [];

      const originalLotTotalsByProduct = new Map<string, Map<string, { expiryDate: Date | null; createdAt: Date; quantity: Decimal }>>();
      for (const row of originalAllocRows) {
        const pid = row.line.productId;
        const map = originalLotTotalsByProduct.get(pid) ?? new Map<string, { expiryDate: Date | null; createdAt: Date; quantity: Decimal }>();
        const existing = map.get(row.lotId);
        if (existing) {
          existing.quantity = existing.quantity.add(row.quantity);
        } else {
          map.set(row.lotId, { expiryDate: row.lot.expiryDate, createdAt: row.lot.createdAt, quantity: row.quantity });
        }
        originalLotTotalsByProduct.set(pid, map);
      }

      const alreadyRefundedByProductLot = new Map<string, Map<string, Decimal>>();
      for (const row of refundedAllocRows) {
        const pid = row.line.productId;
        const map = alreadyRefundedByProductLot.get(pid) ?? new Map<string, Decimal>();
        map.set(row.lotId, (map.get(row.lotId) ?? new Prisma.Decimal(0)).add(row.quantity));
        alreadyRefundedByProductLot.set(pid, map);
      }

      const availablePerProductLot = new Map<string, Map<string, Decimal>>();
      const orderedOriginalLots = new Map<string, Array<{ lotId: string; expiryDate: Date | null; createdAt: Date }>>();
      for (const [pid, lotsMap] of originalLotTotalsByProduct.entries()) {
        const refundedMap = alreadyRefundedByProductLot.get(pid) ?? new Map<string, Decimal>();
        const availMap = new Map<string, Decimal>();
        const ordered: Array<{ lotId: string; expiryDate: Date | null; createdAt: Date }> = [];
        for (const [lotId, info] of lotsMap.entries()) {
          const refundedQty = refundedMap.get(lotId) ?? new Prisma.Decimal(0);
          const remaining = info.quantity.sub(refundedQty);
          if (remaining.gt(0)) {
            availMap.set(lotId, remaining);
            ordered.push({ lotId, expiryDate: info.expiryDate, createdAt: info.createdAt });
          }
        }
        ordered.sort((a, b) => {
          if (!a.expiryDate && !b.expiryDate) return a.createdAt.getTime() - b.createdAt.getTime();
          if (!a.expiryDate) return 1;
          if (!b.expiryDate) return -1;
          const d = a.expiryDate.getTime() - b.expiryDate.getTime();
          if (d !== 0) return d;
          return a.createdAt.getTime() - b.createdAt.getTime();
        });
        availablePerProductLot.set(pid, availMap);
        orderedOriginalLots.set(pid, ordered);
      }

      for (const l of lines) {
        const s = map2.get(l.productId);
        const before = s?.onHandQty ?? new Prisma.Decimal(0);
        const after = invoice.kind === "refund" ? before.add(l.quantity) : before.sub(l.quantity);
        if (after.lt(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.stockInsufficient" } }, 400);

        const trackLots = trackLotsByProduct.get(l.productId) ?? true;
        if (invoice.kind === "sale" && trackLots) {
          const now = new Date();
          const lots = await tx.shopStockLot.findMany({
            where: { tenantId, locationId: invoice.locationId!, productId: l.productId, onHandQty: { gt: 0 }, OR: [{ expiryDate: null }, { expiryDate: { gte: now } }] },
            select: { id: true, onHandQty: true, expiryDate: true, createdAt: true },
            orderBy: [{ expiryDate: "asc" }, { createdAt: "asc" }]
          });
          lots.sort((a, b) => {
            if (!a.expiryDate && !b.expiryDate) return a.createdAt.getTime() - b.createdAt.getTime();
            if (!a.expiryDate) return 1;
            if (!b.expiryDate) return -1;
            const d = a.expiryDate.getTime() - b.expiryDate.getTime();
            if (d !== 0) return d;
            return a.createdAt.getTime() - b.createdAt.getTime();
          });
          let remaining = l.quantity;
          for (const lot of lots) {
            if (remaining.lte(0)) break;
            const take = lot.onHandQty.lt(remaining) ? lot.onHandQty : remaining;
            if (take.lte(0)) continue;
            await tx.shopStockLot.update({ where: { id: lot.id }, data: { onHandQty: lot.onHandQty.sub(take) } });
            await tx.shopInvoiceLotAllocation.create({ data: { tenantId, invoiceId: id, invoiceLineId: l.id, lotId: lot.id, quantity: take } });
            remaining = remaining.sub(take);
          }
          if (remaining.gt(0) && lots.length) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.stockInsufficient" } }, 400);
        } else if (invoice.kind === "refund" && trackLots) {
          let remaining = l.quantity;
          const availLots = availablePerProductLot.get(l.productId) ?? new Map<string, Decimal>();
          const ordered = orderedOriginalLots.get(l.productId) ?? [];
          for (const lotRef of ordered) {
            if (remaining.lte(0)) break;
            const avail = availLots.get(lotRef.lotId) ?? new Prisma.Decimal(0);
            if (avail.lte(0)) continue;
            const take = avail.lt(remaining) ? avail : remaining;
            if (take.lte(0)) continue;
            await tx.shopStockLot.update({ where: { id: lotRef.lotId }, data: { onHandQty: { increment: take } } });
            await tx.shopInvoiceLotAllocation.create({ data: { tenantId, invoiceId: id, invoiceLineId: l.id, lotId: lotRef.lotId, quantity: take } });
            availLots.set(lotRef.lotId, avail.sub(take));
            remaining = remaining.sub(take);
          }
          if (remaining.gt(0)) {
            const expiryDate = new Date("9999-12-31T00:00:00.000Z");
            const returnLot = await tx.shopStockLot.upsert({
              where: { tenantId_productId_locationId_lotNumber_expiryDate: { tenantId, productId: l.productId, locationId: invoice.locationId!, lotNumber: "RETURN", expiryDate } },
              update: { onHandQty: { increment: remaining } },
              create: { tenantId, productId: l.productId, locationId: invoice.locationId!, lotNumber: "RETURN", expiryDate, onHandQty: remaining },
              select: { id: true }
            });
            await tx.shopInvoiceLotAllocation.create({ data: { tenantId, invoiceId: id, invoiceLineId: l.id, lotId: returnLot.id, quantity: remaining } });
          }
        }

        if (!s) {
          await tx.shopStockItem.create({ data: { tenantId, productId: l.productId, locationId: invoice.locationId!, onHandQty: after } });
        } else {
          await tx.shopStockItem.update({ where: { id: s.id }, data: { onHandQty: after } });
        }
        await tx.shopStockMovement.create({
          data: {
            tenantId,
            type: invoice.kind === "refund" ? "sale_refund" : "sale",
            productId: l.productId,
            locationId: invoice.locationId!,
            deltaQty: invoice.kind === "refund" ? l.quantity : l.quantity.negated(),
            beforeQty: before,
            afterQty: after,
            note: invoiceNumber,
            actorUserId: req.user.id
          }
        });
      }
    });

    return { data: { success: true } };
  }

  @Post("invoices/:id/payments")
  @RequirePermissions("shop.invoices.update")
  async addInvoicePayment(@Req() req: { tenantId: string; user: { id: string } }, @Param("id") id: string, @Body() body: CreateInvoicePaymentDto) {
    const tenantId = req.tenantId;
    const method = body.method.trim();
    const amount = toDecimal(body.amount);
    if (!method || amount.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

    const note = body.note?.trim() || null;

    await this.prisma.$transaction(async (tx: PrismaTypes.TransactionClient) => {
      const invoice = await tx.shopInvoice.findFirst({
        where: { tenantId, id, moduleId: "pharmacy" },
        select: { id: true, kind: true, status: true, locationId: true, subtotal: true, paidTotal: true, roundingAdjustment: true }
      });
      if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);
      if (invoice.status !== "posted") throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.validationError" } }, 400);

      const [settings, methodRow] = await Promise.all([
        tx.shopSettings.findFirst({ where: { tenantId }, select: { cashRoundingIncrement: true } }),
        tx.shopPaymentMethod.findFirst({ where: { tenantId, moduleId: "pharmacy", name: method }, select: { kind: true } })
      ]);

      const roundingIncrement = settings?.cashRoundingIncrement ?? new Prisma.Decimal(0);
      const methodKind = methodRow?.kind ?? null;
      const cashSession =
        methodKind === "cash" && invoice.locationId
          ? await tx.shopCashSession.findFirst({
              where: { tenantId, moduleId: "pharmacy", locationId: invoice.locationId, status: "open" },
              select: { id: true },
              orderBy: [{ openedAt: "desc" }, { id: "desc" }]
            })
          : null;
      const cashSessionId = cashSession?.id ?? null;
      let roundingApplied = false;
      let roundingAdjustment = new Prisma.Decimal(0);
      let nextSubtotal = invoice.subtotal;

      if (methodKind === "cash" && roundingIncrement.gt(0) && invoice.roundingAdjustment.eq(0) && invoice.paidTotal.eq(0)) {
        const rounded = roundToIncrement(invoice.subtotal, roundingIncrement);
        roundingAdjustment = rounded.sub(invoice.subtotal).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
        if (!roundingAdjustment.eq(0)) {
          nextSubtotal = rounded;
          roundingApplied = true;
          await tx.shopInvoice.update({ where: { id }, data: { subtotal: nextSubtotal, roundingAdjustment } });
        }
      }

      const balance = nextSubtotal.sub(invoice.paidTotal);
      if (balance.lte(0)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.invoiceFullyPaid" } }, 400);
      if (amount.gt(balance)) throw new HttpException({ error: { code: "VALIDATION_ERROR", message_key: "errors.paymentExceedsBalance" } }, 400);

      await tx.shopInvoicePayment.create({
        data: { tenantId, invoiceId: id, cashSessionId, direction: invoice.kind === "refund" ? "out" : "in", method, amount, note, actorUserId: req.user.id }
      });
      const paidTotal = invoice.paidTotal.add(amount);
      await tx.shopInvoice.update({ where: { id }, data: { paidTotal } });
      await tx.auditLog.create({
        data: {
          tenantId,
          actorUserId: req.user.id,
          action: invoice.kind === "refund" ? "pharmacy.invoice.refund.payment.create" : "pharmacy.invoice.payment.create",
          entityType: "shopInvoice",
          entityId: id,
          metadataJson: {
            amount: amount.toString(),
            method,
            roundingApplied,
            roundingAdjustment: roundingApplied ? roundingAdjustment.toString() : null
          }
        }
      });
    });

    return { data: { success: true } };
  }

  @Get("invoices")
  @RequirePermissions("shop.invoices.read")
  async listInvoices(@Req() req: { tenantId: string }, @Query() query: ListInvoicesQueryDto) {
    const page = toInt(query.page, 1);
    const pageSize = Math.min(50, toInt(query.pageSize, 20));
    const skip = (page - 1) * pageSize;

    const q = query.q?.trim() || null;
    const status = query.status === "draft" || query.status === "posted" || query.status === "void" ? query.status : "all";

    const where: Record<string, unknown> = { tenantId: req.tenantId, moduleId: "pharmacy" };
    if (status !== "all") where.status = status;
    if (q) {
      where.OR = [
        { invoiceNumber: { contains: q, mode: "insensitive" } },
        { customer: { is: { name: { contains: q, mode: "insensitive" } } } }
      ];
    }

    const [total, items] = await Promise.all([
      this.prisma.shopInvoice.count({ where }),
      this.prisma.shopInvoice.findMany({
        where,
        select: {
          id: true,
          kind: true,
          status: true,
          invoiceNumber: true,
          currencyCode: true,
          subtotal: true,
          createdAt: true,
          postedAt: true,
          customer: { select: { id: true, name: true } },
          location: { select: { id: true, name: true } },
          refundOf: { select: { id: true, invoiceNumber: true } }
        },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        skip,
        take: pageSize
      })
    ]);

    return {
      data: {
        items: items.map((i) => ({
          id: i.id,
          kind: i.kind,
          status: i.status,
          invoiceNumber: i.invoiceNumber,
          currencyCode: i.currencyCode,
          subtotal: i.subtotal.toString(),
          createdAt: i.createdAt,
          postedAt: i.postedAt,
          customer: i.customer ? { id: i.customer.id, name: i.customer.name } : null,
          location: i.location ? { id: i.location.id, name: i.location.name } : null,
          refundOf: i.refundOf ? { id: i.refundOf.id, invoiceNumber: i.refundOf.invoiceNumber } : null
        })),
        page,
        pageSize,
        total
      }
    };
  }

  @Get("invoices/:id")
  @RequirePermissions("shop.invoices.read")
  async getInvoice(@Req() req: { tenantId: string }, @Param("id") id: string) {
    const invoice = await this.prisma.shopInvoice.findFirst({
      where: { tenantId: req.tenantId, id, moduleId: "pharmacy" },
      select: {
        id: true,
        kind: true,
        status: true,
        invoiceNumber: true,
        refundOf: { select: { id: true, invoiceNumber: true } },
        restockOnRefund: true,
        currencyCode: true,
        notes: true,
        grossSubtotal: true,
        invoiceDiscountAmount: true,
        discountTotal: true,
        taxEnabled: true,
        taxRate: true,
        taxTotal: true,
        roundingAdjustment: true,
        subtotal: true,
        paidTotal: true,
        createdAt: true,
        postedAt: true,
        customer: { select: { id: true, name: true } },
        location: { select: { id: true, name: true } },
        payments: {
          select: { id: true, direction: true, method: true, amount: true, note: true, createdAt: true, actor: { select: { id: true, fullName: true } } },
          orderBy: { createdAt: "desc" }
        },
        lines: {
          select: {
            id: true,
            quantity: true,
            unitPrice: true,
            lineTotal: true,
            discountAmount: true,
            netTotal: true,
            product: { select: { id: true, name: true, sku: true, unit: { select: { id: true, name: true, symbol: true } } } }
          },
          orderBy: { createdAt: "asc" }
        }
      }
    });
    if (!invoice) throw new HttpException({ error: { code: "NOT_FOUND", message_key: "errors.notFound" } }, 404);

    let refundable: { productId: string; quantity: string }[] = [];
    if (invoice.kind === "sale" && invoice.status === "posted") {
      const refunded = await this.prisma.shopInvoiceLine.groupBy({
        by: ["productId"],
        where: { tenantId: req.tenantId, invoice: { is: { refundOfId: invoice.id, kind: "refund", status: "posted", moduleId: "pharmacy" } } },
        _sum: { quantity: true }
      });
      const refundedMap = new Map(refunded.map((r) => [r.productId, r._sum.quantity ?? new Prisma.Decimal(0)]));
      refundable = invoice.lines
        .map((l) => {
          const refundedQty = refundedMap.get(l.product.id) ?? new Prisma.Decimal(0);
          const available = l.quantity.sub(refundedQty);
          return { productId: l.product.id, quantity: available.gt(0) ? available.toString() : "0" };
        })
        .filter((r) => new Prisma.Decimal(r.quantity).gt(0));
    }

    return {
      data: {
        id: invoice.id,
        kind: invoice.kind,
        status: invoice.status,
        invoiceNumber: invoice.invoiceNumber,
        refundOf: invoice.refundOf ? { id: invoice.refundOf.id, invoiceNumber: invoice.refundOf.invoiceNumber } : null,
        restockOnRefund: invoice.restockOnRefund,
        currencyCode: invoice.currencyCode,
        notes: invoice.notes,
        grossSubtotal: invoice.grossSubtotal.toString(),
        invoiceDiscountAmount: invoice.invoiceDiscountAmount.toString(),
        discountTotal: invoice.discountTotal.toString(),
        taxEnabled: invoice.taxEnabled,
        taxRate: invoice.taxRate.toString(),
        taxTotal: invoice.taxTotal.toString(),
        roundingAdjustment: invoice.roundingAdjustment.toString(),
        subtotal: invoice.subtotal.toString(),
        paidTotal: invoice.paidTotal.toString(),
        createdAt: invoice.createdAt,
        postedAt: invoice.postedAt,
        customer: invoice.customer ? { id: invoice.customer.id, name: invoice.customer.name } : null,
        location: invoice.location ? { id: invoice.location.id, name: invoice.location.name } : null,
        payments: invoice.payments.map((p) => ({
          id: p.id,
          direction: p.direction,
          method: p.method,
          amount: p.amount.toString(),
          note: p.note,
          createdAt: p.createdAt,
          actor: p.actor ? { id: p.actor.id, fullName: p.actor.fullName } : null
        })),
        lines: invoice.lines.map((l) => ({
          id: l.id,
          product: { id: l.product.id, name: l.product.name, sku: l.product.sku, unit: l.product.unit ? { id: l.product.unit.id, name: l.product.unit.name, symbol: l.product.unit.symbol } : null },
          quantity: l.quantity.toString(),
          unitPrice: l.unitPrice.toString(),
          lineTotal: l.lineTotal.toString(),
          discountAmount: l.discountAmount.toString(),
          netTotal: l.netTotal.toString()
        })),
        refundable
      }
    };
  }
}
