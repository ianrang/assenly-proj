-- ============================================================
-- NEW-17h M-1: defense-in-depth — RPC 함수 search_path 고정.
-- 설계 정본: docs/superpowers/specs/2026-04-16-new17b-rpc-hardening-design.md
--
-- migration 017의 4개 RPC 함수에 SET search_path 추가.
-- SECURITY INVOKER + service_role 전용이라 실질 위험 낮지만
-- defense-in-depth 원칙으로 search_path 오염 가능성 차단.
-- ============================================================

ALTER FUNCTION apply_ai_profile_patch(uuid, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION apply_ai_journey_patch(uuid, jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION get_profile_field_spec() SET search_path = public, pg_temp;
ALTER FUNCTION get_journey_field_spec() SET search_path = public, pg_temp;

-- ============================================================
-- ROLLBACK
-- ============================================================
-- ALTER FUNCTION apply_ai_profile_patch(uuid, jsonb) RESET search_path;
-- ALTER FUNCTION apply_ai_journey_patch(uuid, jsonb) RESET search_path;
-- ALTER FUNCTION get_profile_field_spec() RESET search_path;
-- ALTER FUNCTION get_journey_field_spec() RESET search_path;
