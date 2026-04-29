import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTestDto } from './dto/create-test.dto';

@Injectable()
export class TestService {
  constructor(private prisma: PrismaService) { }

  create(dto: CreateTestDto) {
    return this.prisma.test.create({
      data: dto,
    });
  }

  findByCategory(categoryId: string) {
    return this.prisma.test.findMany({
      where: { categoryId },
      include: {
        parameters: {
          include: {
            defaultCriteria: true,
             ruleDefinition: true,  
          },
        },
      },
    });
  }

  update(id: string, dto: CreateTestDto) {
    return this.prisma.test.update({
      where: { id },
      data: dto,
    });
  }

  remove(id: string) {
    return this.prisma.$transaction(async (tx) => {
      const test = await tx.test.findUnique({
        where: { id },
        select: {
          id: true,
          parameters: {
            select: {
              id: true,
            },
          },
        },
      });

      if (!test) {
        throw new NotFoundException('Test not found');
      }

      const parameterIds = test.parameters.map((parameter) => parameter.id);

      if (parameterIds.length > 0) {
        await tx.qCTestResult.deleteMany({
          where: {
            ruleId: {
              in: parameterIds,
            },
          },
        });

        await tx.companyParameterOverride.deleteMany({
          where: {
            parameterId: {
              in: parameterIds,
            },
          },
        });

        await tx.ruleDefinition.deleteMany({
          where: {
            parameterId: {
              in: parameterIds,
            },
          },
        });

        await tx.acceptanceCriteria.deleteMany({
          where: {
            parameterId: {
              in: parameterIds,
            },
          },
        });

        await tx.testParameter.deleteMany({
          where: {
            id: {
              in: parameterIds,
            },
          },
        });
      }

      await tx.companyTestConfig.deleteMany({
        where: { testId: id },
      });

      await tx.batchTest.deleteMany({
        where: { testId: id },
      });

      try {
        return await tx.test.delete({
          where: { id },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2025'
        ) {
          throw new NotFoundException('Test not found');
        }

        throw error;
      }
    });
  }
}
