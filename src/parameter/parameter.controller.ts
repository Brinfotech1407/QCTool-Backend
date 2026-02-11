import { Body, Controller, Get, Post, Query, Put, Delete, Param } from '@nestjs/common';
import { ParameterService } from './parameter.service';
import { CreateParameterDto } from './dto/create-parameter.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('parameters')
export class ParameterController {
  constructor(private service: ParameterService) { }

  @Roles(UserRole.PLATFORM_ADMIN)
  @Post()
  create(@Body() dto: CreateParameterDto) {
    return this.service.create(dto);
  }

  @Get()
  findByTest(@Query('testId') testId: string) {
    return this.service.findByTest(testId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: CreateParameterDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
