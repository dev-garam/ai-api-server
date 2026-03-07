export type AgentChatRole = 'user' | 'assistant';

export interface AgentInStateChatMessage {
  role: AgentChatRole;
  content: string;
  imageDescription?: string;
}

export interface AgentUserMemory {
  key: string;
  content: string;
  targetDate?: string | null;
}

export interface AgentIntentDetectRequest {
  model?: string;
  state: {
    messages: AgentInStateChatMessage[];
    viewerTimezone?: string;
    viewerAddress?: string;
    viewerCountry?: string;
    viewerCity?: string;
    viewerLat?: number;
    viewerLon?: number;
    imageDescription?: string;
    userMemory?: AgentUserMemory[];
    currentFeature?: { id: string };
  };
}

export interface AgentIntentDetectResponse {
  parsed: {
    featureId: string;
    reasoning?: string;
    parameters?: Record<string, string | null>;
    options?: Record<string, string | null>;
  };
  rawResponse: string;
  matchedFeature: {
    id: string;
    title: string;
  } | null;
}

export interface AgentGenerateReplyRequest {
  model?: string;
  session: {
    id: string;
    userId: string;
    tenantId: string;
    serviceId: string;
  };
  state: {
    messages: AgentInStateChatMessage[];
    viewerTimezone?: string;
    viewerAddress?: string;
    viewerCountry?: string;
    viewerCity?: string;
    viewerLat?: number;
    viewerLon?: number;
    imageDescription?: string;
    userMemory?: AgentUserMemory[];
    currentFeature?: { id: string };
  };
  context?: {
    conversationSummary?: string;
    sessionVersion?: number;
    requestId?: string;
    chatMessageId?: string;
  };
}

export interface AgentGenerateReplyResponse {
  answer: string;
  modelName?: string;
  finishReason?: string;
  usage?: {
    promptTokens?: number;
    completionTokens?: number;
    totalTokens?: number;
  };
}

export type AgentStreamEvent =
  | { type: 'message.start'; data: { model: string; requestId?: string } }
  | { type: 'message.delta'; data: { text: string } }
  | {
      type: 'message.end';
      data: {
        answer: string;
        modelName?: string;
        finishReason?: string;
        path?: string;
      };
    }
  | {
      type: 'intent.result';
      data: {
        parsed: {
          featureId: string;
          reasoning?: string;
          parameters?: Record<string, string | null>;
          options?: Record<string, string | null>;
        };
        rawResponse: string;
        matchedFeature: {
          id: string;
          title: string;
        } | null;
      };
    }
  | { type: 'intent.error'; data: { message: string } }
  | {
      type: 'done';
      data: {
        path?: string;
        timings?: {
          totalMs?: number;
          intentDetectMs?: number;
          intentParseMs?: number;
          featureExecMs?: number;
          finalAnswerMs?: number;
          firstChunkMs?: number;
        };
      };
    }
  | { type: 'error'; data: { code?: string; message: string; requestId?: string } };
