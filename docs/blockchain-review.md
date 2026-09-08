# 블록체인 담당 구현 점검 및 작업 목록

- 검토 기준: `main`의 `a94a189` (초기 MVP), 2026-09-08
- 작업 브랜치: `blockchain-hardening`
- 범위: Solidity Registry, 배포·등록 스크립트, API의 Registry 조회 어댑터
- 이 브랜치의 현재 변경: **R3·R4 실제 기능 수정 및 회귀 테스트 추가. R1·R2·R5·R6은 미해결.**

기본 등록·승인·폐기 동작은 구현되어 있다. 조회 예외와 배포 설정을 수정했으며, 다음으로 공개 Registry의 식별자·폐기 정책을 확정한 뒤 독립적인 운영 CLI를 추가하는 순서를 권장한다.

## 우선순위

| ID  | 구분                       | 발견 사항                                                                      | 우선순위                     |
| --- | -------------------------- | ------------------------------------------------------------------------------ | ---------------------------- |
| R1  | 공개 Registry 설계 결함    | 미승인 게시자가 다른 게시자의 Tool ID를 먼저 등록해 영구 선점 가능             | 공개 테스트넷 사용 전 높음   |
| R2  | 승인·폐기 경합 정책 미구현 | 일반 승인과 폐기 해제가 같은 함수이며, 폐기 전 준비된 승인 요청도 폐기 후 유효 | 여러 지갑이 운영하기 전 높음 |
| R3  | 수정 완료                  | 미등록 Tool의 `ToolNotFound`를 조회 장애와 구분                                | 회귀 테스트 추가             |
| R4  | 수정 완료                  | `.env` 로딩, 기대 체인 ID, 배포 파일·주소·ABI, 계약 코드 존재 여부 검증        | 회귀 테스트 추가             |
| R5  | 미구현 기능                | 데모 일괄 시드 외에 새 버전 게시·별도 승인·폐기 CLI 없음                       | 기본 개발 작업               |
| R6  | 문서화된 MVP 제한          | 새 버전을 등록하면 현재 승인 버전이 즉시 사라져 기존 버전으로 계속 서비스 불가 | 무중단 버전 배포가 필요할 때 |

## R1. 전역 Tool ID 최초 등록 선점

위치: [ToolRegistry.sol](../packages/contracts/contracts/ToolRegistry.sol) 50–74행, `@mcpsentinel/shared`의 `hashToolId()`.

현재 `toolId`는 이름의 해시이고 게시자 주소가 포함되지 않는다. `registerTool()`은 처음 등록하는 사람의 권한을 제한하지 않고, 그 주소에 ID를 영구 귀속시킨다.

재현:

1. 미승인 제3자 지갑이 `exchange_rate`의 ID를 먼저 등록한다.
2. 실제 게시자가 동일 ID를 등록하면 `NotPublisher`로 실패한다.
3. 관리자가 제3자의 Tool을 폐기해도 소유자는 바뀌지 않아 정상 게시자가 등록할 수 없다.

이는 악성 Tool이 자동 승인된다는 뜻은 아니다. **이름 충돌·선점에 의한 등록 방해**이며, 제3자에게 승인 권한이 없어도 가능하다. 서로 다른 정상 게시자가 같은 이름을 쓰는 경우에도 충돌한다.

수정 방향:

- 계약이 `msg.sender`와 Tool 이름으로 ID를 직접 계산하도록 변경한다. 예: `keccak256(abi.encode(publisher, toolName))`.
- 클라이언트만 주소를 붙이는 것으로 끝내면 안 된다. 계약이 임의의 다른 게시자 ID를 받을 수 없어야 한다.
- 게이트웨이의 조회 키, Manifest 형식, 공유 해시 함수, 프론트의 Tool 식별 방식을 함께 맞춘다.
- 이름만으로 관리하는 중앙 승인 목록이 목적이라면 최초 등록을 승인된 게시자 또는 관리자에게 제한하는 대안도 가능하다. 두 정책 중 하나를 먼저 결정한다.

