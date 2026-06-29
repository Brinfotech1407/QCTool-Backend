import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CompanyTcConfigController } from './company-tc-config.controller';
import { CompanyTcConfigService } from './company-tc-config.service';

@Module({
  imports: [PrismaModule],
  controllers: [CompanyTcConfigController],
  providers: [CompanyTcConfigService],
  exports: [CompanyTcConfigService],
})
export class CompanyTcConfigModule {}
