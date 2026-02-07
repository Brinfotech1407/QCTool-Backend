import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { TestCategoryService } from './test-category.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('categories')
export class TestCategoryController {
  constructor(private service: TestCategoryService) {}

  @Roles(UserRole.PLATFORM_ADMIN)
  @Post()
  create(@Body() dto: CreateCategoryDto) {
    return this.service.create(dto);
  }

  @Get()
  findByStandard(@Query('standardId') standardId: string) {
    return this.service.findByStandard(standardId);
  }
}
