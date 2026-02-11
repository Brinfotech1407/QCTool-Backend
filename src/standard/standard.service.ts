import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStandardDto } from './dto/create-standard.dto';

@Injectable()
export class StandardService {
  constructor(private prisma: PrismaService) { }

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


  update(id: string, dto: CreateStandardDto) {
    return this.prisma.standard.update({
      where: { id },
      data: dto,
    });
  }

  remove(id: string) {
    return this.prisma.standard.delete({
      where: { id },
    });
  }
}


