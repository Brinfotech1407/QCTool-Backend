import {
  Body,
  Controller,
  Get,
  Patch,
  Post,
  Query,
  Put,
  Delete,
  Param,
  UseGuards,
} from '@nestjs/common';
import { TestCategoryService } from './test-category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategorySequenceDto } from './dto/update-category-sequence.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';

@Controller('categories')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TestCategoryController {
  constructor(private service: TestCategoryService) { }

  @Roles(UserRole.PLATFORM_ADMIN)
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.service.create(dto);
  }

  @Roles(
    UserRole.PLATFORM_ADMIN,
    UserRole.COMPANY_ADMIN,
    UserRole.QC_USER,
    UserRole.AUDITOR,
  )
  @Get()
  findByStandard(@Query('standardId') standardId: string) {
    return this.service.findByStandard(standardId);
  }

  @Roles(UserRole.PLATFORM_ADMIN, UserRole.COMPANY_ADMIN)
  @Patch(':id')
  updateSequence(
    @Param('id') id: string,
    @Body() dto: UpdateCategorySequenceDto,
  ) {
    return this.service.updateSequence(id, dto.sequence);
  }

  @Roles(UserRole.PLATFORM_ADMIN)
  @Put(':id')
  update(
    @Param('id') id: string,
    @Body() dto: CreateCategoryDto,
  ) {
    return this.service.update(id, dto);
  }

  @Roles(UserRole.PLATFORM_ADMIN)
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }


}
