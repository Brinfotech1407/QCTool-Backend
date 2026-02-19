import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RuleType } from '@prisma/client';
import { RuleEngineService } from '../rule-engine/rule-engine.service';

@Injectable()
export class RuleDefinitionService {
  constructor(private prisma: PrismaService, private ruleEngine: RuleEngineService) { }

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

  async validateRule(body: any) {

    const { parameterId, batchContext, measuredValue } = body;

    const parameter = await this.prisma.testParameter.findUnique({
      where: { id: parameterId },
      include: {
        ruleDefinition: true,
        defaultCriteria: true,
      },
    });

    if (!parameter) {
      throw new Error('Parameter not found');
    }

    const result = this.ruleEngine.evaluate(
      parameter,
      batchContext,
      measuredValue
    );

    return result;
  }

}
