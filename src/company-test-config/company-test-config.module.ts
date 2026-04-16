import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CompanyTestConfigController } from './company-test-config.controller';
import { CompanyTestConfigService } from './company-test-config.service';

@Module({
  imports: [PrismaModule],
  controllers: [CompanyTestConfigController],
  providers: [CompanyTestConfigService],
})
export class CompanyTestConfigModule {}
