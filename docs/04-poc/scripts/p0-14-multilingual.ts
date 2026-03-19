/**
 * P0-14: 다국어 대화 품질 검증
 *
 * 3질문 × 6언어 × 3회 = 54회 호출 + LLM Judge 평가
 * KO/EN: 자동 키워드 검증, JA/ZH/ES/FR: LLM-as-Judge
 *
 * 실행: npx tsx docs/04-poc/scripts/p0-14-multilingual.ts
 */
import { generateText, stepCountIs } from 'ai';
import { getModel, provider } from './shared/config.js';
import { SYSTEM_PROMPT } from './shared/system-prompt.js';
import { pocTools } from './shared/tools.js';
import { judgeMultilingualQuality, type MultilingualScore } from './shared/llm-judge.js';

interface LangQuestion {
  lang: string;
  langName: string;
  questions: string[];
}

const LANGUAGES: LangQuestion[] = [
  {
    lang: 'en', langName: 'English',
    questions: [
      'I have oily skin and large pores. What serum would you recommend?',
      'Is laser toning treatment safe? Will it hurt?',
      'I\'m visiting Gangnam tomorrow. Where should I go for skincare shopping?',
    ],
  },
  {
    lang: 'ja', langName: 'Japanese',
    questions: [
      '脂性肌で毛穴が大きいです。おすすめの美容液はありますか？',
      'このレーザートーニングは安全ですか？痛いですか？',
      '明日カンナムに行きます。スキンケアの買い物はどこがいいですか？',
    ],
  },
  {
    lang: 'zh', langName: 'Chinese',
    questions: [
      '我是油性皮肤，毛孔粗大。你推荐什么精华液？',
      '这个激光嫩肤安全吗？会痛吗？',
      '我明天去江南。去哪里买护肤品好？',
    ],
  },
  {
    lang: 'es', langName: 'Spanish',
    questions: [
      'Tengo piel grasa y poros grandes. ¿Qué serum me recomiendas?',
      '¿Es seguro este tratamiento de láser toning? ¿Duele?',
      'Mañana voy a Gangnam. ¿Dónde debería ir para comprar productos de skincare?',
    ],
  },
  {
    lang: 'fr', langName: 'French',
    questions: [
      "J'ai la peau grasse et les pores dilatés. Quel sérum recommandez-vous ?",
      'Ce traitement laser toning est-il sûr ? Est-ce douloureux ?',
      'Je vais à Gangnam demain. Où faire du shopping skincare ?',
    ],
  },
  {
    lang: 'ko', langName: 'Korean',
    questions: [
      '지성 피부에 모공이 큰데요. 추천 세럼 있을까요?',
      '이 레이저 토닝 시술 안전한가요? 아프지 않나요?',
      '내일 강남 가는데요. 스킨케어 쇼핑 어디가 좋을까요?',
    ],
  },
];

const RUNS_PER_QUESTION = 3;
const DELAY_MS = 1000;

// 언어 감지 (간이)
function detectLanguageScript(text: string): string {
  if (/[\u3040-\u309F\u30A0-\u30FF]/.test(text)) return 'ja';
  if (/[\u4E00-\u9FFF]/.test(text) && !/[\uAC00-\uD7AF]/.test(text)) return 'zh';
  if (/[\uAC00-\uD7AF]/.test(text)) return 'ko';
  if (/[àâçéèêëîïôùûüÿœæ]/i.test(text)) return 'fr';
  if (/[áéíóúñ¿¡]/i.test(text)) return 'es';
  return 'en';
}

interface LangResult {
  lang: string;
  questionIndex: number;
  run: number;
  detectedLang: string;
  langMatch: boolean;
  score: MultilingualScore | null;
  responseSnippet: string;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('=== P0-14: Multilingual Conversation Quality ===');
  console.log(`Provider: ${provider}`);
  const totalCalls = LANGUAGES.length * 3 * RUNS_PER_QUESTION;
  console.log(`Total: ${LANGUAGES.length} langs × 3 questions × ${RUNS_PER_QUESTION} runs = ${totalCalls} calls + judge calls\n`);

  const results: LangResult[] = [];

