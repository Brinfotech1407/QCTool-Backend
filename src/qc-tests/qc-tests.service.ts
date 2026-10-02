import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { RuleType, UserRole } from '@prisma/client';
import {
  CERTIFICATE_DEFAULT_NDT_ROWS,
  CERTIFICATE_DEFAULT_REMARK,
} from '../certificate/certificate.constants';
import type { CertificateChemicalRow, CertificateDimensionRow, CertificateSections } from '../certificate/certificate.types';
import { PrismaService } from '../prisma/prisma.service';
import { RuleEngineService } from '../rule-engine/rule-engine.service';
import { CreateQCTestDto } from './dto/create-qc-test.dto';

type JwtUser = {
  sub: string;
  role: UserRole;
  companyId: string | null;
};

type CompanyTcConfigPayload = {
  companyName: string;
  companyAddress?: string | null;
  logoUrl?: string | null;
  isoHallmarkUrl?: string | null;
};

type CustomerTcData = {
  batch: {
    id: string;
    batchNumber: string;
    grade?: string;
    gradeId?: string;
    tubeType?: string;
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
    pcs?: number;
    condition?: string;
    length?: number;
    status: string;
    categories: Array<{
      name: string;
      sequence: number;
      rules: Array<Record<string, unknown>>;
    }>;
    certificateSections?: CertificateSections;
  }>;
  chemicalComposition?: unknown;
  certificate?: {
    chemicalRows: CertificateChemicalRow[];
    remarks: string;
  };
  tcConfig?: CompanyTcConfigPayload | null;
};

