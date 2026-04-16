import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CompanyTestConfigService } from './company-test-config.service';
import { SaveCompanyTestConfigDto } from './dto/save-company-test-config.dto';

type JwtRequest = {
  user: {
    sub: string;
    role: UserRole;
    companyId: string | null;
  };
};

@Controller('company-test-config')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.COMPANY_ADMIN)
export class CompanyTestConfigController {
  constructor(private readonly service: CompanyTestConfigService) {}

  @Get()
  findAll(@Req() req: JwtRequest) {
    return this.service.findAll(req.user);
  }

  @Post()
  save(@Req() req: JwtRequest, @Body() dto: SaveCompanyTestConfigDto) {
    return this.service.save(req.user, dto);
  }
}
