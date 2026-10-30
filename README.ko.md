# Raindrop Autosort

[English](README.md) | 한국어

현재 탭을 [Raindrop.io](https://raindrop.io)에 저장하는 Chrome 확장 프로그램(Manifest V3)입니다.
TypeSafe의 Jev가 북마크마다 컬렉션과 태그를 고릅니다.

컬렉션 목록과 각 컬렉션의 짧은 기준을 적어 두면, Jev가 페이지를 읽고 그 목록에서 컬렉션을
하나 선택합니다. Jev가 확신하지 못하면 북마크는 대체 컬렉션에 들어가고, 팝업에서 저장하기 전에
컬렉션을 바꿀 수 있습니다.

비공식 확장 프로그램입니다. Raindrop.io에서 만들지 않았고 보증하지도 않습니다.
Raindrop.io는 사용자가 적은 기준으로 새 북마크의 컬렉션을 골라 주지 않습니다.
이 확장 프로그램이 Raindrop.io 저장 과정에 그 단계를 추가합니다.

<img src="docs/popup.png" alt="컬렉션, 태그, 메모가 채워진 Save to Raindrop 팝업" width="360">

이 이미지의 팝업은 샘플 데이터로 만든 화면입니다.

## 요구 사항

- 압축 해제된 확장 프로그램을 불러올 수 있는 Chrome 또는 다른 Chromium 브라우저.
- Raindrop.io 계정. 같은 브라우저에서 app.raindrop.io에 로그인하거나 테스트 토큰을 사용합니다.
- System One 엔드포인트용 Jev API 키.

## 설치

1. 이 저장소를 클론합니다.
2. `chrome://extensions`를 열고 개발자 모드를 켭니다.
3. "압축해제된 확장 프로그램을 로드합니다"를 누르고 저장소 폴더를 선택합니다.
4. 확장 프로그램의 옵션 페이지를 열고 Jev API 키를 붙여 넣습니다.
5. "Add my collections"를 누릅니다. 각 콜론 뒤에 기준을 적고 Save를 누릅니다.
6. "Test connections"를 누릅니다.

테스트가 성공하면 상태 줄에 컬렉션 수와 함께 `Raindrop OK`가 표시되고, 샘플 북마크에 대해
Jev가 고른 컬렉션과 함께 `Jev OK`가 표시됩니다.

## 사용

- 툴바 팝업: 컬렉션을 확인하고 제목, 태그, 메모를 수정한 뒤 Save를 누릅니다.
  "Refresh"는 컬렉션 목록을 다시 불러오고, "Re-run"은 Jev에게 다시 묻습니다.
- `Alt+Shift+S`: 팝업 없이 분류하고 저장합니다. 배지에 `OK`, `ERR`, `DUP` 중 하나가 표시됩니다.
  아이콘에 마우스를 올리면 저장된 컬렉션이나 오류 내용이 보입니다.
- 링크를 오른쪽 클릭하고 "Save link to Raindrop (auto-sort)"를 누릅니다.

URL이 이미 Raindrop에 있으면 팝업이 알려 주며, 그래도 다시 저장할 수 있습니다.
`Alt+Shift+S` 단축키는 이미 Raindrop에 있는 URL을 저장하지 않습니다.

## 북마크를 분류하는 과정

1. 확장 프로그램이 제목, 메타 설명, 선택한 텍스트, `article` 또는 `main` 텍스트의 앞부분을
   읽습니다. X와 Threads의 게시물 페이지에서는 중심 게시물만 읽습니다.
2. 규칙을 확인합니다. 규칙이 일치하면 규칙이 컬렉션을 정하고, Jev는 태그만 고릅니다.
3. 일치하는 규칙이 없으면 Jev에게 요청을 한 번 보냅니다. 후보는 "Jev candidates"에 적은
   컬렉션이고, 각 컬렉션의 기준이 함께 전달됩니다.
4. 신뢰도가 최솟값(기본값 `0.7`)보다 낮으면 북마크는 대체 컬렉션(기본값 `Inbox`)에 들어갑니다.
   대체 컬렉션이 없으면 `Unsorted`에 들어갑니다.
5. 같은 요청에서 태그 목록의 각 태그에 대해 예/아니요 질문을 하나씩 합니다. 확률이 `0.7` 이상인
   태그를 확률이 높은 순서로 최대 4개 붙입니다.

확장 프로그램은 컬렉션을 만들지 않습니다. Jev는 태그 목록에 없는 태그를 붙일 수 없습니다.
오른쪽 클릭으로 저장할 때는 링크 URL과 선택한 텍스트만 알 수 있습니다. 옵션에서
"Read the linked page's title and description"를 켜면 링크된 페이지의 제목과 설명도 읽습니다.

## 설정

모든 설정은 옵션 페이지에 있습니다. API 키와 Raindrop 테스트 토큰은 `chrome.storage.local`에
저장됩니다. 나머지 설정은 브라우저 프로필과 동기화됩니다.

### 규칙

한 줄에 규칙 하나를 적습니다. 규칙은 순서대로 확인하며, 처음 일치한 규칙이 적용됩니다.
`#`으로 시작하는 줄은 주석입니다.

```text
news.ycombinator.com => Reading
/github\.com\/[^/]+\/[^/]+$/ => Dev / Repositories
```

호스트 규칙은 하위 도메인에도 일치합니다. `/regex/flags` 형식의 규칙은 전체 URL을 대상으로
검사합니다. 대상은 컬렉션 제목이거나 `Parent / Child` 경로입니다.

### Jev candidates

한 줄에 컬렉션 하나를 `<collection> : <criterion>` 형식으로 적습니다.
여기에 적은 컬렉션만 Jev에게 전달됩니다.

```text
Dev : Software design, programming languages, libraries and developer tools.
Personal : Shopping, travel, restaurants and other non-work topics. Not technology news.
Inbox : None of the other collections clearly fits.
```

Jev는 각 기준을 문자 그대로 읽습니다. 위 `Personal` 줄처럼 제외할 대상도 직접 적어야 합니다.
각 컬렉션의 목적과 대상, 대표 사례를 적고 제외하는 주제는 어느 컬렉션에 넣을지도 명시하세요.
두 컬렉션이 겹치면 어느 쪽을 우선할지 정하고, 이미 분류한 북마크 특히 경계 사례로 확인하세요.
어디에도 명확히 맞지 않거나 정보가 부족한 페이지는 대체 컬렉션에 남겨 둡니다.
기본 기준이 바뀌어도 저장한 기준은 자동으로 바뀌지 않습니다. 옵션에서 직접 수정하고 저장하세요.
어떤 줄도 컬렉션과 일치하지 않으면 Jev는 모든 컬렉션을 받고, 기준으로는 컬렉션 경로만 받습니다.

기본 제공 목록은 컬렉션 한 벌을 가정한 예시입니다. 본인의 컬렉션으로 바꿔서 사용하세요.

### Tag vocabulary

한 줄에 태그 하나를 `<tag> : <when the tag applies>` 형식으로 적습니다.

```text
mcp : The page is about the Model Context Protocol: an MCP server, client, or the protocol itself.
```

태그는 소문자로 바뀌고 공백은 하이픈이 됩니다. "Add my Raindrop tags"는 Raindrop 계정의
태그를 많이 쓴 순서로 추가합니다. 조건이 없는 줄은 무시됩니다.

### 설정 문제와 규칙 제안

옵션 페이지에는 분류기가 무시하는 줄이 표시됩니다. 존재하지 않는 컬렉션이나 잘못된 정규식을
쓴 규칙, 존재하지 않는 컬렉션을 쓰거나 기준이 없는 후보, 조건이 없는 태그가 해당합니다.
대체 컬렉션이 없을 때도 알려 줍니다.

팝업에서 Jev가 고른 컬렉션을 바꾸면 확장 프로그램이 호스트와 선택한 컬렉션을 기록합니다.
같은 호스트를 같은 컬렉션으로 두 번 옮기면 옵션 페이지가 그 호스트에 대한 규칙을 제안합니다.
"Add"를 누른 뒤 Save를 누르세요.

### Raindrop 인증

기본 모드는 app.raindrop.io 로그인 쿠키와 Raindrop 웹 앱이 호출하는 API
(`https://api.raindrop.io/v1`)를 사용합니다. 이 API는 문서화되어 있지 않으며 바뀔 수 있습니다.

문서화된 API를 쓰려면 "Test token"을 선택합니다. 토큰은
`app.raindrop.io/settings/integrations`에서 만듭니다. 이 모드에서는 확장 프로그램이
`https://api.raindrop.io/rest/v1`을 호출합니다. 태그 가져오기와 중복 확인은 토큰 모드에서만
문서화되어 있습니다. 로그인 쿠키 모드에서는 이 두 기능을 테스트하지 않았습니다. 실패하면 팝업에
오류가 표시되고, 분류와 저장은 계속 쓸 수 있습니다.

### Jev 엔드포인트

기본 엔드포인트는 `https://api.typesafe.ai/v1/systemone`입니다. 다른 호스트의 엔드포인트를
지정하면 Save를 누를 때 Chrome이 그 호스트에 대한 권한을 묻습니다.

Jev 요청은 15초 안에 응답이 없으면 시간 초과로 처리하고 한 번 더 보냅니다. 두 번 연속
시간 초과가 나면 팝업에 `Jev timed out after 15 s`가 표시됩니다.

## 권한과 데이터

| 권한 | 용도 |
|---|---|
| `activeTab`, `scripting` | 저장하는 탭의 제목과 텍스트를 읽습니다. |
| `storage` | 설정, 컬렉션 캐시, 사용자가 바꾼 선택을 보관합니다. |
| `contextMenus` | 링크용 오른쪽 클릭 메뉴 항목을 추가합니다. |
| `api.raindrop.io`, `api.typesafe.ai` | Raindrop과 Jev를 호출합니다. |
| 모든 사이트(선택) | 오른쪽 클릭 저장 시 링크된 페이지를 읽거나, 다른 호스트의 Jev 엔드포인트를 호출합니다. |

분류할 때마다 확장 프로그램은 다음 데이터를 Jev 엔드포인트로 보냅니다. URL, 제목, 사이트 이름,
설명, 선택한 텍스트, 페이지 텍스트 최대 600자입니다.

## 개발

이 확장 프로그램은 빌드 단계가 없습니다. Chrome이 소스 파일을 그대로 불러옵니다.

테스트는 Node.js 테스트 러너를 쓰며 Node.js 22 이상이 필요합니다. `fetch`와 `chrome` API를
스텁으로 바꿔서 실행하므로 Raindrop이나 Jev를 호출하지 않습니다.

```sh
npm test
```

테스트는 `lib/`를 대상으로 합니다. 페이지 리더 `extractPageInfo`는 브라우저 DOM에서 실행되어
테스트가 없습니다. 이 함수를 고친 뒤에는 확장 프로그램을 불러오고 페이지를 저장해서 확인하세요.

| 경로 | 내용 |
|---|---|
| `lib/classify.js` | 페이지 읽기, 규칙, Jev 요청, 설정 검사, 규칙 제안 |
| `lib/raindrop.js` | Raindrop API 클라이언트 |
| `lib/settings.js` | 기본 설정과 저장소 |
| `background.js` | 키보드 단축키와 오른쪽 클릭 메뉴 |
| `popup.js`, `options.js` | 팝업과 옵션 페이지 |

## 버전 관리

이 프로젝트는 [Semantic Versioning](https://semver.org/)을 따릅니다. 버전은 `manifest.json`과
`package.json`에 있고, 옵션 페이지의 제목 옆에도 표시됩니다.
각 릴리스는 [CHANGELOG.md](CHANGELOG.md)에 섹션이 있고 `v<version>` Git 태그가 붙습니다.

릴리스하는 방법은 다음과 같습니다.

1. 변경 내용을 `CHANGELOG.md`의 `## [Unreleased]` 아래에 적습니다.
2. `manifest.json`과 `package.json`에 같은 새 버전을 지정합니다.
3. `## [Unreleased]`를 `## [<version>] - <date>`로 바꾸고, 그 위에 빈 `## [Unreleased]`를 추가합니다.
4. `npm test`를 실행합니다. 두 버전이 다르거나 변경 이력에 해당 버전의 섹션이 없으면 테스트가 실패합니다.
5. 커밋한 뒤 `v<version>` 태그를 만듭니다.

## 라이선스

[MIT](LICENSE)
