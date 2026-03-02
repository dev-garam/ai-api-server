import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import {
  ApiHeader,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { InternalApiKeyGuard } from '../../common/guards/internal-api-key.guard';
import { Public } from '../../common/decorators/public.decorator';
import { AuthService } from './auth.service';
import { IssueUserTicketRequestDto, TokenPairResponseDto } from './dtos/issue-user-ticket.dto';
import { RefreshTokenRequestDto } from './dtos/refresh-token.dto';

@Controller({
  path: 'auth',
  version: '1',
})
@ApiTags('인증')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

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
}
