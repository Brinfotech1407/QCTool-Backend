import { Test, TestingModule } from '@nestjs/testing';
import { TestCategoryService } from './test-category.service';

describe('TestCategoryService', () => {
  let service: TestCategoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TestCategoryService],
    }).compile();

    service = module.get<TestCategoryService>(TestCategoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
