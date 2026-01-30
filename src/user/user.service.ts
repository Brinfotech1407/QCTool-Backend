import { BadRequestException, Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UserService {
  constructor(private prisma: PrismaService) {}

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

  findAll() {
    return this.prisma.user.findMany({
      include: { company: true },
    });
  }
}
