import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RuleType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { RuleEngineService } from '../rule-engine/rule-engine.service';
import { CreateQCTestDto } from './dto/create-qc-test.dto';

type JwtUser = {
  sub: string;
  role: UserRole;
  companyId: string | null;
};

type CustomerTcData = {
  batch: {
    id: string;
    batchNumber: string;
    grade?: string;
    gradeId?: string;
    condition?: string;
  };
  customer: {
    id: string;
    name: string;
  };
  items: Array<{
    id: string;
    od: number;
    wt: number;
    qty?: number;
    condition?: string;
    length?: number;
    status: string;
    categories: Array<{
      name: string;
      sequence: number;
      rules: Array<Record<string, unknown>>;
    }>;
  }>;
  chemicalComposition?: unknown;
};

type BatchWithNestedItems = {
  id: string;
  companyId: string;
  batchHits: Array<{
    hit: {
      id: string;
      hitNumber: string;
      chemicalComposition: unknown;
    };
  }>;
  customers: Array<{
    id: string;
    name: string;
    items: Array<{
      id: string;
      od: number;
      wt: number;
      qty: number;
      condition: string;
      length: number;
      categories?: Array<{
        name: string;
        sequence: number;
        rules: Array<Record<string, unknown>>;
      }>;
      qcTests: Array<{
        id: string;
        createdAt: Date;
        tests: Array<{
          id: string;
          status: string;
          observed: number;
          min: number | null;
          max: number | null;
          rule: unknown;
        }>;
      }>;
    }>;
  }>;
};

