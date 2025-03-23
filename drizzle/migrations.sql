-- Migration file for D1 database

-- Create users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT,
  address TEXT NOT NULL UNIQUE,
  avatar TEXT DEFAULT 'https://ipfs.io/ipfs/bafkreig4ob6pq5qy4v6j62krj4zkh2kc2pnv5egqy7f65djqhgqv3x56pq',
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- Create tokens table
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ticker TEXT NOT NULL,
  url TEXT NOT NULL,
  image TEXT NOT NULL,
  twitter TEXT,
  telegram TEXT,
  website TEXT,
  discord TEXT,
  agent_link TEXT,
  description TEXT,
  mint TEXT NOT NULL UNIQUE,
  creator TEXT NOT NULL,
  nft_minted TEXT,
  lock_id TEXT,
  locked_amount TEXT,
  locked_at INTEGER,
  harvested_at INTEGER,
  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  last_updated INTEGER NOT NULL DEFAULT (unixepoch()),
  completed_at INTEGER,
  withdrawn_at INTEGER,
  migrated_at INTEGER,
  market_id TEXT,
  base_vault TEXT,
  quote_vault TEXT,
  withdrawn_amount INTEGER,
  reserve_amount INTEGER,
  reserve_lamport INTEGER,
  virtual_reserves INTEGER,
  liquidity INTEGER,
  current_price INTEGER,
  market_cap_usd INTEGER,
  token_price_usd INTEGER,
  sol_price_usd INTEGER,
  curve_progress INTEGER,
  curve_limit INTEGER,
  price_change_24h INTEGER,
  price_24h_ago INTEGER,
  volume_24h INTEGER,
  inference_count INTEGER,
  last_volume_reset INTEGER,
  last_price_update INTEGER,
  holder_count INTEGER,
  tx_id TEXT NOT NULL
);

-- Create swaps table
CREATE TABLE IF NOT EXISTS swaps (
  id TEXT PRIMARY KEY,
  token_mint TEXT NOT NULL,
  user TEXT NOT NULL,
  type TEXT NOT NULL,
  direction INTEGER NOT NULL,
  amount_in INTEGER NOT NULL,
  amount_out INTEGER NOT NULL,
  price_impact INTEGER,
  price INTEGER NOT NULL,
  tx_id TEXT NOT NULL,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (token_mint) REFERENCES tokens(mint)
);

-- Create fees table
CREATE TABLE IF NOT EXISTS fees (
  id TEXT PRIMARY KEY,
  token_mint TEXT NOT NULL,
  user TEXT,
  direction INTEGER,
  fee_amount TEXT,
  token_amount TEXT,
  sol_amount TEXT,
  type TEXT NOT NULL,
  tx_id TEXT,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (token_mint) REFERENCES tokens(mint)
);

-- Create messages table
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  token_mint TEXT NOT NULL,
  message TEXT NOT NULL,
  parent_id TEXT,
  reply_count INTEGER NOT NULL DEFAULT 0,
  likes INTEGER NOT NULL DEFAULT 0,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (token_mint) REFERENCES tokens(mint),
  FOREIGN KEY (parent_id) REFERENCES messages(id)
);

-- Create message likes table
CREATE TABLE IF NOT EXISTS message_likes (
  id TEXT PRIMARY KEY,
  message_id TEXT NOT NULL,
  user_address TEXT NOT NULL,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (message_id) REFERENCES messages(id)
);

-- Create vanity keypairs table
CREATE TABLE IF NOT EXISTS vanity_keypairs (
  id TEXT PRIMARY KEY,
  address TEXT NOT NULL UNIQUE,
  secret_key TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  used INTEGER NOT NULL DEFAULT 0
);

-- Create token holders table
CREATE TABLE IF NOT EXISTS token_holders (
  id TEXT PRIMARY KEY,
  mint TEXT NOT NULL,
  address TEXT NOT NULL,
  amount INTEGER NOT NULL,
  percentage INTEGER NOT NULL,
  last_updated INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (mint) REFERENCES tokens(mint)
);

-- Create personalities table
CREATE TABLE IF NOT EXISTS personalities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at INTEGER
);

