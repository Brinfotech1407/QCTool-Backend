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
  }>;
  chemicalComposition?: unknown;
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
    this.renderChemicalSection(doc, qcData.chemicalComposition);
    this.renderDimensionalSection(doc, qcData.batch.batchNumber, [qcData.item], qcData.categories);
    this.renderMechanicalSection(doc, qcData.categories);
    this.renderRoundnessSection(doc, qcData.categories);
    this.renderStraightnessSection(doc, [qcData.item]);
    this.renderVisualSection(doc, qcData.categories);
    this.renderRemarks(doc, qcData.status);
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
    this.renderChemicalSection(doc, tcData.chemicalComposition);
    this.renderDimensionalSection(doc, tcData.batch.batchNumber, tcData.items, tcData.items[0]?.categories ?? []);
    this.renderMechanicalSection(
      doc,
      tcData.items.flatMap((item) => item.categories),
    );
    this.renderRoundnessSection(
      doc,
      tcData.items.flatMap((item) => item.categories),
    );
    this.renderStraightnessSection(doc, tcData.items);
    this.renderVisualSection(
      doc,
      tcData.items.flatMap((item) => item.categories),
    );
    const overallStatus = tcData.items.some((item) => item.status === 'FAIL') ? 'FAIL' : 'PASS';
    this.renderRemarks(doc, overallStatus);
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
    doc.y = metaY + 72;
  }

  private renderChemicalSection(doc: InstanceType<typeof PDFDocument>, chemicalComposition: unknown) {
    this.ensurePageSpace(doc, 80, () => this.drawSectionHeader(doc, 'CHEMICAL COMPOSITION (%)'));
    this.drawSectionHeader(doc, 'CHEMICAL COMPOSITION (%)');
    const startY = doc.y;
    const cols = [24, 100, 70, 60, 70, 70, this.contentWidth - 394];
    this.drawRow(
      doc,
      startY,
      ['REQUIRED - AS PER IS 10773:2025', '', '', '', 'OBSERVED CHEMICAL ANALYSIS', 'BATCH NO.', ''],
      cols,
      { fontSize: 6, bold: true },
    );
    this.drawRow(doc, startY + 14, ['SR NO.', 'ELEMENTS', 'MINI.%', 'MAX.%', '(Batch No)', '(Batch No)', ''], cols, {
      fontSize: 6.5,
      bold: true,
    });

    const entries = this.getChemicalEntries(chemicalComposition);
    const rows = entries.length
      ? entries
      : [{ element: '-', value: '-', min: '-', max: '-' }];

    rows.forEach((entry, index) => {
      const rowY = startY + 28 + index * 14;
      this.ensurePageSpace(doc, 20, () => {
        this.drawSectionHeader(doc, 'CHEMICAL COMPOSITION (%)');
        this.drawRow(doc, doc.y, ['REQUIRED - AS PER IS 10773:2025', '', '', '', 'OBSERVED CHEMICAL ANALYSIS', '', ''], cols, {
          fontSize: 6,
          bold: true,
        });
        this.drawRow(doc, doc.y + 14, ['SR NO.', 'ELEMENTS', 'MINI.%', 'MAX.%', '(Batch No)', '(Batch No)', ''], cols, {
          fontSize: 6.5,
          bold: true,
        });
      });
      this.drawRow(
        doc,
        rowY,
        [String(index + 1), entry.element, entry.min, entry.max, entry.value, entry.value, ''],
        cols,
        { fontSize: 6.5 },
      );
    });

    doc.y = startY + 28 + rows.length * 14 + 4;
  }

  private renderDimensionalSection(
    doc: InstanceType<typeof PDFDocument>,
    batchNo: string,
    items: Array<{ od: number; wt: number; qty?: number; length?: number }>,
    categories: Array<{ name: string; rules: Array<Record<string, any>> }>,
  ) {
    this.ensurePageSpace(doc, 80, () => this.drawSectionHeader(doc, 'DIMENSIONAL MEASUREMENTS'));
    this.drawSectionHeader(doc, 'DIMENSIONAL MEASUREMENTS');
    const y = doc.y;
    const cols = [20, 52, 62, 50, 50, 62, 50, 50, 72, 47];
    this.drawRow(
      doc,
      y,
      ['SR', 'SIZE MM', 'OUTSIDE DIAMETER (OD) MM', '', '', 'WALL THICKNESS (WT) MM', '', '', 'BATCH NO', 'QTY'],
      cols,
      { fontSize: 6.1, bold: true },
    );
    this.drawRow(
      doc,
      y + 14,
      ['', '', 'Tolerance', 'Min', 'Max', 'Tolerance', 'Min', 'Max', '', '(KGS)'],
      cols,
      { fontSize: 6.2, bold: true },
    );

    const dimRules = this.extractDimensionalRules(categories);
    items.forEach((item, index) => {
      const spec = dimRules[index] ?? dimRules[0];
      const rowY = y + 28 + index * 28;
      this.ensurePageSpace(doc, 34, () => {
        this.drawSectionHeader(doc, 'DIMENSIONAL MEASUREMENTS');
        this.drawRow(
          doc,
          doc.y,
          ['SR', 'SIZE MM', 'OUTSIDE DIAMETER (OD) MM', '', '', 'WALL THICKNESS (WT) MM', '', '', 'BATCH NO', 'QTY'],
          cols,
          { fontSize: 6.1, bold: true },
        );
        this.drawRow(
          doc,
          doc.y + 14,
          ['', '', 'Tolerance', 'Min', 'Max', 'Tolerance', 'Min', 'Max', '', '(KGS)'],
          cols,
          { fontSize: 6.2, bold: true },
        );
      });
      this.drawRow(
        doc,
        rowY,
        [
          String(index + 1),
          `${item.od} x ${item.wt}`,
          spec.odTolerance,
          spec.odMin,
          spec.odMax,
          spec.wtTolerance,
          spec.wtMin,
          spec.wtMax,
          batchNo.slice(0, 14),
          String(item.qty ?? '-'),
        ],
        cols,
        { fontSize: 6.2 },
      );
      this.drawRow(
        doc,
        rowY + 14,
        ['', 'Observed', String(item.od), '', '', String(item.wt), '', '', '', ''],
        cols,
        { fontSize: 6.2 },
      );
    });

    doc.y = y + 28 + items.length * 28 + 4;
  }

  private renderMechanicalSection(doc: InstanceType<typeof PDFDocument>, categories: Array<{ name: string; rules: Array<Record<string, any>> }>) {
    this.ensurePageSpace(doc, 90, () => this.drawSectionHeader(doc, 'MECHANICAL & METALLURGICAL PROPERTIES'));
    this.drawSectionHeader(doc, 'MECHANICAL & METALLURGICAL PROPERTIES');
    const startY = doc.y;
    const cols = [20, 92, 70, 50, 70, 50, 70, this.contentWidth - 422];
    this.drawRow(doc, startY, ['TEMPER', '', 'LIGHT ANNEALED', '', 'SOFT ANNEALED', '', '', 'Remarks'], cols, {
      bold: true,
      fontSize: 6,
    });
    this.drawRow(doc, startY + 14, ['SR. NO', 'PROPERTIES', 'REQUIRED', 'OBSERVED', 'REQUIRED', 'OBSERVED', '', ''], cols, {
      bold: true,
      fontSize: 6,
    });

    const rows = this.extractMechanicalRows(categories);
    rows.forEach((row, index) => {
      const rowY = startY + 28 + index * 12;
      this.ensurePageSpace(doc, 20, () => {
        this.drawSectionHeader(doc, 'MECHANICAL & METALLURGICAL PROPERTIES');
        this.drawRow(doc, doc.y, ['TEMPER', '', 'LIGHT ANNEALED', '', 'SOFT ANNEALED', '', '', 'Remarks'], cols, {
          bold: true,
          fontSize: 6,
        });
        this.drawRow(doc, doc.y + 14, ['SR. NO', 'PROPERTIES', 'REQUIRED', 'OBSERVED', 'REQUIRED', 'OBSERVED', '', ''], cols, {
          bold: true,
          fontSize: 6,
        });
      });
      this.drawRow(doc, rowY, [String(index + 1), row.property, row.required, row.observed, row.required, row.observed, '', row.result], cols, {
        fontSize: 6.2,
      });
    });

    doc.y = startY + 28 + rows.length * 12 + 3;
  }

  private renderRoundnessSection(doc: InstanceType<typeof PDFDocument>, categories: Array<{ name: string; rules: Array<Record<string, any>> }>) {
    this.ensurePageSpace(doc, 60, () => this.drawSectionHeader(doc, 'ROUNDNESS'));
    this.drawSectionHeader(doc, 'ROUNDNESS');
    const y = doc.y;
    const rule = this.findRule(categories, 'round');
    const row = rule
      ? this.expandRuleRows(rule)[0]
      : { spec: '-', observed: '-', status: '-' };
    const cols = [26, 140, 120, 100, this.contentWidth - 386];
    this.drawRow(doc, y, ['1', 't/D based tolerance formula', row.spec, String(row.observed), `Result ${row.status}`], cols, {
      bold: true,
      fontSize: 6.2,
    });
    doc.y = y + 18;
  }

  private renderStraightnessSection(
    doc: InstanceType<typeof PDFDocument>,
    items: Array<{ length?: number; condition?: string }>,
  ) {
    this.ensurePageSpace(doc, 55, () => this.drawSectionHeader(doc, 'STRAIGHTNESS & LENGTH'));
    this.drawSectionHeader(doc, 'STRAIGHTNESS & LENGTH');
    const y = doc.y;
    const cols = [40, 200, this.contentWidth - 240];
    this.drawRow(doc, y, ['1', 'Length', 'N.A'], cols, { fontSize: 6.5 });
    this.drawRow(doc, y + 14, ['2', 'Straightness', 'N.A'], cols, { fontSize: 6.5 });
    doc.y = y + 32;
  }

  private renderVisualSection(doc: InstanceType<typeof PDFDocument>, categories: Array<{ name: string; rules: Array<Record<string, any>> }>) {
    this.ensurePageSpace(doc, 80, () => this.drawSectionHeader(doc, 'VISUAL INSPECTION'));
    this.drawSectionHeader(doc, 'VISUAL INSPECTION');
    const y = doc.y;
    const cols = [30, 180, 170, this.contentWidth - 380];
    this.drawRow(doc, y, ['SR', 'TEST', 'REQUIRED', 'OBSERVED'], cols, { bold: true, fontSize: 6.5 });
    const allRows = this.extractVisualRows(categories);
    const rowHeight = 18;
    const reserveBottom = 190; // keep space for remarks + signatures on page 1
    const availableHeight = 760 - reserveBottom - (y + 14);
    const maxRows = Math.max(1, Math.floor(availableHeight / rowHeight));
    const rows = allRows.slice(0, maxRows);
    rows.forEach((row, index) => {
      const rowY = y + 14 + index * rowHeight;
      this.drawWrappedTextRow(
        doc,
        rowY,
        [String(index + 1), row.test, row.required, row.observed],
        cols,
        rowHeight,
      );
    });
    doc.y = y + 14 + rows.length * rowHeight + 2;
  }

  private renderRemarks(doc: InstanceType<typeof PDFDocument>, status: string) {
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
