// ============================================================
// KB 빌드 스크립트 — docs/knowledge-base/*.md → shared/constants/kb.generated.ts
// P-9: scripts/ → shared/ 출력 허용. 프로젝트 코드 import 없음.
// P-7: KB 추가 = .md 1파일만 편집. 이 스크립트가 자동 반영.
// Usage: npx tsx scripts/generate-kb.ts
// ============================================================

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join, basename } from 'node:path';

const KB_DIR = join(process.cwd(), 'docs', 'knowledge-base');
const OUTPUT = join(process.cwd(), 'src', 'shared', 'constants', 'kb.generated.ts');

interface KbEntry {
  topic: string;
  category: 'ingredient' | 'treatment';
  content: string;
}

function readKbFiles(subDir: string, category: 'ingredient' | 'treatment'): KbEntry[] {
  const dir = join(KB_DIR, subDir);
  const files = readdirSync(dir).filter(f => f.endsWith('.md')).sort();
  return files.map(file => {
    const topic = basename(file, '.md');
    if (!/^[a-z0-9-]+$/.test(topic)) {
      throw new Error(`Invalid KB filename: ${file}. Use kebab-case only (a-z, 0-9, hyphen).`);
    }
    return { topic, category, content: readFileSync(join(dir, file), 'utf-8') };
  });
}

function escapeTemplate(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${');
}

const ingredients = readKbFiles('ingredients', 'ingredient');
const treatments = readKbFiles('treatments', 'treatment');
const all = [...ingredients, ...treatments];

const lines = [
  '// ============================================================',
  '// KB 데이터 — 자동 생성 파일. 수동 편집 금지.',
  '// 원본: docs/knowledge-base/*.md',
  '// 생성: scripts/generate-kb.ts (npm run generate:kb)',
  '// ============================================================',
  '',
  'export const KB_INGREDIENT_TOPICS = [',
  ...ingredients.map(e => `  '${e.topic}',`),
  '] as const;',
  '',
  'export const KB_TREATMENT_TOPICS = [',
  ...treatments.map(e => `  '${e.topic}',`),
  '] as const;',
  '',
  'export type KbIngredientTopic = typeof KB_INGREDIENT_TOPICS[number];',
  'export type KbTreatmentTopic = typeof KB_TREATMENT_TOPICS[number];',
  'export type KbTopic = KbIngredientTopic | KbTreatmentTopic;',
  '',
  'export interface KbDocument {',
  '  topic: KbTopic;',
  "  category: 'ingredient' | 'treatment';",
  '  content: string;',
  '}',
  '',
  'export const KB_DOCUMENTS: Record<KbTopic, KbDocument> = {',
  ...all.map(e => [
    `  '${e.topic}': {`,
    `    topic: '${e.topic}',`,
    `    category: '${e.category}',`,
    `    content: \`${escapeTemplate(e.content)}\`,`,
    '  },',
  ].join('\n')),
  '};',
  '',
];

writeFileSync(OUTPUT, lines.join('\n'));
console.log(`[generate-kb] ${all.length} documents → ${OUTPUT}`);
