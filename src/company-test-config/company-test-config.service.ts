import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SaveCompanyTestConfigDto } from './dto/save-company-test-config.dto';

type JwtUser = {
  sub: string;
  role: UserRole;
  companyId: string | null;
};

type CompanyTestConfigPrisma = {
  companyTestConfig: {
    findMany: (args: unknown) => Promise<unknown[]>;
    deleteMany: (args: unknown) => Promise<unknown>;
    createMany: (args: unknown) => Promise<unknown>;
  };
  standard: {
    findUnique: (args: unknown) => Promise<unknown>;
  };
  testCategory: {
    findFirst: (args: unknown) => Promise<unknown>;
  };
  test: {
    findMany: (args: unknown) => Promise<{ id: string }[]>;
  };
};

@Injectable()
export class CompanyTestConfigService {
  constructor(private readonly prisma: PrismaService) {}

  private get db() {
    return this.prisma as unknown as CompanyTestConfigPrisma;
  }

  async findAll(user: JwtUser) {
    const companyId = this.getCompanyId(user);

    return this.db.companyTestConfig.findMany({
      where: {
        companyId,
      },
      include: {
        standard: true,
        category: true,
        test: true,
      },
      orderBy: [
        { standardId: 'asc' },
        { categoryId: 'asc' },
        { sequence: 'asc' },
      ],
    });
  }

  async save(user: JwtUser, dto: SaveCompanyTestConfigDto) {
    const companyId = this.getCompanyId(user);
    this.validateSequences(dto);

    await this.validateHierarchy(dto);

    return this.prisma.$transaction(async (tx) => {
      const transaction = tx as unknown as CompanyTestConfigPrisma;

      await transaction.companyTestConfig.deleteMany({
        where: {
          companyId,
          categoryId: dto.categoryId,
        },
      });

      await transaction.companyTestConfig.createMany({
        data: dto.tests.map((test) => ({
          companyId,
          standardId: dto.standardId,
          categoryId: dto.categoryId,
          testId: test.testId,
          sequence: test.sequence,
          isActive: true,
        })),
      });

      return transaction.companyTestConfig.findMany({
        where: {
          companyId,
          categoryId: dto.categoryId,
        },
        include: {
          standard: true,
          category: true,
          test: true,
        },
        orderBy: {
          sequence: 'asc',
        },
      });
    });
  }

  private getCompanyId(user: JwtUser) {
    if (user.role !== UserRole.COMPANY_ADMIN) {
      throw new ForbiddenException('Only company admin can configure tests');
    }

    if (!user.companyId) {
      throw new ForbiddenException('Company admin is not mapped to a company');
    }

    return user.companyId;
  }

  private validateSequences(dto: SaveCompanyTestConfigDto) {
    const sequences = dto.tests.map((test) => test.sequence);

    if (new Set(sequences).size !== sequences.length) {
      throw new BadRequestException('Sequence values must be unique');
    }
  }

  private async validateHierarchy(dto: SaveCompanyTestConfigDto) {
    const standard = await this.db.standard.findUnique({
      where: {
        id: dto.standardId,
      },
    });

    if (!standard) {
      throw new NotFoundException('Standard not found');
    }

    const category = await this.db.testCategory.findFirst({
      where: {
        id: dto.categoryId,
        standardId: dto.standardId,
      },
    });

    if (!category) {
      throw new NotFoundException('Category not found for selected standard');
    }

    const requestedTestIds = dto.tests.map((test) => test.testId);
    const tests = await this.db.test.findMany({
      where: {
        id: {
          in: requestedTestIds,
        },
        categoryId: dto.categoryId,
      },
      select: {
        id: true,
      },
    });

    if (tests.length !== requestedTestIds.length) {
      throw new BadRequestException('One or more tests do not belong to selected category');
    }
  }
}
