# AI API Server

`ai-api-server`는 특정 서비스에 종속되지 않는 범용 AI 기능 서버입니다.  
기존 `api-server`처럼 특정 클라이언트(예: AI Glass)와 기본 결합된 형태가 아니라, 다양한 서버에서 필요 시 연결해서 사용할 수 있는 MSA 모듈을 목표로 합니다.

## 목적

- 공통 AI 기능을 독립 서비스로 분리
- 기존/신규 서버에서 재사용 가능한 표준 연동 지점 제공
- 도메인 서버와 AI 처리 로직의 결합도 최소화

## 서비스 포지셔닝

- 이 프로젝트는 "메인 API 서버"가 아니라 "AI 기능 전용 서버"입니다.
- 다른 서버는 이 모듈을 선택적으로 연결해 AI 기능을 확장합니다.
- 연결 대상은 단일 제품이 아닌, 복수의 서비스/서버를 전제로 합니다.

## 설계 원칙

- 범용성: 특정 제품/디바이스 정책을 기본값으로 두지 않음
- 독립성: 배포/스케일링/장애 격리를 메인 서비스와 분리
- 확장성: 기능 단위 모듈화로 신규 AI 기능을 점진적으로 추가
- 호환성: 기존 `api-server`와 연계 가능하지만 강한 종속은 피함

## 연동 모델 (MSA)

- 각 도메인 서버는 필요 기능만 `ai-api-server` API로 호출
- 인증/권한/트래픽 제어는 서버 간 통신 기준으로 관리
- 장애 전파를 줄이기 위해 타임아웃, 재시도, 서킷브레이커 등 적용 권장

## 범위

- 포함:
  - AI 관련 처리 API
  - 서버 간 연동을 위한 인터페이스
  - 공통 운영/모니터링 고려 구조
- 제외:
  - 특정 서비스 전용 정책 하드코딩
  - 마이그레이션 이력/절차 문서

## 참고

- 상위의 기존 통합 API 프로젝트: `../api-server`
- 본 저장소는 위 프로젝트를 참고하되, 범용 AI 모듈로 독립 운영하는 것을 목표로 합니다.

## 인증 정책 (초기)

- 게이트웨이/정식 S2S 인증 설계 전까지는 `Lite Internal Auth + User Ticket`로 운영합니다.
- 신뢰 서버는 `x-internal-api-key`로 유저 티켓을 발급받습니다.
- 기능 API 호출은 `Authorization: Bearer <accessToken>`을 사용합니다.
- access token 만료 시 refresh token으로 재발급합니다.

## 1차 API

- `GET /api/v1/health/liveness`
- `GET /api/v1/health/readiness`
- `GET /api/v1/internal/auth/check` (약식 인증 검증)
- `POST /api/v1/auth/tickets` (internal key 기반 유저 티켓 발급)
- `POST /api/v1/auth/refresh` (refresh token 재발급)
- `POST /api/v1/chat/sessions` (채팅 세션 생성)
- `GET /api/v1/chat/sessions/:sessionId` (채팅 세션 조회)
- `GET /api/v1/chat/sessions/:sessionId/messages` (채팅 메시지 목록 조회)
- `POST /api/v1/chat/sessions/:sessionId/messages` (메시지 전송 및 답변 저장)
- `POST /api/v1/chat/sessions/:sessionId/messages/stream` (SSE 스트리밍 응답)
- `POST /api/v1/interpreting/translate` (현재 미구현: 501)
- `POST /api/v1/interpreting/semantic-units/split` (현재 미구현: 501)

## 기본 처리 흐름

- 기본 기능은 `사용자 요청 -> 도메인 서버 -> (티켓 발급) -> ai-api-server -> node-agent-server(intent detect) -> ai-api-server 응답 생성` 흐름을 따릅니다.
- 채팅 API는 intent 결과를 바탕으로 서버가 응답을 구성하고, 일반/스트리밍(SSE) 형태로 반환합니다.
