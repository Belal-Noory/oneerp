import { Module } from "@nestjs/common";
import { JwtModule } from "@nestjs/jwt";
import type { SignOptions } from "jsonwebtoken";
import { SupportCenterController } from "./support-center.controller";
import { SupportCenterOwnerController } from "./support-center-owner.controller";
import { SupportCenterGateway } from "./support-center.gateway";
import { SupportCenterService } from "./support-center.service";

@Module({
  imports: [
    JwtModule.register({
      secret: process.env.JWT_ACCESS_SECRET ?? "dev-access-secret",
      signOptions: { expiresIn: (process.env.TOKEN_TTL_ACCESS ?? "7d") as unknown as SignOptions["expiresIn"] }
    })
  ],
  controllers: [SupportCenterController, SupportCenterOwnerController],
  providers: [SupportCenterService, SupportCenterGateway],
  exports: [SupportCenterService, SupportCenterGateway]
})
export class SupportCenterModule {}

