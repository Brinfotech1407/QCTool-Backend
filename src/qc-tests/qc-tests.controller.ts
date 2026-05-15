import { Body, Controller, Get, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ExcelService } from '../excel/excel.service';
import { PdfService } from '../pdf/pdf.service';
import { CreateQCTestDto } from './dto/create-qc-test.dto';
import { QcTestsService } from './qc-tests.service';

type JwtRequest = {
  user: {
    sub: string;
    role: UserRole;
    companyId: string | null;
  };
};

@Controller('qc-tests')
@UseGuards(JwtAuthGuard, RolesGuard)
export class QcTestsController {
  constructor(
    private readonly qcTestsService: QcTestsService,
    private readonly pdfService: PdfService,
    private readonly excelService: ExcelService,
  ) {}

  @Roles(UserRole.QC_USER)
  @Post()
  create(@Req() req: JwtRequest, @Body() dto: CreateQCTestDto) {
    return this.qcTestsService.create(req.user, dto);
  }

  @Roles(UserRole.PLATFORM_ADMIN, UserRole.COMPANY_ADMIN, UserRole.QC_USER)
  @Get()
  list(@Req() req: JwtRequest) {
    return this.qcTestsService.list(req.user);
  }

  @Roles(UserRole.PLATFORM_ADMIN, UserRole.COMPANY_ADMIN, UserRole.QC_USER)
  @Get('batch/:batchId')
  getBatchQc(@Req() req: JwtRequest, @Param('batchId') batchId: string) {
    return this.qcTestsService.getBatchQc(req.user, batchId);
  }

  @Roles(UserRole.PLATFORM_ADMIN, UserRole.COMPANY_ADMIN, UserRole.QC_USER)
  @Get(':batchId/customers/:customerId/pdf')
  async getCustomerPdf(
    @Req() req: JwtRequest,
    @Param('batchId') batchId: string,
    @Param('customerId') customerId: string,
    @Res() res: Response,
  ) {
    const tcData = await this.qcTestsService.getCustomerTcData(
      req.user,
      batchId,
      customerId,
    );
    this.pdfService.generateCustomerQCReport(res, tcData);
  }

  @Roles(UserRole.PLATFORM_ADMIN, UserRole.COMPANY_ADMIN, UserRole.QC_USER)
  @Get(':batchId/customers/:customerId/excel')
  async getCustomerExcel(
    @Req() req: JwtRequest,
    @Param('batchId') batchId: string,
    @Param('customerId') customerId: string,
    @Res() res: Response,
  ) {
    const tcData = await this.qcTestsService.getCustomerTcData(
      req.user,
      batchId,
      customerId,
    );
    const buffer = await this.excelService.generateCustomerQCReport(tcData);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader(
      'Content-Disposition',
      `attachment; filename=QC-${batchId}-${customerId}.xlsx`,
    );
    res.send(buffer);
  }

  @Roles(UserRole.PLATFORM_ADMIN, UserRole.COMPANY_ADMIN, UserRole.QC_USER)
  @Get(':id/pdf')
  async getPdfPreview(
    @Req() req: JwtRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const record = await this.qcTestsService.getRecord(req.user, id);
    this.pdfService.generateQCReport(res, record);
  }

  @Roles(UserRole.PLATFORM_ADMIN, UserRole.COMPANY_ADMIN, UserRole.QC_USER)
  @Get(':id/excel')
  async getExcelReport(
    @Req() req: JwtRequest,
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    const record = await this.qcTestsService.getRecord(req.user, id);
    const buffer = await this.excelService.generateQCReport(record);

    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.setHeader('Content-Disposition', `attachment; filename=QC-${id}.xlsx`);
    res.send(buffer);
  }

  @Roles(UserRole.PLATFORM_ADMIN, UserRole.COMPANY_ADMIN, UserRole.QC_USER)
  @Get(':id')
  getRecord(@Req() req: JwtRequest, @Param('id') id: string) {
    return this.qcTestsService.getRecord(req.user, id);
  }
}
