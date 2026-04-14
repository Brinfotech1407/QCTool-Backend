import { Body, Controller, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserRole } from '@prisma/client';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('company-admin/login')
  companyAdminLogin(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password, [
      UserRole.COMPANY_ADMIN,
    ]);
  }

  @Post('qc-user/login')
  qcUserLogin(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password, [UserRole.QC_USER]);
  }
}
