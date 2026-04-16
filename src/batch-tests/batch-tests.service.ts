import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

type JwtUser = {
  sub: string;
  role: UserRole;
  companyId: string | null;
};

type BatchTestsPrisma = {
  batchTest: {
    findMany: (args: unknown) => Promise<unknown[]>;
  };
};

@Injectable()
export class BatchTestsService {
  constructor(private readonly prisma: PrismaService) {}

  async findByBatch(user: JwtUser, batchId: string) {
    if (!batchId) {
      return [];
    }

    const companyScope =
      user.role === UserRole.PLATFORM_ADMIN
        ? {}
        : { batch: { companyId: this.getCompanyId(user) } };

    return (this.prisma as unknown as BatchTestsPrisma).batchTest.findMany({
      where: {
        batchId,
        ...companyScope,
      },
      include: {
        test: {
          include: {
            parameters: {
              include: {
                defaultCriteria: true,
                ruleDefinition: true,
              },
            },
          },
        },
      },
      orderBy: {
        sequence: 'asc',
      },
    });
  }

  private getCompanyId(user: JwtUser) {
    if (!user.companyId) {
      throw new ForbiddenException('User is not mapped to a company');
    }

    return user.companyId;
  }
}
