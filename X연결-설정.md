# X 연결 켜기 (한 번만 하면 됩니다)

Dragon Stakes의 X 기능은 두 층입니다.

- **1층: 지금 바로 작동합니다. 설정할 것이 없습니다.** 결과 화면의 "Share on X", 싸움에서 이기거나 대박 내기를 땄을 때 뜨는 작은 "Share", 하늘 만들기의 "Invite on X", 직접 적는 X 핸들. 모두 X의 글쓰기 화면을 새 탭으로 여는 방식이라 키도 돈도 들지 않습니다.
- **2층: "Connect X" (X로 로그인).** 코드는 다 들어가 있고, 아래 키 세 개를 Vercel에 넣기 전까지는 꺼져 있습니다. 꺼져 있는 동안 게임은 1층까지만 보이고 그 외에는 지금과 똑같습니다.

> **먼저 비용을 확인하세요.** 2026년 2월부터 X API는 무료 등급이 없어지고 "쓴 만큼 내는" 선불 크레딧 방식입니다. 로그인할 때마다 이 게임은 X에 "내 프로필 읽기"를 한 번 부르는데, X 가격표의 "User: Read"가 건당 0.010달러입니다. 즉 **로그인 1번에 약 1센트**, 로그인은 30일 유지됩니다. 크레딧을 미리 사 두지 않으면 로그인이 실패하고, 게임은 "지금은 X로 로그인하지 못했습니다"라고만 말한 뒤 그대로 작동합니다. 1층(공유, 초대, 핸들)은 API를 쓰지 않으므로 계속 무료입니다. 자세한 확인 여부는 맨 아래 "확인한 것과 못 한 것"에 적었습니다.

---

## 1. X 개발자 앱 만들기

1. https://developer.x.com 에 X 계정으로 로그인합니다. (요즘은 Developer Console, https://console.x.com 으로 이어질 수 있습니다. 같은 곳입니다.)
2. 개발자 약관에 동의하고, 사용 목적을 묻는 칸에는 예를 들어 이렇게 적습니다: "Sign in with X for a browser game (Dragon Stakes). Reads only the signed-in user's own username, name and profile picture. No posting, no data stored."
3. **Project**를 하나 만들고(이름 예: Dragon Stakes), 그 안에 **App**을 하나 만듭니다.

## 2. 앱의 로그인 설정 (User authentication settings)

앱 화면에서 **User authentication settings** 옆의 **Set up**(또는 Edit)을 누르고 아래처럼 채웁니다.

| 항목 | 넣을 값 |
|---|---|
| App permissions | **Read** (읽기만. Read and write는 고르지 마세요) |
| Type of App | **Web App, Automated App or Bot** (이게 "Confidential client"입니다) |
| Callback URI / Redirect URL | `https://dragon-stakes.vercel.app/api/x/callback` |
| Website URL | `https://dragon-stakes.vercel.app` |
| 이메일 요청 | 끄기 (필요 없습니다) |

- Callback URI는 한 글자도 다르면 안 됩니다. 끝에 `/`를 붙이지 마세요.
- 이 게임이 요청하는 권한(scope)은 `users.read tweet.read` 두 개뿐입니다. X 규칙상 내 프로필을 읽으려면 둘 다 필요합니다. 글쓰기 권한은 요청하지 않으므로, 로그인한 사람 계정으로 무언가가 올라가는 일은 없습니다.
- 저장하면 **OAuth 2.0 Client ID**와 **Client Secret**이 한 번 보입니다. 바로 복사해 두세요.

## 3. Client ID와 Secret 찾는 곳

앱 화면의 **Keys and tokens** 탭, 아래쪽 **OAuth 2.0 Client ID and Client Secret** 칸입니다.

- 위쪽의 "API Key and Secret", "Bearer Token", "Access Token"은 **이 기능에 쓰지 않습니다.** 헷갈리기 쉬우니 OAuth 2.0 칸만 보세요.
- Secret을 잃어버렸으면 같은 칸에서 **Regenerate**를 누르고 새로 받은 값으로 Vercel 값을 바꾸면 됩니다.

## 4. Vercel에 키 네 개 넣기

Vercel 프로젝트 `dragon-stakes` (계정 woocheol33)에 환경 변수를 넣습니다.

| 이름 | 값 |
|---|---|
| `X_CLIENT_ID` | 3단계의 OAuth 2.0 Client ID |
| `X_CLIENT_SECRET` | 3단계의 OAuth 2.0 Client Secret |
| `X_SESSION_SECRET` | 직접 만든 긴 무작위 문자열 (아래 명령으로 만듭니다. **32자 이상**이어야 켜집니다) |
| `X_REDIRECT_URI` | `https://dragon-stakes.vercel.app/api/x/callback` (선택이지만 넣어 두는 것을 권합니다) |

`X_SESSION_SECRET` 만들기 (터미널에 붙여 넣으면 64자짜리가 나옵니다):

```sh
openssl rand -hex 32
```

### 방법 A: 대시보드에서

1. https://vercel.com 로그인 → `dragon-stakes` 프로젝트 → **Settings** → **Environment Variables**
2. 위 네 개를 하나씩 **Key / Value**로 넣고, Environments는 **Production**에 체크합니다. (미리보기 배포에서도 시험하려면 Preview도 체크. 단 미리보기 주소는 Callback URI가 달라서 X가 거절합니다.)
3. Save.

