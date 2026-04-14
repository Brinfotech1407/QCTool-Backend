import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) { }

  async create(data: CreateUserDto) {
    // Business rule enforcement
    if (data.role !== 'PLATFORM_ADMIN' && !data.companyId) {
      throw new BadRequestException(
        'companyId is required for non-platform users',
      );
    }

    if (data.role === 'PLATFORM_ADMIN' && data.companyId) {
      throw new BadRequestException(
        'Platform admin must not belong to a company',
      );
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return this.prisma.user.create({
      data: {
        ...data,
        password: hashedPassword,
      },
    });
  }

  async createQcUserByCompanyAdmin(companyAdminId: string, data: CreateUserDto) {
    const companyAdmin = await this.prisma.user.findUnique({
      where: { id: companyAdminId },
    });

    if (!companyAdmin || companyAdmin.role !== UserRole.COMPANY_ADMIN) {
      throw new ForbiddenException('Only company admin can create QC users');
    }

    if (!companyAdmin.companyId) {
      throw new BadRequestException('Company admin must belong to a company');
    }

    if (data.role !== UserRole.QC_USER) {
      throw new BadRequestException(
        'Company admin can only create users with QC_USER role',
      );
    }

    const hashedPassword = await bcrypt.hash(data.password, 10);

    return this.prisma.user.create({
      data: {
        ...data,
        role: UserRole.QC_USER,
        companyId: companyAdmin.companyId,
        password: hashedPassword,
      },
    });
  }

  async findCompanyQcUsers(companyAdminId: string) {
    const companyAdmin = await this.prisma.user.findUnique({
      where: { id: companyAdminId },
    });

    if (!companyAdmin || companyAdmin.role !== UserRole.COMPANY_ADMIN) {
      throw new ForbiddenException('Only company admin can view QC users');
    }

    if (!companyAdmin.companyId) {
      throw new NotFoundException('Company mapping not found for company admin');
    }

    return this.prisma.user.findMany({
      where: {
        companyId: companyAdmin.companyId,
        role: UserRole.QC_USER,
      },
      include: { company: true },
    });
  }

  findAll(query: any) {
    const { role, companyId } = query;
    const where: any = {};

    if (role) {
      where.role = role;
    }

    if (companyId) {
      where.companyId = companyId;
    }


    return this.prisma.user.findMany({
      where,
      include: { company: true },
    });
  }
}