  for (const langDef of LANGUAGES) {
    console.log(`\n=== ${langDef.langName} (${langDef.lang}) ===`);

    for (let qi = 0; qi < langDef.questions.length; qi++) {
      const question = langDef.questions[qi];
      console.log(`  Q${qi + 1}: "${question.slice(0, 60)}..."`);

      for (let ri = 0; ri < RUNS_PER_QUESTION; ri++) {
        try {
          const model = await getModel();
          const result = await generateText({
            model,
            system: SYSTEM_PROMPT,
            tools: pocTools,
            stopWhen: stepCountIs(2),
            maxTokens: 1024,
            prompt: question,
          });

          const response = result.text;
          const detectedLang = detectLanguageScript(response);
          const langMatch = detectedLang === langDef.lang;

          // LLM Judge 평가 (KO/EN도 포함 — 일관성 위해)
          let score: MultilingualScore | null = null;
          try {
            score = await judgeMultilingualQuality(langDef.langName, question, response);
          } catch {
            score = null;
          }

          const entry: LangResult = {
            lang: langDef.lang,
            questionIndex: qi,
            run: ri + 1,
            detectedLang,
            langMatch,
            score,
            responseSnippet: response.slice(0, 100),
          };
          results.push(entry);

          const scoreStr = score ? `avg=${score.average}` : 'judge-failed';
          const langIcon = langMatch ? 'LANG-OK' : 'LANG-MISMATCH';
          console.log(`    Run ${ri + 1}: ${langIcon} | ${scoreStr} | "${response.slice(0, 60)}..."`);

          await sleep(DELAY_MS);
        } catch (err) {
          console.error(`    Run ${ri + 1}: ERROR — ${err instanceof Error ? err.message : err}`);
          results.push({
            lang: langDef.lang,
            questionIndex: qi,
            run: ri + 1,
            detectedLang: '?',
            langMatch: false,
            score: null,
            responseSnippet: '',
          });
        }
      }
    }
  }

  // --- 결과 요약 ---
  console.log('\n=== P0-14 Results Summary ===\n');

  let allLangsPass = true;

  for (const langDef of LANGUAGES) {
    const langResults = results.filter((r) => r.lang === langDef.lang);
    const langMatches = langResults.filter((r) => r.langMatch).length;
    const scores = langResults.filter((r) => r.score !== null).map((r) => r.score!);

    const avgFidelity = scores.length > 0 ? scores.reduce((s, sc) => s + sc.language_fidelity, 0) / scores.length : 0;
    const avgAccuracy = scores.length > 0 ? scores.reduce((s, sc) => s + sc.content_accuracy, 0) / scores.length : 0;
    const avgFluency = scores.length > 0 ? scores.reduce((s, sc) => s + sc.natural_fluency, 0) / scores.length : 0;
    const avgCompletion = scores.length > 0 ? scores.reduce((s, sc) => s + sc.task_completion, 0) / scores.length : 0;
    const avgTotal = scores.length > 0 ? scores.reduce((s, sc) => s + sc.average, 0) / scores.length : 0;

    const pass = avgTotal >= 3.5 && avgFidelity >= 3.0;
    if (!pass) allLangsPass = false;

    const icon = pass ? 'PASS' : 'FAIL';
    console.log(
      `  ${langDef.langName} (${langDef.lang}): ${icon}` +
        ` | avg=${avgTotal.toFixed(1)}` +
        ` | fidelity=${avgFidelity.toFixed(1)} accuracy=${avgAccuracy.toFixed(1)}` +
        ` fluency=${avgFluency.toFixed(1)} completion=${avgCompletion.toFixed(1)}` +
        ` | langDetect=${langMatches}/${langResults.length}`,
    );
  }

  const totalScored = results.filter((r) => r.score !== null);
  const overallAvg = totalScored.length > 0
    ? totalScored.reduce((s, r) => s + r.score!.average, 0) / totalScored.length
    : 0;

  console.log(`\nOverall average: ${overallAvg.toFixed(1)} (threshold: 3.5)`);

  const verdict = allLangsPass ? 'PASS' : overallAvg >= 3.0 ? 'CONDITIONAL' : 'FAIL';
  console.log(`\n=== P0-14 Verdict: ${verdict} ===`);
}

main().catch((err) => {
  console.error('Unexpected error:', err);
  process.exit(1);
});
