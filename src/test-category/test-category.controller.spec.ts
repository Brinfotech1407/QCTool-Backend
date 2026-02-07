import { Test, TestingModule } from '@nestjs/testing';
import { TestCategoryController } from './test-category.controller';

describe('TestCategoryController', () => {
  let controller: TestCategoryController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [TestCategoryController],
    }).compile();

    controller = module.get<TestCategoryController>(TestCategoryController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
