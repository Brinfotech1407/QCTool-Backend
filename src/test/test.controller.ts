import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { TestService } from './test.service';
import { CreateTestDto } from './dto/create-test.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('tests')
export class TestController {
  constructor(private service: TestService) {}

  @Roles(UserRole.PLATFORM_ADMIN)
  @Post()
  create(@Body() dto: CreateTestDto) {
    return this.service.create(dto);
  }

  @Get()
  findByCategory(@Query('categoryId') categoryId: string) {
    return this.service.findByCategory(categoryId);
  }
}
