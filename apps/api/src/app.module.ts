import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { ThrottlerModule } from "@nestjs/throttler";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard } from "@nestjs/throttler";
import { PrismaModule } from "./prisma/prisma.module";
import { PublicModule } from "./modules/public/public.module";
import { AuthModule } from "./modules/auth/auth.module";
import { TenantsModule } from "./modules/tenants/tenants.module";
import { MeModule } from "./modules/me/me.module";
import { FilesModule } from "./modules/files/files.module";
import { ShopModule } from "./modules/shop/shop.module";
import { PharmacyModule } from "./modules/pharmacy/pharmacy.module";
import { OwnerModule } from "./modules/owner/owner.module";
import { OfflineModule } from "./modules/offline/offline.module";
import { FuelModule } from "./modules/fuel/fuel.module";
import { MspModule } from "./modules/msp/msp.module";
import { PrintPressModule } from "./modules/printpress/printpress.module";
import { ReferralsModule } from "./modules/referrals/referrals.module";
import { SupportCenterModule } from "./modules/support-center/support-center.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ThrottlerModule.forRoot([{ ttl: 60, limit: 60 }]),
    PrismaModule,
    PublicModule,
    AuthModule,
    TenantsModule,
    MeModule,
    FilesModule,
    ShopModule,
    PharmacyModule,
    OwnerModule,
    OfflineModule,
    FuelModule,
    MspModule,
    PrintPressModule,
    ReferralsModule,
    SupportCenterModule
  ],
  providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }]
})
export class AppModule {}