완료 기준: 같은 이름을 쓰는 두 게시자가 충돌하지 않고, 다른 게시자에게 귀속될 ID를 대신 등록할 수 없어야 한다.

## R2. 일반 승인과 폐기 해제의 구분 부재

위치: [ToolRegistry.sol](../packages/contracts/contracts/ToolRegistry.sol) 78–86행.

현재 `approveVersion(id, version)`은 승인뿐 아니라 `revoked = false`도 수행한다. 현재 README에 명시된 동작이므로 단순히 “누구나 폐기를 우회한다”는 오류는 아니다. **승인 권한자가 의도한 상태와 트랜잭션 도착 순서가 달라졌을 때를 구분하지 못한다는 점**이 문제다.

재현 순서: `approveVersion(v1)` → 게시자의 `revokeTool()` → 권한자의 동일한 `approveVersion(v1)` calldata → 다시 `approved=true, revoked=false`.

마지막 호출은 같은 트랜잭션의 nonce 재사용이 아니다. 예를 들어 폐기를 모르고 먼저 준비된 별도 승인 트랜잭션이 다른 게시자의 폐기 트랜잭션보다 늦게 포함되는 상황을 모델링한 것이다. 기존의 버전 문자열 재사용 차단은 **같은 버전에서 발생한 폐기**를 구분하지 못한다.

수정 방향:

- 일반 `approveVersion()`은 폐기 상태를 해제하지 않도록 한다.
- 복원하려면 별도 `restoreTool()` 같은 명시적 작업을 거치게 한다.
- Tool에 `revision`을 두고 등록·승인·폐기·복원 때 증가시킨다. 승인/복원 요청의 `expectedRevision`이 현재 값과 일치하는지 검사한다.
- 상태가 바뀐 경우 오래된 요청을 실패시키고, 최신 상태를 확인한 후 다시 제출하게 한다.

완료 기준: 폐기 전 상태를 기준으로 준비한 승인이 폐기 후에는 실패하고, 최신 revision에 대한 명시적 복원만 성공해야 한다.

## R3. 미등록 Tool이 Registry 장애로 처리됨 — 수정 완료

위치: [registry.ts](../apps/api/src/registry.ts)의 `OnchainRegistry.get()`, [gateway.ts](../apps/api/src/gateway.ts)의 조회 오류 처리.

초기 MVP에서 `Registry.get()` 인터페이스는 `RegistryRecord | null`을 반환하지만 온체인 어댑터는 `ToolNotFound`를 그대로 던졌다. 이 때문에 게이트웨이가 미등록을 네트워크 장애와 똑같이 처리했다.

영향: RPC와 컨트랙트는 정상인데 UI와 로그에는 “Registry 조회 실패”가 표시되어, 사용자가 Tool 등록 대신 네트워크 설정을 점검하게 된다. 실행은 차단되므로 허용 우회 문제는 아니다.

적용한 수정:

- 조회 ABI에 `ToolNotFound(bytes32)`를 포함하거나, 계약 ABI를 공유해 오류를 해석한다.
- 해당 custom error에만 `null`을 반환한다.
- RPC 타임아웃·체인 불일치·잘못된 주소·ABI 오류는 계속 예외로 전달하고 차단한다. 모든 예외를 `null`로 바꾸면 장애를 숨기게 된다.

완료 기준: 미등록 요청은 `registry_available=true`, `registered=false`로 기록되고, 실제 RPC 장애는 `registry_available=false`로 구분되어야 한다.

회귀 테스트: `packages/contracts/test/RegistryIntegration.ts`. 실제 컨트랙트의 미등록 조회는 정상 Registry의 미등록 BLOCK으로 기록된다. 등록·승인된 Tool의 ALLOW, 실제 RPC 장애의 BLOCK, 다른 ID에 대한 `ToolNotFound`·다른 revert·비정상 반환값의 오류 전파도 검증한다.

## R4. 배포와 조회의 네트워크 설정 불일치 — 수정 완료

위치: [clients.ts](../packages/contracts/scripts/clients.ts), [공통 설정](../packages/shared/src/blockchain.ts), [API 시작 설정](../apps/api/src/index.ts).

