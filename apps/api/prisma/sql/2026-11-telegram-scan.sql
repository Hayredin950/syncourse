-- Self-post scanner state.
--
-- Telegram does not deliver a bot's own outgoing messages to the bot, so the
-- watcher never sees a course posted as @syncourse_bot. The bot now walks the
-- group's message ids forward and borrows each one with `forwardMessage` into a
-- scratch chat, which is the only Bot API way to read a message it did not
-- receive. This table is the resumable cursor for that walk.
--
-- Additive only: safe to run repeatedly.

CREATE TABLE IF NOT EXISTS "TelegramScanState" (
  "chatId"        BIGINT NOT NULL,
  "lastMessageId" BIGINT NOT NULL DEFAULT 0,
  "topicId"       BIGINT,
  "scratchChatId" BIGINT,
  "scanUntil"     TIMESTAMP(3),
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TelegramScanState_pkey" PRIMARY KEY ("chatId")
);
