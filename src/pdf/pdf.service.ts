import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CERTIFICATE_COMPANY_NAME,
  CERTIFICATE_COMPANY_SUBTITLE,
  CERTIFICATE_COMPANY_TAGLINE,
  CERTIFICATE_DEFAULT_NDT_ROWS,
  CERTIFICATE_DEFAULT_REMARK,
  CERTIFICATE_SECTION_TITLES,
  CERTIFICATE_TITLE,
} from '../certificate/certificate.constants';
import { formatObservedValue, getIsoDeclarationText } from '../certificate/certificate.display';
import type {
  CategoryShape,
  CertificateDimensionRow,
  CertificateChemicalRow,
  CertificateItem,
  CertificateSections,
  CertificateTableRow,
} from '../certificate/certificate.types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

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
  item: Omit<CertificateItem, 'status' | 'categories' | 'certificateSections'>;
  categories: CategoryShape[];
  chemicalComposition?: unknown;
  certificateSections?: CertificateSections;
  certificate?: {
    chemicalRows: CertificateChemicalRow[];
    remarks: string;
  };
  tcConfig?: {
    companyName: string;
    logoUrl?: string | null;
    isoHallmarkUrl?: string | null;
  } | null;
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
  items: CertificateItem[];
  chemicalComposition?: unknown;
  certificate?: {
    chemicalRows: CertificateChemicalRow[];
    remarks: string;
  };
  tcConfig?: {
    companyName: string;
    logoUrl?: string | null;
    isoHallmarkUrl?: string | null;
  } | null;
};

@Injectable()
export class PdfService {
  private currentTcConfig: { companyName: string; logoUrl?: string | null; isoHallmarkUrl?: string | null } | null = null;
  private readonly margin = 18;
  private readonly pageWidth = 595.28;
  private readonly pageHeight = 841.89;
  private readonly contentWidth = this.pageWidth - this.margin * 2;
  private readonly border = '#222222';
  private readonly sectionFill = '#F6ECA2';
  private readonly mutedFill = '#F7F7F7';
  private readonly logoPath = path.join(process.cwd(), 'src', 'assets', 'logo.png');
  private readonly isoLogoPath = path.join(process.cwd(), 'src', 'assets', 'iso.png');
  private readonly rohsLogoPath = path.join(process.cwd(), 'src', 'assets', 'rohs.png');

  generateQCReport(res: Response, qcData: PdfQcData) {
    const doc = this.createDocument(res, `QC-${qcData.batch.batchNumber}.pdf`);
    const item = {
      ...qcData.item,
      categories: qcData.categories,
      status: qcData.status,
      certificateSections: qcData.certificateSections,
    };

    this.renderCertificatePage(doc, {
      batchNumber: qcData.batch.batchNumber,
      grade: qcData.batch.grade || qcData.batch.gradeId || '-',
      customer: qcData.customer.name,
      overallStatus: qcData.status,
      chemicalRows: qcData.certificate?.chemicalRows ?? [],
      remarks: qcData.certificateSections?.remarks ?? qcData.certificate?.remarks ?? '',
      tcConfig: qcData.tcConfig ?? null,
      items: [item],
    });

    doc.end();
  }

  generateCustomerQCReport(res: Response, tcData: PdfCustomerTcData) {
    const doc = this.createDocument(
      res,
      `QC-${tcData.batch.batchNumber}-${tcData.customer.name}.pdf`,
    );

    this.renderCertificatePage(doc, {
      batchNumber: tcData.batch.batchNumber,
      grade: tcData.batch.grade || tcData.batch.gradeId || '-',
      customer: tcData.customer.name,
      overallStatus: tcData.items.some((item) => item.status === 'FAIL') ? 'FAIL' : 'PASS',
      chemicalRows: tcData.certificate?.chemicalRows ?? [],
      remarks: tcData.certificate?.remarks ?? tcData.items[0]?.certificateSections?.remarks ?? '',
      tcConfig: tcData.tcConfig ?? null,
      items: tcData.items,
    });

    doc.end();
  }

