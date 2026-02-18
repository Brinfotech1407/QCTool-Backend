import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RuleType } from '@prisma/client';

@Injectable()
export class RuleDefinitionService {
  constructor(private prisma: PrismaService) { }

  createOrUpdate(data: {
    parameterId: string;
    ruleType: any;
    ruleConfig: any;
  }) {
    return this.prisma.ruleDefinition.upsert({
      where: { parameterId: data.parameterId },
      update: {
        ruleType: data.ruleType,
        ruleConfig: data.ruleConfig,
      },
      create: data,
    });
  }

  update(id: string, data: any) {
    return this.prisma.ruleDefinition.update({
      where: { id },
      data,
    });
  }

  findByParameter(parameterId: string) {
    return this.prisma.ruleDefinition.findUnique({
      where: { parameterId },
    });
  }

  delete(id: string) {
    return this.prisma.ruleDefinition.delete({
      where: { id },
    });
  }
}
