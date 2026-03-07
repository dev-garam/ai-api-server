# AI API Server

`ai-api-server`는 NestJS 기반의 범용 AI 애플리케이션 서버입니다.  
도메인 서버와 별도의 추론 런타임인 `node-agent-server` 사이에서
인증, 오케스트레이션, 대화 저장, 응답 중계를 담당합니다.

## 이 서버가 담당하는 것

- 외부 및 서비스 연동용 HTTP API 제공
- 인증 및 토큰 발급
- 채팅 세션/메시지 저장
- 제품 레벨 AI 오케스트레이션
- agent 호출용 context 조립

이 서버는 채팅 히스토리와 제품이 소유해야 하는 대화 상태의 source of truth입니다.

## 이 서버가 담당하지 않는 것

- 모델별 추론 세부 구현
- provider별 프롬프트 실행 런타임
- 별도 agent 런타임 자체의 소유와 운영 책임

이 영역은 `node-agent-server` 또는 별도 추론 컴포넌트의 책임으로 둡니다.

## `node-agent-server`와의 경계

- 원본 대화 히스토리는 `ai-api-server`가 저장합니다.
- 사용자 메모리, 세션 summary 등 제품 레벨 대화 상태도 `ai-api-server`가 소유합니다.
- `node-agent-server`는 명시적으로 전달받은 context를 바탕으로 추론하는 모듈로 취급합니다.
- `node-agent-server`가 원본 대화나 제품 상태의 source of truth가 되지 않도록 유지합니다.

의도하는 흐름은 아래와 같습니다.

`client/domain server -> ai-api-server -> node-agent-server -> ai-api-server -> client`

## 현재 API 범위

- `GET /api/v1/health/liveness`
- `GET /api/v1/health/readiness`
- `GET /api/v1/internal/auth/check`
- `POST /api/v1/auth/service/token`
- `POST /api/v1/auth/tickets`
- `POST /api/v1/auth/refresh`
- `POST /api/v1/auth/dev/token`
- `POST /api/v1/chat/sessions`
- `GET /api/v1/chat/sessions/:sessionId`
- `GET /api/v1/chat/sessions/:sessionId/messages`
- `POST /api/v1/chat/sessions/:sessionId/messages`
- `POST /api/v1/chat/sessions/:sessionId/messages/stream`

Swagger 문서는 실행 중인 서버의 `/api-docs`에서 확인할 수 있습니다.

## 인증

현재 기본 인증 구조는 `Lite Internal Auth + User Ticket`입니다.

- 신뢰된 서버는 유저 티켓을 발급받을 수 있습니다.
- 기능 API는 `Authorization: Bearer <accessToken>` 방식으로 호출합니다.
- access token 만료 시 refresh token으로 재발급합니다.

공개용 인증 계약 초안은 아래 문서를 참고합니다.  
[AUTH_API_CONTRACT.md](/Users/dev-garam/workspace/ai-api-server/AUTH_API_CONTRACT.md)

## 로컬 개발

### 준비물

- Node.js
- PostgreSQL
- Redis
- 접근 가능한 `node-agent-server`

### 환경변수

아래 파일을 기준으로 시작합니다.  
[.env.example](/Users/dev-garam/workspace/ai-api-server/.env.example)

주요 환경변수:

- `PORT`
- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `INTERNAL_API_KEY`
- `AGENT_SERVER_HOST`
- `AGENT_CHAT_REPLY_PATH`
- `AGENT_INTENT_DETECT_PATH`
- `AGENT_DEFAULT_MODEL`
- `AGENT_HMAC_ENABLED`
- `AGENT_HMAC_KEY_ID`
- `AGENT_HMAC_SECRET`

### 실행

```bash
npm install
npm run prisma:generate
npm run start:dev
```

## 로컬 인증 우회

로컬 테스트 전용으로 아래 값을 설정할 수 있습니다.

- `NODE_ENV=local`
- `LOCAL_AUTH_BYPASS=true`

이 모드가 활성화되면:

- `POST /api/v1/auth/dev/token`으로 내부 키나 HMAC 없이 개발용 JWT를 발급할 수 있습니다.
- 해당 개발 토큰으로 호출한 채팅 API는 DB 대신 메모리 저장소를 사용합니다.
- 해당 개발 토큰의 refresh 재발급은 Redis 기반 refresh 저장소를 사용하지 않습니다.
- `x-dev-user-id`, `x-dev-tenant-id`, `x-dev-service-id`, `x-dev-scopes` 헤더로 로컬 사용자 컨텍스트를 덮어쓸 수 있습니다.

이 모드는 로컬 개발 전용이며, 로컬 환경 외에서는 활성화하지 않는 것을 전제로 합니다.

## Agent 연동

`ai-api-server`는 내부 HTTP로 `node-agent-server`를 호출합니다.

현재 동작 방식:

- `chat/reply`를 우선 호출합니다.
- `chat/reply`가 `404`, `405`, `501`을 반환하면 임시로 `intent/detect`로 폴백합니다.
- `POST /api/v1/chat/sessions/:sessionId/messages/stream`는 upstream `node-agent-server`의 streaming endpoint를 호출하고 SSE 이벤트를 그대로 relay 합니다.
- stream 응답은 `message.start`, `message.delta`, `message.end`, `intent.result`, `intent.error`, `done`, `error` 이벤트를 사용할 수 있습니다.
- stream 경로에서는 user message를 먼저 저장하고, assistant message는 upstream 완료 후 저장합니다.
- 서버 간 요청 서명은 HMAC 헤더 기반입니다.

## SSE 테스트

로컬에서는 `node-agent-server` mock 시나리오를 이용해 실제 LLM 호출 없이 SSE relay를 검증할 수 있습니다.

예시 헤더:

- `x-agent-mock-scenario: weather_success`
- `x-agent-mock-scenario: stream_error`

권장 순서:

1. `POST /api/v1/auth/dev/token`으로 개발 토큰 발급
2. `POST /api/v1/chat/sessions`로 세션 생성
3. `POST /api/v1/chat/sessions/:sessionId/messages/stream` 호출
4. `Accept: text/event-stream`와 `x-agent-mock-scenario` 헤더로 SSE 이벤트 확인

## 기술 스택

- NestJS
- Prisma
- PostgreSQL
- Redis
- Axios
- Swagger

## 범위

포함:

- 여러 제품/서비스에서 재사용 가능한 AI API
- 인증 및 서비스 연동 인터페이스
- 채팅 세션 저장과 오케스트레이션

제외:

- 특정 제품 전용 정책 하드코딩
- 마이그레이션 이력 문서화
- 추론 런타임 자체 소유
