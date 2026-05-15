import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';

type ExcelQcData = {
  id: string;
  batch: {
    batchNumber: string;
    grade?: string;
    gradeId?: string;
  };
  customer: {
    name: string;
  };
  item: {
    od: number;
    wt: number;
    length?: number;
    condition?: string;
  };
  categories: Array<{
    name: string;
    rules: Array<Record<string, any>>;
  }>;
  chemicalComposition?: unknown;
};

type ExcelCustomerTcData = {
  batch: {
    batchNumber: string;
    grade?: string;
    gradeId?: string;
  };
  customer: {
    name: string;
  };
  items: Array<{
    od: number;
    wt: number;
    length?: number;
    condition?: string;
    categories: Array<{
      name: string;
      rules: Array<Record<string, any>>;
    }>;
  }>;
  chemicalComposition?: unknown;
};

@Injectable()
export class ExcelService {
  async generateQCReport(qcData: ExcelQcData): Promise<Buffer> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Test Certificate');

    sheet.addRow(['Company Name', 'Hindalco Industries Ltd']);
    sheet.addRow(['TEST CERTIFICATE']);
    sheet.addRow(['Batch Number', qcData.batch.batchNumber]);
    sheet.addRow(['Grade', qcData.batch.grade || qcData.batch.gradeId || '-']);
    sheet.addRow([]);

    const chemicalHeaderRow = sheet.addRow(['Element', 'Observed']);
    this.styleHeaderRow(chemicalHeaderRow);
    this.applyBorders(chemicalHeaderRow);

    for (const entry of this.getChemicalEntries(qcData.chemicalComposition)) {
      const row = sheet.addRow([entry.element, entry.value]);
      this.applyBorders(row);
    }

    sheet.addRow([]);
    const customerRow = sheet.addRow(['Customer Name', qcData.customer.name]);
    customerRow.font = { bold: true };
    this.applyBorders(customerRow);

    const itemHeaderRow = sheet.addRow(['OD', 'WT', 'Length', 'Condition']);
    this.styleHeaderRow(itemHeaderRow);
    this.applyBorders(itemHeaderRow);

    const itemRow = sheet.addRow([
      qcData.item.od,
      qcData.item.wt,
      qcData.item.length ?? '-',
      qcData.item.condition ?? '-',
    ]);
    this.applyBorders(itemRow);

    sheet.addRow([]);

    const resultHeaderRow = sheet.addRow([
      'Category',
      'Test',
      'Specification',
      'Observed',
      'Result',
    ]);
    this.styleHeaderRow(resultHeaderRow);
    this.applyBorders(resultHeaderRow);

