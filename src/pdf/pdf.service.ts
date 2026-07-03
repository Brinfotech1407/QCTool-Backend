import { Injectable } from '@nestjs/common';
import type { Response } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  CERTIFICATE_COMPANY_NAME,
  CERTIFICATE_COMPANY_SUBTITLE,
  CERTIFICATE_COMPANY_TAGLINE,
  CERTIFICATE_SECTION_TITLES,
  CERTIFICATE_TITLE,
} from '../certificate/certificate.constants';
import {
  formatCertificateValue,
  formatObservedValue,
  getIsoDeclarationText,
} from '../certificate/certificate.display';
import { buildCertificateMatrixLayout } from '../certificate/certificate.matrix';
import type {
  CertificateChemicalRow,
  CertificateItem,
  CertificateSections,
  CertificateMatrixRow,
  CertificateSizeReference,
} from '../certificate/certificate.types';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit');

type PdfQcData = {
  status: string;
  batch: {
    batchNumber: string;
    grade?: string;
    gradeId?: string;
    tubeType?: string;
  };
  customer: {
    name: string;
  };
  item: Omit<CertificateItem, 'status' | 'categories'> & {
    categories?: CertificateItem['categories'];
  };
  chemicalComposition?: unknown;
  certificateSections?: CertificateSections;
  certificate?: {
    chemicalRows: CertificateChemicalRow[];
    remarks: string;
  };
  tcConfig?: {
    companyName: string;
    companyAddress?: string | null;
    logoUrl?: string | null;
    isoHallmarkUrl?: string | null;
  } | null;
};

type PdfCustomerTcData = {
  batch: {
    batchNumber: string;
    grade?: string;
    gradeId?: string;
    tubeType?: string;
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
    companyAddress?: string | null;
    logoUrl?: string | null;
    isoHallmarkUrl?: string | null;
  } | null;
};

