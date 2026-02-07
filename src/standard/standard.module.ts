import { Module } from '@nestjs/common';
import { StandardController } from './standard.controller';
import { StandardService } from './standard.service';

@Module({
  controllers: [StandardController],
  providers: [StandardService]
})
export class StandardModule {}
