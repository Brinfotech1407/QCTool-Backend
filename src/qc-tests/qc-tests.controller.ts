import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateQCTestDto } from './dto/create-qc-test.dto';
import { QcTestsService } from './qc-tests.service';

type JwtRequest = {
  user: {
    sub: string;
    role: UserRole;
    companyId: string | null;
  };
};

@Controller('qc-tests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QcTestsController {
  constructor(private readonly qcTestsService: QcTestsService) {}

  @Roles(UserRole.QC_USER)
  @Post()
  create(@Req() req: JwtRequest, @Body() dto: CreateQCTestDto) {
    return this.qcTestsService.create(req.user, dto);
  }

  @Roles(UserRole.PLATFORM_ADMIN, UserRole.COMPANY_ADMIN, UserRole.QC_USER)
  @Get(':batchId')
  getBatchQc(@Req() req: JwtRequest, @Param('batchId') batchId: string) {
    return this.qcTestsService.getBatchQc(req.user, batchId);
  }
}
