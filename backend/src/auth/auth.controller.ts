import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsEmail, IsIn, IsOptional, IsString, MinLength } from 'class-validator';
import { AuthService } from './auth.service';
import { Public, Roles } from './decorators';

class LoginDto {
  @IsString({ message: 'email é obrigatório' }) email: string;
  @IsString({ message: 'password é obrigatório' }) password: string;
}

class CreateUserDto {
  @IsEmail({}, { message: 'email inválido' }) email: string;
  @IsString({ message: 'password é obrigatório' }) @MinLength(8, { message: 'password deve ter no mínimo 8 caracteres' }) password: string;
  @IsOptional() @IsIn(['admin', 'collector'], { message: 'role deve ser admin ou collector' }) role?: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // 10 tentativas/min por IP
  @Post('login')
  @HttpCode(200)
  login(@Body() b: LoginDto) { return this.auth.login(b.email, b.password); }

  @Get('me') me(@Req() req: any) { return req.user; }

  @Roles('admin') @Post('users')
  createUser(@Body() b: CreateUserDto) { return this.auth.createUser(b.email, b.password, b.role ?? 'collector'); }

  @Roles('admin') @Get('users')
  users() { return this.auth.list(); }
}