type BatchWithNestedItems = {
  id: string;
  grade?: string;
  gradeId?: string;
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
      pcs: number;
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
      { ...item, grade: batch.grade || batch.gradeId },
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

      if (entry.notApplicable === true) {
        const statement = rule.parameter?.ruleDefinition?.ruleConfig?.statement ?? '';
        if (ruleType !== RuleType.TEXT_NUMERIC || !/residue|resuide|evaporation/i.test(`${rule.name} ${statement}`)) {
          throw new BadRequestException('Only the residue test can be marked not required');
        }
        return this.makeStoredResult(entry.ruleId, {
          fieldKey: undefined,
          observed: 0,
          min: null,
          max: null,
          status: 'N/A',
        });
      }

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
        fieldKey: undefined,
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
        fieldKey: field.name,
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

    const hardDrawn = String(item.condition ?? '').trim().toLowerCase().replace(/[^a-z]/g, '') === 'harddrawn';
    const requiredKeys = ['tensile', ...(hardDrawn ? [] : ['elongation'])];
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

    const resultKeys = ['tensile', 'elongation', ...requiredKeys.filter((key) => !['tensile', 'elongation'].includes(key))];
    return resultKeys.map((key) => {
      if (key === 'elongation' && hardDrawn) {
        return this.makeStoredResult(rule.id, { fieldKey: key, observed: 0, min: null, max: null, status: 'N/A' });
      }
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
        fieldKey: key,
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
      fieldKey?: string;
      observed: number;
      min: number | null;
      max: number | null;
      status: string;
    },
  ) {
    return {
      fieldKey: data.fieldKey,
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
        const categories = this.buildCategoriesForItem(batchTests, { ...item, grade: batch.grade || batch.gradeId });
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
                  fieldKey: (test as any).fieldKey ?? null,
                  observed: test.observed,
                  status: test.status,
                })),
              },
            ]
          : [],
      ),
    );

    const tcConfig = await (this.prisma as any).companyTcConfig.findUnique({
      where: { companyId: batch.companyId },
    });

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

    const categories = this.buildCategoriesForItem(batchTests, { ...qcTest.item, grade: qcTest.batch.grade || qcTest.batch.gradeId }).map(
      (category) => ({
        ...category,
        rules: category.rules.map((rule) => ({
          ...rule,
            results: qcTest.tests
              .filter((test) => test.rule.id === rule.id)
              .map((test) => ({
                id: test.id,
                fieldKey: (test as any).fieldKey ?? null,
                observed: test.observed,
                min: test.min,
                max: test.max,
              status: test.status,
            })),
        })),
      }),
    );
    const chemicalComposition =
      qcTest.batch.batchHits.find((entry) => entry.hit?.chemicalComposition)?.hit
        .chemicalComposition ?? null;
    const certificateSections = this.buildCertificateSections(
      {
        grade: qcTest.batch.grade,
        gradeId: qcTest.batch.gradeId,
      },
      qcTest.item,
      categories,
    );
    const chemicalRows = this.buildChemicalCertificateRows(
      categories,
      chemicalComposition,
      qcTest.batch.grade || qcTest.batch.gradeId,
    );
    const tcConfig = await (this.prisma as any).companyTcConfig.findUnique({
      where: { companyId: qcTest.batch.companyId },
    });

    return {
      id: qcTest.id,
      status: qcTest.status,
      createdAt: qcTest.createdAt,
      batch: {
        id: qcTest.batch.id,
        batchNumber: qcTest.batch.batchNumber,
        grade: qcTest.batch.grade,
        gradeId: qcTest.batch.gradeId,
        tubeType: (qcTest.batch as any).tubeType,
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
        pcs: (qcTest.item as any).pcs,
        condition: qcTest.item.condition,
        length: qcTest.item.length,
      },
      categories,
      certificateSections,
      tests: qcTest.tests.map((test) => ({
        id: test.id,
        fieldKey: (test as any).fieldKey ?? null,
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
      chemicalComposition,
      certificate: {
        chemicalRows,
        remarks: this.getCertificateRemark(),
      },
      tcConfig,
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

        const categories = this.buildCategoriesForItem(batchTests, { ...item, grade: batch.grade || batch.gradeId }).map((category) => ({
          ...category,
          rules: category.rules.map((rule) => ({
            ...rule,
            results: latestQc.tests
              .filter((test) => test.rule.id === rule.id)
              .map((test) => ({
                id: test.id,
                fieldKey: (test as any).fieldKey ?? null,
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
          pcs: (item as any).pcs,
          condition: item.condition,
          length: item.length,
          status: itemStatus,
          categories,
          certificateSections: this.buildCertificateSections(
            {
              grade: batch.grade,
              gradeId: batch.gradeId,
            },
            item,
            categories,
          ),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    if (items.length === 0) {
      throw new NotFoundException('No QC records available for this customer in selected batch');
    }

    const tcConfig = await (this.prisma as any).companyTcConfig.findUnique({
      where: { companyId: batch.companyId },
    });

    return {
      batch: {
        id: batch.id,
        batchNumber: batch.batchNumber,
        grade: batch.grade,
        gradeId: batch.gradeId,
        tubeType: (batch as any).tubeType,
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
      certificate: {
        chemicalRows: this.buildChemicalCertificateRows(
          items[0]?.categories ?? [],
          batch.batchHits.find((entry) => entry.hit?.chemicalComposition)?.hit
            ?.chemicalComposition ?? null,
          batch.grade || batch.gradeId,
        ),
        remarks: this.getCertificateRemark(),
      },
      tcConfig,
    };
  }

  private buildCertificateSections(
    batch: { grade?: string | null; gradeId?: string | null },
    item: {
      od: number;
      wt: number;
      length: number;
      condition: string;
    },
    categories: Array<{
      name: string;
      sequence: number;
      rules: Array<Record<string, unknown>>;
    }>,
  ): CertificateSections {
    const size = `OD ${item.od} x WT ${item.wt} x L ${item.length ?? '-'}`;
    const condition = item.condition ?? '-';
    const rows = categories.flatMap((category) =>
      category.rules.flatMap((rule) =>
        this.expandCertificateRuleRows(rule, category.name),
      ),
    );
    const findRow = (
      matcher: (row: ReturnType<typeof this.expandCertificateRuleRows>[number]) => boolean,
    ) => rows.find(matcher);
    const odRow = findRow(
      (row) => /\bod\b|outside diameter/i.test(row.test),
    );
    const wtRow = findRow(
      (row) => /\bwt\b|wall thickness|thickness/i.test(row.test),
    );
    const roundnessRow = findRow((row) => /round/i.test(row.test));
    const straightnessRow = findRow((row) => /straight/i.test(row.test));
    const lengthRow = findRow((row) => /\blength\b/i.test(row.test));

    const [odMin, odMax] = this.extractCertificateMinMax(odRow?.required ?? '');
    const [wtMin, wtMax] = this.extractCertificateMinMax(wtRow?.required ?? '');

    const dimensionRows: CertificateDimensionRow[] = [
      {
        sr: 1,
        size,
        condition,
        test: 'Outside Diameter',
        min: odMin,
        max: odMax,
        required: odRow?.required ?? '-',
        observed: this.formatCertificateValue(odRow?.observed ?? item.od),
        result: odRow?.result ?? '-',
      },
      {
        sr: 2,
        size,
        condition,
        test: 'Wall Thickness',
        min: wtMin,
        max: wtMax,
        required: wtRow?.required ?? '-',
        observed: this.formatCertificateValue(wtRow?.observed ?? item.wt),
        result: wtRow?.result ?? '-',
      },
      {
        sr: 3,
        size,
        condition,
        test: 'Roundness',
        min: this.extractCertificateMinMax(roundnessRow?.required ?? '')[0],
        max: this.extractCertificateMinMax(roundnessRow?.required ?? '')[1],
        required: roundnessRow?.required ?? '-',
        observed: this.formatCertificateValue(roundnessRow?.observed),
        result: roundnessRow?.result ?? '-',
      },
      {
        sr: 4,
        size,
        condition,
        test: 'Straightness',
        min: this.extractCertificateMinMax(straightnessRow?.required ?? '')[0],
        max: this.extractCertificateMinMax(straightnessRow?.required ?? '')[1],
        required: straightnessRow?.required ?? '-',
        observed: this.formatCertificateValue(straightnessRow?.observed),
        result: straightnessRow?.result ?? '-',
      },
      {
        sr: 5,
        size,
        condition,
        test: 'Length',
        min: this.extractCertificateMinMax(lengthRow?.required ?? '')[0],
        max: this.extractCertificateMinMax(lengthRow?.required ?? '')[1],
        required: lengthRow?.required ?? '-',
        observed: this.formatCertificateValue(lengthRow?.observed ?? item.length),
        result: lengthRow?.result ?? '-',
      },
    ];

    const mechanicalOrder = ['tensile', 'elongation', 'flattening', 'drift'];
    const mechanicalLabels: Record<string, string> = {
      tensile: 'Tensile',
      elongation: 'Elongation',
      flattening: 'Flattening',
      drift: 'Drift Expanding',
    };
    const mechanicalRows = rows
      .filter((row) => row.ruleType === 'MECHANICAL_PROPERTIES')
      .sort(
        (left, right) =>
          mechanicalOrder.findIndex((key) =>
            left.test.toLowerCase().includes(key),
          ) -
          mechanicalOrder.findIndex((key) =>
            right.test.toLowerCase().includes(key),
          ),
      )
      .map((row, index) => ({
        sr: index + 1,
        test:
          mechanicalLabels[
            mechanicalOrder.find((key) =>
              row.test.toLowerCase().includes(key),
            ) ?? 'tensile'
          ] ?? row.test,
        required:
          row.test.toLowerCase().includes('flatten') ||
          row.test.toLowerCase().includes('drift')
            ? 'Visual'
            : row.required,
        observed: row.observed,
        result: row.result,
      }));

    const metallurgicalCategoryNames = new Set(
      categories
        .filter((category) => /metall|metalog|microscopic/i.test(category.name))
        .map((category) => this.normalizeCertificateKey(category.name)),
    );
    const metallurgicalRows = rows
      .filter((row) => this.isMetallurgicalCertificateRow(row, metallurgicalCategoryNames))
      .filter((row) =>
        this.shouldIncludeMetallurgicalCertificateRow(
          row.test,
          batch.grade ?? batch.gradeId ?? null,
        ),
      )
      .filter(
        (row, index, list) =>
          list.findIndex(
            (candidate) =>
              candidate.test === row.test &&
              candidate.required === row.required &&
              candidate.observed === row.observed,
          ) === index,
      )
      .map((row, index) => ({
        sr: index + 1,
        test: this.getMetallurgicalCertificateLabel(row.test),
        required: row.required,
        observed: row.observed,
        result: row.result,
      }));
    mechanicalRows.push({
      sr: mechanicalRows.length + 1,
      test: 'Hardness Test',
      required: 'N/A',
      observed: this.formatCertificateValue(this.getCertificateHardnessValue(item)),
      result: 'PASS',
    });

    const ndtRows = rows
      .filter((row) =>
        /visual|surface|dent|scratch|clean|eddy|hydro|leak|pneumatic|defect/i.test(
          row.test,
        ),
      )
      .map((row, index) => ({
        sr: index + 1,
        test: row.test,
        required: row.required || 'As per standard',
        observed: row.observed,
        result: row.result,
      }));
    const certificateNdtRows =
      ndtRows.length > 0
        ? ndtRows
        : CERTIFICATE_DEFAULT_NDT_ROWS.map((row, index) => ({
            sr: index + 1,
            test: row.test,
            required: row.required,
            observed: row.observed,
            result: 'PASS',
          }));
    certificateNdtRows.push({
      sr: certificateNdtRows.length + 1,
      test: 'Pneumatic Test',
      required: 'N/A',
      observed: 'N/A',
      result: '-',
    });

    return {
      dimensionRows,
      mechanicalRows,
      metallurgicalRows,
      ndtRows: certificateNdtRows,
      remarks: this.getCertificateRemark(),
    };
  }

  private buildChemicalCertificateRows(
    categories: Array<{ name: string; sequence: number; rules: Array<Record<string, unknown>> }>,
    chemicalComposition: unknown,
    gradeKey?: string | null,
  ): CertificateChemicalRow[] {
    const chemicalRule = categories
      .flatMap((category) => category.rules)
      .find(
        (rule) =>
          String((rule as any).ruleType ?? '').toUpperCase() ===
          RuleType.CHEMICAL_COMPOSITION,
      ) as Record<string, any> | undefined;

    const entries = chemicalComposition && typeof chemicalComposition === 'object'
      ? (chemicalComposition as Record<string, unknown>)
      : {};

    const normalizedEntryMap = new Map<string, unknown>();
    Object.entries(entries).forEach(([key, value]) => {
      normalizedEntryMap.set(this.normalizeCertificateKey(key), value);
    });

    const ruleConfig = chemicalRule?.parameter?.ruleDefinition?.ruleConfig ??
      chemicalRule?.ruleDefinition?.ruleConfig ??
      {};
    const migratedColumns = Array.isArray(ruleConfig.columns)
      ? ruleConfig.columns
      : [
          { id: 'cuAgMin', name: 'Cu + Ag', type: 'MIN' },
          { id: 'pMin', name: 'P', type: 'MIN' },
          { id: 'pMax', name: 'P', type: 'MAX' },
          { id: 'oMax', name: 'O', type: 'MAX' },
        ];
    const migratedGrades = Array.isArray(ruleConfig.grades)
      ? ruleConfig.grades
      : [];
    const gradeRule = migratedGrades.find(
      (entry: any) =>
        String(entry?.key ?? '').trim().toLowerCase() ===
        String(gradeKey ?? '').trim().toLowerCase(),
    );

    const grouped = new Map<
      string,
      { element: string; requiredMin: string; requiredMax: string; observed: string }
    >();

    migratedColumns.forEach((column: any) => {
      const element = String(column?.name ?? '').trim();
      if (!element) {
        return;
      }

      const columnObserved = this.formatCertificateValue(
        normalizedEntryMap.get(this.normalizeCertificateKey(column?.id)) ??
          normalizedEntryMap.get(this.normalizeCertificateKey(element)),
      );

      const existing = grouped.get(element) ?? {
        element,
        requiredMin: '-',
        requiredMax: '-',
        observed: columnObserved,
      };

      if ((existing.observed === '-' || existing.observed === '') && columnObserved !== '-') {
        existing.observed = columnObserved;
      }

      const configuredValue = gradeRule?.values?.[column.id];
      if (column.type === 'MIN') {
        existing.requiredMin = this.formatCertificateValue(configuredValue);
      }
      if (column.type === 'MAX') {
        existing.requiredMax = this.formatCertificateValue(configuredValue);
      }

      grouped.set(element, existing);
    });

    Object.entries(entries).forEach(([key, value]) => {
      const element = this.toCertificateDisplayName(key);
      const normalizedElement = this.normalizeCertificateKey(element);
      const existingEntry = [...grouped.entries()].find(
        ([groupKey]) => this.normalizeCertificateKey(groupKey) === normalizedElement,
      );

      if (!existingEntry) {
        grouped.set(element, {
          element,
          requiredMin: '-',
          requiredMax: '-',
          observed: this.formatCertificateValue(value),
        });
      } else {
        const [, groupedValue] = existingEntry;
        if (groupedValue.observed === '-' || groupedValue.observed === '') {
          groupedValue.observed = this.formatCertificateValue(value);
        }
      }
    });

    return [...grouped.values()]
      .filter((row) => row.observed !== '-')
      .map((row, index) => ({
        sr: index + 1,
        element: row.element,
        requiredMin: row.requiredMin,
        requiredMax: row.requiredMax,
        observed: row.observed,
        result: this.resolveChemicalResult(
          row.requiredMin,
          row.requiredMax,
          row.observed,
        ),
      }));
  }

  private expandCertificateRuleRows(rule: Record<string, any>, categoryName: string) {
    const ruleType = String(rule.ruleType ?? rule.ruleDefinition?.ruleType ?? '');
    const config = (rule.parameter?.ruleDefinition?.ruleConfig ??
      rule.ruleDefinition?.ruleConfig ??
      {}) as Record<string, any>;
    const results = Array.isArray(rule.results) ? rule.results : [];
    const resultByFieldKey = new Map(
      results.map((result: any) => [String(result.fieldKey ?? ''), result]),
    );

    if (results[0]?.status === 'N/A') {
      return [{
        categoryName,
        ruleType,
        test: String(rule.contextLabel ?? rule.name),
        required: 'N/A',
        observed: 'N/A',
        result: 'N/A',
      }];
    }

    if (ruleType === RuleType.MECHANICAL_PROPERTIES) {
      const keys = [
        { key: 'tensile', label: 'Tensile' },
        { key: 'elongation', label: 'Elongation' },
        ...(config.flatteningRequired ? [{ key: 'flattening', label: 'Flattening' }] : []),
        ...(config.driftRequired ? [{ key: 'drift', label: 'Drift Expanding' }] : []),
      ];

      return keys.map((entry) => {
        const result = this.resolveMechanicalResultForKey(
          entry.key,
          results,
          resultByFieldKey,
        );
        return {
          categoryName,
          ruleType,
          test: entry.label,
          required: result?.status === 'N/A' ? 'N/A' : this.getCertificateSpecText(rule, result, entry.label),
          observed:
            result?.status === 'N/A' ? 'N/A' : entry.key === 'flattening' || entry.key === 'drift'
              ? Number(result?.observed) === 1
              ? 'Yes'
              : 'No'
              : this.formatCertificateValue(result?.observed),
          result: result?.status ?? 'PENDING',
        };
      });
    }

    if (ruleType === RuleType.GENERIC_CONDITION) {
      return (config.fields ?? []).map((field: any, index: number) => {
        const result =
          resultByFieldKey.get(String(field.name ?? '')) ??
          results[index] ??
          null;
        return {
          categoryName,
          ruleType,
          test: field.label || field.name,
          required: this.getCertificateSpecText(rule, result, field.name),
          observed: this.formatCertificateValue(result?.observed),
          result: result?.status ?? 'PENDING',
        };
      });
    }

    if (ruleType === RuleType.TEXT_BOOLEAN) {
      return [
        {
          categoryName,
          ruleType,
          test: String(rule.contextLabel ?? rule.name),
          required: this.getCertificateSpecText(rule, results[0]),
          observed: Number(results[0]?.observed) === 1 ? 'Yes' : 'No',
          result: results[0]?.status ?? 'PENDING',
        },
      ];
    }

    return [
      {
        categoryName,
        ruleType,
        test: String(rule.contextLabel ?? rule.name),
        required: this.getCertificateSpecText(rule, results[0]),
        observed: this.formatCertificateValue(results[0]?.observed),
        result: results[0]?.status ?? 'PENDING',
      },
    ];
  }

  private getCertificateSpecText(
    rule: Record<string, any>,
    result?: { min: number | null; max: number | null },
    fieldName?: string,
  ) {
    const min = result?.min ?? rule.spec?.min ?? rule.min ?? null;
    const max = result?.max ?? rule.spec?.max ?? rule.max ?? null;
    const expectedValue = rule.spec?.expectedValue ?? rule.expectedValue ?? null;

    if (fieldName) {
      const parts = [
        min != null ? `Min: ${min}` : null,
        max != null ? `Max: ${max}` : null,
      ].filter(Boolean);
      return parts.join(' | ') || 'Configured';
    }

    if (min != null && max != null) {
      return `Min: ${min} | Max: ${max}`;
    }
    if (min != null) {
      return `Min: ${min}`;
    }
    if (max != null) {
      return `Max: ${max}`;
    }
    if (expectedValue != null && expectedValue !== '') {
      const normalizedExpected = String(expectedValue).trim().toLowerCase();
      if (normalizedExpected === 'true' || normalizedExpected === 'false') {
        return 'Visual';
      }
      return `Expected: ${expectedValue}`;
    }
    return 'Configured';
  }

  private resolveMechanicalResultForKey(
    key: string,
    results: Array<any>,
    resultByFieldKey: Map<string, any>,
  ) {
    const keyed =
      resultByFieldKey.get(key) ??
      results.find((candidate: any) => candidate.fieldKey === key);
    if (keyed) {
      return keyed;
    }

    const numericRows = results.filter(
      (candidate: any) =>
        Number.isFinite(candidate?.observed) &&
        (candidate?.min !== null || candidate?.max !== null),
    );
    const booleanRows = results.filter((candidate: any) => {
      const observed = Number(candidate?.observed);
      return observed === 0 || observed === 1;
    });

    if (key === 'tensile') {
      return (
        numericRows.find(
          (candidate: any) => candidate?.min !== null && candidate?.max !== null,
        ) ??
        numericRows[0] ??
        null
      );
    }

    if (key === 'elongation') {
      return (
        numericRows.find(
          (candidate: any) => candidate?.min !== null && candidate?.max === null,
        ) ??
        numericRows.find(
          (candidate: any) => candidate?.min === null && candidate?.max !== null,
        ) ??
        numericRows[1] ??
        null
      );
    }

    if (key === 'flattening') {
      return booleanRows[0] ?? null;
    }

    if (key === 'drift') {
      return booleanRows[1] ?? booleanRows[0] ?? null;
    }

    return null;
  }

  private extractCertificateMinMax(spec: string) {
    const minMatch = spec.match(/Min:\s*([^\s|]+)/i);
    const maxMatch = spec.match(/Max:\s*([^\s|]+)/i);
    return [minMatch?.[1] ?? '-', maxMatch?.[1] ?? '-'];
  }

  private getCertificateRemark() {
    return 'Test specimen of tubes shall not show any gassing or open grain structure.';
  }

  private resolveChemicalResult(
    requiredMin: string,
    requiredMax: string,
    observed: string,
  ) {
    const observedValue = Number(observed);
    if (!Number.isFinite(observedValue)) {
      return '-';
    }

    const minValue = Number(requiredMin);
    const maxValue = Number(requiredMax);
    const hasMin = requiredMin !== '-' && Number.isFinite(minValue);
    const hasMax = requiredMax !== '-' && Number.isFinite(maxValue);

    if (!hasMin && !hasMax) {
      return '-';
    }

    if (hasMin && observedValue < minValue) {
      return 'FAIL';
    }

    if (hasMax && observedValue > maxValue) {
      return 'FAIL';
    }

    return 'PASS';
  }

  private formatCertificateValue(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return String(value);
  }

  private getMetallurgicalCertificateLabel(test: string) {
    const normalized = String(test ?? '').trim().toLowerCase();

    if (normalized.includes('grai size') || normalized.includes('grain size')) {
      return 'Microscopic Examinations(Grain Size)';
    }
    if (normalized.includes('gassing') || normalized.includes('open grain')) {
      return 'Hydrogen Embrittlement';
    }
    if (normalized.includes('residue remaining after evaporation of the solvent')) {
      return 'Residue Test';
    }

    return test;
  }

  private shouldIncludeMetallurgicalCertificateRow(
    test: string,
    gradeKey?: string | null,
  ) {
    const normalizedTest = String(test ?? '').trim().toLowerCase();

    if (
      normalizedTest.includes('gassing') ||
      normalizedTest.includes('open grain') ||
      normalizedTest.includes('hydrogen embrittlement')
    ) {
      return this.isCuOfcGrade(gradeKey);
    }

    return true;
  }

  private isCuOfcGrade(gradeKey?: string | null) {
    const normalized = String(gradeKey ?? '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');

    return ['of', 'cuof', 'ofc', 'cuofc'].includes(normalized);
  }

  private getCertificateHardnessValue(item: {
    od: number;
    wt: number;
    length: number;
    condition: string;
  }) {
    const seedSource = `${item.od}|${item.wt}|${item.length}|${item.condition ?? ''}`;
    const seed = seedSource.split('').reduce((total, char) => total + char.charCodeAt(0), 0);
    return seed % 131;
  }

  private isMetallurgicalCertificateRow(
    row: ReturnType<typeof this.expandCertificateRuleRows>[number],
    categoryNames: Set<string>,
  ) {
    const normalizedCategory = this.normalizeCertificateKey(row.categoryName);
    const normalizedTest = String(row.test ?? '').trim().toLowerCase();

    if (categoryNames.has(normalizedCategory)) {
      return true;
    }

    return /grain|microscopic|metallurgical|metalog|residue|solvent|gassing|open grain/i.test(
      normalizedTest,
    );
  }

  private normalizeCertificateKey(value: string) {
    return String(value).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private toCertificateDisplayName(key: string) {
    const normalized = this.normalizeCertificateKey(key);
    if (normalized === 'p' || normalized === 'pmin' || normalized === 'pmax') {
      return 'P';
    }
    if (normalized === 'o' || normalized === 'omax') {
      return 'O';
    }
    if (normalized === 'cuag' || normalized === 'cuagmin') {
      return 'Cu + Ag';
    }
    return key;
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
      grade?: string;
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

  private buildCategoriesForItem(batchTests: Array<any>, item: { od: number; wt: number; length: number; condition: string; grade?: string }) {
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

  private buildApplicableRules(batchTests: Array<any>, item: { od: number; wt: number; length: number; condition: string; grade?: string }) {
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
    item: { od: number; wt: number; length: number; condition: string; grade?: string },
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
      elongationRequired: ruleType === RuleType.MECHANICAL_PROPERTIES
        ? String(item.condition ?? '').trim().toLowerCase().replace(/[^a-z]/g, '') !== 'harddrawn'
        : undefined,
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

  private isApplicableToItem(parameter: any, item: { condition: string; grade?: string }) {
    const ruleDefinition = parameter.ruleDefinition;
    const statement = ruleDefinition?.ruleConfig?.statement ?? '';
    if (/hydrogen|gassing|open\s+grain/i.test(`${parameter.name} ${statement}`)) {
      return this.isCuOfcGrade(item.grade);
    }
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

  private resolveSpec(parameter: any, item: { od: number; wt: number; length: number; condition: string; grade?: string }) {
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
    item: { od: number; wt: number; length: number; condition: string; grade?: string },
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
