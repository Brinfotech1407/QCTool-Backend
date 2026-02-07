import { Module } from '@nestjs/common';
import { TestCategoryController } from './test-category.controller';
import { TestCategoryService } from './test-category.service';

@Module({
  controllers: [TestCategoryController],
  providers: [TestCategoryService]
})
export class TestCategoryModule {}
