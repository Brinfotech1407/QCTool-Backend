import { Module } from '@nestjs/common';
import { RuleDefinitionService } from './rule-definition.service';
import { RuleDefinitionController } from './rule-definition.controller';
import { PrismaService } from '../prisma/prisma.service';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';


@Module({
  imports: [RuleEngineModule],
  controllers: [RuleDefinitionController],
  providers: [RuleDefinitionService, PrismaService],
})
export class RuleDefinitionModule { }
