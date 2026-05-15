import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';

// pdfkit does not ship ESM-friendly typings in this setup; require keeps the Nest build simple.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

type PdfQcRuleRow = {
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
  private readonly pageWidth = 515;
  private readonly left = 40;
  private readonly right = 555;
  private readonly logoPath = path.join(process.cwd(), 'src', 'assets', 'logo.png');

  generateQCReport(res: Response, qcData: PdfQcData) {
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=QC-${qcData.batch.batchNumber}.pdf`,
    );

    doc.pipe(res);

    this.writeHeader(doc, qcData);
    this.writeCompanyBlock(doc, qcData);
    this.writeBatchInfoBox(doc, qcData);
    this.writeChemical(doc, qcData.chemicalComposition);
    this.writeCustomerItemSection(doc, qcData);
   // this.writeFinalResult(doc, qcData.status);
    this.drawSignatureBlock(doc);
    this.addFooters(doc);

    doc.end();
  }

  generateCustomerQCReport(res: Response, tcData: PdfCustomerTcData) {
    const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
    const overallStatus = tcData.items.some((item) => item.status === 'FAIL')
      ? 'FAIL'
      : 'PASS';

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=QC-${tcData.batch.batchNumber}-${tcData.customer.name}.pdf`,
    );

    doc.pipe(res);

    this.writeHeader(doc, {
      status: overallStatus,
      batch: tcData.batch,
      customer: tcData.customer,
      item: { od: 0, wt: 0 },
      categories: [],
    });
    this.writeCompanyBlock(doc, {
      status: overallStatus,
      batch: tcData.batch,
      customer: tcData.customer,
      item: { od: 0, wt: 0 },
      categories: [],
    });
    this.writeBatchInfoBox(doc, {
      status: overallStatus,
      batch: tcData.batch,
      customer: tcData.customer,
      item: { od: 0, wt: 0 },
      categories: [],
    });
    this.writeChemical(doc, tcData.chemicalComposition);
    this.writeCustomerMultiItemSection(doc, tcData);
    this.drawSignatureBlock(doc);
    this.addFooters(doc);
    doc.end();
  }

  private writeHeader(doc: InstanceType<typeof PDFDocument>, qcData: PdfQcData) {
    const startY = 40;

    if (fs.existsSync(this.logoPath)) {
      doc.image(this.logoPath, this.left, startY, { width: 60 });
    }

    doc
      .fontSize(16)
      .fillColor('#111827')
      .text('TEST CERTIFICATE', 0, startY + 10, {
        align: 'center',
      });

    doc
      .fontSize(8)
      .fillColor('#111827')
      .text(`Doc No: QC-001`, 400, startY)
      .text(`Rev No: 00`, 400, startY + 10)
      .text(`Date: ${new Date().toLocaleDateString()}`, 400, startY + 20);

    doc.y = startY + 58;
  }

  private writeCompanyBlock(doc: InstanceType<typeof PDFDocument>, qcData: PdfQcData) {
    doc
      .fontSize(10)
      .fillColor('#111827')
      .text('Company Name: Hindalco Industries Ltd')
      .text('Plant: Copper Division')
      .text(`Certificate No: QC-${qcData.batch.batchNumber}`)
      .text(`Date: ${new Date().toLocaleDateString()}`);

    doc.moveDown();
  }

  private writeBatchInfoBox(doc: InstanceType<typeof PDFDocument>, qcData: PdfQcData) {
    const boxTop = doc.y;
    const boxHeight = 50;

    doc.rect(40, boxTop, this.pageWidth, boxHeight).stroke('#111827');
    doc
      .fontSize(9)
      .fillColor('#111827')
      .text(`Batch No: ${qcData.batch.batchNumber}`, 50, boxTop + 8)
      .text(`Grade: ${qcData.batch.grade || qcData.batch.gradeId || '-'}`, 50, boxTop + 24)
      .text(`Customer: ${qcData.customer.name}`, 275, boxTop + 8)
      .text(`Status: ${qcData.status}`, 275, boxTop + 24);

    doc.y = boxTop + boxHeight + 10;
    doc.moveTo(this.left, doc.y).lineTo(this.right, doc.y).stroke('#111827');
    doc.moveDown();
  }

  private writeChemical(doc: InstanceType<typeof PDFDocument>, chemicalComposition: unknown) {
    doc.fontSize(12).fillColor('#111827').text('Chemical Composition');
    doc.moveDown(0.5);

    const entries = this.getChemicalEntries(chemicalComposition);
    if (entries.length === 0) {
      doc.fontSize(10).text('No chemical composition linked.');
      doc.moveDown();
      return;
    }

    let y = doc.y;
    this.drawRow(doc, y, ['Element', 'Observed'], [250, 250], true);
    y += 20;

    entries.forEach((entry) => {
      this.checkPageSpace(doc, y, 24);
      if (y + 24 > doc.page.height - 40) {
        doc.addPage();
        y = 40;
        this.drawRow(doc, y, ['Element', 'Observed'], [250, 250], true);
        y += 20;
      }
      this.drawRow(doc, y, [entry.element, entry.value], [250, 250]);
      y += 20;
    });

    doc.y = y + 14;
  }

  private writeCustomerItemSection(
    doc: InstanceType<typeof PDFDocument>,
    qcData: PdfQcData,
  ) {
    doc.addPage();
    doc.fontSize(12).fillColor('#111827').text(`Customer: ${qcData.customer.name}`);
    doc.moveDown();

    const itemBoxTop = doc.y;
    const itemBoxHeight = 38;
    doc.rect(40, itemBoxTop, this.pageWidth, itemBoxHeight).stroke('#111827');
    doc
      .fontSize(9)
      .fillColor('#111827')
      .text(`OD: ${qcData.item.od}`, 50, itemBoxTop + 8)
      .text(`WT: ${qcData.item.wt}`, 150, itemBoxTop + 8)
      .text(`Length: ${qcData.item.length ?? '-'}`, 250, itemBoxTop + 8)
      .text(`Condition: ${qcData.item.condition ?? '-'}`, 360, itemBoxTop + 8);

    doc.y = itemBoxTop + itemBoxHeight + 16;

    qcData.categories.forEach((category) => {
      this.checkPageSpace(doc, doc.y, 50);
      doc.fontSize(11).fillColor('#111827').text(category.name, { underline: true });
      doc.moveDown(0.5);

      let y = doc.y;
      this.drawRow(
        doc,
        y,
        ['Test', 'Specification', 'Observed', 'Result'],
        [170, 170, 85, 90],
        true,
      );
      y += 20;

      category.rules
        .flatMap((rule) => this.expandRuleRows(rule))
        .forEach((row) => {
          this.checkPageSpace(doc, y, 24);
          if (y + 24 > doc.page.height - 40) {
            doc.addPage();
            y = 40;
            doc.fontSize(11).fillColor('#111827').text(category.name, 40, y, {
              underline: true,
            });
            y = doc.y + 8;
            this.drawRow(
              doc,
              y,
              ['Test', 'Specification', 'Observed', 'Result'],
              [170, 170, 85, 90],
              true,
            );
            y += 20;
          }
          this.drawRow(
            doc,
            y,
            [row.name, row.spec, String(row.observed), row.status],
            [170, 170, 85, 90],
            false,
            [undefined, undefined, undefined, row.status === 'FAIL' ? 'red' : '#111827'],
          );
          y += 20;
        });

      doc.y = y + 14;
    });
  }

  private writeCustomerMultiItemSection(
    doc: InstanceType<typeof PDFDocument>,
    tcData: PdfCustomerTcData,
  ) {
    doc.addPage();
    doc.fontSize(12).fillColor('#111827').text(`Customer: ${tcData.customer.name}`);
    doc.moveDown();

    tcData.items.forEach((item, index) => {
      this.checkPageSpace(doc, doc.y, 80);

      doc
        .fontSize(10)
        .fillColor('#111827')
        .text(`Item ${index + 1}`, { underline: true });
      doc.moveDown(0.3);

      const itemBoxTop = doc.y;
      const itemBoxHeight = 38;
      doc.rect(40, itemBoxTop, this.pageWidth, itemBoxHeight).stroke('#111827');
      doc
        .fontSize(9)
        .fillColor('#111827')
        .text(`OD: ${item.od}`, 50, itemBoxTop + 8)
        .text(`WT: ${item.wt}`, 150, itemBoxTop + 8)
        .text(`Length: ${item.length ?? '-'}`, 250, itemBoxTop + 8)
        .text(`Condition: ${item.condition ?? '-'}`, 360, itemBoxTop + 8);

      doc.y = itemBoxTop + itemBoxHeight + 12;

      item.categories.forEach((category) => {
        this.checkPageSpace(doc, doc.y, 50);
        doc.fontSize(11).fillColor('#111827').text(category.name, { underline: true });
        doc.moveDown(0.5);

        let y = doc.y;
        this.drawRow(
          doc,
          y,
          ['Test', 'Specification', 'Observed', 'Result'],
          [170, 170, 85, 90],
          true,
        );
        y += 20;

        category.rules
          .flatMap((rule) => this.expandRuleRows(rule))
          .forEach((row) => {
            this.checkPageSpace(doc, y, 24);
            if (y + 24 > doc.page.height - 40) {
              doc.addPage();
              y = 40;
              this.drawRow(
                doc,
                y,
                ['Test', 'Specification', 'Observed', 'Result'],
                [170, 170, 85, 90],
                true,
              );
              y += 20;
            }
            this.drawRow(
              doc,
              y,
              [row.name, row.spec, String(row.observed), row.status],
              [170, 170, 85, 90],
              false,
              [undefined, undefined, undefined, row.status === 'FAIL' ? 'red' : '#111827'],
            );
            y += 20;
          });

        doc.y = y + 10;
      });

      doc.moveDown(0.5);
    });
  }

  private writeFinalResult(doc: InstanceType<typeof PDFDocument>, status: string) {
    doc.addPage();
    doc
      .fontSize(14)
      .fillColor(status === 'FAIL' ? 'red' : 'green')
      .text(`FINAL RESULT: ${status}`, { align: 'center' });
    doc.fillColor('#111827');
  }

  private drawSignatureBlock(doc: InstanceType<typeof PDFDocument>) {
    doc.addPage();

    let y = doc.y + 100;
    const boxWidth = 150;
    const gap = 20;
    const labels = ['Tested By', 'Checked By', 'Authorized Signatory'];

    labels.forEach((label, index) => {
      const x = this.left + index * (boxWidth + gap);
      doc.rect(x, y, boxWidth, 60).stroke('#111827');
      doc
        .fontSize(9)
        .fillColor('#111827')
        .text(label, x, y + 68, {
          width: boxWidth,
          align: 'center',
        });
    });

    doc
      .rect(400, y + 100, 120, 80)
      .dash(3, { space: 3 })
      .stroke('#111827');

    doc
      .undash()
      .fontSize(8)
      .fillColor('#111827')
      .text('Company Stamp', 400, y + 185, {
        width: 120,
        align: 'center',
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

  private expandRuleRows(rule: PdfQcData['categories'][number]['rules'][number]) {
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

  private getSpecText(
    rule: PdfQcData['categories'][number]['rules'][number],
    result?: { min: number | null; max: number | null },
  ) {
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

  private drawRow(
    doc: InstanceType<typeof PDFDocument>,
    y: number,
    cols: string[],
    widths: number[],
    isHeader = false,
    colors: Array<string | undefined> = [],
  ) {
    let x = 40;

    cols.forEach((text, index) => {
      doc
        .lineWidth(0.8)
        .rect(x, y, widths[index], 20)
        .fillAndStroke(isHeader ? '#f8fafc' : '#ffffff', '#111827');

      doc
        .fillColor(colors[index] ?? '#111827')
        .fontSize(8)
        .text(text, x + 5, y + 5, {
          width: widths[index] - 10,
          align: 'left',
        });

      x += widths[index];
    });
  }

  private checkPageSpace(
    doc: InstanceType<typeof PDFDocument>,
    y: number,
    requiredHeight: number,
  ) {
    if (y + requiredHeight > doc.page.height - 40) {
      doc.addPage();
      doc.y = 40;
    }
  }

  private addFooters(doc: InstanceType<typeof PDFDocument>) {
    const range = doc.bufferedPageRange();

    for (let index = range.start; index < range.start + range.count; index += 1) {
      doc.switchToPage(index);
      const bottom = doc.page.height - 40;
      doc
        .fontSize(8)
        .fillColor('#111827')
        .text(`Generated by QC System | Page ${index + 1}`, this.left, bottom, {
          width: this.pageWidth,
          align: 'center',
        });
    }
  }
}
