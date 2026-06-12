import { Injectable } from '@nestjs/common';
import { Workbook, type Worksheet } from 'exceljs';
import {
  CERTIFICATE_COMPANY_NAME,
  CERTIFICATE_COMPANY_SUBTITLE,
  CERTIFICATE_COMPANY_TAGLINE,
  CERTIFICATE_DEFAULT_NDT_ROWS,
  CERTIFICATE_DEFAULT_REMARK,
  CERTIFICATE_SECTION_TITLES,
  CERTIFICATE_TITLE,
} from '../certificate/certificate.constants';
import type {
  CategoryShape,
  CertificateChemicalRow,
  CertificateDimensionRow,
  CertificateItem,
  CertificateSections,
  CertificateTableRow,
} from '../certificate/certificate.types';

type ExcelQcData = {
  id: string;
  status?: string;
  batch: {
    batchNumber: string;
    grade?: string;
    gradeId?: string;
  };
  customer: {
    name: string;
  };
  item: Omit<CertificateItem, 'status' | 'categories' | 'certificateSections'>;
  categories: CategoryShape[];
  chemicalComposition?: unknown;
  certificateSections?: CertificateSections;
  certificate?: {
    chemicalRows: CertificateChemicalRow[];
    remarks: string;
  };
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
  items: CertificateItem[];
  chemicalComposition?: unknown;
  certificate?: {
    chemicalRows: CertificateChemicalRow[];
    remarks: string;
  };
};

@Injectable()
export class ExcelService {
  private readonly sectionFill = 'FFF6ECA2';
  private readonly headerFill = 'FFF7F7F7';
  private readonly passFill = 'FFC6EFCE';
  private readonly failFill = 'FFFFC7CE';
  private readonly border = {
    top: { style: 'thin' as const },
    left: { style: 'thin' as const },
    bottom: { style: 'thin' as const },
    right: { style: 'thin' as const },
  };

  async generateQCReport(qcData: ExcelQcData): Promise<Buffer> {
    const workbook = this.createWorkbook();
    const sheet = workbook.addWorksheet('Test Certificate', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
      views: [{ showGridLines: false }],
    });

    this.configureSheet(sheet);
    this.renderCertificateSheet(sheet, {
      batchNumber: qcData.batch.batchNumber,
      grade: qcData.batch.grade || qcData.batch.gradeId || '-',
      customer: qcData.customer.name,
      overallStatus: qcData.status || 'PASS',
      chemicalRows: qcData.certificate?.chemicalRows ?? [],
      remarks: qcData.certificateSections?.remarks ?? qcData.certificate?.remarks ?? '',
      items: [
        {
          ...qcData.item,
          status: qcData.status || 'PASS',
          categories: qcData.categories,
          certificateSections: qcData.certificateSections,
        },
      ],
    });

