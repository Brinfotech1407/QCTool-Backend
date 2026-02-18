import { Module } from '@nestjs/common';
import { TestController } from './test.controller';
import { TestService } from './test.service';
import { RuleEngineModule } from '../rule-engine/rule-engine.module';


@Module({
  imports: [RuleEngineModule],  // 👈 ADD THIS
  controllers: [TestController],
  providers: [TestService]
})
export class TestModule { }
