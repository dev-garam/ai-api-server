# 인증 API 계약서 (초안)

## 목적

이 문서는 외부 서비스 연동을 위한 인증/토큰 발급 흐름을 고정하기 위한 API 계약(스펙) 초안입니다.

핵심 원칙:

1. 서비스 인증(S2S)과 유저 인증(Bearer)을 분리한다.
2. 기능 API는 유저 토큰만 사용한다.
3. 서비스 키는 토큰 발급/교환 단계에서만 사용한다.

---

## 전체 플로우

1. 외부 서비스는 발급받은 `key_id/secret`으로 S2S 서명 인증 요청
2. 인증 성공 시, `external_user_id` 기준으로 내부 유저 매핑/생성
3. 우리 서버가 유저용 `access_token` + `refresh_token` 발급
4. 기능 API 호출은 `Authorization: Bearer <access_token>` 사용
5. access 만료 시 `refresh_token`으로 재발급

---

## 공통 규칙

### 1) 버전/프리픽스

- Base: `/api/v1`

### 2) 컨텐츠 타입

- 요청: `application/json`
- SSE API 제외 일반 응답: `application/json`

### 3) 에러 응답 포맷

```json
{
  "statusCode": 401,
  "message": "invalid_signature",
  "error": "Unauthorized"
}
```

### 4) 시간/재전송 방지

- `x-timestamp`: epoch seconds
- 허용 오차: ±60초
- `x-nonce`: 재사용 불가 (Redis TTL 저장, 권장 60초)

---

## 1. S2S 서명 인증 + 유저 토큰 발급

### Endpoint

- `POST /api/v1/auth/service/token`

### 헤더

- `x-key-id`: 서비스 키 식별자
- `x-timestamp`: epoch seconds
- `x-nonce`: UUID 등 고유값
- `x-signature`: HMAC-SHA256 서명

### 서명 원문

```text
METHOD + "\n" + PATH + "\n" + x-timestamp + "\n" + x-nonce + "\n" + body_sha256_hex
```

### 요청 Body

```json
{
  "externalUserId": "ext-user-123",
  "tenantId": "tenant-a",
  "displayName": "홍길동",
  "scopes": ["chat:read", "chat:write"]
}
```

### 응답 201

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "tokenType": "Bearer",
  "accessExpiresInSec": 900,
  "refreshExpiresInSec": 604800,
  "user": {
    "userId": "usr_01...",
    "externalUserId": "ext-user-123",
    "tenantId": "tenant-a"
  }
}
```

### 실패 코드

- `400`: invalid_request
- `401`: invalid_signature / timestamp_expired / nonce_reused
- `403`: key_revoked_or_expired
- `429`: too_many_requests

---

## 2. Refresh Token 재발급

### Endpoint

- `POST /api/v1/auth/refresh`

### 요청 Body

```json
{
  "refreshToken": "<jwt>"
}
```

### 응답 201

```json
{
  "accessToken": "<jwt>",
  "refreshToken": "<jwt>",
  "tokenType": "Bearer",
  "accessExpiresInSec": 900,
  "refreshExpiresInSec": 604800
}
```

### 실패 코드

- `400`: invalid_request
- `401`: invalid_refresh_token / refresh_token_revoked

### 정책

- Refresh Token Rotation 적용
- 사용된 refresh token은 즉시 폐기
- 재사용 감지 시 세션 전체 폐기 가능

---

## 3. 기능 API 인증 규칙

기능 API(채팅/통역 등)는 아래 규칙을 따른다.

1. `Authorization: Bearer <access_token>` 필수
2. 서비스 키(`x-key-id`, `x-signature`)는 기능 API에서 사용하지 않음
3. access token의 `sub(userId)`, `tenantId`, `scopes`로 권한 검증

---

## 토큰 클레임 표준

### Access Token

```json
{
  "sub": "usr_01...",
  "tenantId": "tenant-a",
  "scopes": ["chat:read", "chat:write"],
  "tokenType": "access",
  "jti": "uuid",
  "iat": 1700000000,
  "exp": 1700000900
}
```

### Refresh Token

```json
{
  "sub": "usr_01...",
  "tenantId": "tenant-a",
  "scopes": ["chat:read", "chat:write"],
  "tokenType": "refresh",
  "jti": "uuid",
  "iat": 1700000000,
  "exp": 1700604800
}
```

---

## 미확정 항목 (합의 필요)

1. `tenantId` 필수 여부
2. 서비스별 기본 scope 매핑 정책
3. refresh 만료 기간(7일/14일/30일)
4. 서비스별 rate limit 기본값
5. 키 회전 주기 및 grace period