### 방법 B: 터미널에서

`_배포` 폴더에서 (이미 `dragon-stakes` 프로젝트에 연결돼 있습니다):

```sh
cd ~/CLAUDE_CONTENTS/rare-dragon/_배포
npx vercel env add X_CLIENT_ID production
npx vercel env add X_CLIENT_SECRET production
openssl rand -hex 32 | npx vercel env add X_SESSION_SECRET production
npx vercel env add X_REDIRECT_URI production
```

각 줄은 값을 물어보면 붙여 넣고 Enter를 누르면 됩니다. 세 번째 줄은 만든 값을 바로 넣으므로 묻지 않습니다. 넣은 것 확인: `npx vercel env ls`

## 5. 다시 배포

환경 변수는 **새로 배포해야** 적용됩니다.

```sh
cd ~/CLAUDE_CONTENTS/rare-dragon
sh scripts/deploy-copy.sh          # _배포 폴더를 최신 원본(api 포함)으로 다시 채웁니다
cd _배포 && npx vercel deploy --prod --yes
```

## 6. 켜졌는지 확인

1. https://dragon-stakes.vercel.app/api/x/status 를 열어 `{"enabled":true}`가 보이면 켜진 것입니다. `false`면 키 세 개 중 하나가 빠졌거나 `X_SESSION_SECRET`이 32자보다 짧습니다.
2. 게임 설정 화면 "내 X 핸들" 옆에 **Connect X** 버튼이 생깁니다. 눌러서 X에서 "Authorize app"을 누르면 게임으로 돌아오고, 핸들과 이름이 채워지고 프로필 사진과 X 표시가 붙습니다.
3. 돌아왔는데 "지금은 X로 로그인하지 못했습니다"가 나오면: Callback URI 오타, Client Secret 오타, 또는 X 크레딧 잔액 0이 가장 흔한 원인입니다.

## 끄는 법

Vercel에서 `X_CLIENT_ID` 하나만 지우고 다시 배포하면 Connect X 버튼이 사라지고 게임은 1층만 남습니다. 이미 로그인한 사람들도 모두 로그아웃됩니다. `X_SESSION_SECRET`만 바꿔도 모든 로그인이 풀립니다.

---

## 무엇이 어디에 남는지 (안심용)

- X가 주는 출입증(access token)은 서버에서 프로필을 한 번 읽는 데만 쓰고, 그 자리에서 X에 반납(revoke)한 뒤 버립니다. 브라우저에도, 서버에도 남지 않습니다.
- 브라우저에 남는 것은 서명된 쿠키 하나입니다. 안에는 X 사용자 번호, 핸들, 이름, 프로필 사진 주소, 만료일(30일)만 있습니다. 페이지의 스크립트는 이 쿠키를 읽을 수 없고(HttpOnly), 서버의 `/api/x/me`만 서명을 확인한 뒤 내용을 알려 줍니다.
- 직접 적은 핸들은 그냥 글자입니다. X 표시가 붙지 않습니다. X 표시는 Connect X로 로그인한 핸들에만 붙습니다.
- 함께 날기(온라인)에서 다른 사람의 X 표시는, 그 사람이 보낸 서명된 확인증을 방장 기기가 이 사이트 서버(`/api/x/verify`)에 물어 진짜일 때만 붙습니다.
- 코인, 싸움, 등급 등 게임 내용은 X와 아무 관련이 없습니다.

## 확인한 것과 못 한 것 (2026-10-01 기준)

- **확인함:** X API는 2026년 2월부터 구독 등급 대신 선불 크레딧 종량제이고, 새로 가입하는 개발자에게 무료 등급은 없습니다. 크레딧이 0이면 API 호출이 막힙니다. 가격표의 "User: Read"는 건당 0.010달러이고, 같은 대상을 24시간(UTC 하루) 안에 다시 읽으면 다시 청구하지 않는다고 적혀 있습니다. 출처: X 공식 문서 https://docs.x.com/x-api/getting-started/pricing
- **확인 못 함:** `GET /2/users/me`(로그인한 사람 자기 프로필 읽기)가 정확히 "User: Read" 0.010달러로 청구되는지는 공식 문서에 따로 적혀 있지 않습니다. 더 싼 "Owned Reads"(0.001달러) 목록에는 들어 있지 않았습니다. 로그인 과정 자체(토큰 발급, 반납)가 청구되는지도 문서에 없습니다. 크레딧을 조금(예: 5달러) 넣고 몇 번 로그인해 본 뒤 Developer Console의 사용량에서 실제 금액을 확인하세요.
- **확인 못 함:** 개발자 포털 화면의 메뉴 이름(User authentication settings, Keys and tokens 등)은 X가 자주 바꿉니다. 이름이 조금 달라도 "OAuth 2.0", "Web App / Confidential", "Callback URI"를 찾으면 됩니다.
- 공익 목적 앱에 무료 이용을 따로 허락하는 경우가 있다고 하나, 사례별 심사라 이 게임이 해당하는지는 알 수 없습니다.
