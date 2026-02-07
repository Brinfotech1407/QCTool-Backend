import { Test, TestingModule } from '@nestjs/testing';
import { ParameterController } from './parameter.controller';

describe('ParameterController', () => {
  let controller: ParameterController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ParameterController],
    }).compile();

    controller = module.get<ParameterController>(ParameterController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
