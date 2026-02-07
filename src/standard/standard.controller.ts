import { Body, Controller, Get, Post } from '@nestjs/common';
import { StandardService } from './standard.service';
import { CreateStandardDto } from './dto/create-standard.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('standards')
export class StandardController {
  constructor(private service: StandardService) {}

  @Roles(UserRole.PLATFORM_ADMIN)
  @Post()
  create(@Body() dto: CreateStandardDto) {
    return this.service.create(dto);
  }

  @Get()
  findAll() {
    return this.service.findAll();
  }
}
