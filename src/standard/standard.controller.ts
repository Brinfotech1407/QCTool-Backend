import { Body, Controller, Get, Post,Put, Delete,Param } from '@nestjs/common';
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
  
  @Roles(UserRole.PLATFORM_ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: CreateStandardDto) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.PLATFORM_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
