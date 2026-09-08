# Tool Registry — 블록체인 담당

Solidity + OpenZeppelin AccessControl + Hardhat 3 + viem으로 구현한 Registry v2입니다. 온체인에는 Tool의 현재 버전·승인 기준 해시·상태 변경 번호(revision)를 저장합니다. 실행 코드나 사용자 요청·로그는 저장하지 않습니다.

## 로컬 실행

루트에서 의존성을 설치한 후 다음 명령을 사용합니다. Node.js 24를 권장합니다.

```sh
pnpm --filter @mcpsentinel/contracts compile
pnpm test:contracts
pnpm chain
```

로컬 노드를 실행한 채 새 터미널에서 배포합니다.

```sh
pnpm chain:deploy
```

MCP 서버를 실행한 후 데모 Manifest 두 개를 등록·승인합니다.

```sh
pnpm chain:seed
```

배포 결과는 로컬 체인에서 `deployments/localhost.json`, 다른 체인에서 `deployments/<CHAIN_ID>.json`에 `{ address, chainId, abi }` 형태로 기록됩니다. `REGISTRY_DEPLOYMENT`를 지정하면 그 경로에 저장하고 시드·API도 같은 파일을 읽습니다. 체인을 재시작하면 다시 배포·시드해야 합니다.

## 상태와 권한

| 함수                                                            | 권한 및 동작                                                                       |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `computeToolId(publisher, toolName)`                            | `keccak256(abi.encode(publisher, toolName))` 조회. 빈 이름·0 주소는 거부.          |
| `registerTool(toolName, version, manifestHash, permissionHash)` | 호출자 주소와 이름으로 ID를 직접 계산. 미승인 등록, revision 증가. 계산한 ID 반환. |
| `approveVersion(toolId, version, expectedRevision)`             | Verifier가 검토한 버전·revision만 승인. 폐기된 Tool은 거부.                        |
| `restoreVersion(toolId, version, expectedRevision)`             | Verifier가 최신 버전·revision을 검토해 폐기된 Tool을 명시적으로 복원·승인.         |
| `revokeTool(toolId)`                                            | Publisher 또는 Verifier가 폐기. 승인 상태도 해제.                                  |
| `getTool(toolId)`                                               | 누구나 읽기 가능. 없는 Tool은 `ToolNotFound`로 revert.                             |

배포 시 지정한 관리자에게 `DEFAULT_ADMIN_ROLE`, `VERIFIER_ROLE`이 부여됩니다. 운영 구조에서는 관리자가 `grantRole` / `revokeRole`로 검증자를 분리해야 합니다. 개발 시드는 한 개발 계정이 Publisher와 Verifier를 함께 맡습니다.

버전을 갱신할 때 승인은 무효화되고 기존 폐기는 유지됩니다. 같은 게시자의 같은 Tool에서 한 번 사용한 버전 문자열은 다시 사용할 수 없습니다. 서로 다른 게시자는 동일한 이름·버전을 독립적으로 등록할 수 있습니다.

등록·승인·폐기·복원은 모두 revision을 1씩 증가시킵니다. 첫 등록은 1입니다. 이미 폐기된 Tool을 다시 폐기해도 증가하여, 대기 중인 복원 요청을 무효화합니다. 승인·복원 요청의 `expectedRevision`이 다르면 `RevisionMismatch`로 실패합니다. 자동으로 새 revision을 읽고 재시도하면 검토 의미가 사라지므로, 최신 버전·해시·상태를 다시 검토한 뒤 새 요청을 만드세요. 일반 승인은 폐기를 해제하지 않으며, 복원은 폐기 상태에서만 가능합니다.

이벤트는 `ToolRegistered`에 게시자의 원래 Tool 이름을 포함하고, `ToolRegistered`, `VersionApproved`, `ToolRevoked`, `VersionRestored`에 변경 후 revision을 포함합니다. 과거 버전 전체 Metadata는 저장하지 않는 MVP이며 변경 이력은 이벤트로 확인합니다.

## 다른 담당자와 연결

- Tool ID: `hashToolId(manifest.publisher, manifest.toolId)` → `keccak256(abi.encode(address, string))`. Solidity 등록 인자로는 해시가 아닌 `manifest.toolId` 원문을 전달합니다.
- Manifest / Permission 해시는 공유 패키지의 `hashManifest`, `hashPermissions`만 사용합니다.
- `getTool` 결과: `publisher`, `version`, `manifestHash`, `permissionHash`, `approved`, `revoked`, `exists`, `revision`(uint256). 공유 스키마는 revision을 JSON용 10진 문자열로 변환합니다. 트랜잭션 인자로 보낼 때는 `BigInt(record.revision)`을 사용합니다.
- `OnchainRegistry.get({ publisher, toolId })`는 Manifest의 게시자와 ID를 함께 받아 조회합니다. 조회한 ID에 대한 `ToolNotFound`만 `null`로 변환하며 미등록은 `registry_available=true`, `registered=false`로 차단합니다. RPC 장애·체인 불일치·코드 없는 주소·구형 계약·다른 revert는 계속 조회 오류입니다.
- 승인 여부만 보지 말고 현재 Manifest 해시, 권한 해시, Publisher, Version, Revoked를 함께 확인하세요.
- 컨트랙트가 검증하는 것은 등록·승인 정보입니다. 원격 서버 코드의 안전성 또는 실제 실행 행동을 증명하지 않습니다.

## 환경 변수

