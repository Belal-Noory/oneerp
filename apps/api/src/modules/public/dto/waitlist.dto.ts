import { IsEmail, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class WaitlistDto {
  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  company?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  moduleId?: string;

  @IsOptional()
  @IsString()
  @IsIn(["en", "fa", "ps"])
  locale?: string;
}

export class PublicContactDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  fullName!: string;

  @IsOptional()
  @IsString()
  @MinLength(2)
  @MaxLength(160)
  organizationName?: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(30)
  phoneNumber!: string;

  @IsString()
  @IsIn([
    "erpModuleActivation",
    "databaseDevelopment",
    "softwareDevelopment",
    "mobileAppDevelopment",
    "websiteDevelopment",
    "webAppDevelopment",
    "dataAnalysis",
    "dataProcessing",
    "other"
  ])
  serviceType!: string;

  @IsString()
  @MinLength(5)
  @MaxLength(2000)
  message!: string;

  @IsOptional()
  @IsString()
  @IsIn(["en", "fa", "ps"])
  locale?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  website?: string;
}