  private createDocument(res: Response, filename: string) {
    const doc = new PDFDocument({ margin: this.margin, size: 'A4', autoFirstPage: false, bufferPages: true });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
    doc.pipe(res);
    return doc;
  }



  private renderCertificatePage(
    doc: InstanceType<typeof PDFDocument>,
    data: {
      batchNumber: string;
      grade: string;
      customer: string;
      overallStatus: string;
      chemicalRows: CertificateChemicalRow[];
      remarks: string;
      tcConfig?: {
        companyName: string;
        logoUrl?: string | null;
        isoHallmarkUrl?: string | null;
      } | null;
      items: Array<{
        od: number;
        wt: number;
        length?: number;
        condition?: string;
        qty?: number;
        status: string;
        categories: CategoryShape[];
        certificateSections?: CertificateSections;
      }>;
    },
  ) {
    this.currentTcConfig = data.tcConfig ?? null;

    if (!doc.page) {
      doc.addPage();
      doc.y = this.margin;
    }

    this.renderBrandHeader(doc, this.currentTcConfig);
    this.renderTopInfoGrid(doc, data);
    this.renderChemicalSection(doc, data.chemicalRows);
    data.items.forEach((item, index) => {
      this.renderItemSummary(doc, item, index + 1);
      this.renderDimensionSection(doc, item.certificateSections?.dimensionRows ?? []);
      this.renderMechanicalSection(doc, item.certificateSections?.mechanicalRows ?? []);
      this.renderMetallurgicalSection(doc, item.certificateSections?.metallurgicalRows ?? []);
      this.renderNdtSection(doc, this.extractVisualRows(item.categories));
    });
    this.renderRemarks(doc, data.overallStatus, data.remarks);
    this.renderSignatureSection(doc);
  }

  private renderBrandHeader(
    doc: InstanceType<typeof PDFDocument>,
    tcConfig?: { companyName: string; logoUrl?: string | null; isoHallmarkUrl?: string | null } | null,
  ) {
    const y = doc.y;
    const leftW = 74;
    const rightW = 74;
    const centerW = this.contentWidth - leftW - rightW;

    this.drawBox(doc, this.margin, y, this.contentWidth, 46);
    this.drawBox(doc, this.margin, y, leftW, 46);
    this.drawBox(doc, this.margin + leftW, y, centerW, 46);
    this.drawBox(doc, this.margin + leftW + centerW, y, rightW, 46);

    const logoSource = this.resolvePdfImageSource(tcConfig?.logoUrl, this.logoPath);
    if (logoSource) {
      doc.image(logoSource, this.margin + 8, y + 6, {
        fit: [54, 30],
        align: 'center',
        valign: 'center',
      });
    }

    doc.font('Helvetica-Bold').fontSize(11.5).text(
      tcConfig?.companyName || CERTIFICATE_COMPANY_NAME,
      this.margin + leftW,
      y + 7,
      {
        width: centerW,
        align: 'center',
      },
    );
    doc.font('Helvetica').fontSize(7).text(
      CERTIFICATE_COMPANY_SUBTITLE,
      this.margin + leftW,
      y + 19,
      {
        width: centerW,
        align: 'center',
      },
    );
    doc.fontSize(7).text(
      CERTIFICATE_COMPANY_TAGLINE,
      this.margin + leftW,
      y + 28,
      {
        width: centerW,
        align: 'center',
      },
    );

    const isoSource = this.resolvePdfImageSource(tcConfig?.isoHallmarkUrl, this.isoLogoPath);
    if (isoSource) {
      doc.image(isoSource, this.margin + leftW + centerW + 8, y + 6, {
        fit: [26, 12],
      });
    }
    if (fs.existsSync(this.rohsLogoPath)) {
      doc.image(this.rohsLogoPath, this.margin + leftW + centerW + 38, y + 6, {
        fit: [26, 12],
      });
    }

    doc.y = y + 50;
    doc.font('Helvetica-Bold').fontSize(14).text(CERTIFICATE_TITLE, this.margin, doc.y, {
      width: this.contentWidth,
      align: 'center',
      underline: true,
    });
    doc.y += 16;
  }

