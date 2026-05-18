import { IsEmail, IsIn, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from "class-validator";
import { Type } from "class-transformer";

class RegisterAccountDto {
  @IsString()
  @MinLength(2)
  fullName!: string;

  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(8)
  password!: string;
}

class RegisterTenantDto {
  @IsString()
  @MinLength(2)
  legalName!: string;

  @IsString()
  @MinLength(2)
  displayName!: string;

  @IsString()
  @MinLength(3)
  @MaxLength(50)
  @Matches(/^[a-z0-9-]+$/)
  slug!: string;

  @IsString()
  @IsIn(["en", "fa", "ps"])
  defaultLocale!: string;

  @IsOptional()
  @IsString()
  address?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEmail()
  email?: string;
}

export class RegisterDto {
  @ValidateNested()
  @Type(() => RegisterAccountDto)
  account!: RegisterAccountDto;

  @ValidateNested()
  @Type(() => RegisterTenantDto)
  tenant!: RegisterTenantDto;

  @IsOptional()
  @IsString()
  referralCode?: string;
}
