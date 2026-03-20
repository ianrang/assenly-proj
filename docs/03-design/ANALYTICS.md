# 에센리 K-뷰티 AI 에이전트 — 성공 지표 측정 설계

> 버전: 0.1
> 최종 갱신: 2026-03-20
> 상위 문서: PRD §5.6, MASTER-PLAN §2
> 범위: MVP 6개 KPI 측정 방법 + 분석 도구 결정 (U-10)

---

## 목차

1. [§1 목적](#1-목적)
2. [§2 KPI별 이벤트 요구사항](#2-kpi별-이벤트-요구사항)
3. [§3 수집 이벤트 정의](#3-수집-이벤트-정의)
4. [§4 분석 도구 결정 (U-10)](#4-분석-도구-결정-u-10)
5. [§5 KPI별 측정 방법](#5-kpi별-측정-방법)
6. [§6 동의/법적 경계](#6-동의법적-경계)
7. [§7 MVP 범위 vs v0.2+](#7-mvp-범위-vs-v02)
8. [§8 의존성 + 미결정 메모](#8-의존성--미결정-메모)

---

# §1 목적

PRD §5.6에 정의된 6개 MVP 성공 지표(KPI)의 **측정 도구와 구현 방법**을 확정한다.

- **입력**: PRD §5.6 KPI 정의 (지표명, 목표값, 계산식)
- **산출물**: 이벤트 요구사항, 도구 결정, KPI별 측정 방법
- **범위**: 측정 "설계"까지. 이벤트 상세 스키마는 P1-56, 구현은 P2-26에서 수행
- **전제**: PRD §5.6의 "세션"은 MVP에서 `conversations` 레코드(대화 단위)로 구현한다. MVP는 토큰 기반 anonymous 사용이며 세션 타임아웃을 구현하지 않으므로, 1 conversation = 1 측정 단위로 사용한다.

---

# §2 KPI별 이벤트 요구사항

## 6개 KPI → 필요 데이터 매핑

| # | KPI | 목표 | 분자 | 분모 | 필요 데이터 |
|---|-----|------|------|------|------------|
| K1 | 온보딩 완료율 | >60% | 프로필 생성 완료 | 경로A 진입 | ① `path_a_entry` 이벤트 ② `user_profiles` 생성 기록 |
| K2 | 대화 턴 수 | avg 5+ | 사용자 메시지 합계 | 대화 수 | `messages` 테이블 (role='user') — 기존 DB |
| K3 | 카드 클릭률 | >30% | 카드 클릭 | 카드 노출 | ① `card_exposure` 이벤트 ② `card_click` 이벤트 |
| K4 | Kit CTA 전환 | >5% | 이메일 제출 | 전체 대화 수 | ① `kit_cta_submit` 이벤트 ② `conversations` 레코드 수 |
| K5 | 외부 링크 클릭 | >20% | 외부 링크 클릭 | 카드 노출 | ① `external_link_click` 이벤트 ② K3의 `card_exposure` 공유 |
| K6 | 다국어 사용 | 2+ 언어 | 비영어 대화 | 전체 대화 수 | `conversations.locale` (URL `[locale]` 파라미터에서 기록) |

## 데이터 소스 분류

- **기존 DB/라우팅으로 측정 가능**: K2 (`messages` 테이블), K6 (URL locale → `conversations.locale`)
- **`behavior_logs` 이벤트 필요**: K1, K3, K4, K5 → 5개 이벤트 타입

---

# §3 수집 이벤트 정의

## 필요 이벤트 (5개)

| event_type | KPI | target_type | metadata |
|------------|-----|-------------|----------|
| `path_a_entry` | K1 | — | `{ source: "landing" }` |
| `card_exposure` | K3, K5 | `product` / `treatment` | `{ card_id, domain }` |
| `card_click` | K3 | `product` / `treatment` | `{ card_id, domain }` |
| `external_link_click` | K5 | `product` / `treatment` | `{ card_id, link_type, url }` |
| `kit_cta_submit` | K4 | — | `{ email_hash }` |

## `behavior_logs` 스키마 매핑

DB-SCHEMA.md 기존 정의:

```sql
CREATE TABLE behavior_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id),
  event_type TEXT NOT NULL,
  target_id UUID,
  target_type TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

5개 이벤트 모두 이 스키마에 적합:

- `event_type`: 위 5개 문자열
- `target_id`: 카드 관련 이벤트에서 product/treatment UUID. 비카드 이벤트는 null
- `target_type`: `product`, `treatment`, 또는 null
- `metadata`: 이벤트별 추가 정보 (JSONB)

> 이벤트 상세 속성(필수/선택, 값 제약 등)은 P1-56(Analytics 이벤트 정의)에서 확정.

---

# §4 분석 도구 결정 (U-10)

## 선택지 비교

| 기준 | (a) Vercel Analytics | (b) Mixpanel | (c) 자체 (behavior_logs) |
|------|---------------------|-------------|------------------------|
| KPI 측정 | 페이지뷰만 네이티브. 커스텀 이벤트 제한적 | 6개 KPI 모두 네이티브 지원 | 6개 KPI 모두 SQL 쿼리로 측정 |
| 퍼널 분석 | ✗ | ✓ (핵심 강점) | ✗ (수동 SQL) |
| 대시보드 | 기본 제공 (페이지뷰/Web Vitals) | 풍부한 시각화 | ✗ (직접 구축 또는 외부 도구) |
| 설치 비용 | 제로 (Vercel 내장) | JS SDK 추가 + GDPR 설정 | 제로 (DB 이미 설계됨) |
| 운영 비용 | 무료 (Pro 포함) | 무료 (20M 이벤트/월) | 무료 (Supabase 내) |
| 데이터 소유 | Vercel 서버 | Mixpanel 서버 | 자체 Supabase DB |
| 개발 공수 | 최소 | 중 (SDK 통합, 이벤트 전송) | 중 (이벤트 기록 + 조회 쿼리) |
| MVP 적합성 | 보조용으로만 적합 | 소규모에는 과잉 | ✓ 소규모 최적 |

## 결정: **(c) 자체 + (a) Vercel Analytics 보조**

| 역할 | 도구 | 용도 |
|------|------|------|
| **주 측정** | 자체 (`behavior_logs` + SQL) | 6개 KPI 전체 측정 |
| **보조** | Vercel Analytics | 페이지뷰, Web Vitals, 디바이스/브라우저 (무료, 제로 설정) |

**근거:**

1. `behavior_logs` 테이블이 TDD에 이미 설계됨 — 추가 인프라 불필요
2. 5개 이벤트로 6개 KPI 전부 측정 가능 — 외부 도구 없이 충분
3. MVP는 소프트 런칭(소규모) — Mixpanel 퍼널 분석은 v0.2+ 사용자 증가 시 검토
4. Vercel Analytics는 제로 설정으로 페이지뷰 + Web Vitals 보조 (무료)
5. 1인 개발 — 외부 의존성 최소화, 데이터 완전 소유

**v0.2+ 전환 경로**: 사용자 규모 증가 시 `behavior_logs` → Mixpanel/Amplitude 이벤트 파이프라인 추가 가능 (데이터 구조 호환)

---

# §5 KPI별 측정 방법

## K1: 온보딩 완료율 (목표 >60%)

```
측정식: COUNT(user_profiles created in period) / COUNT(behavior_logs WHERE event_type='path_a_entry' in period)
데이터: behavior_logs (path_a_entry) + user_profiles (created_at)
집계: 일간/주간
```

- 분자: `user_profiles` 레코드 생성 = 온보딩 4단계 완료 + 프로필 생성
- 분모: Landing에서 "Start with my profile" 클릭 시 `path_a_entry` 이벤트 기록
- 경로B 사용자는 분모에 포함되지 않음 (PRD §5.6 정의와 일치)

## K2: 대화 턴 수 (목표 avg 5+)

```
측정식: AVG(user_message_count per conversation)
         = AVG(SELECT COUNT(*) FROM messages WHERE role='user' GROUP BY conversation_id)
데이터: messages 테이블 — 추가 이벤트 불필요
집계: 일간/주간
```

- 기존 `messages` 테이블에서 직접 계산
- `role='user'`인 메시지만 카운트 (assistant/system 제외)

## K3: 카드 클릭률 (목표 >30%)

```
측정식: COUNT(card_click events in period) / COUNT(card_exposure events in period)
데이터: behavior_logs (card_exposure, card_click)
집계: 일간/주간
```

- `card_exposure`: AI 응답에서 추천 카드가 렌더링될 때 기록
- `card_click`: 사용자가 카드를 클릭/탭할 때 기록
- 도메인별(shopping/treatment) 분리 집계 가능 (metadata.domain)

## K4: Kit CTA 전환 (목표 >5%)

```
측정식: COUNT(kit_cta_submit events in period) / COUNT(conversations created in period)
데이터: behavior_logs (kit_cta_submit) + conversations (created_at)
집계: 일간/주간
```

- 분자: Kit CTA 폼에서 이메일 제출 시 `kit_cta_submit` 이벤트 기록
- 분모: `conversations` 레코드 수 (§1 전제 참조)
- `email_hash`만 metadata에 기록 (원문 이메일은 별도 저장소)

## K5: 외부 링크 클릭 (목표 >20%)

```
측정식: COUNT(external_link_click events in period) / COUNT(card_exposure events in period)
데이터: behavior_logs (external_link_click, card_exposure)
집계: 일간/주간
```

- `card_exposure`는 K3과 공유 (중복 기록 아님)
- `link_type`별 분리 집계 가능 (metadata.link_type: naver_map, kakao_map, website 등)

## K6: 다국어 사용 (목표 2+ 언어)

```
측정식: COUNT(conversations WHERE locale != 'en' in period) / COUNT(conversations in period)
데이터: conversations.locale (URL [locale] 파라미터에서 기록)
집계: 일간/주간
보조: 언어별 비율 breakdown (en, ko, ja, zh, es, fr)
```

- `conversations` 테이블에 `locale TEXT` 컬럼 추가 필요 (P1-16에서 반영)
- URL locale = 사용자가 선택한 UI 언어를 대리 지표로 사용. 대화 내 실제 사용 언어 감지는 v0.2+ 범위
- URL locale 기반 → 경로A/B 모두 포함 (user_profiles.language는 경로B 사용자 누락 가능)
- 목표 "2+ 언어": 영어 외 1개 이상 언어에서 유의미한 대화 발생 여부

---

# §6 동의/법적 경계

## 이벤트 유형별 동의 구분

| 이벤트 유형 | 목적 | 필요 동의 | MVP 수집 |
|------------|------|----------|---------|
| **KPI 이벤트** (5개) | 서비스 운영 분석 | `data_retention` (Landing 배너) | ✓ MVP 필수 |
| **BH-4 학습 이벤트** | 고급 개인화 (선호도 학습) | `behavior_logging` | ✗ v0.3 |

## 근거

- `data_retention` 동의 (PRD §4-C): Landing 하단 배너에서 수집. MVP 필수. KPI 이벤트 기록은 서비스 운영 분석에 해당하므로 이 동의에 포함
- `behavior_logging` 동의 (PRD §4-C): "행동 로깅 동의 — MVP 제외". BH-4 학습을 위한 상세 행동 패턴 추적에 해당

## 주의

- 두 유형 모두 동일한 `behavior_logs` 테이블에 기록되지만, **동의 범위가 다름**
- KPI 이벤트는 집계 목적, BH-4 학습 이벤트는 개인화 목적
- 법적 검토(U-15)에서 이 구분의 법적 타당성 최종 확인 필요

## 미결정: `analytics` 동의 컬럼

- 마이그레이션(`setup-all.sql`, `001_initial_schema.sql`)에 `consent_records.analytics BOOLEAN` 컬럼이 존재하나, DB-SCHEMA.md와 PRD §4-C에는 미반영 상태
- KPI 이벤트 동의 매핑이 `data_retention`이 아닌 `analytics`에 해당할 가능성 있음
- DB-SCHEMA.md + PRD §4-C 동기화 시 동의 매핑 재검토 필요 (P0-3 범위 밖)

---

# §7 MVP 범위 vs v0.2+

## MVP (v0.1)

| 항목 | 범위 |
|------|------|
| KPI 측정 | 6개 KPI 전부. SQL 쿼리로 집계 |
| 이벤트 수집 | behavior_logs에 5개 이벤트 타입 기록 |
| 페이지 분석 | Vercel Analytics (페이지뷰, Web Vitals) |
| 대시보드 | 없음. SQL 수동 조회 또는 간단한 관리자 화면 |
| 알림 | 없음 |

## v0.2+

| 항목 | 범위 |
|------|------|
| 대시보드 | 관리자 앱에 KPI 대시보드 시각화 (MASTER-PLAN §2.2) |
| 퍼널 분석 | Mixpanel/Amplitude 도입 검토 (사용자 규모 증가 시) |
| 추가 이벤트 | page_view, onboarding_step_complete, profile_edit 등 (P1-56 범위) |
| BH-4 학습 | behavior_logging 동의 수집 후 상세 행동 추적 (v0.3) |
| 행동 분석 | 행동 분석 대시보드 (v0.3, MASTER-PLAN §2.3) |

---

# §8 의존성 + 미결정 메모

## 후속 작업 의존성

| 항목 | 설명 | 결정 시점 |
|------|------|----------|
| K6 locale 컬럼 | `conversations` 테이블에 `locale TEXT` 추가 필요 | P1-16 (스키마 수정) |
| Kit CTA 저장 테이블 | DB 스키마에 kit_subscribers 테이블 없음. 이메일 저장소 설계 필요 | P1-16~P1-20 |
| P1-56 이벤트 상세 | 본 문서의 5개 KPI 이벤트 + 추가 이벤트 상세 정의 (이벤트 이름·속성·발화 시점) | Phase 1 |
| P2-26 행동 로그 서비스 | `behavior_logs` 기록 서비스 구현 | Phase 2 |
| U-15 법적 검토 | KPI 이벤트 ⊂ data_retention 동의 전제의 법적 타당성 확인 | Phase 0~3 |
| consent_records 스키마 동기화 | 마이그레이션의 `analytics` 컬럼이 DB-SCHEMA.md·PRD §4-C에 미반영. 동기화 후 §6 동의 매핑 재검토 | P1-16 (스키마 수정) |
