import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto } from './dto/create-category.dto';

@Injectable()
export class TestCategoryService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateCategoryDto) {
    return this.prisma.testCategory.create({
      data: dto,
    });
  }

  findByStandard(standardId: string) {
    return this.prisma.testCategory.findMany({
      where: { standardId },
      include: {
        tests: true,
      },
    });
  }
}