  private renderTopInfoGrid(
    doc: InstanceType<typeof PDFDocument>,
    data: {
      batchNumber: string;
      grade: string;
      customer: string;
    },
  ) {
    const cols = [90, 187, 90, this.contentWidth - 367];
    const y = doc.y;

    this.drawRow(doc, y, ['TC NO', `QC-${data.batchNumber}`, 'DATE', new Date().toLocaleDateString()], cols, {
      fontSize: 6.2,
      boldCells: [0, 2],
      fillCells: [0, 2],
    });
    this.drawRow(doc, y + 14, ['M/S.', data.customer || '-', 'P.O. / INV.', '-'], cols, {
      fontSize: 6.2,
      boldCells: [0, 2],
    });
    this.drawTallRow(doc, y + 28, ['PRODUCT', 'WROUGHT COPPER TUBES FOR REFRIGERATION AND AIR CONDITIONING PURPOSES', 'BATCH NO.', data.batchNumber], cols, 18, {
      fontSize: 5.6,
      boldCells: [0, 2],
      alignments: ['center', 'left', 'center', 'left'],
    });
    this.drawRow(doc, y + 46, ['SPECIFICATION', 'IS 10773:2025', 'GRADE', data.grade || '-'], cols, {
      fontSize: 6.2,
      boldCells: [0, 2],
    });

    doc.y = y + 60;
  }

  private renderChemicalSection(
    doc: InstanceType<typeof PDFDocument>,
    rows: CertificateChemicalRow[],
  ) {
    this.ensurePageSpace(doc, 90);
    this.drawSectionHeader(doc, CERTIFICATE_SECTION_TITLES.chemical);
    const cols = [22, 146, 78, 78, 78, this.contentWidth - 402];
    const startY = doc.y;
    this.drawRow(doc, startY, ['SR', 'ELEMENT', 'MIN', 'MAX', 'OBSERVED', 'RESULT'], cols, {
      fontSize: 6.3,
      bold: true,
      fillCells: [0, 1, 2, 3, 4, 5],
    });

    const safeRows = rows.length
      ? rows
      : [{ sr: 1, element: '-', requiredMin: '-', requiredMax: '-', observed: '-', result: '-' }];

    safeRows.forEach((row, index) => {
      this.drawRow(
        doc,
        startY + 12 + index * 11,
        [
          String(row.sr),
          row.element,
          row.requiredMin,
          row.requiredMax,
          formatObservedValue(row.observed, CERTIFICATE_SECTION_TITLES.chemical),
          row.result,
        ],
        cols,
        {
          fontSize: 6.1,
          resultCell: 5,
        },
      );
    });

    doc.y = startY + 12 + safeRows.length * 11 + 3;
  }

  private renderItemSummary(
    doc: InstanceType<typeof PDFDocument>,
    item: {
      od: number;
      wt: number;
      length?: number;
      condition?: string;
      qty?: number;
      status: string;
    },
    index: number,
  ) {
    this.ensurePageSpace(doc, 34);
    const y = doc.y;
    const cols = [54, 196, 96, 88, this.contentWidth - 434];
    this.drawRow(
      doc,
      y,
      ['ITEM', String(index), 'SIZE', `${item.od} x ${item.wt} x ${item.length ?? '-'}`, ''],
      cols,
      { fontSize: 6.3, boldCells: [0, 2], fillCells: [0, 2] },
    );
    this.drawRow(
      doc,
      y + 12,
      ['CONDITION', item.condition ?? '-', 'QTY', item.qty != null ? String(item.qty) : '-', 'STATUS'],
      cols,
      { fontSize: 6.3, boldCells: [0, 2, 4], fillCells: [0, 2, 4] },
    );
    this.drawRow(
      doc,
      y + 24,
      ['', '', '', '', item.status],
      cols,
      { fontSize: 6.3, resultCell: 4 },
    );
    doc.y = y + 34;
  }

