import { IsIn, IsInt, IsOptional, IsString, Matches, Max, Min } from "class-validator";

const PRICE_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;

export class ApproveModuleRequestDto {
  @IsString()
  @IsIn(["online_monthly", "offline_no_changes", "offline_with_changes"])
  subscriptionType!: string;

  @IsOptional()
  @IsString()
  @Matches(PRICE_RE)
  priceAmount?: string;

  @IsOptional()
  @IsString()
  priceCurrency?: string;

  @IsOptional()
  @IsString()
  currentPeriodEndAt?: string;

  @IsOptional()
  @IsString()
  paymentNotes?: string;

  @IsOptional()
  @IsString()
  activationNotes?: string;
}

export class RejectModuleRequestDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class UpdateReferralSettingsDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  bundleStepPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  bundleMaxPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  loyaltyExtraPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  invoiceDiscountPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  freeMonthAtReferrals?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  premiumPartnerAtReferrals?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  loyaltyExtraAtReferrals?: number;
}
