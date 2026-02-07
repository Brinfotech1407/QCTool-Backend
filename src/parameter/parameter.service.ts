import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateParameterDto } from './dto/create-parameter.dto';

@Injectable()
export class ParameterService {
  constructor(private prisma: PrismaService) {}

  async create(dto: CreateParameterDto) {
    const parameter = await this.prisma.testParameter.create({
      data: {
        name: dto.name,
        testId: dto.testId,
        unit: dto.unit,
      },
    });

    if (
      dto.minValue !== undefined ||
      dto.maxValue !== undefined ||
      dto.exactValue !== undefined
    ) {
      await this.prisma.acceptanceCriteria.create({
        data: {
          parameterId: parameter.id,
          minValue: dto.minValue,
          maxValue: dto.maxValue,
          exactValue: dto.exactValue,
        },
      });
    }

    return parameter;
  }

  findByTest(testId: string) {
    return this.prisma.testParameter.findMany({
      where: { testId },
      include: {
        defaultCriteria: true,
      },
    });
  }
}
