import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStandardDto } from './dto/create-standard.dto';

@Injectable()
export class StandardService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateStandardDto) {
    return this.prisma.standard.create({
      data: dto,
    });
  }

  findAll() {
    return this.prisma.standard.findMany({
      include: {
        categories: true,
      },
    });
  }
}
