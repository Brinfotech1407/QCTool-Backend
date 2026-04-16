import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { JwtAuthGuard } from '../auth/jwt.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { CreateHitDto } from './dto/create-hit.dto';
import { QueryHitDto } from './dto/query-hit.dto';
import { UpdateHitDto } from './dto/update-hit.dto';
import { HitService } from './hit.service';

type JwtRequest = {
  user: {
    sub: string;
    role: UserRole;
    companyId: string | null;
  };
};

@Controller('hit')
@UseGuards(JwtAuthGuard, RolesGuard)
export class HitController {
  constructor(private readonly hitService: HitService) {}

  @Roles(UserRole.QC_USER)
  @Post()
  create(@Req() req: JwtRequest, @Body() dto: CreateHitDto) {
    return this.hitService.create(req.user, dto);
  }

  @Roles(UserRole.PLATFORM_ADMIN, UserRole.COMPANY_ADMIN, UserRole.QC_USER)
  @Get()
  findAll(@Req() req: JwtRequest, @Query() query: QueryHitDto) {
    return this.hitService.findAll(req.user, query);
  }

  @Roles(UserRole.PLATFORM_ADMIN, UserRole.COMPANY_ADMIN, UserRole.QC_USER)
  @Get(':id')
  findOne(@Req() req: JwtRequest, @Param('id') id: string) {
    return this.hitService.findOne(req.user, id);
  }

  @Roles(UserRole.QC_USER)
  @Patch(':id')
  update(
    @Req() req: JwtRequest,
    @Param('id') id: string,
    @Body() dto: UpdateHitDto,
  ) {
    return this.hitService.update(req.user, id, dto);
  }
}
