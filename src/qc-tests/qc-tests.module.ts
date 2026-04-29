import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';
import { QcTestsController } from './qc-tests.controller';
import { QcTestsService } from './qc-tests.service';

@Module({
  imports: [PrismaModule, RuleEngineModule],
  controllers: [QcTestsController],
  providers: [QcTestsService],
})
export class QcTestsModule {}
