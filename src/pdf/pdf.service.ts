import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

type RuleRow = {
  name: string;
  observed: string | number;
  spec: string;
  status: string;
};

type CertificateChemicalRow = {
  sr: number;
  element: string;
  requiredMin: string;
  requiredMax: string;
  observed: string;
  result: string;
};

type CertificateTableRow = {
  sr: number;
  test: string;
  required: string;
  observed: string;
  result: string;
};

type CertificateDimensionRow = CertificateTableRow & {
  size: string;
  condition: string;
  min: string;
  max: string;
};

type CertificateSections = {
  dimensionRows: CertificateDimensionRow[];
  mechanicalRows: CertificateTableRow[];
  metallurgicalRows: CertificateTableRow[];
  remarks: string;
};

type PdfQcData = {
  status: string;
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
  certificateSections?: CertificateSections;
  certificate?: {
    chemicalRows: CertificateChemicalRow[];
    remarks: string;
  };
};

type PdfCustomerTcData = {
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
    status: string;
    categories: Array<{
      name: string;
      rules: Array<Record<string, any>>;
    }>;
    certificateSections?: CertificateSections;
  }>;
  chemicalComposition?: unknown;
  certificate?: {
    chemicalRows: CertificateChemicalRow[];
    remarks: string;
  };
};

@Injectable()
export class PdfService {
  private readonly margin = 20;
  private readonly pageWidth = 595.28;
  private readonly contentWidth = this.pageWidth - this.margin * 2;
  private readonly yellow = '#FFF200';
  private readonly border = '#000000';
  private readonly logoPath = path.join(process.cwd(), 'src', 'assets', 'logo.png');
  private readonly isoLogoPath = path.join(process.cwd(), 'src', 'assets', 'iso.png');
  private readonly rohsLogoPath = path.join(process.cwd(), 'src', 'assets', 'rohs.png');

