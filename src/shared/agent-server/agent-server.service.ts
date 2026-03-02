import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import {
  AgentGenerateReplyRequest,
  AgentGenerateReplyResponse,
  AgentIntentDetectRequest,
  AgentIntentDetectResponse,
} from './agent-server.types';

@Injectable()
export class AgentServerService {
  private readonly client: AxiosInstance;
  private readonly host: string;
  private readonly intentDetectPath: string;
  private readonly chatReplyPath: string;
  private readonly pingPath: string;
  private readonly hmacEnabled: boolean;
  private readonly hmacKeyId?: string;
  private readonly hmacSecret?: string;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('AGENT_SERVER_HOST') ?? '';
    if (!host) {
      throw new InternalServerErrorException('AGENT_SERVER_HOST is required');
    }

    this.host = host;
    this.intentDetectPath =
      this.configService.get<string>('AGENT_INTENT_DETECT_PATH') ?? '/api/v1/intent/detect';
    this.chatReplyPath =
      this.configService.get<string>('AGENT_CHAT_REPLY_PATH') ?? '/api/v1/chat/reply';
    this.pingPath = this.configService.get<string>('AGENT_PING_PATH') ?? '/api/v1/ping';
    this.hmacEnabled =
      (this.configService.get<string>('AGENT_HMAC_ENABLED') ?? 'true').toLowerCase() === 'true';
    this.hmacKeyId = this.configService.get<string>('AGENT_HMAC_KEY_ID') ?? undefined;
    this.hmacSecret = this.configService.get<string>('AGENT_HMAC_SECRET') ?? undefined;

    if (this.hmacEnabled && (!this.hmacKeyId || !this.hmacSecret)) {
      throw new InternalServerErrorException(
        'AGENT_HMAC_ENABLED=true 인 경우 AGENT_HMAC_KEY_ID, AGENT_HMAC_SECRET이 필요합니다.',
      );
    }

    this.client = axios.create({
      baseURL: this.host,
      timeout: Number(this.configService.get<string>('REQUEST_TIMEOUT_MS') ?? 30000),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (this.hmacEnabled) {
      this.client.interceptors.request.use((config) => {
        const url = config.url ?? '/';
        const method = (config.method ?? 'get').toUpperCase();
        const path = this.extractPath(url);
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const nonce = randomUUID();
        const bodyHash = this.getBodyHash(config.data);
        const signingString = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyHash}`;
        const signature = createHmac('sha256', this.hmacSecret!)
          .update(signingString, 'utf8')
          .digest('hex');

        this.setHeader(config, 'x-key-id', this.hmacKeyId!);
        this.setHeader(config, 'x-timestamp', timestamp);
        this.setHeader(config, 'x-nonce', nonce);
        this.setHeader(config, 'x-signature', signature);

        return config;
      });
    }
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

  async generateReply(payload: AgentGenerateReplyRequest): Promise<AgentGenerateReplyResponse> {
    try {
      const response = await this.client.post<AgentGenerateReplyResponse>(this.chatReplyPath, payload);
      return response.data;
    } catch (error) {
      if (this.isMissingReplyEndpoint(error)) {
        return this.fallbackGenerateReplyByIntent(payload);
      }
      throw error;
    }
  }

  private isMissingReplyEndpoint(error: unknown): boolean {
    if (!axios.isAxiosError(error)) {
      return false;
    }
    const status = error.response?.status;
    return status === 404 || status === 405 || status === 501;
  }

  private async fallbackGenerateReplyByIntent(
    payload: AgentGenerateReplyRequest,
  ): Promise<AgentGenerateReplyResponse> {
    const intent = await this.detectIntent({
      state: {
        messages: payload.state.messages,
        viewerTimezone: payload.state.viewerTimezone,
        imageDescription: payload.state.imageDescription,
        userMemory: payload.state.userMemory,
      },
    });
    const featureId = intent.parsed.featureId;
    const featureTitle = intent.matchedFeature?.title ?? '알 수 없음';
    const reasoning = intent.parsed.reasoning ?? 'reasoning 없음';

    return {
      answer: `intent:${featureId} | title:${featureTitle} | reasoning:${reasoning}`,
      modelName: 'intent-detect',
      finishReason: 'fallback-intent',
    };
  }

  private getBodyHash(data: unknown): string {
    const bodyString = JSON.stringify(data ?? {});
    return createHash('sha256').update(bodyString, 'utf8').digest('hex');
  }

  private extractPath(rawUrl: string): string {
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      const parsed = new URL(rawUrl);
      return parsed.pathname || '/';
    }
    return rawUrl.split('?')[0] || '/';
  }

  private setHeader(
    config: { headers?: unknown },
    key: string,
    value: string,
  ): void {
    const headers = config.headers as
      | { set?: (name: string, val: string) => void; [k: string]: unknown }
      | undefined;
    if (!headers) {
      config.headers = { [key]: value };
      return;
    }
    if (typeof headers.set === 'function') {
      headers.set(key, value);
      return;
    }
    headers[key] = value;
  }
}