    return Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
  }

  async generateCustomerQCReport(tcData: ExcelCustomerTcData): Promise<Buffer> {
    const workbook = this.createWorkbook();
    const sheet = workbook.addWorksheet('Test Certificate', {
      pageSetup: { paperSize: 9, orientation: 'portrait', fitToPage: true, fitToWidth: 1 },
      views: [{ showGridLines: false }],
    });

    this.configureSheet(sheet);
    this.renderCertificateSheet(sheet, {
      batchNumber: tcData.batch.batchNumber,
      grade: tcData.batch.grade || tcData.batch.gradeId || '-',
      customer: tcData.customer.name,
      overallStatus: tcData.items.some((item) => item.status === 'FAIL') ? 'FAIL' : 'PASS',
      chemicalRows: tcData.certificate?.chemicalRows ?? [],
      remarks: tcData.certificate?.remarks ?? tcData.items[0]?.certificateSections?.remarks ?? '',
      items: tcData.items,
    });

    return Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
  }

  private createWorkbook() {
    const workbook = new Workbook();
    workbook.creator = 'QC System';
    workbook.company = CERTIFICATE_COMPANY_NAME;
    workbook.created = new Date();
    return workbook;
  }

  private configureSheet(sheet: Worksheet) {
    sheet.columns = [
      { width: 6 },
      { width: 18 },
      { width: 14 },
      { width: 14 },
      { width: 16 },
      { width: 16 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
      { width: 14 },
    ];
    sheet.pageSetup.margins = {
      left: 0.35,
      right: 0.35,
      top: 0.4,
      bottom: 0.4,
      header: 0.2,
      footer: 0.2,
    };
  }

  private renderCertificateSheet(
    sheet: Worksheet,
    data: {
      batchNumber: string;
      grade: string;
      customer: string;
      overallStatus: string;
      chemicalRows: CertificateChemicalRow[];
      remarks: string;
      items: Array<{
        od: number;
        wt: number;
        qty?: number;
        length?: number;
        condition?: string;
        status: string;
        categories: CategoryShape[];
        certificateSections?: CertificateSections;
      }>;
    },
  ) {
    let row = 1;
    row = this.renderHeader(sheet, row);
    row = this.renderInfoGrid(sheet, row, data);
    row = this.renderChemicalSection(sheet, row, data.chemicalRows);

    data.items.forEach((item, index) => {
      row = this.renderItemSummary(sheet, row, item, index + 1);
      row = this.renderDimensionSection(sheet, row, item.certificateSections?.dimensionRows ?? []);
      row = this.renderTestSection(sheet, row, CERTIFICATE_SECTION_TITLES.mechanical, item.certificateSections?.mechanicalRows ?? []);
      row = this.renderTestSection(sheet, row, CERTIFICATE_SECTION_TITLES.metallurgical, item.certificateSections?.metallurgicalRows ?? [], true);
      row = this.renderNdtSection(sheet, row, this.extractVisualRows(item.categories));
    });

    row = this.renderRemarks(sheet, row, data.overallStatus, data.remarks);
    this.renderSignatureSection(sheet, row);
  }

  private renderHeader(sheet: Worksheet, row: number) {
    this.mergeAndBorder(sheet, `A${row}:B${row + 2}`);
    this.mergeAndBorder(sheet, `C${row}:J${row + 2}`);
    this.mergeAndBorder(sheet, `K${row}:L${row + 2}`);
    this.setValue(sheet, `A${row}`, 'LOGO', { bold: true, align: 'center', valign: 'middle' });
    this.setValue(sheet, `C${row}`, CERTIFICATE_COMPANY_NAME, {
      bold: true,
      size: 14,
      align: 'center',
    });
    this.setValue(sheet, `C${row + 1}`, CERTIFICATE_COMPANY_SUBTITLE, { align: 'center' });
    this.setValue(sheet, `C${row + 2}`, CERTIFICATE_COMPANY_TAGLINE, { align: 'center' });
    this.setValue(sheet, `K${row + 1}`, 'ISO / RoHS', { bold: true, align: 'center' });

    this.mergeAndBorder(sheet, `A${row + 4}:L${row + 4}`);
    this.setValue(sheet, `A${row + 4}`, CERTIFICATE_TITLE, {
      bold: true,
      size: 16,
      align: 'center',
      underline: true,
    });
    sheet.getRow(row + 4).height = 24;
    return row + 6;
  }

  private renderInfoGrid(
    sheet: Worksheet,
    row: number,
    data: { batchNumber: string; grade: string; customer: string },
  ) {
    const rows = [
      ['TC NO', `QC-${data.batchNumber}`, 'DATE', new Date().toLocaleDateString()],
      ['M/S.', data.customer || '-', 'P.O. / INV.', '-'],
      ['PRODUCT', 'WROUGHT COPPER TUBES FOR REFRIGERATION AND AIR CONDITIONING PURPOSES', 'BATCH NO.', data.batchNumber],
      ['SPECIFICATION', 'IS 10773:2025', 'GRADE', data.grade || '-'],
    ];

    rows.forEach((values, index) => {
      const currentRow = row + index;
      this.writeGridRow(sheet, currentRow, values, [1, 3, 7, 9], [2, 6, 8, 12], index === 2 ? 24 : 18);
      if (index === 2) {
        sheet.getCell(`B${currentRow}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      }
    });

    return row + 5;
  }

  private renderChemicalSection(sheet: Worksheet, row: number, rows: CertificateChemicalRow[]) {
    row = this.renderSectionHeader(sheet, row, CERTIFICATE_SECTION_TITLES.chemical);
    const headerRow = row;
    this.writeTableRow(sheet, headerRow, ['SR', 'ELEMENT', 'MIN', 'MAX', 'OBSERVED', 'RESULT'], ['A', 'B', 'D', 'F', 'H', 'J'], [1, 3, 5, 7, 9, 11], true);
    const safeRows = rows.length ? rows : [{ sr: 1, element: '-', requiredMin: '-', requiredMax: '-', observed: '-', result: '-' }];

    safeRows.forEach((entry, index) => {
      const currentRow = headerRow + 1 + index;
      this.writeTableRow(
        sheet,
        currentRow,
        [String(entry.sr), entry.element, entry.requiredMin, entry.requiredMax, entry.observed, entry.result],
        ['A', 'B', 'D', 'F', 'H', 'J'],
        [1, 3, 5, 7, 9, 11],
      );
      this.colorResultCell(sheet.getCell(`J${currentRow}`), entry.result);
    });

    return headerRow + safeRows.length + 2;
  }

  private renderItemSummary(
    sheet: Worksheet,
    row: number,
    item: { od: number; wt: number; qty?: number; length?: number; condition?: string; status: string },
    index: number,
  ) {
    this.writeGridRow(
      sheet,
      row,
      ['ITEM', String(index), 'SIZE', `${item.od} x ${item.wt} x ${item.length ?? '-'}`, '', ''],
      [1, 2, 6, 8, 11, 12],
      [1, 5, 7, 10, 11, 12],
      18,
    );
    this.writeGridRow(
      sheet,
      row + 1,
      ['CONDITION', item.condition ?? '-', 'QTY', item.qty != null ? String(item.qty) : '-', 'STATUS', item.status],
      [1, 2, 6, 8, 11, 12],
      [1, 5, 7, 10, 11, 12],
      18,
    );
    this.colorResultCell(sheet.getCell(`L${row + 1}`), item.status);
    return row + 3;
  }

  private renderDimensionSection(sheet: Worksheet, row: number, rows: CertificateDimensionRow[]) {
    row = this.renderSectionHeader(sheet, row, CERTIFICATE_SECTION_TITLES.dimension);
    const headerRow = row;
    this.writeTableRow(sheet, headerRow, ['SR', 'TEST', 'MIN', 'MAX', 'OBSERVED', 'RESULT'], ['A', 'B', 'E', 'G', 'I', 'K'], [1, 4, 6, 8, 10, 12], true);
    const safeRows = rows.length ? rows : [{ sr: 1, test: 'Outside Diameter', min: '-', max: '-', observed: '-', result: '-', required: '-', size: '-', condition: '-' }];

    safeRows.forEach((entry, index) => {
      const currentRow = headerRow + 1 + index;
      this.writeTableRow(
        sheet,
        currentRow,
        [String(entry.sr), entry.test, entry.min, entry.max, entry.observed, entry.result],
        ['A', 'B', 'E', 'G', 'I', 'K'],
        [1, 4, 6, 8, 10, 12],
      );
      this.colorResultCell(sheet.getCell(`K${currentRow}`), entry.result);
    });

    return headerRow + safeRows.length + 2;
  }

  private renderTestSection(
    sheet: Worksheet,
    row: number,
    title: string,
    rows: CertificateTableRow[],
    tall = false,
  ) {
    row = this.renderSectionHeader(sheet, row, title);
    const headerRow = row;
    this.writeTableRow(sheet, headerRow, ['SR', 'TEST', 'REQUIRED', 'OBSERVED', 'RESULT'], ['A', 'B', 'F', 'I', 'K'], [1, 5, 8, 10, 12], true);
    const safeRows = rows.length ? rows : [{ sr: 1, test: '-', required: '-', observed: '-', result: '-' }];

    safeRows.forEach((entry, index) => {
      const currentRow = headerRow + 1 + index;
      this.writeTableRow(
        sheet,
        currentRow,
        [String(entry.sr), entry.test, entry.required, entry.observed, entry.result],
        ['A', 'B', 'F', 'I', 'K'],
        [1, 5, 8, 10, 12],
      );
      sheet.getRow(currentRow).height = tall ? 24 : 18;
      sheet.getCell(`B${currentRow}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: tall };
      sheet.getCell(`F${currentRow}`).alignment = { vertical: 'middle', horizontal: 'left', wrapText: tall };
      this.colorResultCell(sheet.getCell(`K${currentRow}`), entry.result);
    });

    return headerRow + safeRows.length + 2;
  }

  private renderNdtSection(sheet: Worksheet, row: number, rows: Array<{ test: string; required: string; observed: string }>) {
    row = this.renderSectionHeader(sheet, row, CERTIFICATE_SECTION_TITLES.ndt);
    const headerRow = row;
    this.writeTableRow(sheet, headerRow, ['SR', 'TEST', 'REQUIRED', 'OBSERVED'], ['A', 'B', 'G', 'J'], [1, 6, 9, 12], true);
    const safeRows = rows.length ? rows : [{ test: '-', required: '-', observed: '-' }];

    safeRows.forEach((entry, index) => {
      const currentRow = headerRow + 1 + index;
      this.writeTableRow(
        sheet,
        currentRow,
        [String(index + 1), entry.test, entry.required, entry.observed],
        ['A', 'B', 'G', 'J'],
        [1, 6, 9, 12],
      );
      sheet.getRow(currentRow).height = 18;
    });

    return headerRow + safeRows.length + 2;
  }

  private renderRemarks(sheet: Worksheet, row: number, status: string, remarks: string) {
    row = this.renderSectionHeader(sheet, row, CERTIFICATE_SECTION_TITLES.remarks);
    this.mergeAndBorder(sheet, `A${row}:K${row}`);
    this.mergeAndBorder(sheet, `L${row}:L${row}`);
    this.setValue(sheet, `A${row}`, `FINAL RESULT: ${status}`, { bold: true, fill: this.headerFill });
    this.setValue(sheet, `L${row}`, status, { bold: true, align: 'center', fill: this.headerFill });
    this.colorResultCell(sheet.getCell(`L${row}`), status);

    this.mergeAndBorder(sheet, `A${row + 1}:L${row + 2}`);
    this.setValue(
      sheet,
      `A${row + 1}`,
      remarks || CERTIFICATE_DEFAULT_REMARK,
      { wrapText: true },
    );
    sheet.getRow(row + 1).height = 18;
    sheet.getRow(row + 2).height = 18;

    this.mergeAndBorder(sheet, `A${row + 3}:L${row + 4}`);
    this.setValue(
      sheet,
      `A${row + 3}`,
      'We hereby certify that the material described herein has been manufactured, sampled, tested and inspected in accordance with IS 10773:2025.',
      { align: 'center', wrapText: true },
    );

    return row + 6;
  }

  private renderSignatureSection(sheet: Worksheet, row: number) {
    this.mergeAndBorder(sheet, `A${row}:D${row + 2}`);
    this.mergeAndBorder(sheet, `E${row}:H${row + 2}`);
    this.mergeAndBorder(sheet, `I${row}:L${row + 2}`);
    this.setValue(sheet, `A${row + 3}`, 'Tested By', { align: 'center' });
    this.setValue(sheet, `E${row + 3}`, 'Authorized Signatory', { align: 'center' });
    this.setValue(sheet, `I${row + 3}`, 'Company Stamp', { align: 'center' });
  }

  private renderSectionHeader(sheet: Worksheet, row: number, title: string) {
    this.mergeAndBorder(sheet, `A${row}:L${row}`);
    this.setValue(sheet, `A${row}`, title, {
      bold: true,
      size: 10,
      align: 'center',
      fill: this.sectionFill,
    });
    sheet.getRow(row).height = 18;
    return row + 1;
  }

  private writeGridRow(
    sheet: Worksheet,
    row: number,
    values: string[],
    starts: number[],
    ends: number[],
    height: number,
  ) {
    values.forEach((value, index) => {
      const range = `${this.col(starts[index])}${row}:${this.col(ends[index])}${row}`;
      this.mergeAndBorder(sheet, range);
      this.setValue(sheet, `${this.col(starts[index])}${row}`, value, {
        bold: index % 2 === 0,
        fill: index % 2 === 0 ? this.headerFill : undefined,
      });
    });
    sheet.getRow(row).height = height;
  }

  private writeTableRow(
    sheet: Worksheet,
    row: number,
    values: string[],
    starts: string[],
    ends: number[],
    header = false,
  ) {
    values.forEach((value, index) => {
      const startCol = starts[index];
      const endCol = this.col(ends[index]);
      this.mergeAndBorder(sheet, `${startCol}${row}:${endCol}${row}`);
      this.setValue(sheet, `${startCol}${row}`, value, {
        bold: header,
        fill: header ? this.headerFill : undefined,
        align: index === 0 || index === values.length - 1 ? 'center' : 'left',
      });
    });
    sheet.getRow(row).height = header ? 18 : 16;
  }

  private mergeAndBorder(sheet: Worksheet, range: string) {
    sheet.mergeCells(range);
    const [start, end] = range.split(':');
    const startCell = sheet.getCell(start);
    const endCell = sheet.getCell(end);
    for (let row = startCell.row; row <= endCell.row; row += 1) {
      for (let col = startCell.col; col <= endCell.col; col += 1) {
        sheet.getCell(row, col).border = this.border;
      }
    }
  }

  private setValue(
    sheet: Worksheet,
    cellRef: string,
    value: string,
    options?: {
      bold?: boolean;
      size?: number;
      align?: 'left' | 'center' | 'right';
      valign?: 'top' | 'middle' | 'bottom';
      fill?: string;
      underline?: boolean;
      wrapText?: boolean;
    },
  ) {
    const cell = sheet.getCell(cellRef);
    cell.value = value;
    cell.font = {
      bold: options?.bold ?? false,
      size: options?.size ?? 8,
      underline: options?.underline ? 'single' : undefined,
      name: 'Arial',
    };
    cell.alignment = {
      horizontal: options?.align ?? 'left',
      vertical: options?.valign ?? 'middle',
      wrapText: options?.wrapText ?? false,
    };
    if (options?.fill) {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: options.fill },
      };
    }
  }

  private colorResultCell(cell: any, value: string) {
    const normalized = String(value ?? '').trim().toUpperCase();
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.font = { bold: true, size: 8, name: 'Arial' };
    if (normalized === 'PASS') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: this.passFill } };
    } else if (normalized === 'FAIL') {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: this.failFill } };
    }
  }

  private col(index: number) {
    return String.fromCharCode(64 + index);
  }

  private extractVisualRows(categories: CategoryShape[]) {
    const rows = categories.flatMap((category) =>
      category.rules.map((rule) => this.expandRuleRows(rule)),
    ).flat();
    const filtered = rows.filter((row) =>
      /visual|surface|dent|scratch|clean|eddy|hydro|leak|pneumatic|defect/i.test(row.name),
    );
    if (!filtered.length) {
      return [...CERTIFICATE_DEFAULT_NDT_ROWS];
    }
    return filtered.map((row) => ({
      test: row.name,
      required: row.spec || 'As per standard',
      observed: `${row.observed} (${row.status})`,
    }));
  }

  private expandRuleRows(rule: any) {
    const ruleType = rule.ruleDefinition?.ruleType ?? '';
    const config = (rule.ruleDefinition?.ruleConfig ?? {}) as Record<string, any>;
    const results = Array.isArray(rule.results) ? rule.results : [];
    const resultByFieldKey = new Map(
      results.map((result: any) => [String(result.fieldKey ?? ''), result]),
    );

    if (ruleType === 'MECHANICAL_PROPERTIES') {
      const keys = [
        { key: 'tensile', label: 'Tensile' },
        { key: 'elongation', label: 'Elongation' },
        ...(config.flatteningRequired ? [{ key: 'flattening', label: 'Flattening' }] : []),
        ...(config.driftRequired ? [{ key: 'drift', label: 'Drift Expanding' }] : []),
      ];

      return keys.map((entry) => {
        const result = resultByFieldKey.get(entry.key) ?? results.find((candidate: any) => candidate.fieldKey === entry.key);
        return {
          name: entry.label,
          observed:
            entry.key === 'flattening' || entry.key === 'drift'
              ? Number(result?.observed) === 1
                ? 'Yes'
                : 'No'
              : this.formatValue(result?.observed),
          spec: this.getSpecText(rule, result, entry.label),
          status: result?.status ?? 'PENDING',
        };
      });
    }

    if (ruleType === 'GENERIC_CONDITION') {
      return (config.fields ?? []).map((field: any, index: number) => {
        const result = resultByFieldKey.get(String(field.name ?? '')) ?? results[index] ?? null;
        return {
          name: field.label || field.name,
          observed: this.formatValue(result?.observed),
          spec: this.getSpecText(rule, result, field.name),
          status: result?.status ?? 'PENDING',
        };
      });
    }

    if (ruleType === 'TEXT_BOOLEAN') {
      return [
        {
          name: String(rule.contextLabel ?? rule.name),
          observed: Number(results[0]?.observed) === 1 ? 'Yes' : 'No',
          spec: this.getSpecText(rule, results[0]),
          status: results[0]?.status ?? 'PENDING',
        },
      ];
    }

    return [
      {
        name: String(rule.contextLabel ?? rule.name),
        observed: this.formatValue(results[0]?.observed),
        spec: this.getSpecText(rule, results[0]),
        status: results[0]?.status ?? 'PENDING',
      },
    ];
  }

  private getSpecText(
    rule: Record<string, any>,
    result?: { min: number | null; max: number | null },
    fieldName?: string,
  ) {
    const min = result?.min ?? rule.spec?.min ?? rule.min ?? null;
    const max = result?.max ?? rule.spec?.max ?? rule.max ?? null;
    const expectedValue = rule.spec?.expectedValue ?? rule.expectedValue ?? null;

    if (fieldName) {
      const parts = [min != null ? `Min: ${min}` : null, max != null ? `Max: ${max}` : null].filter(Boolean);
      return parts.join(' | ') || 'Configured';
    }
    if (min != null && max != null) return `Min: ${min} | Max: ${max}`;
    if (min != null) return `Min: ${min}`;
    if (max != null) return `Max: ${max}`;
    if (expectedValue != null && expectedValue !== '') return `Expected: ${expectedValue}`;
    return 'Configured';
  }

  private formatValue(value: unknown) {
    if (value === null || value === undefined || value === '') {
      return '-';
    }
    return String(value);
  }
}