-- Create media generations table
CREATE TABLE IF NOT EXISTS media_generations (
  id TEXT PRIMARY KEY,
  mint TEXT NOT NULL,
  type TEXT NOT NULL,
  prompt TEXT NOT NULL,
  media_url TEXT NOT NULL,
  negative_prompt TEXT,
  num_inference_steps INTEGER,
  seed INTEGER,
  num_frames INTEGER,
  fps INTEGER,
  motion_bucket_id INTEGER,
  duration INTEGER,
  duration_seconds INTEGER,
  bpm INTEGER,
  creator TEXT,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
  daily_generation_count INTEGER DEFAULT 0,
  last_generation_reset INTEGER,
  FOREIGN KEY (mint) REFERENCES tokens(mint)
);

-- Create cache prices table
CREATE TABLE IF NOT EXISTS cache_prices (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  symbol TEXT NOT NULL,
  price TEXT NOT NULL,
  timestamp INTEGER NOT NULL DEFAULT (unixepoch()),
  expires_at INTEGER NOT NULL
);

-- Create agents table
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  owner_address TEXT NOT NULL,
  contract_address TEXT NOT NULL,
  tx_id TEXT NOT NULL UNIQUE,
  symbol TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  model_provider TEXT DEFAULT 'llama_cloud',
  
  -- Arrays (stored as JSON strings in SQLite)
  bio TEXT, -- JSON array
  lore TEXT, -- JSON array
  post_examples TEXT, -- JSON array
  adjectives TEXT, -- JSON array
  people TEXT, -- JSON array
  topics TEXT, -- JSON array
  style_all TEXT, -- JSON array
  style_chat TEXT, -- JSON array
  style_post TEXT, -- JSON array
  
  -- JSON fields
  message_examples TEXT, -- JSON
  twitter_cookie TEXT, -- JSON
  
  -- Twitter fields
  twitter_username TEXT NOT NULL,
  twitter_password TEXT NOT NULL,
  twitter_email TEXT NOT NULL,
  post_freq_min INTEGER DEFAULT 90,
  post_freq_max INTEGER DEFAULT 180,
  poll_interval_sec INTEGER DEFAULT 120,
  
  -- Task management
  ecs_task_id TEXT,
  
  -- Timestamps
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch()),
  deleted_at INTEGER
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_tokens_creator ON tokens(creator);
CREATE INDEX IF NOT EXISTS idx_tokens_status ON tokens(status);
CREATE INDEX IF NOT EXISTS idx_tokens_market_cap ON tokens(market_cap_usd);

CREATE INDEX IF NOT EXISTS idx_swaps_token_mint ON swaps(token_mint);
CREATE INDEX IF NOT EXISTS idx_swaps_timestamp ON swaps(timestamp);

CREATE INDEX IF NOT EXISTS idx_messages_token_mint ON messages(token_mint);
CREATE INDEX IF NOT EXISTS idx_messages_parent_id ON messages(parent_id);
CREATE INDEX IF NOT EXISTS idx_messages_author ON messages(author);

CREATE INDEX IF NOT EXISTS idx_message_likes_message_id ON message_likes(message_id);
CREATE INDEX IF NOT EXISTS idx_message_likes_user ON message_likes(user_address);

CREATE INDEX IF NOT EXISTS idx_token_holders_mint ON token_holders(mint);
CREATE INDEX IF NOT EXISTS idx_token_holders_amount ON token_holders(amount);

CREATE INDEX IF NOT EXISTS idx_agents_owner ON agents(owner_address);
CREATE INDEX IF NOT EXISTS idx_agents_contract ON agents(contract_address);
CREATE INDEX IF NOT EXISTS idx_agents_task ON agents(ecs_task_id);
CREATE INDEX IF NOT EXISTS idx_agents_tx_id ON agents(tx_id);
CREATE INDEX IF NOT EXISTS idx_agents_updated_at ON agents(updated_at);

CREATE INDEX IF NOT EXISTS idx_cache_prices_type ON cache_prices(type);
CREATE INDEX IF NOT EXISTS idx_cache_prices_symbol ON cache_prices(symbol);
CREATE INDEX IF NOT EXISTS idx_cache_prices_expires ON cache_prices(expires_at); 