초기 MVP에서 재현된 사실:

- `CHAIN_ID=11155111`을 지정하고 chain 31337 RPC를 사용해도 `createClients()`는 오류 없이 chain 31337용 서명 클라이언트를 생성한다. 이 재현은 읽기만 수행하며 실제 외부 트랜잭션은 보내지 않는다.
- API의 `deploymentAddress()`는 배포 JSON의 chainId가 잘못된 문자열이어도 주소만 꺼내 반환한다. 배포 스크립트 측 `readDeployment()`에는 체인 검사 일부가 있으나 API 파일 로더와 일관되지 않다.
- 루트 `.env`는 `pnpm dev`에서만 읽고 배포·시드에서는 자동으로 읽지 않는다. 현재 README에 명시된 제한이지만, API와 배포가 서로 다른 네트워크를 바라보기 쉬운 구성이다.

잘못된 RPC를 지정한 상태에서 별도 키로 배포할 경우, 의도와 다른 체인으로 트랜잭션을 보낼 수 있다. 공개 Hardhat 개발 키를 외부 체인에 사용하지 못하게 하는 현재 제한은 유지해야 한다.

수정 방향:

- 공통 설정 로더에서 `.env`, `RPC_URL`, 기대 `CHAIN_ID`, 배포 파일을 한 번에 검증한다.
- 쓰기 작업 전에 RPC의 실제 chainId와 기대 chainId가 일치하는지 확인한다. 불일치는 **서명/전송 전에** 중단한다.
- 배포 JSON을 Zod 등으로 검증하고 주소·파일 chainId·선택한 chainId의 일치를 검사한다.
- 대상 주소에 계약 코드가 존재하는지 확인하고, 오류 원인을 사용자에게 구분해서 표시한다.

완료 기준: 잘못된 체인·누락 설정·다른 체인의 배포 JSON에 대해 쓰기 트랜잭션을 한 건도 전송하지 않고 명확한 오류가 나와야 한다.

적용한 수정:

- `packages/shared/src/blockchain.ts`에서 설정·배포 파일 검증을 공유한다. API·Tool 서버·배포·시드·smoke가 루트 `.env`를 읽으며 셸 값이 우선한다.
- 외부 RPC는 `CHAIN_ID`가 필수다. 실제 RPC와 기대 체인이 다르면 서명 클라이언트를 만들기 전에 중단하며, 쓰기 직전에도 확인한다.
- 기본 배포 경로를 chainId별로 선택한다. 사용자 지정 `REGISTRY_DEPLOYMENT`는 저장과 읽기에 모두 적용한다.
- 파일의 유효한 주소·숫자 chainId·Registry ABI를 검사한다. 명시한 주소와 파일을 함께 쓰면 서로 일치해야 한다.
- API는 시작 시, 조회 어댑터는 매 조회 시, 시드는 쓰기 전에 대상 주소의 계약 코드 존재를 확인한다. 코드의 진위나 안전성까지 증명하는 검사는 아니다.
- 공개 Hardhat 키의 loopback·31337 제한은 해당 키를 직접 환경 변수로 설정해도 적용한다.

회귀 테스트: `packages/shared/test/blockchain.test.ts`, `packages/contracts/test/RegistryIntegration.ts`. 잘못된 설정·JSON·ABI·chainId·주소 조합, `.env` 우선순위, 체인 불일치 시 트랜잭션 RPC 미호출, 배포 파일 왕복 저장을 검증한다. 컨트랙트 자체와 ABI는 그대로여서 기존 정상 배포 파일을 사용할 수 있다.

## R5. 데모 seed 이후 일반 운영 경로가 없음

위치: [seed.ts](../packages/contracts/scripts/seed.ts) 90–116행, [컨트랙트 명령 목록](../packages/contracts/package.json).

`chain:seed`는 처음 두 데모 Tool을 등록하고 즉시 승인하는 용도다. 등록된 Tool의 버전이나 해시가 바뀌면 명시적으로 오류를 낸다. 기존 신뢰를 몰래 바꾸지 않으려는 올바른 제한이지만, 이를 대체할 일반 게시·승인·폐기 명령이 없다.

