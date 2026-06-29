import { Body, Controller, Delete, Get, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { SaveCompanyTcConfigDto } from './dto/save-company-tc-config.dto';
import { CompanyTcConfigService } from './company-tc-config.service';

type JwtRequest = {
  user: {
    sub: string;
    role: UserRole;
    companyId: string | null;
  };
};

@Controller('company-tc-config')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanyTcConfigController {
  constructor(private readonly service: CompanyTcConfigService) {}

  @Roles(UserRole.COMPANY_ADMIN, UserRole.QC_USER)
  @Get()
  findOne(@Req() req: JwtRequest) {
    return this.service.findOne(req.user);
  }

  @Roles(UserRole.COMPANY_ADMIN)
  @Post()
  save(@Req() req: JwtRequest, @Body() dto: SaveCompanyTcConfigDto) {
    return this.service.save(req.user, dto);
  }

  @Roles(UserRole.COMPANY_ADMIN)
  @Delete()
  remove(@Req() req: JwtRequest) {
    return this.service.remove(req.user);
  }
}
