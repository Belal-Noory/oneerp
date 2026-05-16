import { IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, MaxLength, Min, MinLength } from "class-validator";

export class UpsertTutorialCategoryDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  slug!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(40)
  icon!: string;

  @IsIn(["general", "module"])
  scope!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  moduleId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(140)
  titleEn!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(140)
  titleFa!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(140)
  titlePs!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderNo?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertTutorialSeriesDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  slug!: string;

  @IsIn(["general", "module"])
  scope!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  moduleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  categoryId?: string;

  @IsString()
  @MinLength(2)
  @MaxLength(140)
  titleEn!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(140)
  titleFa!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(140)
  titlePs!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionFa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  descriptionPs?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  thumbnailUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderNo?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class UpsertTutorialDto {
  @IsString()
  @MinLength(2)
  @MaxLength(120)
  slug!: string;

  @IsIn(["general", "module"])
  scope!: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  moduleId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  seriesId?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  stepNo?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  orderNo?: number;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  titleEn!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  titleFa!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(160)
  titlePs!: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionEn?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionFa?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  descriptionPs?: string;

  @IsString()
  @MinLength(5)
  @MaxLength(500)
  youtubeUrl!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  thumbnailUrl?: string;

  @IsIn(["beginner", "intermediate", "advanced"])
  difficulty!: string;

  @IsIn(["en", "fa", "ps"])
  language!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  durationSec?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tags?: string[];

  @IsIn(["public", "private", "draft"])
  visibility!: string;

  @IsOptional()
  @IsBoolean()
  isFeatured?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  relatedSlugs?: string[];
}
