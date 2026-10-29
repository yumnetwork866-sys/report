process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://manage_team_test:manage_team_test@127.0.0.1/manage_team_test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test_session_secret_at_least_32_characters_long';
process.env.TIKTOK_TOKEN_ENCRYPTION_KEY = process.env.TIKTOK_TOKEN_ENCRYPTION_KEY || 'test_tiktok_token_encryption_key_32_chars';
process.env.TIKTOK_PARTNER_TOKEN_ENCRYPTION_KEY = process.env.TIKTOK_PARTNER_TOKEN_ENCRYPTION_KEY || 'test_tiktok_partner_token_encryption_key_32_chars';
