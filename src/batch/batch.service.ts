import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateBatchDto } from './dto/create-batch.dto';
import { QueryBatchDto } from './dto/query-batch.dto';

type JwtUser = {
  sub: string;
  role: UserRole;
  companyId: string | null;
};

type BatchTransaction = {
  batch: {
    create: (args: unknown) => Promise<unknown>;
    findFirst: (args: unknown) => Promise<any>;
    findMany: (args: unknown) => Promise<unknown[]>;
    count: (args: unknown) => Promise<number>;
    delete: (args: unknown) => Promise<unknown>;
  };
  hitEntry: {
    findFirst: (args: unknown) => Promise<any>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
    update: (args: unknown) => Promise<unknown>;
  };
  batchHit: {
    create: (args: unknown) => Promise<unknown>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
  companyTestConfig: {
    findMany: (args: unknown) => Promise<{ testId: string; sequence: number }[]>;
  };
  batchTest: {
    createMany: (args: unknown) => Promise<{ count: number }>;
    deleteMany: (args: unknown) => Promise<unknown>;
  };
};

@Injectable()
export class BatchService {
  constructor(private readonly prisma: PrismaService) {}

  private get batch() {
    return (this.prisma as unknown as BatchTransaction).batch;
  }

  async create(user: JwtUser, dto: CreateBatchDto) {
    this.ensureCompanyScopedUser(user);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        return await this.prisma.$transaction(async (tx) => {
          const transaction = tx as unknown as BatchTransaction;
          if (!dto.hits || dto.hits.length === 0) {
            throw new BadRequestException('At least one HIT is required');
          }

          const uniqueHits = new Set(dto.hits.map(h => h.hitId));
          if (uniqueHits.size !== dto.hits.length) {
            throw new BadRequestException('Duplicate HIT selected');
          }

          // Validate hits
          for (const item of dto.hits) {
            const hit = await transaction.hitEntry.findFirst({
              where: {
                id: item.hitId,
                companyId: user.companyId!,
                isDeleted: false,
              },
            });

            if (!hit) {
              throw new NotFoundException(`HIT not found: ${item.hitId}`);
            }

            if (hit.gradeId !== dto.gradeId) {
              throw new BadRequestException('All selected HITs must match batch grade');
            }

            if (item.usedQty > hit.availableWeight) {
              throw new BadRequestException(`Insufficient stock for HIT: ${item.hitId}`);
            }
          }

          const totalQty = dto.hits.reduce((sum, h) => sum + h.usedQty, 0);

          if (Math.abs(totalQty - dto.requiredQuantity) > 0.0001) { // Floating point comparison
            throw new BadRequestException('Total quantity mismatch');
          }

          const batchNumber = await this.generateBatchNumber(transaction);

          const batch = await transaction.batch.create({
            data: {
              batchNumber,
              gradeId: dto.gradeId,
              condition: dto.condition,
              outwardPartyCode: dto.outwardPartyCode,
              od: dto.od,
              thickness: dto.thickness,
              length: dto.length,
              requiredSize: dto.requiredSize,
              requiredQuantity: dto.requiredQuantity,
              companyId: user.companyId!,
              createdById: user.sub,
            },
          });

          const configs = await transaction.companyTestConfig.findMany({
            where: {
              companyId: user.companyId!,
              isActive: true,
            },
            orderBy: {
              sequence: 'asc',
            },
            select: {
              testId: true,
              sequence: true,
            },
          });

          if (configs.length > 0) {
            await transaction.batchTest.createMany({
              data: configs.map((config) => ({
                batchId: (batch as { id: string }).id,
                testId: config.testId,
                sequence: config.sequence,
              })),
            });
          }

          // Create BatchHits and reduce stock
          for (const item of dto.hits) {
            await transaction.batchHit.create({
              data: {
                batchId: (batch as { id: string }).id,
                hitId: item.hitId,
                usedQty: item.usedQty,
              },
            });

            const updated = await transaction.hitEntry.updateMany({
              where: { 
                id: item.hitId,
                companyId: user.companyId!,
                availableWeight: {
                  gte: item.usedQty,
                },
              },
              data: {
                availableWeight: {
                  decrement: item.usedQty,
                },
              },
            });

            if (updated.count === 0) {
              throw new BadRequestException('Stock already used or insufficient');
            }
          }

          return {
            ...(batch as Record<string, unknown>),
            attachedTestCount: configs.length,
          };
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          continue;
        }

        throw error;
      }
    }

    throw new BadRequestException('Unable to generate a unique batch number');
  }

  async findAll(user: JwtUser, query: QueryBatchDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize && query.pageSize > 0
        ? Math.min(query.pageSize, 100)
        : 20;
    const where = this.buildWhere(user, query);

    const [items, total] = await Promise.all([
      this.batch.findMany({
        where,
        include: {
          batchHits: {
            include: {
              hit: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.batch.count({ where }),
    ]);

    return {
      items,
      page,
      pageSize,
      total,
      totalPages: Math.ceil(total / pageSize),
    };
  }

  async findOne(user: JwtUser, id: string) {
    const batch = await this.batch.findFirst({
      where: {
        id,
        ...this.getCompanyScope(user),
      },
      include: {
        batchHits: {
          include: {
            hit: true,
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    return batch;
  }

  async deleteBatch(id: string, user: JwtUser) {
    this.ensureCompanyScopedUser(user);

    return this.prisma.$transaction(async (tx) => {
      const transaction = tx as unknown as BatchTransaction;

      const batch = await transaction.batch.findFirst({
        where: {
          id,
          companyId: user.companyId!,
        },
        include: {
          batchHits: true,
        },
      });

      if (!batch) {
        throw new NotFoundException('Batch not found');
      }

      for (const batchHit of batch.batchHits ?? []) {
        await transaction.hitEntry.update({
          where: { id: batchHit.hitId },
          data: {
            availableWeight: {
              increment: batchHit.usedQty,
            },
          },
        });
      }

      await transaction.batchTest.deleteMany({
        where: { batchId: id },
      });

      await transaction.batchHit.deleteMany({
        where: { batchId: id },
      });

      await transaction.batch.delete({
        where: { id },
      });

      return { message: 'Batch deleted successfully' };
    });
  }

  private async generateBatchNumber(tx: BatchTransaction) {
    const year = new Date().getUTCFullYear();
    const prefix = `BATCH-${year}-`;
    const latest = await tx.batch.findFirst({
      where: {
        batchNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        batchNumber: 'desc',
      },
      select: {
        batchNumber: true,
      },
    });

    const nextSequence = latest
      ? Number.parseInt(latest.batchNumber.slice(-4), 10) + 1
      : 1;

    return `${prefix}${nextSequence.toString().padStart(4, '0')}`;
  }

  private buildWhere(
    user: JwtUser,
    query: QueryBatchDto,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = {
      ...this.getCompanyScope(user),
    };

    if (query.status) {
      where.status = query.status;
    }

    return where;
  }

  private getCompanyScope(user: JwtUser): Record<string, string> {
    if (user.role === UserRole.PLATFORM_ADMIN) {
      return {};
    }

    this.ensureCompanyScopedUser(user);

    return { companyId: user.companyId! };
  }

  private ensureCompanyScopedUser(user: JwtUser) {
    if (user.role === UserRole.PLATFORM_ADMIN) {
      return;
    }

    if (!user.companyId) {
      throw new ForbiddenException('User is not mapped to a company');
    }
  }
}
