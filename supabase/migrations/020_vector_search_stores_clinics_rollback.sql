-- ============================================================
-- Rollback 020: match_stores / match_clinics RPC 삭제
-- ============================================================

DROP FUNCTION IF EXISTS match_stores(vector, integer, text, text, text);
DROP FUNCTION IF EXISTS match_clinics(vector, integer, text, text, text);

-- PostgREST 스키마 캐시 갱신
NOTIFY pgrst, 'reload schema';
