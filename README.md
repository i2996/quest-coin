# 퀘스트 코인 🪙

아이에게 심부름을 주고, 완료하면 코인을 적립해주는 가족 앱 (PWA). 빌드 없이 정적 파일만으로 동작합니다.

## 기능

**아이 화면 (게임처럼)**
- 🗡️ **미션**: 오늘의 심부름 → `다 했어요!` → 부모님 승인 → 코인 적립 (승인되면 코인이 쏟아지는 효과)
- 📷 **사진 인증**: 심부름 완료할 때 사진을 찍어 보내면 부모님이 확인 탭에서 보고 승인. 부모님이 `사진으로 확인`을 켠 심부름은 사진이 있어야 완료돼요 (나머지는 📷 버튼으로 선택). 사진은 자동으로 줄여서(긴 쪽 1280px) 가족만 볼 수 있는 비공개 저장소(Storage `qc-photos`)에 올라가요
- 🚨 **돌발 미션**: 부모님이 발동하면 아이 화면에 **경고 팝업**이 번쩍! 제한 시간 카운트다운, **선착순 1명** 옵션
- 🏆 **퀘스트**: `이번 주 심부름 모두 완료` / `이번 달 심부름 30개` 같은 도전 과제. **남은 미션 n개**, D-day, 진행 막대 표시. 깨면 `보상 받기`
- 🛒 **상점**
  - 🎁 기프티콘: 부모님이 올린 간식·배달음식(치킨·피자)·기타 상품을 코인으로 구매 → **바로 쿠폰함에 쿠폰**.
    쓰고 싶을 때 `사용하기` → 부모님이 사주고 `사줬어요` → 사용 완료(지난 쿠폰으로). 안 쓴 쿠폰은 환불 가능
  - 💵 용돈: 코인을 용돈으로 교환 (1코인 = N원, 부모님이 설정)
  - 🙏 부모님께 부탁: 상점에 없거나 직접 살 수 없는 것 → 부모님께 코인을 지불하고 대리 구매 요청
  - 🫙 같이 모으기: 치킨처럼 혼자 사기 어려운 건 형제와 코인을 모아요. 누가 얼마 냈는지 보이고, 다 모이면 부모님께 '사주세요' 알림. 취소하면 넣은 코인은 각자 환불
- 💌 **코인 보내기**: 형제에게 바로 코인 보내기 (한마디 가능). 부모님 확인 탭에 최근 보내기 내역
- 💵 **월 용돈 한도**: 아이별로 한 달에 용돈(현금)으로 바꿀 수 있는 최대 금액(기본 10,000원). 넘는 코인은 상점·같이 모으기에 쓰거나 다음 달로 이월
- 👛 **지갑**: 쿠폰함(준비 중 / 받았어요 / 거절·환불), 코인 내역

**부모 화면 (PIN 보호)**
- ✅ 확인: 완료 승인/다시 하기, 모두 승인, 코인 사용 요청 처리(완료 / 거절하면 자동 환불), 아이별 오늘 현황 + 대신 완료 처리
- 📋 미션: 심부름(매일 / 요일마다 / 한 번), 돌발 미션 발동
- 🏆 퀘스트: 정해진 심부름 모두(주간·월간·기간 지정) 또는 심부름 n개
- 🛒 상점: 기프티콘 목록 추가·수정(가격, 재고, 판매 중지), 용돈 교환 비율
- 👨‍👩‍👧 가족: 아이 추가, 보너스/차감, 자동 적립 설정, 가족 코드 공유, 비밀번호/PIN 변경

## 설치 순서 (처음 한 번)

1. Supabase — `우리 가족` 앱과 **같은 프로젝트**를 씁니다 (`js/config.js`). 테이블 이름이 모두 `qc_` 로 시작해서 겹치지 않아요.
   - **SQL Editor** 에 `supabase/schema.sql` 전체를 붙여넣고 Run (여러 번 실행해도 안전)
   - Authentication → Anonymous sign-ins 는 이미 켜져 있어야 해요 (우리 가족 앱과 같음)
