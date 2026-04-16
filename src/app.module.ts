import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { CompanyModule } from './company/company.module';
import { UserModule } from './user/user.module';
import { AuthModule } from './auth/auth.module';
import { ConfigModule } from '@nestjs/config';
import { StandardModule } from './standard/standard.module';
import { TestCategoryModule } from './test-category/test-category.module';
import { TestModule } from './test/test.module';
import { ParameterModule } from './parameter/parameter.module';
import { RuleEngineModule } from './rule-engine/rule-engine.module';
import { RuleDefinitionModule } from './rule-definition/rule-definition';
import { HitModule } from './hit/hit.module';
import { BatchModule } from './batch/batch.module';
import { CompanyTestConfigModule } from './company-test-config/company-test-config.module';
import { BatchTestsModule } from './batch-tests/batch-tests.module';



@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }),PrismaModule, CompanyModule, UserModule, AuthModule, StandardModule, TestCategoryModule, TestModule, ParameterModule, RuleEngineModule,RuleDefinitionModule, HitModule, BatchModule, CompanyTestConfigModule, BatchTestsModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
