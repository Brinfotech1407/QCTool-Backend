import { Test, TestingModule } from '@nestjs/testing';
import { StandardController } from './standard.controller';

describe('StandardController', () => {
  let controller: StandardController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [StandardController],
    }).compile();

    controller = module.get<StandardController>(StandardController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
