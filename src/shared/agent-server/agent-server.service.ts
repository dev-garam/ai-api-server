import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import {
  AgentIntentDetectRequest,
  AgentIntentDetectResponse,
} from './agent-server.types';

@Injectable()
export class AgentServerService {
  private readonly client: AxiosInstance;
  private readonly host: string;
  private readonly intentDetectPath: string;
  private readonly pingPath: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('AGENT_SERVER_HOST') ?? '';
    if (!host) {
      throw new InternalServerErrorException('AGENT_SERVER_HOST is required');
    }

    this.host = host;
    this.intentDetectPath =
      this.configService.get<string>('AGENT_INTENT_DETECT_PATH') ?? '/api/v1/intent/detect';
    this.pingPath = this.configService.get<string>('AGENT_PING_PATH') ?? '/api/v1/ping';

    this.client = axios.create({
      baseURL: this.host,
      timeout: Number(this.configService.get<string>('REQUEST_TIMEOUT_MS') ?? 30000),
      headers: {
        'Content-Type': 'application/json',
      },
    });
  }

  getHost(): string {
    return this.host;
  }

  async ping(): Promise<void> {
    await this.client.get(this.pingPath);
  }

  async detectIntent(payload: AgentIntentDetectRequest): Promise<AgentIntentDetectResponse> {
    const response = await this.client.post<AgentIntentDetectResponse>(this.intentDetectPath, payload);
    return response.data;
  }
}