2. GitHub 저장소 **Settings → Pages → Deploy from a branch → `main` / `(root)`** 저장
   → 사용자 지정 도메인 **https://quest.wurii.com** 으로 열려요 (저장소의 `CNAME` 파일, Cloudflare DNS: `quest` CNAME → `i2996.github.io`, DNS only)
3. 부모님 폰: `새 가족 공간 만들기` → 가족 비밀번호 + 부모 PIN 설정 → 가족 탭에서 아이 추가
4. 아이 폰: `가족 코드로 들어가기` (가족 탭의 `공유` 버튼으로 초대 링크 전달) → 자기 이름 선택 → 홈 화면에 추가

Supabase 없이 먼저 써보려면 첫 화면의 **먼저 체험해보기** (이 기기에만 저장, 부모 PIN `0000`).

로컬 테스트: `python3 -m http.server 8000` 후 `http://localhost:8000` · 로직 테스트: `node --test tests/*.test.mjs`

## 🔔 폰 알림

| 누가 받나 | 언제 |
|---|---|
| 아이 | 새 심부름 · 🚨 돌발 미션(누를 때까지 남아 있음) · 승인돼서 코인 들어옴 · 다시 해달래요 · 기프티콘 도착/용돈 받음/거절(환불) · 코인 받음(형제·보너스) · 같이 모으기 사주심 |
| 부모 | 아이가 '다 했어요' · 기프티콘/용돈/대신 사주세요 요청 · 퀘스트 클리어 · 같이 모으기 다 모음 |

- 기기마다 켜요: 아이 화면 위쪽 🔕 버튼 / 안내 배너의 `켜기`, 부모 화면 `가족 → 설정 → 이 기기 알림`
- 알림은 **그 기기를 지금 쓰는 사람** 기준이에요. (부모 폰을 아이 화면으로 바꾸면 그 아이 알림이 와요)
- 아이폰: 사파리 → 공유 → **홈 화면에 추가** 한 앱에서만 알림을 받을 수 있어요 (iOS 16.4 이상). 안드로이드는 크롬에서 바로.
- 동작 방식: DB 트리거(`qc_notify`) → 알림 함수 `supabase/functions/qc-notify` → 웹 푸시. VAPID 키는 '우리 가족' 알림과 같은 것을 써요.

### 알림이 안 올 때
폰 설정에서 브라우저(또는 홈 화면 앱)의 알림이 허용돼 있는지 확인해주세요. 삼성 인터넷에서 안 되면 크롬·브레이브로 설치해 보세요.

### 알림 설정 (처음 한 번)
1. `supabase/schema.sql` 다시 실행 (알림 테이블·트리거 추가)
2. 이 저장소 **Settings → Secrets and variables → Actions → New repository secret**
   - 이름 `SUPABASE_ACCESS_TOKEN`, 값은 '우리 가족' 저장소에 넣은 것과 같은 토큰 (모르면 supabase.com → Account → Access Tokens 에서 새로 만들기)
3. **Actions → 알림 함수 배포 → Run workflow** (이후엔 함수가 바뀌어 머지되면 자동 배포)

## 📱 안드로이드 앱 (APK)

삼성 인터넷 등 브라우저에서 알림이 안 오는 문제 때문에, 안드로이드 **진짜 알림(FCM)** 을 쓰는 앱을 만들어요.
앱은 `https://quest.wurii.com` 을 그대로 열어서, GitHub 에 머지하면 앱 화면도 바로 바뀌어요. (앱 껍데기만 가끔 다시 설치)

- 코드: `android-app/` (Capacitor). 앱 이름 `퀘스트코인`, 패키지 `com.wurii.quest`
- 만들기: GitHub Actions **'안드로이드 앱 만들기'** → 저장소 **Releases → android-latest → quest-coin.apk**
- 가족 설치용 서명 키(`android-app/android/app/family.keystore`)는 저장소에 있어요. 플레이스토어에 올릴 때는 따로 출시 키를 만들어요.
- 알림 경로: 앱에서 알림 켜기 → FCM 토큰을 `qc_push_subs` 에 `fcm:<토큰>` 으로 저장 → 알림 함수가 FCM HTTP v1 으로 보냄

