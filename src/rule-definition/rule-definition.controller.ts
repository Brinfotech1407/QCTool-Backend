import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseGuards,
} from '@nestjs/common';
import { RuleDefinitionService } from './rule-definition.service';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';

@Controller('rule-definition')
@UseGuards(JwtAuthGuard, RolesGuard)
export class RuleDefinitionController {
    constructor(private service: RuleDefinitionService) { }

    @Roles(
        UserRole.PLATFORM_ADMIN,
        UserRole.COMPANY_ADMIN,
        UserRole.QC_USER,
        UserRole.AUDITOR,
    )
    @Get(':parameterId')
    get(@Param('parameterId') parameterId: string) {
        return this.service.findByParameter(parameterId);
    }

    @Roles(UserRole.PLATFORM_ADMIN)
    @Post()
    create(@Body() body: any) {
        return this.service.createOrUpdate(body);
    }

    @Roles(UserRole.PLATFORM_ADMIN)
    @Put(':id')
    update(@Param('id') id: string, @Body() body: any) {
        return this.service.update(id, body);
    }

    @Roles(UserRole.PLATFORM_ADMIN)
    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.delete(id);
    }

    @Roles(UserRole.PLATFORM_ADMIN, UserRole.QC_USER)
    @Post('validate')
    validate(@Body() body: any) {
        return this.service.validateRule(body);
    }
}
