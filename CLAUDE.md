# 퀘스트 코인 (quest-coin) — Claude 작업 규칙

## 작업 마무리: PR 만들고 main 에 머지까지 (자동 머지)
사용자가 요청한 작업이 끝나면 따로 묻지 말고 아래 순서로 끝까지 진행한다.

1. 지정된 작업 브랜치에 커밋하고 push 한다. (지정이 없으면 `claude/` 로 시작하는 새 브랜치)
2. main 으로 가는 PR 을 만든다. (PR 설명은 한국어로 짧게, 바뀐 점 위주)
3. 그 PR 을 바로 머지한다. (squash merge)
4. 사용자에게 PR 링크와 머지 결과를 알려준다.

주의
- main 에 머지되면 GitHub Pages 로 바로 가족들 폰에 배포되는 앱이다. 머지 전에 아래 "확인" 을 반드시 통과시킨다.
  확인이 실패하면 머지하지 말고 사용자에게 알린다.
- 작업 브랜치의 이전 PR 이 이미 머지됐다면 같은 이름으로 최신 main 에서 브랜치를 다시 만들어 작업한다.
- `supabase/*.sql` 을 추가·변경했다면 머지만으로는 DB 에 반영되지 않는다.
  사용자가 Supabase SQL Editor 에서 직접 실행해야 하므로, 어떤 파일을 실행해야 하는지 꼭 알려준다.

## 확인 (머지 전)
- 앱 파일(js/css/html)을 바꿨다면 `sw.js` 의 `VERSION` 값을 하나 올린다. (안 올리면 폰에 새 파일이 반영되지 않음)
- 새 js/css 파일을 추가했다면 `sw.js` 의 `SHELL` 과 `index.html` 의 `REQUIRED` 목록에도 넣는다.
- 바꾼 js 파일은 `node --check` 로 문법을 확인하고, `node --test tests/*.test.mjs` 를 통과시킨다.
- 화면을 바꿨다면 `python3 -m http.server 8000` 으로 띄워 Playwright 로 '먼저 체험해보기'(체험 모드, 부모 PIN 0000)를 열어
  바꾼 화면을 직접 눌러보고 콘솔 오류가 없는지 확인한다. (체험 모드는 Supabase 없이 동작)
- SQL 을 바꿨다면 가능하면 로컬 Postgres 에 `auth.uid()` 등을 흉내 낸 뒤 두 번 실행해 오류가 없는지 확인한다.
- `js/config.js` 의 Supabase 주소/키, VAPID 공개 키는 바꾸지 않는다.
- 앱 주소는 `https://quest.wurii.com` (GitHub Pages 사용자 지정 도메인). 루트의 `CNAME` 파일은 지우거나 바꾸지 않는다.
- 알림 문구/대상을 바꿨다면 `supabase/functions/qc-notify/logic.js` 와 `tests/notify.test.mjs` 를 같이 고친다.
  `supabase/functions/` 가 바뀌어 머지되면 GitHub Actions 가 알림 함수를 자동 배포한다.
  머지 후 '알림 함수 배포' 실행 결과를 확인하고, 실패하면 로그를 보고 고친 뒤 사용자에게 알린다(토큰 문제면 SUPABASE_ACCESS_TOKEN 확인).

## 프로젝트 개요
- 빌드 없는 정적 PWA + Supabase. 구조는 README.md 참고.
- 계층: `js/data/` (remote=Supabase, local=체험 모드, 같은 함수 이름) → `js/core.js` (실행·다시 불러오기) → `js/ui/` (화면), 순수 계산은 `js/logic/`.
- 코인 이동(적립·결제·환불)은 반드시 DB 함수(`qc_*` RPC)로 처리하고, 체험 모드(`js/data/local.js`)도 같은 규칙으로 맞춘다.
- 사용자와는 한국어로 대화한다.