@Injectable()
export class QcTestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ruleEngine: RuleEngineService,
  ) {}

  async create(user: JwtUser, dto: CreateQCTestDto) {
    const batch = await this.prisma.batch.findFirst({
      where: {
        id: dto.batchId,
        ...this.getCompanyScope(user),
      },
      include: {
        batchHits: {
          include: {
            hit: {
              select: {
                id: true,
                hitNumber: true,
                chemicalComposition: true,
              },
            },
          },
        },
        customers: {
          include: {
            items: true,
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    const customer = batch.customers.find((entry) => entry.id === dto.customerId);
    if (!customer) {
      throw new BadRequestException('Customer does not belong to the batch');
    }

    const item = customer.items.find((entry) => entry.id === dto.itemId);
    if (!item) {
      throw new BadRequestException('Item does not belong to the customer');
    }

    const existing = await this.prisma.qCTest.findFirst({
      where: {
        batchId: dto.batchId,
        customerId: dto.customerId,
        itemId: dto.itemId,
      },
    });

    if (existing) {
      throw new BadRequestException('QC already exists for this item');
    }

    const uniqueRuleIds = [...new Set(dto.tests.map((test) => test.ruleId))];
    if (uniqueRuleIds.length !== dto.tests.length) {
      throw new BadRequestException('Duplicate rules are not allowed');
    }

    const applicableRules = (await this.getApplicableRulesForItem(
      dto.batchId,
      item,
    )) as any[];
    const applicableRulesById = new Map(
      applicableRules.map((rule) => [rule.id, rule]),
    );

    if (!uniqueRuleIds.every((ruleId) => applicableRulesById.has(ruleId))) {
      throw new BadRequestException(
        'One or more rules are not applicable for the selected item',
      );
    }

    const results = dto.tests.map((entry) => {
      return this.buildStoredResultsForEntry(batch, item, applicableRulesById, entry);
    }).flat();
    const qcStatus = results.some((result) => result.status === 'FAIL')
      ? 'FAIL'
      : 'PASS';

    return this.prisma.qCTest.create({
      data: {
        batchId: dto.batchId,
        customerId: dto.customerId,
        itemId: dto.itemId,
        status: qcStatus,
        tests: {
          create: results,
        },
      },
      include: {
        tests: {
          include: {
            rule: {
              include: {
                defaultCriteria: true,
                ruleDefinition: true,
              },
            },
          },
        },
      },
    });
  }

  async list(user: JwtUser) {
    const records = await this.prisma.qCTest.findMany({
      where: this.getQcRecordScope(user),
      include: {
        batch: {
          select: {
            id: true,
            batchNumber: true,
          },
        },
        customer: {
          select: {
            id: true,
            name: true,
          },
        },
        item: {
          select: {
            id: true,
            od: true,
            wt: true,
            condition: true,
            length: true,
          },
        },
      },
      orderBy: {
        createdAt: 'desc',
      },
    });

    return records.map((record) => ({
      id: record.id,
      batchId: record.batchId,
      batchNumber: record.batch.batchNumber,
      customerId: record.customerId,
      customerName: record.customer.name,
      itemId: record.itemId,
      item: {
        od: record.item.od,
        wt: record.item.wt,
        condition: record.item.condition,
        length: record.item.length,
      },
      status: record.status,
      createdAt: record.createdAt,
    }));
  }

  private buildStoredResultsForEntry(
    batch: any,
    item: any,
    applicableRulesById: Map<string, any>,
    entry: CreateQCTestDto['tests'][number],
  ) {
      const rule = applicableRulesById.get(entry.ruleId);

      if (!rule) {
        throw new BadRequestException(`Rule not found: ${entry.ruleId}`);
      }

      const ruleType = rule.parameter?.ruleDefinition?.ruleType as RuleType | undefined;

      if (ruleType === RuleType.GENERIC_CONDITION) {
        return this.buildGenericConditionResults(batch, item, rule, entry);
      }

      if (ruleType === RuleType.MECHANICAL_PROPERTIES) {
        return this.buildMechanicalResults(batch, item, rule, entry);
      }

      const observedValue = entry.observed;
      if (observedValue === undefined) {
        throw new BadRequestException(`Observed value is required for ${rule.name}`);
      }

      const normalizedObserved = this.normalizeObservedValue(rule, observedValue);
      const evaluationContext = this.buildEvaluationContext(
        batch,
        item,
        rule.parameter,
        observedValue,
      );
      const evaluation = this.ruleEngine.evaluate(
        rule.parameter,
        evaluationContext,
        normalizedObserved,
      ) as Record<string, unknown>;
      const min = this.toNullableNumber(
        evaluation?.['min'] ?? rule.spec.min ?? null,
      );
      const max = this.toNullableNumber(
        evaluation?.['max'] ?? rule.spec.max ?? null,
      );
      const status = evaluation?.['pass'] ? 'PASS' : 'FAIL';

      return this.makeStoredResult(entry.ruleId, {
        observed: normalizedObserved,
        min,
        max,
        status,
      });
  }

  private buildGenericConditionResults(batch: any, item: any, rule: any, entry: any) {
    const fieldObservations = entry.fieldObservations ?? {};
    const fields = rule.parameter?.ruleDefinition?.ruleConfig?.fields ?? [];

    const missingField = fields.find((field: any) => fieldObservations[field.name] === undefined);
    if (missingField) {
      throw new BadRequestException(`Observed value is required for ${missingField.name}`);
    }

    const evaluationContext = {
      ...this.buildEvaluationContext(batch, item, rule.parameter, 0),
      dynamicValues: Object.fromEntries(
        fields.map((field: any) => [
          field.name,
          Number(fieldObservations[field.name]),
        ]),
      ),
    };

    const evaluation = this.ruleEngine.evaluate(
      rule.parameter,
      evaluationContext,
      0,
    ) as Record<string, any>;

    return fields.map((field: any) => {
      const detail = evaluation?.details?.[field.name] ?? {};
      return this.makeStoredResult(rule.id, {
        observed: Number(fieldObservations[field.name]),
        min: this.toNullableNumber(detail.min ?? null),
        max: this.toNullableNumber(detail.max ?? null),
        status: detail.pass ? 'PASS' : 'FAIL',
      });
    });
  }

  private buildMechanicalResults(batch: any, item: any, rule: any, entry: any) {
    const fieldObservations = entry.fieldObservations ?? {};
    const config = rule.parameter?.ruleDefinition?.ruleConfig ?? {};

    const requiredKeys = ['tensile', 'elongation'];
    if (config.flatteningRequired) {
      requiredKeys.push('flattening');
    }
    if (config.driftRequired) {
      requiredKeys.push('drift');
    }

    const missingKey = requiredKeys.find((key) => fieldObservations[key] === undefined);
    if (missingKey) {
      throw new BadRequestException(`Observed value is required for ${missingKey}`);
    }

    const evaluationContext = {
      ...this.buildEvaluationContext(batch, item, rule.parameter, 0),
      tensile: Number(fieldObservations.tensile),
      elongation: Number(fieldObservations.elongation),
      flattening: this.toBoolean(fieldObservations.flattening),
      drift: this.toBoolean(fieldObservations.drift),
    };

    const evaluation = this.ruleEngine.evaluate(
      rule.parameter,
      evaluationContext,
      0,
    ) as Record<string, any>;

    const conditionRule = (config.conditions ?? []).find(
      (condition: any) =>
        String(condition.key ?? '').trim().toLowerCase() ===
        String(item.condition ?? '').trim().toLowerCase(),
    );

    return requiredKeys.map((key) => {
      const detailPass = Boolean(evaluation?.details?.[key]);
      const observedValue = fieldObservations[key];

      let min: number | null = null;
      let max: number | null = null;

      if (key === 'tensile') {
        min = this.toNullableNumber(conditionRule?.tensileMin ?? null);
        max = this.toNullableNumber(conditionRule?.tensileMax ?? null);
      }

      if (key === 'elongation') {
        min = this.toNullableNumber(conditionRule?.elongationMin ?? null);
      }

      return this.makeStoredResult(rule.id, {
        observed:
          key === 'flattening' || key === 'drift'
            ? this.toBoolean(observedValue)
              ? 1
              : 0
            : Number(observedValue),
        min,
        max,
        status: detailPass ? 'PASS' : 'FAIL',
      });
    });
  }

  private makeStoredResult(
    ruleId: string,
    data: {
      observed: number;
      min: number | null;
      max: number | null;
      status: string;
    },
  ) {
    return {
      observed: data.observed,
      min: data.min,
      max: data.max,
      status: data.status,
      rule: {
        connect: {
          id: ruleId,
        },
      },
    };
  }

  async getBatchQc(user: JwtUser, batchId: string) {
    const batch = (await this.prisma.batch.findFirst({
      where: {
        id: batchId,
        ...this.getCompanyScope(user),
      },
      include: {
        batchHits: {
          include: {
            hit: {
              select: {
                id: true,
                hitNumber: true,
                chemicalComposition: true,
              },
            },
          },
        },
        customers: {
          include: {
            items: {
              include: {
                qcTests: {
                  include: {
                    tests: {
                      include: {
                        rule: {
                          include: {
                            defaultCriteria: true,
                            ruleDefinition: true,
                          },
                        },
                      },
                    },
                  },
                  orderBy: {
                    createdAt: 'desc',
                  },
                },
              },
            },
          },
        },
      },
    })) as BatchWithNestedItems | null;

    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    const batchTests = await this.prisma.batchTest.findMany({
      where: {
        batchId,
      },
      include: {
        test: {
          include: {
            category: true,
            parameters: {
              include: {
                defaultCriteria: true,
                ruleDefinition: true,
              },
            },
          },
        },
      },
      orderBy: {
        sequence: 'asc',
      },
    });

    const customers = batch.customers.map((customer) => ({
      ...customer,
      items: customer.items.map((item) => {
        const latestQc = item.qcTests[0] ?? null;
        const categories = this.buildCategoriesForItem(batchTests, item);
        const itemStatus =
          latestQc && latestQc.tests.some((test) => test.status === 'FAIL')
            ? 'FAIL'
            : latestQc
              ? 'PASS'
              : 'PENDING';

        return {
          ...item,
          categories,
          qcTest: latestQc,
          qcStatus: itemStatus,
        };
      }),
    }));

    const qcTests = customers.flatMap((customer) =>
      customer.items.flatMap((item) =>
        item.qcTest
          ? [
              {
                customerId: customer.id,
                itemId: item.id,
                tests: item.qcTest.tests.map((test) => ({
                  ruleId: (test.rule as { id: string }).id,
                  observed: test.observed,
                  status: test.status,
                })),
              },
            ]
          : [],
      ),
    );

    return {
      batch: {
        ...batch,
        customers,
      },
      categories: this.buildGlobalCategories(batchTests),
      rules: [],
      qcTests,
      chemicalComposition:
        batch.batchHits.find((entry) => entry.hit?.chemicalComposition)?.hit
          .chemicalComposition ?? null,
    };
  }

  async getRecord(user: JwtUser, id: string) {
    const qcTest = await this.prisma.qCTest.findFirst({
      where: {
        id,
        ...this.getQcRecordScope(user),
      },
      include: {
        batch: {
          include: {
            batchHits: {
              include: {
                hit: {
                  select: {
                    id: true,
                    hitNumber: true,
                    chemicalComposition: true,
                  },
                },
              },
            },
          },
        },
        customer: true,
        item: true,
        tests: {
          include: {
            rule: {
              include: {
                test: {
                  include: {
                    category: true,
                  },
                },
                defaultCriteria: true,
                ruleDefinition: true,
              },
            },
          },
          orderBy: {
            id: 'asc',
          },
        },
      },
    });

    if (!qcTest) {
      throw new NotFoundException('QC record not found');
    }

    const batchTests = await this.prisma.batchTest.findMany({
      where: {
        batchId: qcTest.batchId,
      },
      include: {
        test: {
          include: {
            category: true,
            parameters: {
              include: {
                defaultCriteria: true,
                ruleDefinition: true,
              },
            },
          },
        },
      },
      orderBy: {
        sequence: 'asc',
      },
    });

    const categories = this.buildCategoriesForItem(batchTests, qcTest.item).map(
      (category) => ({
        ...category,
        rules: category.rules.map((rule) => ({
          ...rule,
          results: qcTest.tests
            .filter((test) => test.rule.id === rule.id)
            .map((test) => ({
              id: test.id,
              observed: test.observed,
              min: test.min,
              max: test.max,
              status: test.status,
            })),
        })),
      }),
    );

    return {
      id: qcTest.id,
      status: qcTest.status,
      createdAt: qcTest.createdAt,
      batch: {
        id: qcTest.batch.id,
        batchNumber: qcTest.batch.batchNumber,
        grade: qcTest.batch.grade,
        gradeId: qcTest.batch.gradeId,
        condition: qcTest.batch.condition,
      },
      customer: {
        id: qcTest.customer.id,
        name: qcTest.customer.name,
      },
      item: {
        id: qcTest.item.id,
        od: qcTest.item.od,
        wt: qcTest.item.wt,
        qty: qcTest.item.qty,
        condition: qcTest.item.condition,
        length: qcTest.item.length,
      },
      categories,
      tests: qcTest.tests.map((test) => ({
        id: test.id,
        observed: test.observed,
        min: test.min,
        max: test.max,
        status: test.status,
        rule: {
          id: test.rule.id,
          name: test.rule.name,
          unit: test.rule.unit,
          categoryName: test.rule.test.category.name,
          ruleDefinition: test.rule.ruleDefinition,
          defaultCriteria: test.rule.defaultCriteria,
        },
      })),
      chemicalComposition:
        qcTest.batch.batchHits.find((entry) => entry.hit?.chemicalComposition)?.hit
          .chemicalComposition ?? null,
    };
  }

  async getCustomerTcData(user: JwtUser, batchId: string, customerId: string): Promise<CustomerTcData> {
    const batch = await this.prisma.batch.findFirst({
      where: {
        id: batchId,
        ...this.getCompanyScope(user),
      },
      include: {
        batchHits: {
          include: {
            hit: {
              select: {
                id: true,
                chemicalComposition: true,
              },
            },
          },
        },
      },
    });

    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    const customer = await this.prisma.batchCustomer.findFirst({
      where: {
        id: customerId,
        batchId,
      },
      include: {
        items: {
          include: {
            qcTests: {
              include: {
                tests: {
                  include: {
                    rule: {
                      include: {
                        test: {
                          include: {
                            category: true,
                          },
                        },
                        defaultCriteria: true,
                        ruleDefinition: true,
                      },
                    },
                  },
                },
              },
              orderBy: {
                createdAt: 'desc',
              },
            },
          },
        },
      },
    });

    if (!customer) {
      throw new NotFoundException('Customer not found for this batch');
    }

    const batchTests = await this.prisma.batchTest.findMany({
      where: { batchId },
      include: {
        test: {
          include: {
            category: true,
            parameters: {
              include: {
                defaultCriteria: true,
                ruleDefinition: true,
              },
            },
          },
        },
      },
      orderBy: {
        sequence: 'asc',
      },
    });

    const items = customer.items
      .map((item) => {
        const latestQc = item.qcTests[0];
        if (!latestQc) {
          return null;
        }

        const categories = this.buildCategoriesForItem(batchTests, item).map((category) => ({
          ...category,
          rules: category.rules.map((rule) => ({
            ...rule,
            results: latestQc.tests
              .filter((test) => test.rule.id === rule.id)
              .map((test) => ({
                id: test.id,
                observed: test.observed,
                min: test.min,
                max: test.max,
                status: test.status,
              })),
          })),
        }));

        const itemStatus = latestQc.tests.some((test) => test.status === 'FAIL')
          ? 'FAIL'
          : 'PASS';

        return {
          id: item.id,
          od: item.od,
          wt: item.wt,
          qty: item.qty,
          condition: item.condition,
          length: item.length,
          status: itemStatus,
          categories,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (items.length === 0) {
      throw new NotFoundException('No QC records available for this customer in selected batch');
    }

    return {
      batch: {
        id: batch.id,
        batchNumber: batch.batchNumber,
        grade: batch.grade,
        gradeId: batch.gradeId,
        condition: batch.condition,
      },
      customer: {
        id: customer.id,
        name: customer.name,
      },
      items,
      chemicalComposition:
        batch.batchHits.find((entry) => entry.hit?.chemicalComposition)?.hit
          .chemicalComposition ?? null,
    };
  }

  private getCompanyScope(user: JwtUser): Record<string, string> {
    if (user.role === UserRole.PLATFORM_ADMIN) {
      return {};
    }

    if (!user.companyId) {
      throw new ForbiddenException('User is not mapped to a company');
    }

    return { companyId: user.companyId };
  }

  private getQcRecordScope(user: JwtUser) {
    if (user.role === UserRole.PLATFORM_ADMIN) {
      return {};
    }

    if (!user.companyId) {
      throw new ForbiddenException('User is not mapped to a company');
    }

    return {
      batch: {
        companyId: user.companyId,
      },
    };
  }

  private async getApplicableRulesForItem(
    batchId: string,
    item: {
      od: number;
      wt: number;
      length: number;
      condition: string;
    },
  ) {
    const batchTests = await this.prisma.batchTest.findMany({
      where: { batchId },
      include: {
        test: {
          include: {
            category: true,
            parameters: {
              include: {
                defaultCriteria: true,
                ruleDefinition: true,
              },
            },
          },
        },
      },
      orderBy: { sequence: 'asc' },
    });

    return this.buildApplicableRules(batchTests, item);
  }

  private buildGlobalCategories(batchTests: Array<any>) {
    const categoryMap = new Map<string, { name: string; sequence: number; rules: unknown[] }>();

    batchTests.forEach((batchTest) => {
      const categoryName = batchTest.test?.category?.name ?? 'General';
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, {
          name: categoryName,
          sequence: batchTest.test?.category?.sequence ?? batchTest.sequence,
          rules: [],
        });
      }
    });

    return [...categoryMap.values()].sort((left, right) => left.sequence - right.sequence);
  }

  private buildCategoriesForItem(batchTests: Array<any>, item: { od: number; wt: number; length: number; condition: string }) {
    const applicableRules = this.buildApplicableRules(batchTests, item);
    const categoryMap = new Map<
      string,
      { name: string; sequence: number; rules: Array<Record<string, unknown>> }
    >();

    applicableRules.forEach((rule) => {
      if (!categoryMap.has(rule.categoryName)) {
        categoryMap.set(rule.categoryName, {
          name: rule.categoryName,
          sequence: rule.categorySequence,
          rules: [],
        });
      }

      categoryMap.get(rule.categoryName)?.rules.push(rule);
    });

    return [...categoryMap.values()]
      .map((category) => ({
        ...category,
        rules: [...category.rules].sort(
          (left: any, right: any) =>
            Number(left.sequence ?? 0) - Number(right.sequence ?? 0),
        ),
      }))
      .sort((left, right) => left.sequence - right.sequence);
  }

  private buildApplicableRules(batchTests: Array<any>, item: { od: number; wt: number; length: number; condition: string }) {
    return batchTests.flatMap((batchTest) =>
      (batchTest.test?.parameters ?? [])
        .map((parameter: any, parameterIndex: number) =>
          this.toContextRule(
            parameter,
            batchTest.test?.category?.sequence ?? batchTest.sequence,
            batchTest.test?.category?.name ?? 'General',
            item,
            parameterIndex + 1,
          ),
        )
        .filter(Boolean),
    ) as Array<{
      id: string;
      name: string;
      sequence: number;
      type: string;
      validationType: string;
      spec: { min: number | null; max: number | null; expectedValue: string | number | null };
      categoryName: string;
      categorySequence: number;
      options: string[];
      contextLabel?: string;
    }>;
  }

  private toContextRule(
    parameter: any,
    categorySequence: number,
    categoryName: string,
    item: { od: number; wt: number; length: number; condition: string },
    ruleSequence: number,
  ) {
    if (!this.isApplicableToItem(parameter, item)) {
      return null;
    }

    const ruleType = parameter.ruleDefinition?.ruleType as RuleType | undefined;
    const spec = this.resolveSpec(parameter, item);
    const options = this.extractOptions(parameter.ruleDefinition?.ruleConfig);
    const type = this.inferFieldType(parameter, options);
    const validationType = this.inferValidationType(parameter, type);

    return {
      id: parameter.id,
      sequence: ruleSequence,
      name: parameter.name,
      type,
      validationType,
      ruleType: ruleType ?? 'DEFAULT',
      min: spec.min,
      max: spec.max,
      expectedValue: spec.expectedValue,
      spec,
      options,
      categoryName,
      categorySequence,
      contextLabel: this.getContextLabel(parameter, item),
      parameter,
    };
  }

  private isApplicableToItem(parameter: any, item: { condition: string }) {
    const ruleDefinition = parameter.ruleDefinition;
    if (!ruleDefinition?.ruleConfig) {
      return true;
    }

    const config = ruleDefinition.ruleConfig as Record<string, unknown>;
    const conditions = this.extractConditions(config);

    if (conditions.length > 0) {
      return conditions.some(
        (condition) =>
          condition.trim().toLowerCase() === item.condition.trim().toLowerCase(),
      );
    }

    return true;
  }

  private resolveSpec(parameter: any, item: { od: number; wt: number; length: number; condition: string }) {
    const ruleDefinition = parameter.ruleDefinition;
    const defaultCriteria = parameter.defaultCriteria;

    if (!ruleDefinition?.ruleConfig) {
      return {
        min: defaultCriteria?.minValue ?? null,
        max: defaultCriteria?.maxValue ?? null,
        expectedValue: defaultCriteria?.exactValue ?? null,
      };
    }

    const config = ruleDefinition.ruleConfig as Record<string, any>;

    switch (ruleDefinition.ruleType) {
      case RuleType.BAND_MATRIX: {
        const row = (config.rows ?? []).find((entry: any) => item.wt > entry.min && item.wt <= entry.max);
        const col = (config.columns ?? []).find((entry: any) => item.od > entry.min && item.od <= entry.max);
        const cell = (config.matrix ?? []).find(
          (entry: any) =>
            entry.row === row?.key &&
            entry.col === col?.key &&
            (!entry.condition ||
              String(entry.condition).trim().toLowerCase() === item.condition.trim().toLowerCase()),
        );

        if (!cell) {
          return { min: null, max: null, expectedValue: null };
        }

        const tolerance = Number(cell.tolerance ?? 0);
        return {
          min: item.wt - tolerance,
          max: item.wt + tolerance,
          expectedValue: null,
        };
      }
      case RuleType.FORMULA: {
        const perMeter = Number(config.perMeter ?? 0);
        return {
          min: null,
          max: perMeter * item.length,
          expectedValue: null,
        };
      }
      case RuleType.GENERIC_CONDITION: {
        const conditionRule = (config.conditions ?? []).find(
          (entry: any) =>
            String(entry.key ?? '').trim().toLowerCase() === item.condition.trim().toLowerCase(),
        );
        const fieldRule = conditionRule?.rules?.[parameter.name];

        return {
          min: fieldRule?.min ?? defaultCriteria?.minValue ?? null,
          max: fieldRule?.max ?? defaultCriteria?.maxValue ?? null,
          expectedValue: fieldRule?.value ?? defaultCriteria?.exactValue ?? null,
        };
      }
      case RuleType.TEXT_NUMERIC:
        return {
          min: config.min ?? defaultCriteria?.minValue ?? null,
          max: config.max ?? defaultCriteria?.maxValue ?? null,
          expectedValue: defaultCriteria?.exactValue ?? null,
        };
      case RuleType.TEXT_BOOLEAN:
        return {
          min: null,
          max: null,
          expectedValue: config.expected ?? defaultCriteria?.exactValue ?? 'PASS',
        };
      case RuleType.FIXED_RANGE:
        return {
          min: config.minValue ?? defaultCriteria?.minValue ?? null,
          max: config.maxValue ?? defaultCriteria?.maxValue ?? null,
          expectedValue: defaultCriteria?.exactValue ?? null,
        };
      default:
        return {
          min: defaultCriteria?.minValue ?? null,
          max: defaultCriteria?.maxValue ?? null,
          expectedValue: defaultCriteria?.exactValue ?? null,
        };
    }
  }

  private buildEvaluationContext(
    batch: any,
    item: { od: number; wt: number; length: number; condition: string },
    parameter: any,
    observedValue: string | number | boolean,
  ) {
    const chemicalValues =
      batch.batchHits?.find((entry: any) => entry.hit?.chemicalComposition)?.hit
        ?.chemicalComposition ?? {};
    const normalizedCondition = item.condition ?? '';
    const parameterName = String(parameter.name ?? '').toLowerCase();
    const numericObserved = Number(observedValue);
    const booleanObserved =
      String(observedValue).trim().toUpperCase() === 'PASS' ||
      String(observedValue).trim().toLowerCase() === 'true';

    return {
      nominalValue: this.getNominalValue(parameter, item),
      outerDiameter: item.od,
      wallThickness: item.wt,
      length: item.length,
      measuredValue: Number.isFinite(numericObserved) ? numericObserved : 0,
      grade: batch.grade || batch.gradeId || '',
      chemicalValues,
      condition: normalizedCondition,
      tensile: parameterName.includes('tensile')
        ? numericObserved
        : 0,
      elongation: parameterName.includes('elongation')
        ? numericObserved
        : 0,
      flattening: parameterName.includes('flatten')
        ? booleanObserved
        : false,
      drift: parameterName.includes('drift') ? booleanObserved : false,
      dynamicValues: {
        [parameter.name]: Number.isFinite(numericObserved)
          ? numericObserved
          : observedValue,
      },
      booleanResult: booleanObserved,
      numericValue: Number.isFinite(numericObserved) ? numericObserved : null,
    };
  }

  private getNominalValue(
    parameter: any,
    item: { od: number; wt: number; length: number },
  ) {
    const ruleType = parameter.ruleDefinition?.ruleType as RuleType | undefined;
    const parameterName = String(parameter.name ?? '').toLowerCase();

    if (ruleType === RuleType.ASYMMETRIC_BAND || parameterName.includes('length')) {
      return item.length;
    }

    if (ruleType === RuleType.BAND_SINGLE || parameterName.includes('od')) {
      return item.od;
    }

    if (ruleType === RuleType.BAND_MATRIX || ruleType === RuleType.RATIO_PERCENT) {
      return item.wt;
    }

    if (parameterName.includes('length')) {
      return item.length;
    }

    if (
      parameterName.includes('wall') ||
      parameterName.includes('thickness') ||
      parameterName.includes('wt')
    ) {
      return item.wt;
    }

    return item.od;
  }

  private getContextLabel(
    parameter: any,
    item: { condition: string },
  ) {
    const ruleType = parameter.ruleDefinition?.ruleType as RuleType | undefined;

    if (
      ruleType === RuleType.GENERIC_CONDITION ||
      ruleType === RuleType.MECHANICAL_PROPERTIES
    ) {
      return item.condition
        ? `${parameter.name} (${item.condition})`
        : parameter.name;
    }

    if (ruleType === RuleType.TEXT_BOOLEAN || ruleType === RuleType.TEXT_NUMERIC) {
      const statement = parameter.ruleDefinition?.ruleConfig?.statement;
      if (typeof statement === 'string' && statement.trim()) {
        return statement.trim();
      }
    }

    return parameter.name;
  }

  private normalizeObservedValue(rule: any, observedValue: string | number | boolean) {
    const ruleType = rule.parameter?.ruleDefinition?.ruleType as RuleType | undefined;
    const rawValue = String(observedValue).trim();

    if (ruleType === RuleType.TEXT_BOOLEAN) {
      if (!rawValue) {
        throw new BadRequestException(`Observed value is required for ${rule.name}`);
      }

      return rawValue.toUpperCase() === 'PASS' ? 1 : 0;
    }

    const numericObserved = Number(observedValue);
    if (!Number.isFinite(numericObserved)) {
      throw new BadRequestException(`Observed value must be numeric for ${rule.name}`);
    }

    return numericObserved;
  }

  private toNullableNumber(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
  }

  private toBoolean(value: unknown) {
    if (typeof value === 'boolean') {
      return value;
    }

    const normalized = String(value).trim().toLowerCase();
    return normalized === 'true' || normalized === 'yes' || normalized === 'pass';
  }

  private inferFieldType(parameter: any, options: string[]) {
    const ruleType = parameter.ruleDefinition?.ruleType as RuleType | undefined;

    if (ruleType === RuleType.TEXT_BOOLEAN) {
      return 'boolean';
    }

    if (options.length > 0) {
      return 'dropdown';
    }

    if (ruleType === RuleType.GENERIC_CONDITION) {
      return 'number';
    }

    if (parameter.defaultCriteria?.exactValue != null) {
      return Number.isFinite(Number(parameter.defaultCriteria.exactValue)) ? 'number' : 'text';
    }

    return 'number';
  }

  private inferValidationType(parameter: any, type: string) {
    const ruleType = parameter.ruleDefinition?.ruleType as RuleType | undefined;

    if (type === 'boolean') {
      return 'passfail';
    }

    if (ruleType === RuleType.GENERIC_CONDITION) {
      return 'range';
    }

    if (parameter.defaultCriteria?.exactValue != null || ruleType === RuleType.TEXT_BOOLEAN) {
      return 'exact';
    }

    const min = parameter.defaultCriteria?.minValue;
    const max = parameter.defaultCriteria?.maxValue;

    if (min != null && max != null) {
      return 'range';
    }

    if (min != null) {
      return 'min';
    }

    if (max != null) {
      return 'max';
    }

    return type === 'dropdown' || type === 'text' ? 'exact' : 'range';
  }

  private extractConditions(config: Record<string, unknown>) {
    if (Array.isArray(config.conditions)) {
      return config.conditions
        .map((entry) => {
          if (typeof entry === 'string') {
            return entry;
          }

          if (
            entry &&
            typeof entry === 'object' &&
            'key' in entry &&
            typeof entry.key === 'string'
          ) {
            return entry.key;
          }

          return '';
        })
        .filter(Boolean);
    }

    return [];
  }

  private extractOptions(config: Record<string, unknown> | undefined) {
    if (!config) {
      return [];
    }

    if (Array.isArray(config.options)) {
      return config.options.map((entry) => String(entry));
    }

    return this.extractConditions(config);
  }
}
