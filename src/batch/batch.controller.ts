import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BatchService } from './batch.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { QueryBatchDto } from './dto/query-batch.dto';

type JwtRequest = {
  user: {
    sub: string;
    role: UserRole;
    companyId: string | null;
  };
};

@Controller('batch')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BatchController {
  constructor(private readonly batchService: BatchService) {}

  @Roles(UserRole.QC_USER)
  @Post()
  create(@Req() req: JwtRequest, @Body() dto: CreateBatchDto) {
    return this.batchService.create(req.user, dto);
  }

  @Roles(UserRole.PLATFORM_ADMIN, UserRole.COMPANY_ADMIN, UserRole.QC_USER)
  @Get()
  findAll(@Req() req: JwtRequest, @Query() query: QueryBatchDto) {
    return this.batchService.findAll(req.user, query);
  }

  @Roles(UserRole.PLATFORM_ADMIN, UserRole.COMPANY_ADMIN, UserRole.QC_USER)
  @Get(':id')
  findOne(@Req() req: JwtRequest, @Param('id') id: string) {
    return this.batchService.findOne(req.user, id);
  }

  @Roles(UserRole.COMPANY_ADMIN, UserRole.QC_USER)
  @Delete(':id')
  remove(@Req() req: JwtRequest, @Param('id') id: string) {
    return this.batchService.deleteBatch(id, req.user);
  }
}
