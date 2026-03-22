-- ============================================================
-- Grant permissions for PostgREST API access
-- PostgREST only exposes tables that are GRANTed to the API roles
-- ============================================================

-- Schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- All existing tables
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon, authenticated;

-- Allow authenticated users to INSERT/UPDATE on user-facing tables
GRANT INSERT, UPDATE ON users TO authenticated;
GRANT INSERT, UPDATE ON user_profiles TO authenticated;
GRANT INSERT, UPDATE ON journeys TO authenticated;
GRANT INSERT, UPDATE ON beauty_history TO authenticated;
GRANT INSERT, UPDATE ON learned_preferences TO authenticated;
GRANT INSERT, UPDATE ON conversations TO authenticated;
GRANT INSERT, UPDATE ON messages TO authenticated;
GRANT INSERT, UPDATE ON behavior_logs TO authenticated;
GRANT INSERT, UPDATE ON consent_records TO authenticated;

-- Sequences (for UUID generation)
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- Default permissions for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE ON SEQUENCES TO anon, authenticated, service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
