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
  session: {
    id: string;
    userId: string;
    tenantId?: string;
    serviceId?: string;
  };
  state: {
    messages: AgentInStateChatMessage[];
    viewerTimezone?: string;
    imageDescription?: string;
    userMemory?: AgentUserMemory[];
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
