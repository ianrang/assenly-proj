import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ExternalLink, LinkType } from '@/shared/types/domain';

// ============================================================
// get_external_links Tool Handler — tool-spec.md §2
// R-6: tool handler. Supabase client 직접 조회 (단순 select).
// R-10: service 역호출 금지.
// tool-spec.md §4.2: 링크 조회 실패 → 빈 배열 반환.
// ============================================================

/** tool execute에 전달되는 context */
export interface LinksToolContext {
  client: SupabaseClient;
}

/** tool-spec.md §2 입력 */
interface LinksArgs {
  entity_id: string;
  entity_type: 'product' | 'store' | 'clinic' | 'treatment';
}

/**
 * get_external_links tool execute 함수.
 * tool-spec.md §2: entity_type별 외부 링크 조회.
 * tool-spec.md §4.2: 실패 → { links: [] }.
 */
export async function executeGetExternalLinks(
  args: LinksArgs,
  context: LinksToolContext,
): Promise<{ links: ExternalLink[] }> {
  const { client } = context;
  const { entity_id, entity_type } = args;

  try {
    switch (entity_type) {
      case 'product':
        return await getProductLinks(client, entity_id);
      case 'store':
        return await getStoreLinks(client, entity_id);
      case 'clinic':
        return await getClinicLinks(client, entity_id);
      case 'treatment':
        return await getTreatmentLinks(client, entity_id);
      default:
        return { links: [] };
    }
  } catch {
    // tool-spec.md §4.2: 링크 조회 실패 → 빈 배열
    return { links: [] };
  }
}

/**
 * products.purchase_links → ExternalLink[] 변환.
 * DB 컬럼 미존재 시 null → 빈 배열 (P2-16 D-5).
 */
async function getProductLinks(
  client: SupabaseClient,
  id: string,
): Promise<{ links: ExternalLink[] }> {
  const { data } = await client
    .from('products')
    .select('purchase_links')
    .eq('id', id)
    .maybeSingle();

  const raw = (data?.purchase_links ?? []) as Array<{ platform: string; url: string }>;
  const links: ExternalLink[] = raw.map(link => ({
    type: 'purchase' as LinkType,
    url: link.url,
    label: link.platform,
  }));

  return { links };
}

/**
 * stores.external_links 조회.
 * DB 컬럼 미존재 시 null → 빈 배열.
 */
async function getStoreLinks(
  client: SupabaseClient,
  id: string,
): Promise<{ links: ExternalLink[] }> {
  const { data } = await client
    .from('stores')
    .select('external_links')
    .eq('id', id)
    .maybeSingle();

  const links = (data?.external_links ?? []) as ExternalLink[];
  return { links };
}

/**
 * clinics.external_links + booking_url 조합.
 * clinics는 실제 DB에 external_links JSONB + booking_url TEXT 존재 (001:206-207).
 */
async function getClinicLinks(
  client: SupabaseClient,
  id: string,
): Promise<{ links: ExternalLink[] }> {
  const { data } = await client
    .from('clinics')
    .select('external_links, booking_url')
    .eq('id', id)
    .maybeSingle();

  const links = [...((data?.external_links ?? []) as ExternalLink[])];

  if (data?.booking_url) {
    links.push({
      type: 'booking' as LinkType,
      url: data.booking_url as string,
      label: 'Book appointment',
    });
  }

  return { links };
}

/**
 * treatments → clinic_treatments junction → clinics.booking_url.
 * treatments에 링크 컬럼 없음. 연결된 clinics의 booking_url을 수집.
 */
async function getTreatmentLinks(
  client: SupabaseClient,
  id: string,
): Promise<{ links: ExternalLink[] }> {
  const { data: junctions } = await client
    .from('clinic_treatments')
    .select('clinic:clinics(booking_url, name)')
    .eq('treatment_id', id);

  const links: ExternalLink[] = [];
  for (const row of junctions ?? []) {
    const clinic = (row as { clinic: { booking_url: string | null; name: unknown } | null }).clinic;
    if (clinic?.booking_url) {
      links.push({
        type: 'booking' as LinkType,
        url: clinic.booking_url,
      });
    }
  }

  return { links };
}
