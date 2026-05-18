import { Module } from "@nestjs/common";
import { TenantGuard } from "../../shared/tenant.guard";
import { ReferralsController } from "./referrals.controller";

@Module({
  controllers: [ReferralsController],
  providers: [TenantGuard]
})
export class ReferralsModule {}
