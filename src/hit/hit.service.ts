import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateHitDto } from './dto/create-hit.dto';
import { QueryHitDto, type HitStatusValue } from './dto/query-hit.dto';
import { UpdateHitDto } from './dto/update-hit.dto';

type JwtUser = {
  sub: string;
  role: UserRole;
  companyId: string | null;
};

@Injectable()
export class HitService {
  constructor(private readonly prisma: PrismaService) {}

  private get hitEntry() {
    return (this.prisma as unknown as {
      hitEntry: {
        create: (args: unknown) => Promise<unknown>;
        findMany: (args: unknown) => Promise<unknown[]>;
        count: (args: unknown) => Promise<number>;
        findFirst: (args: unknown) => Promise<any>;
        update: (args: unknown) => Promise<unknown>;
      };
    }).hitEntry;
  }

  async create(user: JwtUser, dto: CreateHitDto) {
    this.ensureCompanyScopedUser(user);

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const hitNumber = dto.hitNumber || await this.generateHitNumber(dto.inwardDate || new Date());

      try {
        return await this.hitEntry.create({
          data: {
            hitNumber,
            gradeId: dto.gradeId,
            od: dto.od,
            thickness: dto.thickness,
            length: dto.length,
            condition: dto.condition,
            weight: dto.weight,
            availableWeight: dto.weight,
            inwardPartyName: dto.inwardPartyName,
            inwardPartyTcNumber: dto.inwardPartyTcNumber,
            chemicalComposition: dto.chemicalComposition as Prisma.InputJsonValue,
            size: dto.size,
            quantity: dto.quantity,
            availableQuantity: dto.quantity,
            inwardDate: dto.inwardDate,
            companyId: user.companyId!,
            createdById: user.sub,
          },
        });
      } catch (error) {
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === 'P2002'
        ) {
          if (dto.hitNumber) {
            throw new BadRequestException('Provided hitNumber already exists');
          }
          continue;
        }

        throw error;
      }
    }

    throw new BadRequestException('Unable to generate a unique HIT number');
  }

  async findAll(user: JwtUser, query: QueryHitDto) {
    const where = this.buildWhere(user, query);
    const page = query.page && query.page > 0 ? query.page : 1;
    const pageSize =
      query.pageSize && query.pageSize > 0
        ? Math.min(query.pageSize, 100)
        : 20;

    const [items, total] = await Promise.all([
      this.hitEntry.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.hitEntry.count({ where }),
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
    const hit = await this.hitEntry.findFirst({
      where: {
        id,
        ...this.getCompanyScope(user),
        isDeleted: false,
      },
    });

    if (!hit) {
      throw new NotFoundException('HIT entry not found');
    }

    return hit;
  }

  async update(user: JwtUser, id: string, dto: UpdateHitDto) {
    this.ensureCompanyScopedUser(user);

    const existing = await this.hitEntry.findFirst({
      where: {
        id,
        companyId: user.companyId!,
        isDeleted: false,
      },
    });

    if (!existing) {
      throw new NotFoundException('HIT entry not found');
    }

    if (dto.chemicalComposition) {
      throw new BadRequestException('Chemical composition cannot be updated');
    }

    if (dto.quantity !== undefined && dto.quantity !== existing.quantity) {
      if (existing.availableQuantity !== existing.quantity) {
        throw new BadRequestException(
          'Quantity cannot be updated after stock has been consumed',
        );
      }
    }

    if (dto.weight !== undefined && dto.weight !== existing.weight) {
      if (existing.availableWeight !== existing.weight) {
        throw new BadRequestException(
          'Weight cannot be updated after stock has been consumed',
        );
      }
    }

    const data: {
      inwardPartyName?: string;
      inwardPartyTcNumber?: string;
      size?: string;
      inwardDate?: Date;
      status?: HitStatusValue;
      quantity?: number;
      availableQuantity?: number;
      gradeId?: string;
      od?: number;
      thickness?: number;
      length?: number;
      condition?: string;
      weight?: number;
      availableWeight?: number;
    } = {
      inwardPartyName: dto.inwardPartyName,
      inwardPartyTcNumber: dto.inwardPartyTcNumber,
      size: dto.size,
      inwardDate: dto.inwardDate,
      status: dto.status,
      gradeId: dto.gradeId,
      od: dto.od,
      thickness: dto.thickness,
      length: dto.length,
      condition: dto.condition,
    };

    if (dto.quantity !== undefined) {
      data.quantity = dto.quantity;
      data.availableQuantity = dto.quantity;
    }

    if (dto.weight !== undefined) {
      data.weight = dto.weight;
      data.availableWeight = dto.weight;
    }

    return this.hitEntry.update({
      where: { id: existing.id },
      data,
    });
  }

  async remove(user: JwtUser, id: string) {
    this.ensureCompanyScopedUser(user);

    const existing = await this.hitEntry.findFirst({
      where: {
        id,
        companyId: user.companyId!,
        isDeleted: false,
      },
    });

    if (!existing) {
      throw new NotFoundException('HIT entry not found');
    }

    if (existing.availableWeight < existing.weight) {
      throw new BadRequestException(
        'HIT cannot be deleted after stock has been consumed',
      );
    }

    return this.hitEntry.update({
      where: { id: existing.id },
      data: {
        isDeleted: true,
      },
    });
  }

  private async generateHitNumber(inwardDate: Date) {
    const year = inwardDate.getUTCFullYear();
    const prefix = `HIT-${year}-`;

    const latest = await this.hitEntry.findFirst({
      where: {
        hitNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        hitNumber: 'desc',
      },
      select: {
        hitNumber: true,
      },
    });

    const nextSequence = latest
      ? Number.parseInt(latest.hitNumber.slice(-4), 10) + 1
      : 1;

    return `${prefix}${nextSequence.toString().padStart(4, '0')}`;
  }

  private buildWhere(
    user: JwtUser,
    query: QueryHitDto,
  ): Record<string, unknown> {
    const where: Record<string, unknown> = {
      isDeleted: false,
      ...this.getCompanyScope(user),
    };

    if (query.status) {
      where.status = query.status;
    }

    if (query.gradeId) {
      where.gradeId = query.gradeId;
    }

    if (query.condition) {
      where.condition = query.condition;
    }

    if (query.startDate || query.endDate) {
      const inwardDate: Record<string, Date> = {};

      if (query.startDate) {
        inwardDate.gte = query.startDate;
      }

      if (query.endDate) {
        inwardDate.lte = query.endDate;
      }

      where.inwardDate = inwardDate;
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
