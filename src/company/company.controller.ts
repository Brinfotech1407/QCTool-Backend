import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { CompanyService } from './company.service';
import { CreateCompanyDto } from './dto/create-company.dto';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('companies')
@UseGuards(JwtAuthGuard, RolesGuard)
export class CompanyController {
  constructor(private readonly companyService: CompanyService) {}

  @Roles(UserRole.PLATFORM_ADMIN)
  @Get()
  getAll() {
    return this.companyService.findAll();
  }

  @Roles(UserRole.PLATFORM_ADMIN)
  @Post()
  create(@Body() body: CreateCompanyDto) {
    return this.companyService.create(body);
  }
}
