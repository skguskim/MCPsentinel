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

배포 결과는 `deployments/localhost.json`에 `{ address, chainId, abi }` 형태로 기록됩니다. 체인을 재시작하면 다시 배포·시드해야 합니다. ABI와 주소는 게이트웨이에서 사용합니다.

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
- 승인 여부만 보지 말고 현재 Manifest 해시, 권한 해시, Publisher, Version, Revoked를 함께 확인하세요.
- 컨트랙트가 검증하는 것은 등록·승인 정보입니다. 원격 서버 코드의 안전성 또는 실제 실행 행동을 증명하지 않습니다.

## 환경 변수

| 변수                   | 기본값                           | 설명                           |
| ---------------------- | -------------------------------- | ------------------------------ |
| `RPC_URL`              | `http://127.0.0.1:8545`          | 배포·시드 대상 JSON-RPC        |
| `DEPLOYER_PRIVATE_KEY` | 공개 Hardhat 개발 키             | 로컬 체인 31337 전용 기본값    |
| `MANIFEST_URL`         | `http://127.0.0.1:4100/manifest` | `{tools: ToolManifest[]}` 응답 |

스크립트는 실행 환경의 변수를 읽습니다. `.env` 파일은 자동 로드하지 않습니다. 기본 개발 키 사용은 loopback RPC + chainId 31337에서만 허용됩니다. 다른 체인에서는 별도 테스트용 키를 환경 변수로 설정하세요. 개발 키는 공개되어 있으며 실제 자산을 보내면 안 됩니다. 외부 테스트넷 배포는 자동 실행하지 않습니다.

시드는 Manifest의 Publisher와 서명 계정이 같은지 확인합니다. 이미 동일하게 등록·승인된 항목은 그대로 두며, 해시가 다르거나 폐기된 항목은 임의로 갱신·복원하지 않습니다.

## 검증 범위

계약 테스트는 등록 후 미승인, ID 탈취 방지, 승인 권한, 역할 위임·제거, 버전 갱신 시 승인 무효화, 버전 재사용 차단, 폐기 권한, 갱신 시 폐기 유지, 명시적 재승인, 누락·잘못된 입력을 검증합니다.

배포·시드 후 아래 명령은 게이트웨이의 실제 `OnchainRegistry` 어댑터로 두 Tool을 조회하고, `exchange_rate` 폐기와 재승인이 즉시 조회되는지 확인합니다. loopback RPC의 chainId 31337에서만 실행하며, 종료 시 기존 승인 버전으로 복원합니다.

```sh
pnpm --filter @mcpsentinel/contracts smoke
```

참고: [Hardhat viem 테스트](https://hardhat.org/docs/guides/testing/using-viem), [OpenZeppelin AccessControl](https://docs.openzeppelin.com/contracts/5.x/access-control).
