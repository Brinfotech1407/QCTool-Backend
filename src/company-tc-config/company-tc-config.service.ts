import { ForbiddenException, Injectable } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SaveCompanyTcConfigDto } from './dto/save-company-tc-config.dto';

type JwtUser = {
  sub: string;
  role: UserRole;
  companyId: string | null;
};

@Injectable()
export class CompanyTcConfigService {
  constructor(private readonly prisma: PrismaService) {}

  async findOne(user: JwtUser) {
    const companyId = this.getCompanyId(user, false);
    return (this.prisma as any).companyTcConfig.findUnique({ where: { companyId } });
  }

  async save(user: JwtUser, dto: SaveCompanyTcConfigDto) {
    const companyId = this.getCompanyId(user, true);
    return (this.prisma as any).companyTcConfig.upsert({
      where: { companyId },
      create: {
        companyId,
        companyName: dto.companyName,
        companyAddress: dto.companyAddress || null,
        logoUrl: dto.logoUrl || null,
        isoHallmarkUrl: dto.isoHallmarkUrl || null,
      },
      update: {
        companyName: dto.companyName,
        companyAddress: dto.companyAddress || null,
        logoUrl: dto.logoUrl || null,
        isoHallmarkUrl: dto.isoHallmarkUrl || null,
      },
    });
  }

  async remove(user: JwtUser) {
    const companyId = this.getCompanyId(user, true);
    await (this.prisma as any).companyTcConfig.deleteMany({ where: { companyId } });
    return { success: true };
  }

  private getCompanyId(user: JwtUser, requireAdmin: boolean) {
    if (requireAdmin && user.role !== UserRole.COMPANY_ADMIN) {
      throw new ForbiddenException('Only company admin can modify TC header configuration');
    }
    if (!requireAdmin && user.role !== UserRole.COMPANY_ADMIN && user.role !== UserRole.QC_USER) {
      throw new ForbiddenException('Not allowed to access TC header configuration');
    }
    if (!user.companyId) {
      throw new ForbiddenException('User is not mapped to a company');
    }
    return user.companyId;
  }
}