  private renderDimensionSection(
    doc: InstanceType<typeof PDFDocument>,
    rows: CertificateDimensionRow[],
  ) {
    this.ensurePageSpace(doc, 88);
    this.drawSectionHeader(doc, CERTIFICATE_SECTION_TITLES.dimension);
    const cols = [22, 170, 70, 70, 94, this.contentWidth - 426];
    const startY = doc.y;
    this.drawRow(doc, startY, ['SR', 'TEST', 'MIN', 'MAX', 'OBSERVED', 'RESULT'], cols, {
      fontSize: 6.3,
      bold: true,
      fillCells: [0, 1, 2, 3, 4, 5],
    });

    const safeRows = rows.length
      ? rows
      : [{ sr: 1, test: 'Outside Diameter', min: '-', max: '-', observed: '-', result: '-', required: '-', size: '-', condition: '-' }];

    safeRows.forEach((row, index) => {
      this.drawRow(
        doc,
        startY + 12 + index * 11,
        [String(row.sr), row.test, row.min, row.max, formatObservedValue(row.observed, CERTIFICATE_SECTION_TITLES.dimension), row.result],
        cols,
        {
          fontSize: 6.1,
          resultCell: 5,
        },
      );
    });

    doc.y = startY + 12 + safeRows.length * 11 + 3;
  }

  private renderMechanicalSection(
    doc: InstanceType<typeof PDFDocument>,
    rows: CertificateTableRow[],
  ) {
    this.renderTestSection(doc, CERTIFICATE_SECTION_TITLES.mechanical, rows);
  }

  private renderMetallurgicalSection(
    doc: InstanceType<typeof PDFDocument>,
    rows: CertificateTableRow[],
  ) {
    this.renderTestSection(doc, CERTIFICATE_SECTION_TITLES.metallurgical, rows, 15);
  }

  private renderNdtSection(
    doc: InstanceType<typeof PDFDocument>,
    rows: Array<{ test: string; required: string; observed: string }>,
  ) {
    this.ensurePageSpace(doc, 72);
    this.drawSectionHeader(doc, CERTIFICATE_SECTION_TITLES.ndt);
    const cols = [22, 236, 150, this.contentWidth - 408];
    const startY = doc.y;
    this.drawRow(doc, startY, ['SR', 'TEST', 'REQUIRED', 'OBSERVED'], cols, {
      fontSize: 6.3,
      bold: true,
      fillCells: [0, 1, 2, 3],
    });

    const safeRows = rows.length
      ? rows
      : [{ test: '-', required: '-', observed: '-' }];

    safeRows.forEach((row, index) => {
      this.drawTallRow(
        doc,
        startY + 12 + index * 14,
        [String(index + 1), row.test, row.required, 'Satisfactory'],
        cols,
        14,
      );
    });

    doc.y = startY + 12 + safeRows.length * 14 + 3;
  }