  generateQCReport(res: Response, qcData: PdfQcData) {
    const doc = new PDFDocument({ margin: this.margin, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=QC-${qcData.batch.batchNumber}.pdf`,
    );
    doc.pipe(res);

    this.renderCertificateHeader(doc, qcData.batch.batchNumber, qcData.customer.name, qcData);
    this.renderChemicalSection(doc, qcData.certificate?.chemicalRows ?? []);
    this.renderDimensionSection(doc, qcData.certificateSections?.dimensionRows ?? []);
    this.renderMechanicalSection(doc, qcData.certificateSections?.mechanicalRows ?? []);
    this.renderMetallurgicalSection(
      doc,
      qcData.certificateSections?.metallurgicalRows ?? [],
    );
    this.renderRemarks(
      doc,
      qcData.status,
      qcData.certificateSections?.remarks ?? qcData.certificate?.remarks,
    );
    this.renderSignatureSection(doc);

    doc.end();
  }

  generateCustomerQCReport(res: Response, tcData: PdfCustomerTcData) {
    const doc = new PDFDocument({ margin: this.margin, size: 'A4' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=QC-${tcData.batch.batchNumber}-${tcData.customer.name}.pdf`,
    );
    doc.pipe(res);

    this.renderCertificateHeader(doc, tcData.batch.batchNumber, tcData.customer.name, tcData);
    this.renderChemicalSection(doc, tcData.certificate?.chemicalRows ?? []);
    tcData.items.forEach((item, index) => {
      this.renderItemHeader(doc, item, index + 1);
      this.renderDimensionSection(doc, item.certificateSections?.dimensionRows ?? []);
      this.renderMechanicalSection(doc, item.certificateSections?.mechanicalRows ?? []);
      this.renderMetallurgicalSection(
        doc,
        item.certificateSections?.metallurgicalRows ?? [],
      );
    });
    const overallStatus = tcData.items.some((item) => item.status === 'FAIL') ? 'FAIL' : 'PASS';
    this.renderRemarks(
      doc,
      overallStatus,
      tcData.certificate?.remarks ?? tcData.items[0]?.certificateSections?.remarks,
    );
    this.renderSignatureSection(doc);

    doc.end();
  }

  private renderCertificateHeader(doc: InstanceType<typeof PDFDocument>, tcNo: string, customer: string, data: any) {
    const y = doc.y;
    const leftW = 90;
    const centerW = this.contentWidth - 180;
    const rightW = 90;

    this.drawCell(doc, this.margin, y, leftW, 45, '');
    if (fs.existsSync(this.logoPath)) {
      doc.image(this.logoPath, this.margin + 8, y + 6, { width: 72, height: 32, fit: [72, 32] });
    }

    this.drawCell(doc, this.margin + leftW, y, centerW, 45, '');
    doc.fontSize(10).font('Helvetica-Bold').text('Hindalco Industries Ltd', this.margin + leftW, y + 6, { width: centerW, align: 'center' });
    doc.fontSize(7).font('Helvetica').text('Copper Division, Industrial Area, Gujarat, India', this.margin + leftW, y + 20, { width: centerW, align: 'center' });
    doc.fontSize(7).text('www.hindalco.com', this.margin + leftW, y + 31, { width: centerW, align: 'center' });

    this.drawCell(doc, this.margin + leftW + centerW, y, rightW, 45, '');
    if (fs.existsSync(this.isoLogoPath)) {
      doc.image(this.isoLogoPath, this.margin + leftW + centerW + 6, y + 5, { width: 34, height: 14, fit: [34, 14] });
    } else {
      this.drawCell(doc, this.margin + leftW + centerW + 6, y + 6, 34, 12, 'ISO', { align: 'center', fontSize: 7 });
    }
    if (fs.existsSync(this.rohsLogoPath)) {
      doc.image(this.rohsLogoPath, this.margin + leftW + centerW + 46, y + 5, { width: 34, height: 14, fit: [34, 14] });
    } else {
      this.drawCell(doc, this.margin + leftW + centerW + 46, y + 6, 34, 12, 'ROHS', { align: 'center', fontSize: 7 });
    }

    doc.y = y + 45;
    this.drawSectionHeader(doc, 'MILL TEST CERTIFICATE');

    const metaY = doc.y;
    const cols = [108, this.contentWidth - 108];
    this.drawRow(doc, metaY, ['TC NO', `:QC-${tcNo}                                                          Date: ${new Date().toLocaleDateString()}`], cols, { fontSize: 6.4 });
    this.drawRow(doc, metaY + 14, ['M/s.', `:${customer}`], cols, { fontSize: 6.4 });
    this.drawRow(doc, metaY + 28, ['P. O. NO. / INVOICE NO', ':N.A'], cols, { fontSize: 6.4 });
    this.drawRow(doc, metaY + 42, ['PRODUCT', ':WROUGHT COPPER TUBES FOR REFRIGERATION AND AIR CONDITIONING PURPOSES'], cols, { fontSize: 6.1 });
    this.drawRow(doc, metaY + 56, ['SPECIFICATION', ':SPECIFICATION AS PER IS 10773:2025'], cols, { fontSize: 6.1 });
    this.drawRow(
      doc,
      metaY + 70,
      ['GRADE', `:${data?.batch?.grade || data?.batch?.gradeId || '-'}`],
      cols,
      { fontSize: 6.1 },
    );
    doc.y = metaY + 86;
  }

  private renderChemicalSection(
    doc: InstanceType<typeof PDFDocument>,
    rows: CertificateChemicalRow[],
  ) {
    this.ensurePageSpace(doc, 80, () =>
      this.drawSectionHeader(doc, 'CHEMICAL COMPOSITION (%)'),
    );
    this.drawSectionHeader(doc, 'CHEMICAL COMPOSITION (%)');
    const startY = doc.y;
    const cols = [24, 148, 84, 84, 84, this.contentWidth - 424];
    this.drawRow(
      doc,
      startY,
      ['SR', 'ELEMENT', 'MIN', 'MAX', 'OBSERVED', 'RESULT'],
      cols,
      { fontSize: 6.5, bold: true },
    );

    const safeRows = rows.length
      ? rows
      : [{ sr: 1, element: '-', requiredMin: '-', requiredMax: '-', observed: '-', result: '-' }];
    safeRows.forEach((row, index) => {
      const rowY = startY + 14 + index * 12;
      this.ensurePageSpace(doc, 20, () => {
        this.drawSectionHeader(doc, 'CHEMICAL COMPOSITION (%)');
        this.drawRow(
          doc,
          doc.y,
          ['SR', 'ELEMENT', 'MIN', 'MAX', 'OBSERVED', 'RESULT'],
          cols,
          { fontSize: 6.5, bold: true },
        );
      });
      this.drawRow(
        doc,
        rowY,
        [
          String(row.sr),
          row.element,
          row.requiredMin,
          row.requiredMax,
          row.observed,
          row.result,
        ],
        cols,
        { fontSize: 6.4 },
      );
    });

    doc.y = startY + 14 + safeRows.length * 12 + 4;
  }

  private renderItemHeader(
    doc: InstanceType<typeof PDFDocument>,
    item: PdfCustomerTcData['items'][number],
    index: number,
  ) {
    this.ensurePageSpace(doc, 28, () => undefined);
    const y = doc.y;
    this.drawCell(
      doc,
      this.margin,
      y,
      this.contentWidth,
      16,
      `Size: ${item.od} x ${item.wt}    Condition: ${item.condition ?? '-'}`,
      { fontSize: 7, bold: true },
    );
    doc.y = y + 16;
  }

  private renderDimensionSection(
    doc: InstanceType<typeof PDFDocument>,
    rows: CertificateDimensionRow[],
  ) {
    this.ensurePageSpace(doc, 80, () =>
      this.drawSectionHeader(doc, 'DIMENSIONAL MEASUREMENTS'),
    );
    this.drawSectionHeader(doc, 'DIMENSIONAL MEASUREMENTS');
    const y = doc.y;
    const cols = [24, 154, 72, 72, 92, this.contentWidth - 414];
    this.drawRow(
      doc,
      y,
      [
        'SR',
        'TEST',
        'MIN',
        'MAX',
        'OBSERVED',
        'RESULT',
      ],
      cols,
      { fontSize: 6.2, bold: true },
    );

    const safeRows = rows.length
      ? rows
      : [
          {
            sr: 1,
            test: 'Outside Diameter',
            required: '-',
            observed: '-',
            result: '-',
            min: '-',
            max: '-',
            size: '-',
            condition: '-',
          },
        ];

    safeRows.forEach((row, index) => {
      const rowY = y + 14 + index * 12;
      this.ensurePageSpace(doc, 20, () => {
        this.drawSectionHeader(doc, 'DIMENSIONAL MEASUREMENTS');
        this.drawRow(
          doc,
          doc.y,
          [
            'SR',
            'TEST',
            'MIN',
            'MAX',
            'OBSERVED',
            'RESULT',
          ],
          cols,
          { fontSize: 6.2, bold: true },
        );
      });
      this.drawRow(
        doc,
        rowY,
        [
          String(row.sr),
          row.test,
          row.min,
          row.max,
          row.observed,
          row.result,
        ],
        cols,
        { fontSize: 6.1 },
      );
    });

    doc.y = y + 14 + safeRows.length * 12 + 4;
  }

  private renderMechanicalSection(
    doc: InstanceType<typeof PDFDocument>,
    rows: CertificateTableRow[],
  ) {
    this.renderCertificateTestSection(
      doc,
      'MECHANICAL TEST',
      'Test',
      rows,
    );
  }

  private renderMetallurgicalSection(
    doc: InstanceType<typeof PDFDocument>,
    rows: CertificateTableRow[],
  ) {
    this.renderCertificateTestSection(
      doc,
      'METALLURGICAL TEST',
      'Metallurgical Test',
      rows,
    );
  }

  private renderCertificateTestSection(
    doc: InstanceType<typeof PDFDocument>,
    title: string,
    testLabel: string,
    rows: CertificateTableRow[],
  ) {
    this.ensurePageSpace(doc, 70, () => this.drawSectionHeader(doc, title));
    this.drawSectionHeader(doc, title);
    const y = doc.y;
    const cols = [24, 190, 140, 85, this.contentWidth - 439];
    this.drawRow(
      doc,
      y,
      ['SR', testLabel, 'Required', 'Observed', 'Result'],
      cols,
      { fontSize: 6.4, bold: true },
    );

    const safeRows = rows.length
      ? rows
      : [{ sr: 1, test: '-', required: '-', observed: '-', result: '-' }];
    safeRows.forEach((row, index) => {
      const rowY = y + 14 + index * 12;
      this.ensurePageSpace(doc, 20, () => {
        this.drawSectionHeader(doc, title);
        this.drawRow(
          doc,
          doc.y,
          ['SR', testLabel, 'Required', 'Observed', 'Result'],
          cols,
          { fontSize: 6.4, bold: true },
        );
      });
      this.drawRow(
        doc,
        rowY,
        [
          String(row.sr),
          row.test,
          row.required,
          row.observed,
          row.result,
        ],
        cols,
        { fontSize: 6.1 },
      );
    });

    doc.y = y + 14 + safeRows.length * 12 + 4;
  }

  private renderRemarks(
    doc: InstanceType<typeof PDFDocument>,
    status: string,
    extraRemark?: string,
  ) {
    this.ensurePageSpace(doc, 64, () => this.drawSectionHeader(doc, 'REMARKS'));
    this.drawSectionHeader(doc, 'REMARKS');
    this.drawCell(
      doc,
      this.margin,
      doc.y,
      this.contentWidth,
      18,
      `WE CERTIFY THAT THE MATERIAL DESCRIBED ABOVE FULLY CONFORMS TO IS 10773:2025 STANDARDS. RESULT: ${status}.`,
      { fontSize: 6.5 },
    );
    doc.y += 20;
    this.drawCell(
      doc,
      this.margin,
      doc.y,
      this.contentWidth,
      16,
      extraRemark ??
        'CHEMICAL COMPOSITION AND MECHANICAL PROPERTIES OF THE PRODUCT & DIMENSIONS TESTED AS PER IS 10773:2025 REQUIREMENTS.',
      { fontSize: 6.1 },
    );
    doc.y += 20;
    this.drawCell(
      doc,
      this.margin,
      doc.y,
      this.contentWidth,
      14,
      'For : HINDALCO INDUSTRIES LIMITED - WAGHODIA',
      { fontSize: 6.5, bold: true },
    );
    doc.y += 16;
  }

  private renderSignatureSection(doc: InstanceType<typeof PDFDocument>) {
    const y = Math.min(doc.y + 2, 730);
    const boxW = 150;
    const gap = 20;
    this.drawCell(doc, this.margin, y, boxW, 34, '');
    this.drawCell(doc, this.margin + boxW + gap, y, boxW, 34, '');
    doc.circle(this.margin + boxW * 2 + gap * 2 + 60, y + 17, 17).stroke(this.border);
    doc.fontSize(7).font('Helvetica').text('Quality Control In-charge', this.margin, y + 38, { width: boxW, align: 'center' });
    doc.text('Authorized Signature', this.margin + boxW + gap, y + 38, { width: boxW, align: 'center' });
    doc.text('Stamp', this.margin + boxW * 2 + gap * 2 + 40, y + 38, { width: 40, align: 'center' });
    doc.y = y + 52;
  }

  private drawCell(
    doc: InstanceType<typeof PDFDocument>,
    x: number,
    y: number,
    w: number,
    h: number,
    text: string,
    options?: { align?: 'left' | 'center' | 'right'; bold?: boolean; fontSize?: number; fill?: string },
  ) {
    if (options?.fill) {
      doc.rect(x, y, w, h).fillAndStroke(options.fill, this.border);
    } else {
      doc.rect(x, y, w, h).stroke(this.border);
    }
    doc
      .font(options?.bold ? 'Helvetica-Bold' : 'Helvetica')
      .fontSize(options?.fontSize ?? 7)
      .fillColor('#000000')
      .text(text, x + 2, y + 4, { width: w - 4, height: h - 4, align: options?.align ?? 'left' });
  }

  private drawRow(
    doc: InstanceType<typeof PDFDocument>,
    y: number,
    cells: string[],
    widths: number[],
    options?: { bold?: boolean; fontSize?: number },
  ) {
    let x = this.margin;
    cells.forEach((cell, index) => {
      this.drawCell(doc, x, y, widths[index], 12, cell, {
        bold: options?.bold,
        fontSize: options?.fontSize ?? 7,
        align: index === cells.length - 1 ? 'center' : 'left',
      });
      x += widths[index];
    });
  }

  private drawSectionHeader(doc: InstanceType<typeof PDFDocument>, title: string) {
    this.drawCell(doc, this.margin, doc.y, this.contentWidth, 12, title, {
      bold: true,
      fontSize: 8,
      fill: this.yellow,
      align: 'left',
    });
    doc.y += 12;
  }

  private drawWrappedTextRow(
    doc: InstanceType<typeof PDFDocument>,
    y: number,
    cells: string[],
    widths: number[],
    rowHeight: number,
  ) {
    let x = this.margin;
    cells.forEach((cell, index) => {
      this.drawCell(doc, x, y, widths[index], rowHeight, cell, {
        fontSize: 6.5,
        align: index === cells.length - 1 ? 'center' : 'left',
      });
      x += widths[index];
    });
  }

  private ensurePageSpace(doc: InstanceType<typeof PDFDocument>, required: number, onBreak: () => void) {
    if (doc.y + required > 760) {
      doc.addPage();
      doc.y = this.margin;
      onBreak();
    }
  }

  private getChemicalEntries(chemicalComposition: unknown) {
    if (!chemicalComposition || typeof chemicalComposition !== 'object') {
      return [];
    }
    return Object.entries(chemicalComposition as Record<string, unknown>).map(([element, value]) => ({
      element,
      value: value === null || value === undefined || value === '' ? '-' : String(value),
      min: '-',
      max: '-',
    }));
  }

  private extractDimensionalRules(categories: Array<{ name: string; rules: Array<Record<string, any>> }>) {
    const rows = categories.flatMap((category) => category.rules.map((rule) => this.expandRuleRows(rule))).flat();
    const od = rows.find((row) => row.name.toLowerCase().includes('od'))?.spec ?? '-';
    const wt = rows.find((row) => row.name.toLowerCase().includes('wt') || row.name.toLowerCase().includes('wall'))?.spec ?? '-';
    const [odMin, odMax] = this.extractMinMax(od);
    const [wtMin, wtMax] = this.extractMinMax(wt);
    return [{
      odTolerance: od,
      odMin,
      odMax,
      wtTolerance: wt,
      wtMin,
      wtMax,
    }];
  }

  private extractMechanicalRows(categories: Array<{ name: string; rules: Array<Record<string, any>> }>) {
    const rows = categories.flatMap((category) => category.rules.map((rule) => this.expandRuleRows(rule))).flat();
    const filtered = rows.filter((row) =>
      /tensile|elongation|grain|anneal|temper|metallurgical/i.test(row.name),
    );
    if (!filtered.length) {
      return [{ property: 'Tensile Strength', required: '-', observed: '-', result: '-' }];
    }
    return filtered.map((row) => ({
      property: row.name,
      required: row.spec,
      observed: String(row.observed),
      result: row.status,
    }));
  }

  private extractVisualRows(categories: Array<{ name: string; rules: Array<Record<string, any>> }>) {
    const rows = categories.flatMap((category) => category.rules.map((rule) => this.expandRuleRows(rule))).flat();
    const filtered = rows.filter((row) => /visual|surface|dent|scratch|clean/i.test(row.name));
    if (!filtered.length) {
      return [
        { test: 'FREEDOM FROM DEFECTS', required: 'THE TUBES SHALL BE CLEAN, SMOOTH, FREE FROM CRACKS, SEAMS, SLIVERS, SCALES AND IMPERFECTIONS.', observed: 'Found satisfactory' },
        { test: 'FLATTENING TEST', required: 'THE TEST PIECE SHALL NOT CRACK WHEN CLOSE FLATTENED.', observed: 'Found satisfactory' },
        { test: 'DRIFT EXPANDING TEST', required: 'NO CRACK OR FLAW UNTIL THE OUTSIDE DIAMETER IS EXPANDED.', observed: 'Found satisfactory' },
        { test: 'EDDY-CURRENT TEST', required: 'THE TEST PIECE SHALL SHOW NO CRACKS.', observed: 'Found satisfactory' },
        { test: 'HYDROSTATIC TEST', required: 'THE TUBE SHALL NOT SHOW ANY SIGN OF WEEPING OR LEAKING.', observed: 'Found satisfactory' },
      ];
    }
    return filtered.map((row) => ({
      test: row.name,
      required: row.spec || 'As per standard',
      observed: `${row.observed} (${row.status})`,
    }));
  }

  private findRule(categories: Array<{ name: string; rules: Array<Record<string, any>> }>, keyword: string) {
    return categories
      .flatMap((category) => category.rules)
      .find((rule) => String(rule.name ?? '').toLowerCase().includes(keyword));
  }

  private extractMinMax(spec: string) {
    const minMatch = spec.match(/Min\s*([0-9.]+)/i);
    const maxMatch = spec.match(/Max\s*([0-9.]+)/i);
    return [minMatch?.[1] ?? '-', maxMatch?.[1] ?? '-'];
  }

  private expandRuleRows(rule: Record<string, any>): RuleRow[] {
    const ruleType = rule.ruleDefinition?.ruleType ?? '';
    const config = (rule.ruleDefinition?.ruleConfig ?? {}) as Record<string, any>;
    const results = rule.results ?? [];

    if (ruleType === 'MECHANICAL_PROPERTIES') {
      const keys = [
        { key: 'tensile', label: 'Tensile Strength' },
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

  private getSpecText(rule: Record<string, any>, result?: { min: number | null; max: number | null }) {
    const min = result?.min ?? rule.spec?.min ?? rule.min ?? null;
    const max = result?.max ?? rule.spec?.max ?? rule.max ?? null;
    const expectedValue = rule.spec?.expectedValue ?? rule.expectedValue ?? null;
    if (min != null && max != null) return `Min ${min} - Max ${max}`;
    if (min != null) return `Min ${min}`;
    if (max != null) return `Max ${max}`;
    if (expectedValue != null && expectedValue !== '') return `Expected ${expectedValue}`;
    return '';
  }
}
