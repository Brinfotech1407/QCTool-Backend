import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { BatchTestsService } from './batch-tests.service';

type JwtRequest = {
  user: {
    sub: string;
    role: UserRole;
    companyId: string | null;
  };
};

@Controller('batch-tests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class BatchTestsController {
  constructor(private readonly batchTestsService: BatchTestsService) {}

  @Roles(UserRole.PLATFORM_ADMIN, UserRole.COMPANY_ADMIN, UserRole.QC_USER)
  @Get()
  findByBatch(@Req() req: JwtRequest, @Query('batchId') batchId: string) {
    return this.batchTestsService.findByBatch(req.user, batchId);
  }
}
