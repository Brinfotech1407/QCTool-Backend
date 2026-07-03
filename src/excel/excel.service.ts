import { Injectable } from '@nestjs/common';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Workbook, type Worksheet } from 'exceljs';
import {
  CERTIFICATE_COMPANY_NAME,
  CERTIFICATE_COMPANY_SUBTITLE,
  CERTIFICATE_COMPANY_TAGLINE,
  CERTIFICATE_SECTION_TITLES,
  CERTIFICATE_TITLE,
} from '../certificate/certificate.constants';
import { formatObservedValue, getIsoDeclarationText } from '../certificate/certificate.display';
import { buildCertificateMatrixLayout } from '../certificate/certificate.matrix';
import type {
  CertificateChemicalRow,
  CertificateItem,
  CertificateSections,
  CertificateMatrixRow,
  CertificateSizeReference,
} from '../certificate/certificate.types';

type ExcelQcData = {
  id: string;
  status?: string;
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

type ExcelCustomerTcData = {
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
export class ExcelService {
  private readonly sectionFill = 'FFF6ECA2';
  private readonly headerFill = 'FFF7F7F7';
  private readonly passFill = 'FFC6EFCE';
  private readonly failFill = 'FFFFC7CE';
  private readonly logoPath = path.join(process.cwd(), 'src', 'assets', 'logo.png');
  private readonly isoLogoPath = path.join(process.cwd(), 'src', 'assets', 'iso.png');
  private readonly border = {
    top: { style: 'thin' as const },
    left: { style: 'thin' as const },
    bottom: { style: 'thin' as const },
    right: { style: 'thin' as const },
  };

  async generateQCReport(qcData: ExcelQcData): Promise<Buffer> {
    const workbook = this.createWorkbook();
    const sheet = workbook.addWorksheet('Test Certificate', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      views: [{ showGridLines: false }],
    });

    this.configureSheet(sheet);
    this.renderCertificateSheet(sheet, {
      batchNumber: qcData.batch.batchNumber,
      grade: qcData.batch.grade || qcData.batch.gradeId || '-',
      tubeType: qcData.batch.tubeType || 'Smooth Copper Tube',
      customer: qcData.customer.name,
      overallStatus: qcData.status || 'PASS',
      chemicalRows: qcData.certificate?.chemicalRows ?? [],
      remarks: qcData.certificateSections?.remarks ?? qcData.certificate?.remarks ?? '',
      tcConfig: qcData.tcConfig ?? null,
      items: [
        {
          ...qcData.item,
          categories: qcData.item.categories ?? [],
          status: qcData.status || 'PASS',
          certificateSections: qcData.certificateSections,
        },
      ],
    });

    return Buffer.from((await workbook.xlsx.writeBuffer()) as ArrayBuffer);
  }

  async generateCustomerQCReport(tcData: ExcelCustomerTcData): Promise<Buffer> {
    const workbook = this.createWorkbook();
    const sheet = workbook.addWorksheet('Test Certificate', {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
      views: [{ showGridLines: false }],
    });

    this.configureSheet(sheet);
    this.renderCertificateSheet(sheet, {
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
      { width: 24 },
      { width: 14 },
      { width: 14 },
      { width: 16 },
      { width: 14 },
      { width: 12 },
      { width: 16 },
      { width: 14 },
      { width: 12 },
      { width: 16 },
      { width: 14 },
      { width: 12 },
      { width: 16 },
      { width: 14 },
      { width: 12 },
      { width: 16 },
      { width: 14 },
      { width: 12 },
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
    let row = 1;
    row = this.renderHeader(sheet, row, data.tcConfig ?? null);
    row = this.renderInfoGrid(sheet, row, data);
    row = this.renderChemicalSection(sheet, row, data.chemicalRows);
    const layout = buildCertificateMatrixLayout(data.items, 5);
    row = this.renderSizeReferenceSection(sheet, row, layout.sizeReferences);
    layout.sizeChunks.forEach((chunk) => {
      row = this.renderMatrixSection(
        sheet,
        row,
        `${CERTIFICATE_SECTION_TITLES.dimension} (${chunk.label})`,
        chunk.sizes,
        chunk.sections.dimension.rows,
      );
      row = this.renderMatrixSection(
        sheet,
        row,
        `${CERTIFICATE_SECTION_TITLES.mechanical} (${chunk.label})`,
        chunk.sizes,
        chunk.sections.mechanical.rows,
      );
      row = this.renderMatrixSection(
        sheet,
        row,
        `${CERTIFICATE_SECTION_TITLES.metallurgical} (${chunk.label})`,
        chunk.sizes,
        chunk.sections.metallurgical.rows,
        true,
      );
      row = this.renderMatrixSection(
        sheet,
        row,
        `${CERTIFICATE_SECTION_TITLES.ndt} (${chunk.label})`,
        chunk.sizes,
        chunk.sections.ndt.rows,
      );
    });

    row = this.renderRemarks(sheet, row, data.overallStatus, data.remarks);
    this.renderSignatureSection(sheet, row);
  }

  private renderHeader(
    sheet: Worksheet,
    row: number,
    tcConfig?: {
      companyName: string;
      companyAddress?: string | null;
      logoUrl?: string | null;
      isoHallmarkUrl?: string | null;
    } | null,
  ) {
    this.mergeAndBorder(sheet, `A${row}:B${row + 2}`);
    this.mergeAndBorder(sheet, `C${row}:J${row + 2}`);
    this.mergeAndBorder(sheet, `K${row}:L${row + 2}`);
    const logoImageId = this.addWorkbookImage(
      sheet.workbook,
      tcConfig?.logoUrl,
      this.logoPath,
    );
    if (logoImageId) {
      sheet.addImage(logoImageId, {
        tl: { col: 0.2, row: row - 0.85 },
        ext: { width: 70, height: 42 },
      });
    } else {
      this.setValue(sheet, `A${row}`, 'LOGO', {
        bold: true,
        align: 'center',
        valign: 'middle',
      });
    }
    this.setValue(sheet, `C${row}`, tcConfig?.companyName || CERTIFICATE_COMPANY_NAME, {
      bold: true,
      size: 14,
      align: 'center',
    });
    this.setValue(sheet, `C${row + 1}`, tcConfig?.companyAddress || CERTIFICATE_COMPANY_SUBTITLE, { align: 'center' });
    this.setValue(sheet, `C${row + 2}`, CERTIFICATE_COMPANY_TAGLINE, { align: 'center' });
    const isoImageId = this.addWorkbookImage(
      sheet.workbook,
      tcConfig?.isoHallmarkUrl,
      this.isoLogoPath,
    );
    if (isoImageId) {
      sheet.addImage(isoImageId, {
        tl: { col: 10.1, row: row - 0.8 },
        ext: { width: 58, height: 26 },
      });
    } else {
      this.setValue(sheet, `K${row + 1}`, 'ISO / RoHS', { bold: true, align: 'center' });
    }

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
    data: { batchNumber: string; grade: string; tubeType: string; customer: string },
  ) {
    const rows = [
      ['TC NO', `QC-${data.batchNumber}`, 'DATE', new Date().toLocaleDateString(), 'BATCH NO.', data.batchNumber],
      ['M/S.', data.customer || '-', 'P.O. / INV.', '-', 'PRODUCT TYPE', data.tubeType || 'Smooth Copper Tube'],
      ['PRODUCT', data.tubeType || 'Smooth Copper Tube', '', '', '', ''],
      ['SPECIFICATION', 'IS 10773:2025', 'GRADE', data.grade || '-', '', ''],
    ];

    rows.forEach((values, index) => {
      const currentRow = row + index;
      this.writeGridRow(sheet, currentRow, values, [1, 2, 7, 8, 10, 11], [1, 6, 7, 9, 10, 12], index === 2 ? 24 : 18);
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
        [String(entry.sr), entry.element, entry.requiredMin, entry.requiredMax, formatObservedValue(entry.observed, CERTIFICATE_SECTION_TITLES.chemical), entry.result],
        ['A', 'B', 'D', 'F', 'H', 'J'],
        [1, 3, 5, 7, 9, 11],
      );
      this.colorResultCell(sheet.getCell(`J${currentRow}`), entry.result);
    });

    return headerRow + safeRows.length + 2;
  }

  private renderSizeReferenceSection(
    sheet: Worksheet,
    row: number,
    rows: CertificateSizeReference[],
  ) {
    row = this.renderSectionHeader(sheet, row, 'SIZE REFERENCE');
    const headerRow = row;
    const normalizedRows = rows.length
      ? rows
      : [{ key: 'S1', sr: 'S1', size: '-', condition: '-', qty: '-', pcs: '-' }];
    const pairCount = Math.ceil(normalizedRows.length / 2);
    const starts = ['A', 'B', 'F', 'I', 'J', 'K', 'L', 'P', 'Q', 'R'];
    const ends = [1, 5, 8, 9, 10, 11, 15, 16, 17, 18];
    this.writeTableRow(
      sheet,
      headerRow,
      ['SR', 'SIZE', 'COND', 'QTY', 'PCS', 'SR', 'SIZE', 'COND', 'QTY', 'PCS'],
      starts,
      ends,
      true,
    );

    for (let index = 0; index < pairCount; index += 1) {
      const currentRow = headerRow + 1 + index;
      const left = normalizedRows[index * 2];
      const right = normalizedRows[index * 2 + 1];
      this.writeTableRow(
        sheet,
        currentRow,
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
        starts,
        ends,
      );
    }

    return headerRow + pairCount + 2;
  }

  private renderMatrixSection(
    sheet: Worksheet,
    row: number,
    title: string,
    sizes: CertificateSizeReference[],
    rows: CertificateMatrixRow[],
    tall = false,
  ) {
    row = this.renderSectionHeader(sheet, row, title);
    const headerRow = row;
    const headers = ['SR', 'TEST', ...sizes.flatMap((size) => [`${size.sr} REQ`, `${size.sr} OBS`, `${size.sr} RES`])];
    const starts = ['A', 'B', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R'];
    const ends = [1, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    this.writeTableRow(sheet, headerRow, headers, starts.slice(0, headers.length), ends.slice(0, headers.length), true);
    const safeRows = rows.length
      ? rows
      : [
          {
            sr: 1,
            test: '-',
            cells: sizes.map(() => ({ required: '-', observed: '-', result: '-' })),
          },
        ];

    safeRows.forEach((entry, index) => {
      const currentRow = headerRow + 1 + index;
      const values = [
        String(entry.sr),
        entry.test,
        ...entry.cells.flatMap((cell) => [
          cell.required,
          formatObservedValue(cell.observed, title),
          cell.result,
        ]),
      ];
      this.writeTableRow(
        sheet,
        currentRow,
        values,
        starts.slice(0, values.length),
        ends.slice(0, values.length),
      );
      sheet.getRow(currentRow).height = tall ? 30 : 18;
      sheet.getCell(`B${currentRow}`).alignment = {
        vertical: 'middle',
        horizontal: 'left',
        wrapText: tall,
      };
      entry.cells.forEach((_cell, cellIndex) => {
        const resultColNumber = 6 + cellIndex * 3;
        this.colorResultCell(sheet.getCell(currentRow, resultColNumber), entry.cells[cellIndex].result);
      });
    });

    return headerRow + safeRows.length + 2;
  }

  private renderRemarks(sheet: Worksheet, row: number, status: string, remarks: string) {
    row = this.renderSectionHeader(sheet, row, CERTIFICATE_SECTION_TITLES.remarks);
    this.mergeAndBorder(sheet, `A${row}:Q${row}`);
    this.mergeAndBorder(sheet, `R${row}:R${row}`);
    this.setValue(sheet, `A${row}`, `FINAL RESULT: ${status}`, { bold: true, fill: this.headerFill });
    // this.setValue(sheet, `L${row}`, status, { bold: true, align: 'center', fill: this.headerFill });
    // this.colorResultCell(sheet.getCell(`L${row}`), status);

    this.mergeAndBorder(sheet, `A${row + 1}:R${row + 2}`);
    this.setValue(
      sheet,
      `A${row + 1}`,
      getIsoDeclarationText(),
      { wrapText: true },
    );
    sheet.getRow(row + 1).height = 18;
    sheet.getRow(row + 2).height = 18;

    return row + 4;
  }

  private renderSignatureSection(sheet: Worksheet, row: number) {
    this.mergeAndBorder(sheet, `A${row}:F${row + 2}`);
    this.mergeAndBorder(sheet, `G${row}:L${row + 2}`);
    this.mergeAndBorder(sheet, `M${row}:R${row + 2}`);
    this.setValue(sheet, `A${row + 3}`, 'Tested By', { align: 'center' });
    this.setValue(sheet, `G${row + 3}`, 'Authorized Signatory', { align: 'center' });
    this.setValue(sheet, `M${row + 3}`, 'Company Stamp', { align: 'center' });
  }

  private renderSectionHeader(sheet: Worksheet, row: number, title: string) {
    this.mergeAndBorder(sheet, `A${row}:R${row}`);
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

  private addWorkbookImage(
    workbook: Workbook,
    value: string | null | undefined,
    fallbackPath: string,
  ) {
    const normalized = String(value ?? '').trim();

    if (normalized.startsWith('data:image/')) {
      return workbook.addImage({
        base64: normalized,
        extension: this.getImageExtensionFromDataUrl(normalized),
      });
    }

    const sourcePath = normalized && fs.existsSync(normalized) ? normalized : fallbackPath;
    if (!fs.existsSync(sourcePath)) {
      return null;
    }

    return workbook.addImage({
      filename: sourcePath,
      extension: this.getImageExtensionFromPath(sourcePath),
    });
  }

  private getImageExtensionFromDataUrl(dataUrl: string): 'png' | 'jpeg' {
    return /data:image\/jpe?g/i.test(dataUrl) ? 'jpeg' : 'png';
  }

  private getImageExtensionFromPath(filePath: string): 'png' | 'jpeg' {
    return /\.jpe?g$/i.test(filePath) ? 'jpeg' : 'png';
  }

}
