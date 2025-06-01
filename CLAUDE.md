# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Development Commands

- `bun install` - Install dependencies
- `bun run dev` - Run in development mode with watch
- `bun run start` - Run in production mode
- `npx @biomejs/biome check` - Lint code (Biome is included as dependency)
- `npx @biomejs/biome format` - Format code

## Architecture

This is a Discord bot for Stack-chan, a palm-sized companion robot. The bot integrates with OpenAI's o4-mini model using the Responses API and provides multilingual conversation capabilities.

### Core Components

- **src/index.ts**: Main Discord client that handles message events and mentions
- **src/services/chat.ts**: ChatService class that manages OpenAI Responses API interactions with tool calling support
- **src/services/cosense.ts**: CosenseService for searching Stack-chan's Scrapbox/Cosense wiki

### Key Features

- Responds when mentioned in Discord channels
- Fetches recent message history (10 messages) for context
- Supports tool calling with three commands:
  - `search_stackchan_cosense`: Search Stack-chan wiki
  - `get_stackchan_cosense_page_text`: Get specific wiki page content  
  - `generate_image`: Generate images via OpenAI DALL-E
- Error handling with Japanese error messages
- Uses OpenAI's Responses API (newer than Chat Completions API)

### Environment Setup

Copy `sample.env` to `.env` and configure:
- `DISCORD_TOKEN`: Discord bot token
- `OPENAI_TOKEN`: OpenAI API key

### Technology Stack

- **Runtime**: Bun
- **Discord**: discord.js v14
- **AI**: OpenAI SDK with Responses API
- **Language**: TypeScript with strict mode
- **Linting**: Biome

### Important Notes

- The bot uses OpenAI's "o4-mini" model specifically
- Messages are processed through a retry loop (max 5 attempts) for tool calling
- Discord intents required: Guilds, GuildMessages, MessageContent
- Bot responds only to direct mentions, not all messages