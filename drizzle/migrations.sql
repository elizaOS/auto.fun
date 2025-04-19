
-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tokens_creator ON tokens(creator);

CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);

CREATE INDEX IF NOT EXISTS idx_tokens_market_cap ON tokens(market_cap_usd);

CREATE INDEX IF NOT EXISTS idx_swaps_token_mint ON swaps(token_mint);

CREATE INDEX IF NOT EXISTS idx_swaps_timestamp ON swaps(timestamp);

CREATE INDEX IF NOT EXISTS idx_messages_token_mint ON messages(token_mint);

CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id);

CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author);

CREATE INDEX IF NOT EXISTS idx_token_holders_mint ON token_holders(mint);

CREATE INDEX IF NOT EXISTS idx_token_holders_amount ON token_holders(amount);

CREATE INDEX IF NOT EXISTS idx_cache_prices_type ON cache_prices(type);

CREATE INDEX IF NOT EXISTS idx_cache_prices_symbol ON cache_prices(symbol);

CREATE INDEX IF NOT EXISTS idx_cache_prices_expires ON cache_prices(expires_at);





-- Create indexes for tokens table
CREATE INDEX IF NOT EXISTS idx_tokens_mint ON tokens(mint);
CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
CREATE INDEX IF NOT EXISTS idx_tokens_creator ON tokens(creator);
CREATE INDEX IF NOT EXISTS idx_tokens_market_cap ON tokens(market_cap_usd);
CREATE INDEX IF NOT EXISTS idx_tokens_created_at ON tokens(created_at);
CREATE INDEX IF NOT EXISTS idx_tokens_holder_count ON tokens(holder_count);
CREATE INDEX IF NOT EXISTS idx_tokens_volume_24h ON tokens(volume_24h);
CREATE INDEX IF NOT EXISTS idx_tokens_imported ON tokens(imported);
CREATE INDEX IF NOT EXISTS idx_tokens_hidden ON tokens(hidden);

-- Create indexes for token_holders table
CREATE INDEX IF NOT EXISTS idx_token_holders_mint ON token_holders(mint);
CREATE INDEX IF NOT EXISTS idx_token_holders_address ON token_holders(address);
CREATE INDEX IF NOT EXISTS idx_token_holders_amount ON token_holders(amount);
CREATE INDEX IF NOT EXISTS idx_token_holders_last_updated ON token_holders(last_updated);

-- Create composite indexes for common query patterns
CREATE INDEX IF NOT EXISTS idx_token_holders_mint_address ON token_holders(mint, address);
CREATE INDEX IF NOT EXISTS idx_tokens_status_imported ON tokens(status, imported);
CREATE INDEX IF NOT EXISTS idx_tokens_creator_imported ON tokens(creator, imported);