    for (const category of qcData.categories) {
      for (const rowData of category.rules.flatMap((rule) => this.expandRuleRows(rule))) {
        const row = sheet.addRow([
          category.name,
          rowData.name,
          rowData.spec,
          rowData.observed,
          rowData.status,
        ]);
        this.applyBorders(row);
        row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
        row.getCell(5).font = { bold: true };
        if (rowData.status === 'PASS') {
          row.getCell(5).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFC6EFCE' },
          };
        } else if (rowData.status === 'FAIL') {
          row.getCell(5).fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FFFFC7CE' },
          };
        }
      }
    }

    this.autoFitColumns(sheet);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async generateCustomerQCReport(tcData: ExcelCustomerTcData): Promise<Buffer> {
    const workbook = new Workbook();
    const sheet = workbook.addWorksheet('Test Certificate');

    sheet.addRow(['Company Name', 'Hindalco Industries Ltd']);
    sheet.addRow(['TEST CERTIFICATE']);
    sheet.addRow(['Batch Number', tcData.batch.batchNumber]);
    sheet.addRow(['Grade', tcData.batch.grade || tcData.batch.gradeId || '-']);
    sheet.addRow(['Customer Name', tcData.customer.name]);
    sheet.addRow([]);

    const chemicalHeaderRow = sheet.addRow(['Element', 'Observed']);
    this.styleHeaderRow(chemicalHeaderRow);
    this.applyBorders(chemicalHeaderRow);

    for (const entry of this.getChemicalEntries(tcData.chemicalComposition)) {
      const row = sheet.addRow([entry.element, entry.value]);
      this.applyBorders(row);
    }

    sheet.addRow([]);

    for (const [index, item] of tcData.items.entries()) {
      const itemTitle = sheet.addRow([`Item ${index + 1}`]);
      itemTitle.font = { bold: true };
      const itemHeaderRow = sheet.addRow(['OD', 'WT', 'Length', 'Condition']);
      this.styleHeaderRow(itemHeaderRow);
      this.applyBorders(itemHeaderRow);

      const itemRow = sheet.addRow([
        item.od,
        item.wt,
        item.length ?? '-',
        item.condition ?? '-',
      ]);
      this.applyBorders(itemRow);
      sheet.addRow([]);

      const resultHeaderRow = sheet.addRow([
        'Category',
        'Test',
        'Specification',
        'Observed',
        'Result',
      ]);
      this.styleHeaderRow(resultHeaderRow);
      this.applyBorders(resultHeaderRow);

      for (const category of item.categories) {
        for (const rowData of category.rules.flatMap((rule) => this.expandRuleRows(rule))) {
          const row = sheet.addRow([
            category.name,
            rowData.name,
            rowData.spec,
            rowData.observed,
            rowData.status,
          ]);
          this.applyBorders(row);
          row.getCell(5).alignment = { horizontal: 'center', vertical: 'middle' };
          row.getCell(5).font = { bold: true };
          if (rowData.status === 'PASS') {
            row.getCell(5).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFC6EFCE' },
            };
          } else if (rowData.status === 'FAIL') {
            row.getCell(5).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFFFC7CE' },
            };
          }
        }
      }

      sheet.addRow([]);
    }

    this.autoFitColumns(sheet);
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  private styleHeaderRow(row: any) {
    row.font = { bold: true };
    row.alignment = { horizontal: 'center', vertical: 'middle' };
  }

  private applyBorders(row: any) {
    row.eachCell((cell: any) => {
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
  }

  private autoFitColumns(sheet: any) {
    sheet.columns.forEach((column: any) => {
      let maxLength = 10;
      column.eachCell({ includeEmpty: true }, (cell: any) => {
        const value = cell.value == null ? '' : String(cell.value);
        maxLength = Math.max(maxLength, value.length + 2);
      });
      column.width = maxLength;
    });
  }

  private getChemicalEntries(chemicalComposition: unknown) {
    if (!chemicalComposition || typeof chemicalComposition !== 'object') {
      return [];
    }

    return Object.entries(chemicalComposition as Record<string, unknown>).map(
      ([element, value]) => ({
        element,
        value:
          value === null || value === undefined || value === ''
            ? '-'
            : String(value),
      }),
    );
  }

  private expandRuleRows(rule: any) {
    const ruleType = rule.ruleDefinition?.ruleType ?? '';
    const config = (rule.ruleDefinition?.ruleConfig ?? {}) as Record<string, any>;
    const results = rule.results ?? [];

    if (ruleType === 'MECHANICAL_PROPERTIES') {
      const keys = [
        { key: 'tensile', label: 'Tensile' },
        { key: 'elongation', label: 'Elongation' },
        ...(config.flatteningRequired ? [{ key: 'flattening', label: 'Flattening' }] : []),
        ...(config.driftRequired ? [{ key: 'drift', label: 'Drift' }] : []),
      ];

      return keys.map((entry, index) => ({
        name: `${rule.contextLabel ?? rule.name} - ${entry.label}`,
        observed:
          entry.key === 'flattening' || entry.key === 'drift'
            ? Number(results[index]?.observed) === 1
              ? 'Yes'
              : 'No'
            : results[index]?.observed ?? '-',
        spec: this.getSpecText(rule, results[index]),
        status: results[index]?.status ?? 'PENDING',
      }));
    }

    if (ruleType === 'GENERIC_CONDITION') {
      const fields = Array.isArray(config.fields) ? config.fields : [];
      return fields.map((field: any, index: number) => ({
        name: field.label || field.name,
        observed: results[index]?.observed ?? '-',
        spec: this.getSpecText(rule, results[index]),
        status: results[index]?.status ?? 'PENDING',
      }));
    }

    if (ruleType === 'TEXT_BOOLEAN') {
      return [
        {
          name: rule.contextLabel ?? rule.name,
          observed: Number(results[0]?.observed) === 1 ? 'Yes' : 'No',
          spec: this.getSpecText(rule, results[0]),
          status: results[0]?.status ?? 'PENDING',
        },
      ];
    }

    return [
      {
        name: rule.contextLabel ?? rule.name,
        observed: results[0]?.observed ?? '-',
        spec: this.getSpecText(rule, results[0]),
        status: results[0]?.status ?? 'PENDING',
      },
    ];
  }

  private getSpecText(rule: any, result?: { min: number | null; max: number | null }) {
    const min = result?.min ?? rule.spec?.min ?? rule.min ?? null;
    const max = result?.max ?? rule.spec?.max ?? rule.max ?? null;
    const expectedValue = rule.spec?.expectedValue ?? rule.expectedValue ?? null;

    if (min != null && max != null) {
      return `Min ${min} - Max ${max}`;
    }

    if (min != null) {
      return `Min ${min}`;
    }

    if (max != null) {
      return `Max ${max}`;
    }

    if (expectedValue != null && expectedValue !== '') {
      return `Expected ${expectedValue}`;
    }

    return '';
  }
}
