import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { HitController } from './hit.controller';
import { HitService } from './hit.service';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule, JwtModule.register({})],
  controllers: [HitController],
  providers: [HitService],
})
export class HitModule {}
