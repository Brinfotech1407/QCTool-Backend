import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Put,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';
import { ParameterService } from './parameter.service';
import { CreateParameterDto } from './dto/create-parameter.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';

@Controller('parameters')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ParameterController {
  constructor(private service: ParameterService) { }

  @Roles(UserRole.PLATFORM_ADMIN)
  @Post()
  create(@Body() dto: CreateParameterDto) {
    return this.service.create(dto);
  }

  @Roles(
    UserRole.PLATFORM_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.QC_USER,
    UserRole.AUDITOR,
  )
  @Get()
  findByTest(@Query('testId') testId: string) {
    return this.service.findByTest(testId);
  }

  @Roles(UserRole.PLATFORM_ADMIN)
  @Put(':id')
  update(@Param('id') id: string, @Body() dto: CreateParameterDto) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.PLATFORM_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
