import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserService } from './user.service';
import { CreateUserDto } from './dto/create-user.dto';

import { JwtAuthGuard } from '../auth/jwt.guard';
import { RolesGuard } from '../auth/roles.guard';
import { Roles } from '../auth/roles.decorator';
import { UserRole } from '@prisma/client';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN)
  @Post()
  create(@Body() body: CreateUserDto) {
    return this.userService.create(body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COMPANY_ADMIN)
  @Post('qc')
  createQcUser(@Req() req: any, @Body() body: CreateUserDto) {
    return this.userService.createQcUserByCompanyAdmin(req.user.sub, body);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.PLATFORM_ADMIN)
  @Get()
  getAll(@Query() query: any) {
    return this.userService.findAll(query);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.COMPANY_ADMIN)
  @Get('company/qc')
  getCompanyQcUsers(@Req() req: any) {
    return this.userService.findCompanyQcUsers(req.user.sub);
  }

  @Post('bootstrap-platform-admin')
  createFirstPlatformAdmin(@Body() body: CreateUserDto) {
    return this.userService.create(body);
  }
}