### 처음 한 번 설정
1. **Firebase**(console.firebase.google.com) 프로젝트 만들기 → 안드로이드 앱 추가(패키지 `com.wurii.quest`) → `google-services.json` 받기
2. GitHub 저장소 Secrets 에 **`GOOGLE_SERVICES_JSON`** = 그 파일 내용 전체
3. Firebase → 프로젝트 설정 → 서비스 계정 → **새 비공개 키 생성**(JSON) → Supabase → Edge Functions → Secrets 에 **`FCM_SERVICE_ACCOUNT`** = 그 파일 내용 전체
4. Actions → '안드로이드 앱 만들기' 실행 → Releases 에서 APK 받아 설치

## 파일 구조

```
index.html / manifest.webmanifest / sw.js   PWA 껍데기 (앱 파일 바꾸면 sw.js 의 VERSION 올리기)
css/style.css                               전체 스타일
js/config.js                                Supabase 주소/키
js/app.js                                   시작점: 백엔드 선택 → 불러오기 → 실시간 구독 → 화면/이벤트
js/core.js                                  실행(오류 토스트)·다시 불러오기·지금 사용자
js/state.js  js/prefs.js                    앱 상태 / 기기별 설정(localStorage)
js/data/api.js                              백엔드 선택 (remote | demo)
js/data/remote.js                           Supabase (가족 공유)
js/data/local.js                            체험 모드 (같은 규칙, 이 기기에만 저장)
js/logic/                                   순수 계산: dates, coins, missions(오늘 할 일·돌발), quests(진행도)
js/data/push.js                             웹 푸시 구독 (브라우저)
js/ui/                                      photos(인증 사진) notify(알림 켜기) gate(시작·사용자 선택) kid(아이) parent(부모) sheet fx components
supabase/schema.sql                         테이블 + RLS + 코인 처리 함수(qc_*) + 실시간 + 알림 트리거
supabase/functions/qc-notify/               알림 함수 (index.ts: 보내기, logic.js: 누구에게·무슨 문구)
.github/workflows/deploy-functions.yml      알림 함수 자동 배포 (SUPABASE_ACCESS_TOKEN 필요)
tests/logic.test.mjs                        로직 테스트
```

## 데이터 구조

| 테이블 | 역할 |
|---|---|
| `qc_spaces` | 가족 공간 (코드, 이름, 1코인=원, 자동 적립) |
| `qc_space_secrets` | 가족 비밀번호·부모 PIN 해시 (클라이언트 접근 불가) |
| `qc_access` | 어떤 기기가 들어왔는지 + 부모 모드(`role=parent`) |
| `qc_kids` | 아이 (이름, 캐릭터, 색) |
| `qc_missions` | 심부름(`chore`) / 돌발 미션(`surprise`: 마감 시각, 선착순) |
| `qc_submissions` | 날짜별 완료 기록 (대기 → 승인/다시 하기) + 인증 사진 경로 |
| `qc_quests`, `qc_quest_claims` | 퀘스트, 기간별 보상 받은 기록 |
| `qc_shop_items` | 기프티콘 상품 (가격, 재고) |
| `qc_requests` | 코인 사용: 기프티콘 쿠폰(shop: 보유→사용 요청→사용 완료) / 용돈(cash) / 부모님께 지불(proxy) |
| `qc_ledger` | 코인 장부 — 잔액 = 합계 |

- 코인이 움직이는 일(완료 승인, 구매, 환불, 퀘스트 보상, 보너스)은 모두 DB 함수가 한 번에 처리해서 잔액이 꼬이지 않아요.
- 쓰기 권한: 심부름·상점·퀘스트·아이 정보는 **부모 모드 기기만** (RLS). 부모 PIN 을 맞게 입력한 기기만 부모 모드가 돼요.
- 퀘스트 보상 받기는 아이 기기에서 계산한 진행도를 믿고 처리해요 (완료 승인 자체는 부모만 가능).