| 변수                   | 기본값                          | 설명                                                                           |
| ---------------------- | ------------------------------- | ------------------------------------------------------------------------------ |
| `RPC_URL`              | `http://127.0.0.1:8545`         | 배포·시드 대상 JSON-RPC                                                        |
| `CHAIN_ID`             | loopback RPC에서 `31337`        | 기대 체인 ID. 외부 RPC는 필수이며 실제 RPC와 일치해야 함                       |
| `REGISTRY_DEPLOYMENT`  | 체인별 기본 JSON                | 저장·읽기 경로. 루트 기준 상대 경로 또는 절대 경로                             |
| `REGISTRY_ADDRESS`     | 배포 파일의 주소                | API 조회 주소. 시드에서는 배포 파일 주소와 일치해야 함                         |
| `DEPLOYER_PRIVATE_KEY` | 공개 Hardhat 개발 키            | 로컬 체인 31337 전용 기본값                                                    |
| `MANIFEST_URL`         | `TOOL_SERVER_URL` + `/manifest` | `{tools: ToolManifest[]}` 응답. 서버 URL 미설정 시 `TOOLS_PORT` 또는 4100 사용 |

배포·시드·smoke와 API·Tool 서버 시작 명령은 루트 `.env`를 자동 로드합니다. 셸에서 이미 설정한 변수가 우선하며, 실행한 디렉터리에 관계없이 같은 기본 배포 경로를 사용합니다. 체인 ID가 다르면 서명 계정을 만들기 전에 중단하고, 트랜잭션 직전에도 체인을 확인합니다. 시드는 배포 파일의 주소·chainId·ABI와 대상 주소의 계약 코드 존재 여부를 확인한 후 진행합니다.

공개 개발 키는 직접 환경 변수로 지정해도 loopback RPC + chainId 31337에서만 허용됩니다. 다른 체인에서는 별도 테스트용 키를 설정하세요. 개발 키는 공개되어 있으며 실제 자산을 보내면 안 됩니다. 외부 테스트넷 배포는 자동 실행하지 않습니다.

시드는 Manifest의 Publisher와 서명 계정이 같은지 확인합니다. 등록 트랜잭션 후 상태를 다시 읽어 버전·해시·폐기 여부를 확인하고 그 revision으로 승인합니다. 이미 동일하게 등록·승인된 항목은 그대로 두며, 해시가 다르거나 폐기된 항목은 임의로 갱신·복원하지 않습니다.

## v1에서 v2로 적용하기

**기존 v1 컨트랙트는 업그레이드되지 않습니다. 새 계약 배포와 Tool 재등록이 필요합니다.** v1 배포 JSON은 ABI 검증에서 거부하며, 주소만 지정해도 `REGISTRY_VERSION() == 2`가 아니면 연결을 중단합니다. 이 버전 표시는 호환성 확인이며 코드 진위 증명은 아닙니다.

1. 기존 API를 종료하고 로컬 체인을 실행합니다. Tool 서버는 정상 Manifest를 제공해야 합니다. `pnpm dev`를 쓰는 경우 재배포가 끝날 때까지 `REGISTRY_MODE=demo`로 시작하세요.
2. `RPC_URL`, `CHAIN_ID`, `REGISTRY_DEPLOYMENT`를 확인한 뒤 `pnpm chain:deploy`로 v2를 배포합니다. 이전 파일을 보관하려면 새 `REGISTRY_DEPLOYMENT` 경로를 사용하세요.
3. `REGISTRY_ADDRESS`를 명시했다면 새 배포 주소로 변경합니다. `pnpm chain:seed`로 두 데모 Tool을 새 ID로 등록·승인합니다.
4. `pnpm --filter @mcpsentinel/contracts smoke`를 실행한 뒤 `REGISTRY_MODE=onchain`으로 앱을 재시작합니다.

이전 계약의 권한·승인·폐기 이력은 새 계약으로 복사되지 않습니다. 외부 체인은 Publisher/Verifier 역할을 다시 설정하고 검토한 Manifest만 재등록·승인하세요. 이전 로그의 v1 ID는 v2 ID와 별개입니다.

## 검증 범위

계약 테스트는 등록 후 미승인, 게시자별 ID 격리, 선점·임의 ID 주입 방지, 승인 권한, 역할 위임·제거, 버전 갱신 시 승인 무효화, 버전 재사용 차단, 폐기 권한, 갱신 시 폐기 유지, 오래된 승인·복원 거부, 명시적 복원, 누락·잘못된 입력을 검증합니다. R1·R2 회귀 테스트만 실행하려면 `pnpm review:blockchain`을 사용합니다. 구현 현황은 [검토 문서](../../docs/blockchain-review.md)를 참고하세요.

`test/RegistryIntegration.ts`는 독립된 메모리 체인과 loopback RPC로 실제 조회 어댑터의 게시자 격리, 미등록·RPC 장애 구분, 체인 불일치, 코드 없는 주소·구형 계약, 비정상 응답, 배포 파일 저장·읽기와 실제 배포·시드·smoke 명령을 검증합니다. 공통 설정의 잘못된 입력과 `.env` 우선순위는 `pnpm test`에 포함됩니다.

배포·시드 후 아래 명령은 게이트웨이의 실제 `OnchainRegistry` 어댑터로 두 Tool을 조회하고, `exchange_rate` 폐기와 명시적 복원이 즉시 조회되는지 확인합니다. loopback RPC의 chainId 31337에서만 실행합니다. 자신이 폐기한 다음 revision을 지정해 복원하므로, 다른 작업이 상태를 바꿨으면 복원도 실패하고 다시 검토해야 합니다.

```sh
pnpm --filter @mcpsentinel/contracts smoke
```

참고: [Hardhat viem 테스트](https://hardhat.org/docs/guides/testing/using-viem), [OpenZeppelin AccessControl](https://docs.openzeppelin.com/contracts/5.x/access-control).
