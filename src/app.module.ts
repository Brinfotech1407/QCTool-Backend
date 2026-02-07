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



@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true }),PrismaModule, CompanyModule, UserModule, AuthModule, StandardModule, TestCategoryModule, TestModule, ParameterModule],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
