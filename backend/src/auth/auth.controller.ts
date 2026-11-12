import { Body, Controller, Get, HttpCode, Post, UnauthorizedException } from '@nestjs/common';
import { authRequired, checkPassword, issueSession } from './session';

@Controller('auth')
export class AuthController {
  @Get('status')
  status() {
    return { authRequired: authRequired() };
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: { password?: unknown }) {
    if (!authRequired()) return { token: null, expiresAt: null };
    if (!checkPassword(body?.password)) throw new UnauthorizedException('Contraseña incorrecta.');
    return issueSession();
  }
}
