import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { BatchTestsController } from './batch-tests.controller';
import { BatchTestsService } from './batch-tests.service';

@Module({
  imports: [PrismaModule],
  controllers: [BatchTestsController],
  providers: [BatchTestsService],
})
export class BatchTestsModule {}
