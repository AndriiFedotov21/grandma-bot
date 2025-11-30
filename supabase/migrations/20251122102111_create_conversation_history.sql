/*
  # Create conversation history table

  1. New Tables
    - `conversation_history`
      - `id` (uuid, primary key)
      - `chat_id` (bigint) - Telegram chat ID
      - `user_id` (bigint) - Telegram user ID
      - `username` (text) - Telegram username
      - `first_name` (text) - User first name
      - `message_type` (text) - 'text' or 'photo'
      - `user_message` (text) - What user sent
      - `bot_response` (text) - What bot replied
      - `created_at` (timestamptz) - When message was sent
      
  2. Indexes
    - Index on chat_id for fast lookups
    - Index on created_at for chronological queries
    
  3. Security
    - Enable RLS
    - Public read access (bot needs to read history)
*/

CREATE TABLE IF NOT EXISTS conversation_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chat_id bigint NOT NULL,
  user_id bigint NOT NULL,
  username text DEFAULT '',
  first_name text DEFAULT '',
  message_type text NOT NULL CHECK (message_type IN ('text', 'photo')),
  user_message text DEFAULT '',
  bot_response text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_conversation_chat_id ON conversation_history(chat_id);
CREATE INDEX IF NOT EXISTS idx_conversation_created_at ON conversation_history(created_at DESC);

-- Enable RLS
ALTER TABLE conversation_history ENABLE ROW LEVEL SECURITY;

-- Allow public read access for the bot
CREATE POLICY "Allow public read access"
  ON conversation_history
  FOR SELECT
  TO public
  USING (true);

-- Allow public insert access for the bot
CREATE POLICY "Allow public insert access"
  ON conversation_history
  FOR INSERT
  TO public
  WITH CHECK (true);