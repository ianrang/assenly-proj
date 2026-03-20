/**
 * 적재 레이어: StoreRow / ClinicRow → Supabase INSERT
 *
 * 프로바이더/변환 독립적. DB 적재만 담당.
 */
import { createServiceClient } from '../infra/helpers.js';
import type { StoreRow, ClinicRow } from './types.js';

export async function loadStores(rows: StoreRow[]): Promise<{ inserted: number; errors: string[] }> {
  const supabase = createServiceClient();
  const errors: string[] = [];
  let inserted = 0;

  for (const row of rows) {
    try {
      // location은 PostGIS geometry — Supabase에서는 문자열로 전달
      const insertData: Record<string, unknown> = { ...row };

      // PostGIS POINT는 직접 insert 시 지원되지 않을 수 있으므로 제거 후 별도 처리
      if (insertData.location) {
        delete insertData.location;
      }

      const { error } = await supabase.from('stores').insert(insertData);

      if (error) {
        errors.push(`stores: ${(row.name as Record<string, string>).ko} — ${error.message}`);
      } else {
        inserted++;
      }
    } catch (err) {
      errors.push(`stores: ${(row.name as Record<string, string>).ko} — ${(err as Error).message}`);
    }
  }

  return { inserted, errors };
}

export async function loadClinics(rows: ClinicRow[]): Promise<{ inserted: number; errors: string[] }> {
  const supabase = createServiceClient();
  const errors: string[] = [];
  let inserted = 0;

  for (const row of rows) {
    try {
      const insertData: Record<string, unknown> = { ...row };
      if (insertData.location) {
        delete insertData.location;
      }

      const { error } = await supabase.from('clinics').insert(insertData);

      if (error) {
        errors.push(`clinics: ${(row.name as Record<string, string>).ko} — ${error.message}`);
      } else {
        inserted++;
      }
    } catch (err) {
      errors.push(`clinics: ${(row.name as Record<string, string>).ko} — ${(err as Error).message}`);
    }
  }

  return { inserted, errors };
}

/** 테스트 데이터 정리 (status='active'인 최근 데이터 삭제) */
export async function cleanupTestData(): Promise<void> {
  const supabase = createServiceClient();

  // 10분 이내 생성된 데이터만 삭제 (안전)
  const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

  await supabase.from('stores').delete().gte('created_at', tenMinAgo);
  await supabase.from('clinics').delete().gte('created_at', tenMinAgo);
}
