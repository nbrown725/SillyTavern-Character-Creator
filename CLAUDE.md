# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

SillyTavern Character Creator is a browser extension for SillyTavern that helps users create character cards using LLM APIs. It's written in TypeScript and uses Webpack for bundling.

## Key Commands

- `npm run dev` - Development mode with watch (rebuilds on file changes)
- `npm run build` - Production build (minified, no source maps)
- `npm test` - Run Jest tests
- `npm run prettify` - Format code with Prettier

## Architecture

The extension follows a modular TypeScript architecture:

- **Entry Point**: `src/index.ts` - Initializes the extension and sets up event handlers
- **Core Logic**: `src/generate.ts` - Handles character generation using LLM APIs
- **Settings**: `src/settings.ts` - Manages user preferences and configuration
- **Constants**: `src/constants.ts` - Contains default prompts and templates for character generation
- **Parsers**: `src/parsers.ts` - Utilities for parsing generated content into structured data
- **UI Templates**: `templates/` directory contains Handlebars templates for popup and settings

## Integration with SillyTavern

The extension integrates with SillyTavern through:
- Extension manifest in `manifest.json`
- Uses `sillytavern-utils-lib` for API access and UI helpers
- Accesses SillyTavern's context data (characters, lorebooks, personas) via event system
- Stores session data in localStorage with keys prefixed by `'character_creator_'`

## Development Guidelines

1. **TypeScript**: All new code should be written in TypeScript with proper type annotations
2. **Module Pattern**: Follow the existing modular structure - keep concerns separated
3. **Event System**: Use SillyTavern's event system for communication (see `eventSource` usage)
4. **Styling**: Use SCSS files in `src/styles/` - main styles are in `main.scss`
5. **Templates**: UI templates use Handlebars - see `templates/` directory
6. **Testing**: Write tests for utility functions in `src/test/`

## Key Features to Understand

1. **Generate Functions**: The `generate.ts` file contains the core logic for creating character fields using LLMs
2. **Field Types**: Supports standard fields (description, personality, etc.) and custom "draft" fields
3. **Output Formats**: Can generate XML, JSON, or raw text formats based on user settings
4. **Context Usage**: Can incorporate existing SillyTavern data into prompts for consistency
5. **World Info Support**: Characters can be saved as World Info entries instead of standard characters