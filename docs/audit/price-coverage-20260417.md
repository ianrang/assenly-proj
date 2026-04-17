# Price Coverage Audit — 20260417

- Generated: `2026-04-17T07:30:53.054Z`
- Branch: `feat/new-17d-profile-edit`
- Script: `scripts/audit/price-coverage.ts` (NEW-34)

이 리포트는 NEW-35 (가격 티어 임계값 보정)의 입력으로 사용된다. 분석 대상은 `products.price` (KRW) 와 `treatments.price_min` / `price_max` (KRW). 모두 `docs/03-design/schema.dbml` 정의 기준.

---

## 1. Products

- Total rows: **597**
- `price IS NULL`: **128** (21.4%)
- Non-null sample: 469

### Quantiles (non-null prices, KRW)

| metric | value (KRW) |
|---|---|
| count | 469 |
| min | 10,010 |
| p25 | 25,392 |
| p50 (median) | 39,841 |
| p75 | 48,552 |
| p90 | 58,057 |
| max | 159,264 |
| mean | 39,364 |

### Per-category breakdown

| category | total | null | null % |
|---|---:|---:|---:|
| skincare | 249 | 82 | 32.9% |
| makeup | 134 | 25 | 18.7% |
| haircare | 86 | 9 | 10.5% |
| bodycare | 81 | 9 | 11.1% |
| tools | 47 | 3 | 6.4% |

### Histogram (10 bins, non-null prices)

```
[    10010 ~ 24935    ] #############################            113
[    24935 ~ 39861    ] #################################        132
[    39861 ~ 54786    ] ######################################## 158
[    54786 ~ 69712    ] #############                            51
[    69712 ~ 84637    ] ##                                       9
[    84637 ~ 99562    ]                                          0
[    99562 ~ 114488   ] #                                        3
[   114488 ~ 129413   ]                                          0
[   129413 ~ 144339   ]                                          0
[   144339 ~ 159264   ] #                                        3
```

---

## 2. Treatments

- Total rows: **53**
- `price_min IS NULL`: **0** (0.0%)
- `price_max IS NULL`: **0** (0.0%)

### Quantiles — `price_min` (KRW)

| metric | value (KRW) |
|---|---|
| count | 53 |
| min | 30,000 |
| p25 | 50,000 |
| p50 (median) | 80,000 |
| p75 | 200,000 |
| p90 | 200,000 |
| max | 500,000 |
| mean | 130,755 |

### Quantiles — `price_max` (KRW)

| metric | value (KRW) |
|---|---|
| count | 53 |
| min | 80,000 |
| p25 | 150,000 |
| p50 (median) | 200,000 |
| p75 | 500,000 |
| p90 | 680,000 |
| max | 2,500,000 |
| mean | 389,245 |

### Per-category breakdown (null = price_min IS NULL)

| category | total | null | null % |
|---|---:|---:|---:|
| laser | 15 | 0 | 0.0% |
| injection | 12 | 0 | 0.0% |
| skin | 10 | 0 | 0.0% |
| facial | 9 | 0 | 0.0% |
| body | 4 | 0 | 0.0% |
| hair | 3 | 0 | 0.0% |

### Histogram — `price_min` (10 bins)

```
[    30000 ~ 77000    ] ######################################## 19
[    77000 ~ 124000   ] ###########################              13
[   124000 ~ 171000   ] ###########                              5
[   171000 ~ 218000   ] #######################                  11
[   218000 ~ 265000   ]                                          0
[   265000 ~ 312000   ] ######                                   3
[   312000 ~ 359000   ]                                          0
[   359000 ~ 406000   ]                                          0
[   406000 ~ 453000   ]                                          0
[   453000 ~ 500000   ] ####                                     2
```

### Histogram — `price_max` (10 bins)

```
[    80000 ~ 322000   ] ######################################## 32
[   322000 ~ 564000   ] ################                         13
[   564000 ~ 806000   ] ######                                   5
[   806000 ~ 1048000  ]                                          0
[  1048000 ~ 1290000  ]                                          0
[  1290000 ~ 1532000  ] #                                        1
[  1532000 ~ 1774000  ]                                          0
[  1774000 ~ 2016000  ] #                                        1
[  2016000 ~ 2258000  ]                                          0
[  2258000 ~ 2500000  ] #                                        1
```

---

## 3. Observations

- products: 총 597건 중 price null 비율 21.4%.
- products 카테고리별 최악: `skincare` (32.9% null, 249건).
- treatments: 총 53건. price_min null 0.0%, price_max null 0.0%.
- treatments 카테고리별 최악: `laser` (0.0% price_min null, 15건).
- 일반 건강 범위: 핵심 표시 필드의 null 비율 < 10%. 위 수치를 이 기준과 비교해 보강 우선순위 도출.

---

## 4. Recommended tier thresholds (draft, for NEW-35)

티어 경계는 quantile 기반 초안. NEW-35에서 비즈니스 맥락(타깃 가격대, 경쟁 벤치마크) 반영해 확정.

### Products (`price`)

- `$` (cheap): < 25,392 KRW
- `$$` (mid): 25,392 ~ 48,552 KRW
- `$$$` (premium): > 48,552 KRW (top ~25%)

> 근거: p25=25,392 / p75=48,552 (median=39,841)

### Treatments (`price_min` 기준)

- `$` (cheap): < 50,000 KRW
- `$$` (mid): 50,000 ~ 200,000 KRW
- `$$$` (premium): > 200,000 KRW (top ~25%)

> 근거: p25=50,000 / p75=200,000 (median=80,000)

### 주의

- null 비율이 높은 카테고리는 티어 분류에서 제외하거나 "가격 정보 없음" 별도 처리 필요.
- treatments는 `price_min` ~ `price_max` 구간 표현이므로, 단일 티어 매핑보다 "예상 시작가 기준 티어" + "범위 폭 표시" 방식 권장.
