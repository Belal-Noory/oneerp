import { Module } from "@nestjs/common";
import { PrintPressController } from "./printpress.controller";

@Module({
  controllers: [PrintPressController]
})
export class PrintPressModule {}

