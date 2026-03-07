import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { ServiceHmacGuard } from '../../common/guards/service-hmac.guard';
import { Public } from '../../common/decorators/public.decorator';
import { GetAuthService } from '../../common/decorators/auth-service.decorator';
import { AuthServicePrincipal } from '../../common/interfaces/auth-service.interface';
import { AuthService } from './auth.service';
import { IssueUserTicketRequestDto, TokenPairResponseDto } from './dtos/issue-user-ticket.dto';
import { RefreshTokenRequestDto } from './dtos/refresh-token.dto';
import {
  ServiceTokenIssueRequestDto,
  ServiceTokenIssueResponseDto,
} from './dtos/service-token.dto';

@Controller({
  path: 'auth',
  version: '1',
})
@ApiTags('인증')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('service/token')
  @Public()
  @UseGuards(ServiceHmacGuard)
  @ApiOperation({ summary: '서비스 서명 인증 후 유저 토큰 발급' })
  @ApiHeader({
    name: 'x-key-id',
    required: true,
    description: '서비스 키 ID',
  })
  @ApiHeader({
    name: 'x-timestamp',
    required: true,
    description: '요청 시간(epoch seconds)',
  })
  @ApiHeader({
    name: 'x-nonce',
    required: true,
    description: '재전송 방지 nonce',
  })
  @ApiHeader({
    name: 'x-signature',
    required: true,
    description: 'HMAC-SHA256 signature',
  })
  @ApiResponse({ status: 201, type: ServiceTokenIssueResponseDto })
  issueServiceUserToken(
    @GetAuthService() serviceAuth: AuthServicePrincipal,
    @Body() dto: ServiceTokenIssueRequestDto,
  ): Promise<ServiceTokenIssueResponseDto> {
    return this.authService.issueServiceUserToken(serviceAuth, dto);
  }

  @Post('tickets')
  @Public()
  @UseGuards(InternalApiKeyGuard)
  @ApiOperation({ summary: '유저 티켓 발급 (internal key 필요)' })
  @ApiHeader({
    name: 'x-internal-api-key',
    required: true,
    description: '신뢰 서버 인증용 내부 API 키',
  })
  @ApiResponse({ status: 201, type: TokenPairResponseDto })
  @ApiOperation({ summary: '유저 티켓 발급 (legacy internal key)' })
  issueUserTicket(@Body() dto: IssueUserTicketRequestDto): Promise<TokenPairResponseDto> {
    return this.authService.issueUserTicket(dto);
  }

  @Post('refresh')
  @Public()
  @ApiOperation({ summary: 'refresh token으로 access token 재발급' })
  @ApiResponse({ status: 201, type: TokenPairResponseDto })
  refresh(@Body() dto: RefreshTokenRequestDto): Promise<TokenPairResponseDto> {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('dev/token')
  @Public()
  @ApiOperation({ summary: '로컬 개발용 토큰 즉시 발급 (NODE_ENV=local + LOCAL_AUTH_BYPASS=true)' })
  @ApiResponse({ status: 201, type: TokenPairResponseDto })
  issueDevToken(@Body() dto: IssueUserTicketRequestDto): Promise<TokenPairResponseDto> {
    return this.authService.issueDevUserTicket(dto);
  }
}
