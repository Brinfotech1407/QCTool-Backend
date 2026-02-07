import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateTestDto } from './dto/create-test.dto';

@Injectable()
export class TestService {
  constructor(private prisma: PrismaService) {}

  create(dto: CreateTestDto) {
    return this.prisma.test.create({
      data: dto,
    });
  }

  findByCategory(categoryId: string) {
    return this.prisma.test.findMany({
      where: { categoryId },
      include: {
        parameters: true,
      },
    });
  }
}