  private renderTestSection(
    doc: InstanceType<typeof PDFDocument>,
    title: string,
    rows: CertificateTableRow[],
    rowHeight = 11,
  ) {
    this.ensurePageSpace(doc, 72);
    this.drawSectionHeader(doc, title);
    const cols = [22, 182, 160, 92, this.contentWidth - 456];
    const startY = doc.y;
    this.drawRow(doc, startY, ['SR', 'TEST', 'REQUIRED', 'OBSERVED', 'RESULT'], cols, {
      fontSize: 6.3,
      bold: true,
      fillCells: [0, 1, 2, 3, 4],
    });

    const safeRows = rows.length
      ? rows
      : [{ sr: 1, test: '-', required: '-', observed: '-', result: '-' }];

    safeRows.forEach((row, index) => {
      const rowY = startY + 12 + index * rowHeight;
      if (rowHeight > 11) {
        this.drawTallRow(
          doc,
          rowY,
          [String(row.sr), row.test, row.required, formatObservedValue(row.observed, title), row.result],
          cols,
          rowHeight,
          {
            fontSize: 6,
            alignments: ['center', 'left', 'left', 'left', 'center'],
          },
        );
      } else {
        this.drawRow(
          doc,
          rowY,
          [String(row.sr), row.test, row.required, formatObservedValue(row.observed, title), row.result],
          cols,
          {
            fontSize: 6.1,
            resultCell: 4,
          },
        );
      }
    });

    doc.y = startY + 12 + safeRows.length * rowHeight + 3;
  }

  private renderRemarks(
    doc: InstanceType<typeof PDFDocument>,
    status: string,
    extraRemark?: string,
  ) {
    this.ensurePageSpace(doc, 76);
    this.drawSectionHeader(doc, CERTIFICATE_SECTION_TITLES.remarks);
    const y = doc.y;
    this.drawBox(doc, this.margin, y, this.contentWidth, 16, this.mutedFill);
    doc.font('Helvetica-Bold').fontSize(6.7).text(
      `FINAL RESULT: ${status}`,
      this.margin + 4,
      y + 4,
      { width: this.contentWidth - 8, align: 'left' },
    );
    // doc.fillColor(status === 'FAIL' ? '#A30000' : '#0E6B36').text(
    //   status,
    //   this.margin + this.contentWidth - 70,
    //   y + 4,
    //   { width: 60, align: 'right' },
    // );
    doc.fillColor('#000000');

    this.drawBox(doc, this.margin, y + 16, this.contentWidth, 22);
    doc.font('Helvetica').fontSize(6.2).text(
      getIsoDeclarationText(),
      this.margin + 4,
      y + 19,
      { width: this.contentWidth - 8, align: 'left' },
    );

    //this.drawBox(doc, this.margin, y + 38, this.contentWidth, 18);
    // doc.fontSize(6.2).text(
    //   extraRemark || CERTIFICATE_DEFAULT_REMARK,
    //   this.margin + 4,
    //   y + 44,
    //   { width: this.contentWidth - 8, align: 'center' },
    // );

    doc.y = y + 50;
  }

  private renderSignatureSection(doc: InstanceType<typeof PDFDocument>) {
    this.ensurePageSpace(doc, 74);
    const y = doc.y;
    const boxW = 160;
    const gap = 12;
    this.drawBox(doc, this.margin, y, boxW, 42);
    this.drawBox(doc, this.margin + boxW + gap, y, boxW, 42);
    this.drawDashedBox(doc, this.margin + (boxW + gap) * 2, y, 158, 42);

    doc.font('Helvetica').fontSize(7).text(
      'Tested By',
      this.margin,
      y + 44,
      { width: boxW, align: 'center' },
    );
    doc.text(
      'Authorized Signatory',
      this.margin + boxW + gap,
      y + 44,
      { width: boxW, align: 'center' },
    );
    doc.text(
      'Company Stamp',
      this.margin + (boxW + gap) * 2,
      y + 44,
      { width: 158, align: 'center' },
    );
    doc.y = y + 58;
  }

  private drawSectionHeader(doc: InstanceType<typeof PDFDocument>, title: string) {
    const y = doc.y;
    this.drawBox(doc, this.margin, y, this.contentWidth, 10, this.sectionFill);
    doc
      .fillColor('#222222')
      .font('Helvetica-Bold')
      .fontSize(7.2)
      .text(title, this.margin, y + 1.5, {
        width: this.contentWidth,
        align: 'center',
        lineBreak: false,
      });
    doc.fillColor('#000000');
    doc.y = y + 10;
  }