또한 seed는 게시자와 승인자를 같은 서명 계정으로 사용한다. 역할을 분리하면 게시자의 등록 후 승인에서 `AccessControlUnauthorizedAccount`가 발생할 수 있다. 등록 트랜잭션은 이미 완료되어 있으므로 전체 작업이 원자적으로 취소되는 것도 아니다.

추가할 최소 명령:

| 명령 예시       | 담당 계정          | 기능                                                          |
| --------------- | ------------------ | ------------------------------------------------------------- |
| `tool:register` | 게시자             | 검토할 Manifest 파일을 읽어 새 Tool/버전을 미승인 상태로 등록 |
| `tool:approve`  | 승인자             | 등록된 버전·해시·revision을 확인하고 승인                     |
| `tool:revoke`   | 게시자 또는 승인자 | 폐기 처리와 receipt 확인                                      |
| `tool:show`     | 서명 불필요        | 등록·승인·폐기·버전 상태 조회                                 |

seed는 로컬 시연용으로 유지하고 실제 게시자/승인자 흐름과 구분한다. 트랜잭션 해시와 처리 단계를 남겨, 중간 실패 시 무엇이 완료됐는지 알 수 있게 한다.

완료 기준: 서로 다른 지갑으로 등록 → 승인 → 새 버전 등록 → 승인 → 폐기 흐름을 계약 콘솔 직접 호출 없이 수행할 수 있어야 한다.

## R6. 현재 버전 하나만 저장하는 제한

위치: [ToolRegistry.sol](../packages/contracts/contracts/ToolRegistry.sol) 68–74행.

v1이 승인된 상태에서 v2를 등록하면 v1 정보가 덮어써지고 `approved=false`가 된다. 따라서 v2를 승인하기 전에는 정상 v1 요청도 통과할 수 없다. 이는 현재 테스트와 README가 명시적으로 채택한 MVP 동작이며 별도의 보안 오류는 아니다.

운영 중 버전 교체가 필요하면 `versions[id][version]`, `activeVersion`, 승인 대기 버전을 분리한다. 이전 버전 조회·승인 이력과 폐기 범위(Tool 전체 / 특정 버전)를 먼저 결정한 후 구현한다.

## 권장 작업 순서

1. **R3 완료:** 미등록과 조회 장애를 구분.
2. **R4 완료:** 공통 네트워크 설정과 배포 전 검증.
3. **R1 + R2:** Tool ID 규칙, revision, 폐기 복원 정책 확정. ABI와 Manifest가 바뀌므로 MCP 담당자와 합의.
4. **R5:** 위 인터페이스를 사용하는 독립 CLI 추가.
5. **R6:** 무중단 버전 교체가 실제로 필요할 때 확장.

## 재현과 테스트 해석

```sh
pnpm review:blockchain
pnpm test:contracts
pnpm test
```

재현 코드는 `packages/contracts/review/findings.test.ts`에 있다. 일반 `test/`와 구분하여 명시적으로 실행한다. 재현과 회귀 테스트는 독립된 메모리 테스트 체인을 사용하며, 회귀 테스트의 임시 loopback RPC·배포 파일도 격리되어 기존 로컬 체인이나 테스트넷의 상태를 바꾸지 않는다.

`review/findings.test.ts`에는 미해결 R1·R2를 확인하는 **재현 테스트 2개**가 남아 있다. 이 테스트가 통과했다는 것은 두 문제가 여전히 재현된다는 뜻이다. 수정한 R3·R4는 원하는 정상 동작을 검증하는 일반 회귀 테스트로 옮겼다. 일반 계약 테스트와 공유 패키지 테스트에 포함되어 CI에서도 실행된다.

이번 검토로 전체 스마트 컨트랙트 보안 감사가 완료된 것은 아니다. 외부 테스트넷의 실제 지갑, 장시간 RPC 장애, 체인 재구성, 복수 게이트웨이 인스턴스는 별도 검증 범위다.
