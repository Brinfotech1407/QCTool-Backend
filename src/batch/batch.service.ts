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
    findUnique: (args: unknown) => Promise<any>;
    findMany: (args: unknown) => Promise<unknown[]>;
    count: (args: unknown) => Promise<number>;
    delete: (args: unknown) => Promise<unknown>;
  };
  hitEntry: {
    findFirst: (args: unknown) => Promise<any>;
    update: (args: unknown) => Promise<unknown>;
    updateMany: (args: unknown) => Promise<{ count: number }>;
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

    const existing = await this.batch.findUnique({
      where: { batchNumber: dto.batchNumber },
    });

    if (existing) {
      throw new BadRequestException('Batch already exists');
    }

    const totalItemsQty = dto.customers
      .flatMap((customer) => customer.items)
      .reduce((sum, item) => sum + item.qty, 0);

    if (Math.abs(totalItemsQty - dto.totalQty) > 0.0001) {
      throw new BadRequestException('Total quantity mismatch');
    }

    for (const customer of dto.customers) {
      if (!customer.items || customer.items.length === 0) {
        throw new BadRequestException(`Customer ${customer.name} has no items`);
      }
    }

    if (dto.selectedHits?.length) {
      const uniqueHits = new Set(dto.selectedHits.map((hit) => hit.hitId));
      if (uniqueHits.size !== dto.selectedHits.length) {
        throw new BadRequestException('Duplicate HIT selected');
      }

      const selectedHitTotal = dto.selectedHits.reduce(
        (sum, hit) => sum + hit.usedQty,
        0,
      );

      if (Math.abs(selectedHitTotal - dto.totalQty) > 0.0001) {
        throw new BadRequestException('Selected HIT total quantity mismatch');
      }
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const transaction = tx as unknown as BatchTransaction;

        const batch = await transaction.batch.create({
          data: {
            batchNumber: dto.batchNumber,
            grade: dto.grade,
            totalQty: dto.totalQty,
            gradeId: dto.grade,
            requiredQuantity: dto.totalQty,
            companyId: user.companyId!,
            createdById: user.sub,
            customers: {
              create: dto.customers.map((customer) => ({
                name: customer.name,
                items: {
                  create: customer.items.map((item) => ({
                    od: item.od,
                    wt: item.wt,
                    qty: item.qty,
                    condition: item.condition,
                    length: item.length,
                  })),
                },
              })),
            },
          },
          include: {
            customers: {
              include: {
                items: true,
              },
            },
            batchHits: {
              include: {
                hit: true,
              },
            },
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

        for (const selectedHit of dto.selectedHits ?? []) {
          const hit = await transaction.hitEntry.findFirst({
            where: {
              id: selectedHit.hitId,
              companyId: user.companyId!,
              isDeleted: false,
            },
          });

          if (!hit) {
            throw new NotFoundException(`HIT not found: ${selectedHit.hitId}`);
          }

          if (hit.gradeId !== dto.grade) {
            throw new BadRequestException(
              'All selected HITs must match batch grade',
            );
          }

          if (selectedHit.usedQty > hit.availableWeight) {
            throw new BadRequestException(
              `Insufficient stock for HIT: ${selectedHit.hitId}`,
            );
          }

          await transaction.batchHit.create({
            data: {
              batchId: (batch as { id: string }).id,
              hitId: selectedHit.hitId,
              usedQty: selectedHit.usedQty,
            },
          });

          const updated = await transaction.hitEntry.updateMany({
            where: {
              id: selectedHit.hitId,
              companyId: user.companyId!,
              availableWeight: {
                gte: selectedHit.usedQty,
              },
            },
            data: {
              availableWeight: {
                decrement: selectedHit.usedQty,
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
        throw new BadRequestException('Batch already exists');
      }

      throw error;
    }
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
          customers: {
            include: {
              items: true,
            },
          },
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
        customers: {
          include: {
            items: true,
          },
        },
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
