# Tool Registry — 블록체인 담당

Solidity + OpenZeppelin AccessControl + Hardhat 3 + viem으로 구현한 MVP입니다. 온체인에는 Tool의 현재 버전과 승인 기준 해시만 저장합니다. 실행 코드나 사용자 요청·로그는 저장하지 않습니다.

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

| 함수                                                          | 권한 및 동작                                                          |
| ------------------------------------------------------------- | --------------------------------------------------------------------- |
| `registerTool(toolId, version, manifestHash, permissionHash)` | 첫 등록 주소가 Publisher. 이후 그 주소만 갱신 가능. 등록 직후 미승인. |
| `approveVersion(toolId, version)`                             | `VERIFIER_ROLE`만 현재 버전을 승인. 기존 폐기도 명시적으로 해제.      |
| `revokeTool(toolId)`                                          | Publisher 또는 Verifier가 폐기. 승인 상태도 해제.                     |
| `getTool(toolId)`                                             | 누구나 읽기 가능. 없는 Tool은 `ToolNotFound`로 revert.                |

배포 시 지정한 관리자에게 `DEFAULT_ADMIN_ROLE`, `VERIFIER_ROLE`이 부여됩니다. 운영 구조에서는 관리자가 `grantRole` / `revokeRole`로 검증자를 분리해야 합니다. 개발 시드는 한 개발 계정이 Publisher와 Verifier를 함께 맡습니다.

버전을 갱신할 때 승인은 무효화되고 기존 폐기는 유지됩니다. 한 번 사용한 버전 문자열은 다시 사용할 수 없습니다. 따라서 `approveVersion(id, version)`은 해당 버전의 해시를 고정적으로 가리키며, 게시자가 승인 대기 중 같은 버전의 해시를 바꾸는 것을 막습니다. 과거 버전의 전체 Metadata는 저장하지 않는 MVP이며, 변경 이력은 이벤트로 확인할 수 있습니다.

## 다른 담당자와 연결

- Tool ID: `@mcpsentinel/shared`의 `hashToolId(toolId)` → `keccak256(UTF-8 toolId)`.
- Manifest / Permission 해시는 공유 패키지의 `hashManifest`, `hashPermissions`만 사용합니다.
- `getTool` 결과: `publisher`, `version`, `manifestHash`, `permissionHash`, `approved`, `revoked`, `exists`.
- `OnchainRegistry.get()`은 조회한 ID에 대한 `ToolNotFound`만 `null`로 변환합니다. 미등록은 `registry_available=true`, `registered=false`로 차단하며, RPC 장애·체인 불일치·코드 없는 주소·다른 revert는 계속 조회 오류입니다.
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

시드는 Manifest의 Publisher와 서명 계정이 같은지 확인합니다. 이미 동일하게 등록·승인된 항목은 그대로 두며, 해시가 다르거나 폐기된 항목은 임의로 갱신·복원하지 않습니다.

## 검증 범위

계약 테스트는 등록 후 미승인, 등록된 ID의 소유권 변경 방지, 승인 권한, 역할 위임·제거, 버전 갱신 시 승인 무효화, 버전 재사용 차단, 폐기 권한, 갱신 시 폐기 유지, 명시적 재승인, 누락·잘못된 입력을 검증합니다. 최초 ID 선점과 승인·폐기 경합 문제는 [검토 문서](../../docs/blockchain-review.md)의 미해결 항목입니다.

`test/RegistryIntegration.ts`는 독립된 메모리 체인과 loopback RPC로 실제 조회 어댑터의 미등록·RPC 장애 구분, 체인 불일치, 코드 없는 주소, 비정상 응답, 배포 파일 저장·읽기를 검증합니다. 공통 설정의 잘못된 입력과 `.env` 우선순위는 `pnpm test`에 포함됩니다. 기존 컨트랙트 ABI와 저장 구조는 변경하지 않았으므로 이번 수정만으로 재배포할 필요는 없습니다. 계약 코드의 존재 확인은 배포물의 진위나 코드 안전성 검증을 의미하지 않습니다.

배포·시드 후 아래 명령은 게이트웨이의 실제 `OnchainRegistry` 어댑터로 두 Tool을 조회하고, `exchange_rate` 폐기와 재승인이 즉시 조회되는지 확인합니다. loopback RPC의 chainId 31337에서만 실행하며, 종료 시 기존 승인 버전으로 복원합니다.

```sh
pnpm --filter @mcpsentinel/contracts smoke
```

참고: [Hardhat viem 테스트](https://hardhat.org/docs/guides/testing/using-viem), [OpenZeppelin AccessControl](https://docs.openzeppelin.com/contracts/5.x/access-control).