  private drawRow(
    doc: InstanceType<typeof PDFDocument>,
    y: number,
    cells: string[],
    widths: number[],
    options?: {
      bold?: boolean;
      boldCells?: number[];
      fillCells?: number[];
      fontSize?: number;
      resultCell?: number;
    },
  ) {
    let x = this.margin;
    cells.forEach((cell, index) => {
      const fill = options?.fillCells?.includes(index) ? this.mutedFill : undefined;
      this.drawBox(doc, x, y, widths[index], 12, fill);
      doc
        .font(
          options?.bold || options?.boldCells?.includes(index)
            ? 'Helvetica-Bold'
            : 'Helvetica',
        )
        .fontSize(options?.fontSize ?? 6.2)
        .fillColor(
          options?.resultCell === index
            ? this.getResultColor(cell)
            : '#000000',
        )
        .text(cell, x + 2, y + 3, {
          width: widths[index] - 4,
          align: index === 0 ? 'center' : index === cells.length - 1 ? 'center' : 'left',
        });
      doc.fillColor('#000000');
      x += widths[index];
    });
  }

  private drawTallRow(
    doc: InstanceType<typeof PDFDocument>,
    y: number,
    cells: string[],
    widths: number[],
    rowHeight: number,
    options?: {
      fontSize?: number;
      boldCells?: number[];
      alignments?: Array<'left' | 'center' | 'right'>;
    },
  ) {
    let x = this.margin;
    cells.forEach((cell, index) => {
      this.drawBox(doc, x, y, widths[index], rowHeight);
      doc
        .font(options?.boldCells?.includes(index) ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(options?.fontSize ?? 6)
        .text(cell, x + 2, y + 3, {
          width: widths[index] - 4,
          height: rowHeight - 4,
          align: options?.alignments?.[index] ?? (index === 0 ? 'center' : index === cells.length - 1 ? 'center' : 'left'),
        });
      x += widths[index];
    });
  }

  private drawBox(
    doc: InstanceType<typeof PDFDocument>,
    x: number,
    y: number,
    width: number,
    height: number,
    fill?: string,
  ) {
    if (fill) {
      doc.rect(x, y, width, height).fillAndStroke(fill, this.border);
      return;
    }
    doc.rect(x, y, width, height).stroke(this.border);
  }

  private drawDashedBox(
    doc: InstanceType<typeof PDFDocument>,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    doc.save();
    doc.dash(3, { space: 2 }).rect(x, y, width, height).stroke(this.border);
    doc.restore();
  }

  private ensurePageSpace(doc: InstanceType<typeof PDFDocument>, required: number) {
    if (doc.y + required > this.pageHeight - 54) {
      doc.addPage();
      doc.y = this.margin;
      this.renderBrandHeader(doc, this.currentTcConfig);
    }
  }

  private getResultColor(value: string) {
    const normalized = String(value).trim().toUpperCase();
    if (normalized === 'PASS') return '#0E6B36';
    if (normalized === 'FAIL') return '#A30000';
    return '#000000';
  }

  private resolvePdfImageSource(
    value: string | null | undefined,
    fallbackPath: string,
  ): string | Buffer | undefined {
    const normalized = String(value ?? '').trim();

    if (normalized.startsWith('data:image/')) {
      const base64 = normalized.split(',')[1];
      if (base64) {
        return Buffer.from(base64, 'base64');
      }
    }

    if (normalized && fs.existsSync(normalized)) {
      return normalized;
    }

    if (fs.existsSync(fallbackPath)) {
      return fallbackPath;
    }

    return undefined;
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
      observed: formatObservedValue(row.observed, CERTIFICATE_SECTION_TITLES.ndt),
    }));
  }

  private expandRuleRows(rule: Record<string, any>) {
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
        const result =
          resultByFieldKey.get(String(field.name ?? '')) ??
          results[index] ??
          null;
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
      const parts = [
        min != null ? `Min: ${min}` : null,
        max != null ? `Max: ${max}` : null,
      ].filter(Boolean);
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