@Injectable()
export class PdfService {
  private currentTcConfig: {
    companyName: string;
    companyAddress?: string | null;
    logoUrl?: string | null;
    isoHallmarkUrl?: string | null;
  } | null = null;
  private compactCertificate = false;
  private readonly margin = 18;
  private readonly pageWidth = 841.89;
  private readonly pageHeight = 595.28;
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
      categories: qcData.item.categories ?? [],
      status: qcData.status,
      certificateSections: qcData.certificateSections,
    };

    this.renderCertificatePage(doc, {
      batchNumber: qcData.batch.batchNumber,
      grade: qcData.batch.grade || qcData.batch.gradeId || '-',
      tubeType: qcData.batch.tubeType || 'Smooth Copper Tube',
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
      tubeType: tcData.batch.tubeType || 'Smooth Copper Tube',
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
    const doc = new PDFDocument({
      margin: this.margin,
      size: 'A4',
      layout: 'landscape',
      autoFirstPage: false,
      bufferPages: true,
    });
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
      tubeType: string;
      customer: string;
      overallStatus: string;
      chemicalRows: CertificateChemicalRow[];
      remarks: string;
      tcConfig?: {
        companyName: string;
        companyAddress?: string | null;
        logoUrl?: string | null;
        isoHallmarkUrl?: string | null;
      } | null;
      items: CertificateItem[];
    },
  ) {
    this.currentTcConfig = data.tcConfig ?? null;
    this.compactCertificate = data.items.length <= 5;

    if (!doc.page) {
      doc.addPage();
      doc.y = this.compactCertificate ? 10 : this.margin;
    }

    this.renderBrandHeader(doc, this.currentTcConfig);
    this.renderTopInfoGrid(doc, data);
    const layout = buildCertificateMatrixLayout(data.items, 5);
    if (this.compactCertificate) {
      this.renderCompactChemicalAndSizeReference(
        doc,
        data.chemicalRows,
        layout.sizeReferences,
      );
    } else {
      this.renderChemicalSection(doc, data.chemicalRows);
      this.renderSizeReference(doc, layout.sizeReferences);
    }
    layout.sizeChunks.forEach((chunk) => {
      this.renderMatrixSection(
        doc,
        `${CERTIFICATE_SECTION_TITLES.dimension} (${chunk.label})`,
        chunk.sizes,
        chunk.sections.dimension.rows,
        18,
      );
      this.renderMatrixSection(
        doc,
        `${CERTIFICATE_SECTION_TITLES.mechanical} (${chunk.label})`,
        chunk.sizes,
        chunk.sections.mechanical.rows,
        18,
      );
      this.renderMatrixSection(
        doc,
        `${CERTIFICATE_SECTION_TITLES.metallurgical} (${chunk.label})`,
        chunk.sizes,
        chunk.sections.metallurgical.rows,
        24,
      );
      this.renderMatrixSection(
        doc,
        `${CERTIFICATE_SECTION_TITLES.ndt} (${chunk.label})`,
        chunk.sizes,
        chunk.sections.ndt.rows,
        18,
      );
    });
    this.renderRemarks(doc, data.overallStatus, data.remarks);
    this.renderSignatureSection(doc);
  }

  private renderBrandHeader(
    doc: InstanceType<typeof PDFDocument>,
    tcConfig?: {
      companyName: string;
      companyAddress?: string | null;
      logoUrl?: string | null;
      isoHallmarkUrl?: string | null;
    } | null,
  ) {
    const y = doc.y;
    const leftW = 74;
    const rightW = 74;
    const centerW = this.contentWidth - leftW - rightW;
    const headerHeight = this.compactCertificate ? 34 : 46;

    this.drawBox(doc, this.margin, y, this.contentWidth, headerHeight);
    this.drawBox(doc, this.margin, y, leftW, headerHeight);
    this.drawBox(doc, this.margin + leftW, y, centerW, headerHeight);
    this.drawBox(doc, this.margin + leftW + centerW, y, rightW, headerHeight);

    const logoSource = this.resolvePdfImageSource(tcConfig?.logoUrl, this.logoPath);
    if (logoSource) {
      doc.image(logoSource, this.margin + 8, y + 4, {
        fit: this.compactCertificate ? [46, 22] : [54, 30],
        align: 'center',
        valign: 'center',
      });
    }

    doc.font('Helvetica-Bold').fontSize(this.compactCertificate ? 10 : 11.5).text(
      tcConfig?.companyName || CERTIFICATE_COMPANY_NAME,
      this.margin + leftW,
      y + (this.compactCertificate ? 3 : 7),
      {
        width: centerW,
        align: 'center',
      },
    );
    doc.font('Helvetica').fontSize(this.compactCertificate ? 5.7 : 7).text(
      tcConfig?.companyAddress || CERTIFICATE_COMPANY_SUBTITLE,
      this.margin + leftW,
      y + (this.compactCertificate ? 13 : 19),
      {
        width: centerW,
        align: 'center',
      },
    );
    doc.fontSize(this.compactCertificate ? 5.7 : 7).text(
      CERTIFICATE_COMPANY_TAGLINE,
      this.margin + leftW,
      y + (this.compactCertificate ? 20 : 28),
      {
        width: centerW,
        align: 'center',
      },
    );

    const isoSource = this.resolvePdfImageSource(tcConfig?.isoHallmarkUrl, this.isoLogoPath);
    if (isoSource) {
      doc.image(isoSource, this.margin + leftW + centerW + 8, y + 4, {
        fit: this.compactCertificate ? [22, 10] : [26, 12],
      });
    }
    if (fs.existsSync(this.rohsLogoPath)) {
      doc.image(this.rohsLogoPath, this.margin + leftW + centerW + 38, y + 4, {
        fit: this.compactCertificate ? [22, 10] : [26, 12],
      });
    }

    doc.y = y + (this.compactCertificate ? 36 : 50);
    doc.font('Helvetica-Bold').fontSize(this.compactCertificate ? 11.5 : 14).text(CERTIFICATE_TITLE, this.margin, doc.y, {
      width: this.contentWidth,
      align: 'center',
      underline: true,
    });
    doc.y += this.compactCertificate ? 8 : 16;
  }

  private renderTopInfoGrid(
    doc: InstanceType<typeof PDFDocument>,
    data: {
      batchNumber: string;
      grade: string;
      tubeType: string;
      customer: string;
    },
  ) {
    const cols = [68, 132, 54, 96, 72, this.contentWidth - 422];
    const y = doc.y;
    const rowGap = this.compactCertificate ? 9 : 14;
    const rowHeight = this.compactCertificate ? 8 : 12;

    this.drawRow(doc, y, ['TC NO', `QC-${data.batchNumber}`, 'DATE', new Date().toLocaleDateString(), 'BATCH NO.', data.batchNumber], cols, {
      fontSize: this.compactCertificate ? 5.9 : 6.2,
      boldCells: [0, 2, 4],
      fillCells: [0, 2, 4],
      rowHeight,
    });
    this.drawRow(doc, y + rowGap, ['M/S.', data.customer || '-', 'P.O. / INV.', '-', 'PRODUCT', data.tubeType || 'Smooth Copper Tube'], cols, {
      fontSize: this.compactCertificate ? 5.9 : 6.2,
      boldCells: [0, 2, 4],
      rowHeight,
    });
    this.drawRow(doc, y + rowGap * 2, ['SPECIFICATION', 'IS 10773:2025', 'GRADE', data.grade || '-', '', ''], cols, {
      fontSize: this.compactCertificate ? 5.9 : 6.2,
      boldCells: [0, 2],
      rowHeight,
    });

    doc.y = y + rowGap * 2 + rowHeight + (this.compactCertificate ? 1 : 20);
  }

  private renderCompactChemicalAndSizeReference(
    doc: InstanceType<typeof PDFDocument>,
    chemicalRows: CertificateChemicalRow[],
    sizeRows: CertificateSizeReference[],
  ) {
    const safeChemicalRows = chemicalRows.length
      ? chemicalRows
      : [{ sr: 1, element: '-', requiredMin: '-', requiredMax: '-', observed: '-', result: '-' }];
    const safeSizeRows = sizeRows.length
      ? sizeRows
      : [{ key: 'S1', sr: 'S1', size: '-', condition: '-', qty: '-', pcs: '-' }];
    const gap = 8;
    const chemicalWidth = 454;
    const sizeWidth = this.contentWidth - chemicalWidth - gap;
    const startX = this.margin;
    const sizeX = startX + chemicalWidth + gap;
    const startY = doc.y;
    const sectionHeight = Math.max(
      8 + 9 + safeChemicalRows.length * 8,
      8 + 9 + safeSizeRows.length * 8,
    );

    this.ensurePageSpace(doc, sectionHeight + 4);

    this.drawSectionHeaderAt(
      doc,
      startX,
      chemicalWidth,
      startY,
      CERTIFICATE_SECTION_TITLES.chemical,
    );
    this.drawSectionHeaderAt(
      doc,
      sizeX,
      sizeWidth,
      startY,
      'SIZE REFERENCE',
    );

    const chemicalTableY = startY + 8;
    const chemicalCols = [20, 118, 54, 54, 60, chemicalWidth - 306];
    this.drawRowAt(
      doc,
      startX,
      chemicalTableY,
      ['SR', 'ELEMENT', 'MIN', 'MAX', 'OBS', 'RES'],
      chemicalCols,
      {
        fontSize: 5.3,
        bold: true,
        fillCells: [0, 1, 2, 3, 4, 5],
        rowHeight: 9,
      },
    );

    safeChemicalRows.forEach((row, index) => {
      this.drawRowAt(
        doc,
        startX,
        chemicalTableY + 9 + index * 8,
        [
          String(row.sr),
          row.element,
          formatCertificateValue(row.requiredMin),
          formatCertificateValue(row.requiredMax),
          formatObservedValue(row.observed, CERTIFICATE_SECTION_TITLES.chemical),
          row.result,
        ],
        chemicalCols,
        {
          fontSize: 5.1,
          resultCell: 5,
          rowHeight: 8,
        },
      );
    });

    const sizeTableY = startY + 8;
    const sizeCols = [24, 108, 70, 44, sizeWidth - 246];
    this.drawRowAt(
      doc,
      sizeX,
      sizeTableY,
      ['SR', 'SIZE', 'COND', 'QTY', 'PCS'],
      sizeCols,
      {
        fontSize: 5.2,
        bold: true,
        fillCells: [0, 1, 2, 3, 4],
        rowHeight: 9,
      },
    );

    safeSizeRows.forEach((row, index) => {
      this.drawRowAt(
        doc,
        sizeX,
        sizeTableY + 9 + index * 8,
        [row.sr, row.size, row.condition, row.qty, row.pcs],
        sizeCols,
        {
          fontSize: 5,
          rowHeight: 8,
        },
      );
    });

    doc.y = startY + sectionHeight + 4;
  }

  private renderChemicalSection(
    doc: InstanceType<typeof PDFDocument>,
    rows: CertificateChemicalRow[],
  ) {
    this.ensurePageSpace(doc, this.compactCertificate ? 64 : 90);
    this.drawSectionHeader(doc, CERTIFICATE_SECTION_TITLES.chemical);
    const cols = [22, 146, 78, 78, 78, this.contentWidth - 402];
    const startY = doc.y;
    this.drawRow(doc, startY, ['SR', 'ELEMENT', 'MIN', 'MAX', 'OBSERVED', 'RESULT'], cols, {
      fontSize: this.compactCertificate ? 5.8 : 6.3,
      bold: true,
      fillCells: [0, 1, 2, 3, 4, 5],
      rowHeight: this.compactCertificate ? 10 : 12,
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
          formatCertificateValue(row.requiredMin),
          formatCertificateValue(row.requiredMax),
          formatObservedValue(row.observed, CERTIFICATE_SECTION_TITLES.chemical),
          row.result,
        ],
        cols,
        {
          fontSize: this.compactCertificate ? 5.7 : 6.1,
          resultCell: 5,
          rowHeight: this.compactCertificate ? 9 : 12,
        },
      );
    });

    doc.y = startY + (this.compactCertificate ? 10 : 12) + safeRows.length * (this.compactCertificate ? 9 : 11) + 2;
  }

  private renderSizeReference(
    doc: InstanceType<typeof PDFDocument>,
    rows: CertificateSizeReference[],
  ) {
    const safeRows = rows.length
      ? rows
      : [{ key: 'S1', sr: 'S1', size: '-', condition: '-', qty: '-', pcs: '-' }];
    if (safeRows.length === 1) {
      this.ensurePageSpace(doc, this.compactCertificate ? 36 : 46);
      this.drawSectionHeader(doc, 'SIZE REFERENCE');
      const startY = doc.y;
      const cols = [28, 220, 190, 80, this.contentWidth - 518];
      this.drawMatrixRow(
        doc,
        startY,
        ['SR', 'SIZE', 'COND', 'QTY', 'PCS'],
        cols,
        this.compactCertificate ? 12 : 14,
        this.compactCertificate ? 5.5 : 5.8,
        [],
        this.mutedFill,
      );
      this.drawMatrixRow(
        doc,
        startY + 14,
        [
          safeRows[0].sr,
          safeRows[0].size,
          safeRows[0].condition,
          safeRows[0].qty,
          safeRows[0].pcs,
        ],
        cols,
        this.compactCertificate ? 13 : 16,
        this.compactCertificate ? 5.5 : 5.8,
        [],
      );
      doc.y = startY + (this.compactCertificate ? 30 : 36);
      return;
    }

    const pairCount = Math.ceil(safeRows.length / 2);
    this.ensurePageSpace(doc, (this.compactCertificate ? 28 : 36) + pairCount * (this.compactCertificate ? 13 : 16));
    this.drawSectionHeader(doc, 'SIZE REFERENCE');
    const cols = [20, 108, 74, 36, 40, 20, 108, 74, 36, 40];
    const startY = doc.y;
    this.drawCompactReferenceRow(
      doc,
      startY,
      ['SR', 'SIZE', 'COND', 'QTY', 'PCS', 'SR', 'SIZE', 'COND', 'QTY', 'PCS'],
      cols,
      this.compactCertificate ? 12 : 14,
      this.compactCertificate ? 5.5 : 5.8,
      [],
      this.mutedFill,
    );

    for (let index = 0; index < pairCount; index += 1) {
      const left = safeRows[index * 2];
      const right = safeRows[index * 2 + 1];
      this.drawCompactReferenceRow(
        doc,
        startY + 14 + index * 16,
        [
          left?.sr ?? '-',
          left?.size ?? '-',
          left?.condition ?? '-',
          left?.qty ?? '-',
          left?.pcs ?? '-',
          right?.sr ?? '-',
          right?.size ?? '-',
          right?.condition ?? '-',
          right?.qty ?? '-',
          right?.pcs ?? '-',
        ],
        cols,
        this.compactCertificate ? 13 : 16,
        this.compactCertificate ? 5.5 : 5.8,
        [],
      );
    }

    doc.y = startY + (this.compactCertificate ? 12 : 14) + pairCount * (this.compactCertificate ? 13 : 16) + (this.compactCertificate ? 5 : 7);
  }

  private renderMatrixSection(
    doc: InstanceType<typeof PDFDocument>,
    title: string,
    sizes: CertificateSizeReference[],
    rows: CertificateMatrixRow[],
    rowHeight = 18,
  ) {
    const effectiveRowHeight = this.compactCertificate ? Math.max(10, rowHeight - 6) : rowHeight;
    const headerHeight = this.compactCertificate ? 10 : 16;
    const cols =
      sizes.length === 1
        ? [22, 220, 188, 160, this.contentWidth - 590]
        : [18, 110, ...sizes.flatMap(() => [38, 36, 28])];
    const headerCells = ['SR', 'TEST', ...sizes.flatMap((size) => [`${size.sr} REQ`, `${size.sr} OBS`, `${size.sr} RES`])];
    const safeRows = rows.length
      ? rows
      : [
          {
            sr: 1,
            test: '-',
            cells: sizes.map(() => ({ required: '-', observed: '-', result: '-' })),
          },
        ];
    this.ensurePageSpace(doc, (this.compactCertificate ? 16 : 24) + (safeRows.length + 1) * effectiveRowHeight);
    this.drawSectionHeader(doc, title);
    const startY = doc.y;
    this.drawMatrixRow(doc, startY, headerCells, cols, headerHeight, this.compactCertificate ? 5.4 : 5.8, headerCells.map((_, index) => index), this.mutedFill);

    safeRows.forEach((row, index) => {
      const rowCells = [
        String(row.sr),
        row.test,
        ...row.cells.flatMap((cell) => [
          this.formatRangeText(cell.required),
          formatObservedValue(cell.observed, title),
          cell.result,
        ]),
      ];
      const resultIndexes = sizes.map((_, sizeIndex) => 4 + sizeIndex * 3);
      this.drawMatrixRow(
        doc,
        startY + headerHeight + index * effectiveRowHeight,
        rowCells,
        cols,
        effectiveRowHeight,
        this.compactCertificate
          ? 5.2
          : title.includes(CERTIFICATE_SECTION_TITLES.metallurgical) ? 5.4 : 5.8,
        resultIndexes,
      );
    });

    doc.y = startY + headerHeight + safeRows.length * effectiveRowHeight + 2;
  }

  private drawMatrixRow(
    doc: InstanceType<typeof PDFDocument>,
    y: number,
    cells: string[],
    widths: number[],
    rowHeight: number,
    fontSize: number,
    resultCells: number[] = [],
    fill?: string,
  ) {
    let x = this.margin;
    cells.forEach((cell, index) => {
      this.drawBox(doc, x, y, widths[index], rowHeight, fill);
      doc
        .font(fill ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(fontSize)
        .fillColor(resultCells.includes(index) ? this.getResultColor(cell) : '#000000')
        .text(cell, x + 2, y + 3, {
          width: widths[index] - 4,
          height: rowHeight - 4,
          lineBreak: false,
          align:
            index === 0
              ? 'center'
              : index === 1
                ? 'left'
                : index % 3 === 0
                  ? 'left'
                  : 'center',
        });
      doc.fillColor('#000000');
      x += widths[index];
    });
  }

  private drawCompactReferenceRow(
    doc: InstanceType<typeof PDFDocument>,
    y: number,
    cells: string[],
    widths: number[],
    rowHeight: number,
    fontSize: number,
    resultCells: number[] = [],
    fill?: string,
  ) {
    let x = this.margin;
    cells.forEach((cell, index) => {
      this.drawBox(doc, x, y, widths[index], rowHeight, fill);
      doc
        .font(fill ? 'Helvetica-Bold' : 'Helvetica')
        .fontSize(fontSize)
        .fillColor(resultCells.includes(index) ? this.getResultColor(cell) : '#000000')
        .text(cell, x + 2, y + 3, {
          width: widths[index] - 4,
          height: rowHeight - 4,
          lineBreak: false,
          align:
            index % 5 === 0
              ? 'center'
              : index % 5 === 1
                ? 'left'
                    : 'center',
        });
      doc.fillColor('#000000');
      x += widths[index];
    });
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
      rowHeight?: number;
    },
  ) {
    let x = this.margin;
    const rowHeight = options?.rowHeight ?? 12;
    cells.forEach((cell, index) => {
      const fill = options?.fillCells?.includes(index) ? this.mutedFill : undefined;
      this.drawBox(doc, x, y, widths[index], rowHeight, fill);
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
          height: rowHeight - 4,
          lineBreak: false,
          align: index === 0 ? 'center' : index === cells.length - 1 ? 'center' : 'left',
        });
      doc.fillColor('#000000');
      x += widths[index];
    });
  }

  private formatRangeText(value: string) {
    if (!value || value === '-') {
      return '-';
    }

    return value.replace(/-?\d+(?:\.\d+)?/g, (match) => formatCertificateValue(match));
  }

  private renderRemarks(
    doc: InstanceType<typeof PDFDocument>,
    status: string,
    extraRemark?: string,
  ) {
    this.ensurePageSpace(doc, this.compactCertificate ? 52 : 76);
    this.drawSectionHeader(doc, CERTIFICATE_SECTION_TITLES.remarks);
    const y = doc.y;
    const resultHeight = this.compactCertificate ? 10 : 16;
    const remarkHeight = this.compactCertificate ? 12 : 22;
    this.drawBox(doc, this.margin, y, this.contentWidth, resultHeight, this.mutedFill);
    doc.font('Helvetica-Bold').fontSize(this.compactCertificate ? 5.8 : 6.7).text(
      `FINAL RESULT: ${status}`,
      this.margin + 4,
      y + 3,
      { width: this.contentWidth - 8, align: 'left' },
    );
    // doc.fillColor(status === 'FAIL' ? '#A30000' : '#0E6B36').text(
    //   status,
    //   this.margin + this.contentWidth - 70,
    //   y + 4,
    //   { width: 60, align: 'right' },
    // );
    doc.fillColor('#000000');

    this.drawBox(doc, this.margin, y + resultHeight, this.contentWidth, remarkHeight);
    doc.font('Helvetica').fontSize(this.compactCertificate ? 5.3 : 6.2).text(
      getIsoDeclarationText(),
      this.margin + 4,
      y + resultHeight + 2,
      { width: this.contentWidth - 8, align: 'left' },
    );

    //this.drawBox(doc, this.margin, y + 38, this.contentWidth, 18);
    // doc.fontSize(6.2).text(
    //   extraRemark || CERTIFICATE_DEFAULT_REMARK,
    //   this.margin + 4,
    //   y + 44,
    //   { width: this.contentWidth - 8, align: 'center' },
    // );

    doc.y = y + resultHeight + remarkHeight + 3;
  }

  private renderSignatureSection(doc: InstanceType<typeof PDFDocument>) {
    this.ensurePageSpace(doc, this.compactCertificate ? 40 : 74);
    const y = doc.y;
    const boxW = this.compactCertificate ? 154 : 160;
    const gap = 12;
    const boxHeight = this.compactCertificate ? 20 : 42;
    this.drawBox(doc, this.margin, y, boxW, boxHeight);
    this.drawBox(doc, this.margin + boxW + gap, y, boxW, boxHeight);
    this.drawDashedBox(doc, this.margin + (boxW + gap) * 2, y, 158, boxHeight);

    doc.font('Helvetica').fontSize(this.compactCertificate ? 5.5 : 7).text(
      'Tested By',
      this.margin,
      y + boxHeight + 2,
      { width: boxW, align: 'center' },
    );
    doc.text(
      'Authorized Signatory',
      this.margin + boxW + gap,
      y + boxHeight + 2,
      { width: boxW, align: 'center' },
    );
    doc.text(
      'Company Stamp',
      this.margin + (boxW + gap) * 2,
      y + boxHeight + 2,
      { width: 158, align: 'center' },
    );
    doc.y = y + boxHeight + 8;
  }

  private drawSectionHeader(doc: InstanceType<typeof PDFDocument>, title: string) {
    const y = doc.y;
    const headerHeight = this.compactCertificate ? 7 : 10;
    this.drawSectionHeaderAt(doc, this.margin, this.contentWidth, y, title, headerHeight);
    doc.y = y + headerHeight;
  }

  private drawSectionHeaderAt(
    doc: InstanceType<typeof PDFDocument>,
    x: number,
    width: number,
    y: number,
    title: string,
    headerHeight = this.compactCertificate ? 7 : 10,
  ) {
    this.drawBox(doc, x, y, width, headerHeight, this.sectionFill);
    doc
      .fillColor('#222222')
      .font('Helvetica-Bold')
      .fontSize(this.compactCertificate ? 6 : 7.2)
      .text(title, x, y + (this.compactCertificate ? 0.7 : 1.5), {
        width,
        align: 'center',
        lineBreak: false,
      });
    doc.fillColor('#000000');
  }

  private drawRowAt(
    doc: InstanceType<typeof PDFDocument>,
    startX: number,
    y: number,
    cells: string[],
    widths: number[],
    options?: {
      bold?: boolean;
      boldCells?: number[];
      fillCells?: number[];
      fontSize?: number;
      resultCell?: number;
      rowHeight?: number;
    },
  ) {
    let x = startX;
    const rowHeight = options?.rowHeight ?? 12;
    cells.forEach((cell, index) => {
      const fill = options?.fillCells?.includes(index) ? this.mutedFill : undefined;
      this.drawBox(doc, x, y, widths[index], rowHeight, fill);
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
        .text(cell, x + 2, y + 2.2, {
          width: widths[index] - 4,
          height: rowHeight - 3,
          lineBreak: false,
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

}
