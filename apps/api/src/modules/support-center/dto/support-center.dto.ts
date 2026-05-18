import { IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from "class-validator";

export class CreateSupportTicketDto {
  @IsString()
  @IsIn(["issue_report", "support_request", "feature_suggestion", "billing", "other"])
  type!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(120)
  subject!: string;

  @IsString()
  @MinLength(2)
  @MaxLength(4000)
  description!: string;

  @IsOptional()
  @IsString()
  @IsIn(["low", "normal", "high", "urgent"])
  priority?: string;
}

export class SendSupportMessageDto {
  @IsString()
  @MinLength(1)
  @MaxLength(4000)
  message!: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  attachmentIds?: string[];
}

export class UpdateSupportTicketDto {
  @IsOptional()
  @IsString()
  @IsIn([
    "open",
    "in_progress",
    "waiting_for_client",
    "resolved",
    "closed",
    "under_review",
    "planned",
    "in_development",
    "completed",
    "rejected"
  ])
  status?: string;

  @IsOptional()
  @IsString()
  @IsIn(["low", "normal", "high", "urgent"])
  priority?: string;

  @IsOptional()
  @IsString()
  assignedToUserId?: string | null;
}

