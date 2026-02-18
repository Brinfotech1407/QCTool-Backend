import { Body, Controller, Get, Post, Query, Put, Delete, Param } from '@nestjs/common';
import { TestService } from './test.service';
import { CreateTestDto } from './dto/create-test.dto';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { RuleEngineService } from '../rule-engine/rule-engine.service';
import { PrismaService } from '../prisma/prisma.service';
@Controller('tests')
export class TestController {
  constructor(private service: TestService, private readonly prisma: PrismaService,
    private readonly ruleEngine: RuleEngineService,) { }

  @Roles(UserRole.PLATFORM_ADMIN)
  @Post()
  create(@Body() dto: CreateTestDto) {
    return this.service.create(dto);
  }

  @Get()
  findByCategory(@Query('categoryId') categoryId: string) {
    return this.service.findByCategory(categoryId);
  }

  @Put(':id')
  update(@Param('id') id: string, @Body() dto: CreateTestDto) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Get('debug-od')
  async debugOD() {

    const parameter = await this.prisma.testParameter.findFirst({
      where: { name: 'OD Value' },
      include: {
        ruleDefinition: true,
        defaultCriteria: true,
      },
    });

    if (!parameter) {
      return { error: 'OD parameter not found' };
    }

    const result = this.ruleEngine.evaluate(
      parameter,
      { nominalValue: 6 },  // simulate batch OD
      6.0                  // simulate measured value
    );

    return result;
  }

  @Get('debug-wt')
  async debugWT() {

    const parameter = await this.prisma.testParameter.findFirst({
      where: { name: 'WT Value' }, // adjust name
      include: {
        ruleDefinition: true,
        defaultCriteria: true,
      },
    });

    const result = this.ruleEngine.evaluate(
      parameter,
      {
        wallThickness: 0.5,
        outerDiameter: 6
      },
      0.60
    );

    return result;
  }
}


