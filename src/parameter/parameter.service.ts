import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateParameterDto } from './dto/create-parameter.dto';

@Injectable()
export class ParameterService {
  constructor(private prisma: PrismaService) { }

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
        ruleDefinition: true
      },
    });
  }

  update(id: string, dto: CreateParameterDto) {
  return this.prisma.testParameter.update({
    where: { id },
    data: {
      name: dto.name,
      unit: dto.unit,
      test: {
        connect: { id: dto.testId },
      },
      defaultCriteria: {
        upsert: {
          update: {
            minValue: dto.minValue,
            maxValue: dto.maxValue,
            exactValue: dto.exactValue,
          },
          create: {
            minValue: dto.minValue,
            maxValue: dto.maxValue,
            exactValue: dto.exactValue,
          },
        },
      },
    },
  });
}


  remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      await tx.qCTestResult.deleteMany({
        where: { ruleId: id },
      });

      await tx.companyParameterOverride.deleteMany({
        where: { parameterId: id },
      });

      await tx.ruleDefinition.deleteMany({
        where: { parameterId: id },
      });

      await tx.acceptanceCriteria.deleteMany({
        where: { parameterId: id },
      });

      try {
        return await tx.testParameter.delete({
          where: { id },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          throw new NotFoundException('Parameter not found');
        }

        throw error;
      }
    });
  }
}
