import { BadGatewayException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance } from 'axios';
import { Readable } from 'node:stream';
import { createHash, createHmac, randomUUID } from 'node:crypto';
import {
  AgentGenerateReplyRequest,
  AgentGenerateReplyResponse,
  AgentIntentDetectRequest,
  AgentIntentDetectResponse,
  AgentStreamEvent,
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
    try {
      await this.client.get(this.pingPath);
    } catch (error) {
      throw this.toAgentRequestException(error, 'agent ping failed');
    }
  }

  async detectIntent(payload: AgentIntentDetectRequest): Promise<AgentIntentDetectResponse> {
    try {
      const response = await this.client.post<AgentIntentDetectResponse>(this.intentDetectPath, payload);
      return response.data;
    } catch (error) {
      throw this.toAgentRequestException(error, 'agent intent detect failed');
    }
  }

  async generateReply(
    payload: AgentGenerateReplyRequest,
    options?: { headers?: Record<string, string> },
  ): Promise<AgentGenerateReplyResponse> {
    try {
      const response = await this.client.post<AgentGenerateReplyResponse>(this.chatReplyPath, payload, {
        headers: options?.headers,
      });
      return response.data;
    } catch (error) {
      if (this.isMissingReplyEndpoint(error)) {
        return this.fallbackGenerateReplyByIntent(payload, options);
      }
      throw this.toAgentRequestException(error, 'agent reply failed');
    }
  }

  async *streamReply(
    payload: AgentGenerateReplyRequest,
    options?: { signal?: AbortSignal; headers?: Record<string, string> },
  ): AsyncGenerator<AgentStreamEvent, void, void> {
    let stream: Readable | undefined;
    try {
      const response = await this.client.post(this.chatReplyPathWithIntentStream(), payload, {
        responseType: 'stream',
        signal: options?.signal,
        headers: options?.headers,
      });
      stream = response.data as Readable;
      for await (const event of this.parseSseStream(stream)) {
        yield event;
      }
    } catch (error) {
      if (options?.signal?.aborted) {
        return;
      }
      throw this.toAgentRequestException(error, 'agent stream reply failed');
    } finally {
      stream?.destroy();
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
    options?: { headers?: Record<string, string> },
  ): Promise<AgentGenerateReplyResponse> {
    const intent = await this.client
      .post<AgentIntentDetectResponse>(
        this.intentDetectPath,
        {
          model: payload.model,
          state: {
            messages: payload.state.messages,
            viewerTimezone: payload.state.viewerTimezone,
            viewerAddress: payload.state.viewerAddress,
            viewerCountry: payload.state.viewerCountry,
            viewerCity: payload.state.viewerCity,
            viewerLat: payload.state.viewerLat,
            viewerLon: payload.state.viewerLon,
            imageDescription: payload.state.imageDescription,
            userMemory: payload.state.userMemory,
            currentFeature: payload.state.currentFeature,
          },
        },
        {
          headers: options?.headers,
        },
      )
      .then((response) => response.data)
      .catch((error) => {
        throw this.toAgentRequestException(error, 'agent intent detect failed');
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

  private chatReplyPathWithIntentStream(): string {
    const basePath = this.chatReplyPath.replace(/\/$/, '');
    return `${basePath}-with-intent/stream`;
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

  private toAgentRequestException(error: unknown, fallbackMessage: string): BadGatewayException {
    if (!axios.isAxiosError(error)) {
      return new BadGatewayException(fallbackMessage);
    }

    const status = error.response?.status;
    const responseData = error.response?.data;
    const remoteCode = this.extractRemoteErrorCode(responseData);
    const remoteMessage = this.extractRemoteErrorMessage(responseData);
    const message = [
      fallbackMessage,
      status ? `status=${status}` : undefined,
      remoteCode ? `code=${remoteCode}` : undefined,
      remoteMessage ? `message=${remoteMessage}` : undefined,
    ]
      .filter((part) => part && part.length > 0)
      .join(' | ');

    return new BadGatewayException(message);
  }

  private extractRemoteErrorCode(data: unknown): string | undefined {
    if (typeof data !== 'object' || data === null) {
      return undefined;
    }
    const candidate = data as Record<string, unknown>;
    return typeof candidate.code === 'string' ? candidate.code : undefined;
  }

  private extractRemoteErrorMessage(data: unknown): string | undefined {
    if (typeof data === 'string') {
      return data;
    }
    if (typeof data !== 'object' || data === null) {
      return undefined;
    }
    const candidate = data as Record<string, unknown>;
    if (typeof candidate.message === 'string') {
      return candidate.message;
    }
    return undefined;
  }

  private async *parseSseStream(stream: Readable): AsyncGenerator<AgentStreamEvent, void, void> {
    let buffer = '';
    for await (const chunk of stream) {
      buffer += chunk.toString('utf8');

      while (true) {
        const separatorIndex = buffer.indexOf('\n\n');
        if (separatorIndex === -1) {
          break;
        }

        const rawEvent = buffer.slice(0, separatorIndex);
        buffer = buffer.slice(separatorIndex + 2);
        const parsed = this.parseSseEvent(rawEvent);
        if (parsed) {
          yield parsed;
        }
      }
    }

    const tail = buffer.trim();
    if (tail.length > 0) {
      const parsed = this.parseSseEvent(tail);
      if (parsed) {
        yield parsed;
      }
    }
  }

  private parseSseEvent(rawEvent: string): AgentStreamEvent | null {
    const lines = rawEvent
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0);

    let eventName = 'message';
    const dataLines: string[] = [];
    for (const line of lines) {
      if (line.startsWith('event:')) {
        eventName = line.slice('event:'.length).trim();
        continue;
      }
      if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim());
      }
    }

    if (dataLines.length === 0) {
      return null;
    }

    const rawData = dataLines.join('\n');
    try {
      const data = JSON.parse(rawData) as AgentStreamEvent['data'];
      return { type: eventName as AgentStreamEvent['type'], data } as AgentStreamEvent;
    } catch {
      return {
        type: 'error',
        data: {
          message: `invalid upstream sse payload: ${rawData}`,
        },
      };
    }
  }
}
