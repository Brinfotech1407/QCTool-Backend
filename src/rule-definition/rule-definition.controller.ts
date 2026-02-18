import { Controller, Get, Post, Put, Delete, Param, Body } from '@nestjs/common';
import { RuleDefinitionService } from './rule-definition.service';

@Controller('rule-definition')
export class RuleDefinitionController {
    constructor(private service: RuleDefinitionService) { }

    @Get(':parameterId')
    get(@Param('parameterId') parameterId: string) {
        return this.service.findByParameter(parameterId);
    }

    @Post()
    create(@Body() body: any) {
        return this.service.createOrUpdate(body);
    }

    @Put(':id')
    update(@Param('id') id: string, @Body() body: any) {
        return this.service.update(id, body);
    }

    @Delete(':id')
    remove(@Param('id') id: string) {
        return this.service.delete(id);
    }
}
