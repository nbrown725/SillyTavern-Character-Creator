## SillyTavern getContext() Reference

This document describes the API returned by `getContext()` from `public/scripts/st-context.js`. The function returns a single object that exposes the core application state, utilities, and helper services for extensions and integrations.

Usage example:

```javascript
const st = globalThis.SillyTavern.getContext();
```

### Notes
- Deprecated items are marked as such; prefer the indicated replacements.
- Function parameter and return information is summarized from inline JSDoc across the codebase.
- Types reflect runtime behavior where possible.

---

### Core state
- **accountStorage**: Persistent key-value storage for account-scoped settings.
  - Methods: `init(state)`, `getItem(key): string|null`, `setItem(key, value)`, `removeItem(key)`, `getState(): Record<string,string>`.
  - Source: `public/scripts/util/AccountStorage.js`
- **chat**: Array of chat message objects representing the current chat history.
  - Source: `public/script.js` (export `chat`)
- **characters**: Array of character metadata loaded in the client.
  - Source: `public/script.js` (export `characters`)
- **groups**: Group chat state list.
  - Source: `public/scripts/group-chats.js`
- **name1**: Current user display name.
- **name2**: Current assistant/character display name for the active chat.
- **characterId**: Index (stringified) of the currently selected character (`this_chid`).
- **groupId**: ID of the currently selected group chat (`selected_group`).
- **chatId()**: Active chat id for current character or group.

### IDs and selectors
- **getCurrentChatId(): string|number|undefined**
  - Returns current chat id for selected group or character.
  - Source: `public/script.js`

### HTTP and persistence
- **getRequestHeaders(opts?): Record<string,string>**
  - Params: `{ omitContentType?: boolean }`
  - Returns headers including CSRF token; omits `Content-Type` if requested.
  - Source: `public/script.js`
- **saveSettingsDebounced()**
  - Debounced app settings save.
  - Source: `public/script.js`
- **saveChat(): Promise<void>**
  - Debounced-save wrapper that persists current character or group chat (aliased to `saveChatConditional`).
  - Source: `public/script.js`
- **saveMetadata(): Promise<void>**
  - Saves chat or group metadata depending on context.
  - Source: `public/script.js`

### Session and status
- **reloadCurrentChat(): Promise<void>**
  - Clears and reloads the current chat (character or group) and re-renders messages.
  - Source: `public/script.js`
- **renameChat(oldName, newName): Promise<void>**
  - Renames the active chat (character or group variant) and reloads.
  - Source: `public/script.js`
- **onlineStatus**: Current API connectivity indicator string.
- **maxContext: number**: Current max context token setting.
- **chatMetadata: object**: Additional metadata for current chat.

### Events
- **eventSource**: Global event emitter instance.
- **eventTypes**: Enum of event names (e.g., `GENERATION_STARTED`, `MESSAGE_RECEIVED`, etc.).
  - Source: `public/scripts/events.js`

### Chat UI helpers
- **addOneMessage(mes, options?): void**
  - Renders/inserts a single message element.
  - Params: `{ type?: 'normal'|'swipe', insertAfter?: number|null, scroll?: boolean, insertBefore?: number|null, forceId?: number|null, showSwipes?: boolean }`.
  - Source: `public/script.js`
- **deleteLastMessage(): Promise<void>**
  - Removes the last message from chat and emits `MESSAGE_DELETED`.
  - Source: `public/script.js`
- **printMessages(): Promise<void>**
  - Renders messages (with truncation and scroll handling).
  - Source: `public/script.js`
- **updateMessageBlock(messageId, message, opts?): void**
  - Re-renders a message block; `opts.rerenderMessage` to refresh text.
  - Source: `public/script.js`
- **appendMediaToMessage(message, messageElement, adjustScroll?): void**
  - Appends image/video/file content to a rendered message.
  - Source: `public/script.js`
- **messageFormatting(mes, chName, isSystem, isUser, messageId, sanitizerOverrides?, isReasoning?): string**
  - Formats a message into sanitized HTML with Markdown and regex/post-processing applied.
  - Source: `public/script.js`
- **swipe.left(event?, opts?): void** / **swipe.right(event?, opts?): void**
  - Handlers for navigating swipes on the last assistant message.
  - Source: `public/script.js`
- **clearChat(): Promise<void>**
  - Clears rendered messages and related UI; persists itemized prompts for the chat.
  - Source: `public/script.js`

### Generation
- **generate(type, options?, dryRun?): Promise<any>**
  - Runs a generation using current context.
  - Params: `type: string`, `options: { automatic_trigger?, force_name2?, quiet_prompt?, quietToLoud?, skipWIAN?, force_chid?, signal?, quietImage?, quietName?, jsonSchema?, depth? } = {}`, `dryRun?: boolean`.
  - Emits `GENERATION_STARTED`, `GENERATION_AFTER_COMMANDS` and handles server ping, group mode, streaming, etc.
  - Source: `public/script.js` (`Generate`)
- **sendGenerationRequest(type, data, options?): Promise<object>**
  - Sends a non-streaming request to the active backend API.
  - Returns parsed JSON response or throws parsed error body.
  - Source: `public/script.js`
- **sendStreamingRequest(type, data, options?): Promise<AsyncGenerator|any>**
  - Sends a streaming request to supported APIs (OpenAI, Textgen, Novel, Kobold).
  - Returns a stream generator function for supported APIs.
  - Source: `public/script.js`
- **stopGeneration(): boolean**
  - Stops active generation and streaming; emits `GENERATION_STOPPED`. Returns true if anything was stopped.
  - Source: `public/script.js`
- **generateQuietPrompt(params): Promise<string>**
  - Background generation utility.
  - Params: `{ quietPrompt?, quietToLoud?, skipWIAN?, quietImage?, quietName?, responseLength?, forceChId?, jsonSchema? }`.
  - Returns generated text; if structured output, returns serialized JSON text.
  - Source: `public/script.js`
- **generateRaw(params): Promise<string>**
  - Low-level single-call generation for the specified API. Accepts either a string prompt or chat-style message array and optional preset/length overrides.
  - Params: `{ prompt?, api?, instructOverride?, quietToLoud?, systemPrompt?, responseLength?, trimNames?, prefill?, jsonSchema? }`.
  - Source: `public/script.js`
- **extractMessageFromData(data, activeApi?): string**
  - Normalizes provider responses to message text across APIs.
  - Source: `public/script.js`
- **saveReply({ type, getMessage, fromStreaming, title, swipes, reasoning, imageUrl }): Promise<{type, getMessage}>**
  - Persists the generated content to the chat and updates UI/swipe metadata.
  - Source: `public/script.js`

### Tokenization
- **tokenizers**: Enum of tokenizer IDs (e.g., `NONE`, `OPENAI`, `LLAMA3`, `MISTRAL`, etc.).
  - Source: `public/scripts/tokenizers.js`
- **getTextTokens(tokenizerType, text): number[]**
  - Encodes text to token IDs through local/server tokenizer.
  - Source: `public/scripts/tokenizers.js`
- **getTokenCount(str, padding?): number** (deprecated)
  - Synchronous token count; prefer async.
  - Source: `public/scripts/tokenizers.js`
- **getTokenCountAsync(str, padding?): Promise<number>**
  - Asynchronous token count with per-chat caching.
  - Source: `public/scripts/tokenizers.js`
- **getTokenizerModel(): string**
  - Normalized tokenizer model key for OpenAI and router backends.
  - Source: `public/scripts/tokenizers.js`

### Extension prompts and macros
- **extensionPrompts**: Internal registry of extension prompt injections.
- **setExtensionPrompt(key, value, position, depth, scan?, role?, filter?): void**
  - Injects custom prompt text into outgoing prompts.
  - Params:
    - `key: string` unique id
    - `value: string` content
    - `position: 0|1` 0=after story string, 1=in-chat
    - `depth: number` 0 is last message in context
    - `scan?: boolean` include in world info scan
    - `role?: number` enum `extension_prompt_roles.{SYSTEM,USER,ASSISTANT}`
    - `filter?: () => Promise<boolean>|boolean` include condition
  - Source: `public/script.js`
- **registerMacro(name, fn)** / **unregisterMacro(name)**
  - Register/unregister custom text macros through `MacrosParser`.
  - Source: `public/scripts/macros.js`
- **substituteParams(content, name1?, name2?, original?, group?, replaceCharacterCard?, additionalMacro?, postProcessFn?)**
  - Replaces `{{macro}}` placeholders in `content` using current chat/character data.
  - Returns formatted string.
  - Source: `public/script.js`
- **substituteParamsExtended(content, additionalMacro?, postProcessFn?)**
  - Shorthand that enables character card macro replacement by default.
  - Source: `public/script.js`

### Tool calling
- **registerFunctionTool(definition)** / **unregisterFunctionTool(name)**
  - Register/unregister OpenAI Function Tools for chat completions. See `ToolManager.registerFunctionTool`.
  - Definition: `{ name, displayName?, description, parameters, action, formatMessage?, shouldRegister?, stealth? }`.
  - Source: `public/scripts/tool-calling.js`
- **isToolCallingSupported(): boolean** / **canPerformToolCalls(type): boolean**
  - Capability helpers based on settings and generation type.
  - Source: `public/scripts/tool-calling.js`
- **ToolManager**: Full tool registry and utilities (see source for `invokeFunctionTool`, `registerFunctionToolsOpenAI`, streaming delta parsers, etc.).

### Slash commands
- **SlashCommandParser, SlashCommand, SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE**
  - Full slash command framework types for building commands.
  - **executeSlashCommandsWithOptions(command, options): Promise<Result>**
  - Deprecated:
    - **registerSlashCommand(...)** (use `SlashCommandParser.addCommandObject`)
    - **executeSlashCommands(...)** (use `executeSlashCommandsWithOptions`)
  - Source: `public/scripts/slash-commands*.js`

### UI and popups
- Deprecated: **callPopup(...)** (use `callGenericPopup`)
- **callGenericPopup(content, type, inputValue?, popupOptions?): Promise<POPUP_RESULT|string|boolean|null>**
  - Shows a modal popup of type `POPUP_TYPE.{TEXT|CONFIRM|INPUT|DISPLAY|CROP}`. Returns result or input.
  - See `Popup` for options like custom buttons/inputs.
  - Source: `public/scripts/popup.js`
- **Popup, POPUP_TYPE, POPUP_RESULT**
  - Modal dialog class and enums. `Popup.show.{input|confirm|text}` helpers are available.
  - Source: `public/scripts/popup.js`
- **showLoader() / hideLoader()**: Global loader visibility.

### Selection and navigation
- **openCharacterChat(fileName): Promise<void>**
  - Switches the active character chat to a specific chat file.
  - Source: `public/script.js`
- **openGroupChat(groupId, chatId): Promise<void>**
  - Switches active group chat to the specified chat.
  - Source: `public/scripts/group-chats.js`
- **selectCharacterById(id, { switchMenu = true }?): Promise<void>**
  - Selects a character by index, resets chat as needed, handles shallow-to-full loading.
  - Source: `public/script.js`

### Internationalization
- **t, translate**: i18n helpers.
- **getCurrentLocale(): string** / **addLocaleData(locale, data): void**

### Tags and menus
- **tags, tagMap**: Tag data and key map.
- **menuType**: One of `'characters'|'character_edit'|'create'|'group_edit'|'group_create'|''`.

### Character data
- **createCharacterData**: Structure used by the character creation form.
- **getCharacters(): Promise<void>**
  - Loads character list; preserves active selection when possible.
  - Source: `public/script.js`
- **getCharacterCardFields({ chid? }): { system, mesExamples, description, personality, persona, scenario, jailbreak, version, charDepthPrompt, creatorNotes }**
  - Returns normalized character card fields for the active or given character id.
  - Source: `public/script.js`
- **unshallowCharacter(characterId): Promise<void>**
  - Ensures the character is fully loaded from server before operations.
  - Source: `public/script.js`
- **unshallowGroupMembers(groupId): Promise<void>**
  - Ensures group members are fully loaded.
  - Source: `public/scripts/group-chats.js`

### System messages
- **sendSystemMessage(type, text?, extra?): void**
  - Pushes a system message to the chat. Special handling for slash command help panel.
  - Source: `public/scripts/system-messages.js`

### Reasoning helpers
- **updateReasoningUI(messageIdOrElement, { reset? }?): void**
  - Updates “thinking/reasoning” UI for a message element.
  - Source: `public/scripts/reasoning.js`
- **parseReasoningFromString(str, { strict? }?): { content, reasoning }**
  - Extracts reasoning text from a provider response when available.
  - Source: `public/scripts/reasoning.js`

### Variables (chat/global)
- **variables.local.get(name, args?): string|number**
  - Gets a chat-local variable value, optional `index` access and `key` alias.
- **variables.local.set(name, value, args?): string|number**
  - Sets chat-local variable; with optional `index` and type conversion via `as`.
- **variables.global.get(name, args?): string|number** / **variables.global.set(name, value, args?)**
  - Same as above for global-scoped variables.
  - Source: `public/scripts/variables.js`

### World Info
- **loadWorldInfo(name): Promise<object|null>**
  - Loads WI from backend and caches it.
- **saveWorldInfo(name, data, immediately?): Promise<void>**
  - Saves WI; updates cache; supports debounced or immediate mode.
- **reloadWorldInfoEditor(file, loadIfNotSelected?): void**
- **updateWorldInfoList(): Promise<void>**
- **convertCharacterBook(characterBook): object**
- **getWorldInfoPrompt(chat, maxContext, isDryRun, globalScanData): Promise<{worldInfoString,before,after,...}>**
  - Returns strings to inject before/after prompt and activation lists; emits `WORLD_INFO_ACTIVATED`.
  - Source: `public/scripts/world-info.js`

### Backend selection and presets
- **mainApi**: Current main API id string.
- **CONNECT_API_MAP**: Mapping of connector names.
- **getTextGenServer(type?): string**
  - Returns API URL for text completion backends.
  - Source: `public/scripts/textgen-settings.js`
- **getPresetManager(apiId?): PresetManager|null**
  - Returns manager for given API or current; supports reading/writing presets, master import/export.
  - Source: `public/scripts/preset-manager.js`
- **getChatCompletionModel(source?): string**
  - Returns model id for active chat completion source.
  - Source: `public/scripts/openai.js`

### Custom request services
- **TextCompletionService** (class)
  - `createRequestData(...)`, `sendRequest(...)`, `processRequest(...)` for text completion providers; supports streaming.
  - Source: `public/scripts/custom-request.js`
- **ChatCompletionService** (class)
  - Similar utilities tailored for chat completion providers.
  - Source: `public/scripts/custom-request.js`
- **ConnectionManagerRequestService** (class)
  - Utilities shared for connection manager extension.
  - Source: `public/scripts/extensions/shared.js`

### Scrapers
- **registerDataBankScraper(scraper): Promise<void>**
  - Registers a Data Bank scraper; scrapers can later be run to ingest files.
  - Source: `public/scripts/scrapers.js`

### UI state toggles
- **activateSendButtons() / deactivateSendButtons()**
  - Toggle generating state and stop button visibility.
  - Source: `public/script.js`
- **shouldSendOnEnter(): boolean**
  - Returns current editor “send on Enter” preference.
  - Source: `public/scripts/RossAscends-mods.js`
- **isMobile(): boolean**
  - Heuristic to identify mobile layout.
  - Source: `public/scripts/RossAscends-mods.js`

### Utilities
- **getThumbnailUrl(type, file, t?): string**
  - Returns `/thumbnail` URL for an asset; `type` is a server-side thumbnail type.
  - Source: `public/script.js`
- **uuidv4(): string**: RFC4122 v4 uuid.
- **humanizedDateTime(): string**
  - Nicely formatted date-time string.
  - Source: `public/scripts/RossAscends-mods.js`
- **timestampToMoment(msOrISO): moment.Moment**
  - Converts a timestamp to a moment-like instance.
  - Source: `public/script.js`

### i18n data
- **tags, tagMap**: Tag collections.
- **menuType**: Current right menu type string.
- **createCharacterData**: Current creation form buffer.

### Settings snapshots
- **chatCompletionSettings**: OpenAI-style settings (`oai_settings`).
- **textCompletionSettings**: Text completion settings (`textgenerationwebui_settings`).
- **powerUserSettings**: Advanced/Power User settings object (`power_user`).

### Legacy aliases and deprecations
- Deprecated: **getTokenCount** (use `getTokenCountAsync`).
- Deprecated: **registerSlashCommand** (use `SlashCommandParser.addCommandObject`).
- Deprecated: **executeSlashCommands** (use `executeSlashCommandsWithOptions`).
- Deprecated: **renderExtensionTemplate** (use `renderExtensionTemplateAsync`).
- Deprecated: **callPopup** (use `callGenericPopup`).
- Deprecated: **registerHelper** (Handlebars helpers are no longer supported for extensions).
- Legacy alias: **event_types** (snake_case alias of `eventTypes`).

### Symbols
- **symbols.ignore**: Special marker used to ignore fields in filtering/formatting.
  - Source: `public/scripts/constants.js` (`IGNORE_SYMBOL`)

---

### Quick property index (by key)

accountStorage, chat, characters, groups, name1, name2, characterId, groupId, chatId, getCurrentChatId, getRequestHeaders, reloadCurrentChat, renameChat, saveSettingsDebounced, onlineStatus, maxContext, chatMetadata, streamingProcessor, eventSource, eventTypes, addOneMessage, deleteLastMessage, generate, sendStreamingRequest, sendGenerationRequest, stopGeneration, tokenizers, getTextTokens, getTokenCount, getTokenCountAsync, extensionPrompts, setExtensionPrompt, updateChatMetadata, saveChat, openCharacterChat, openGroupChat, saveMetadata, sendSystemMessage, activateSendButtons, deactivateSendButtons, saveReply, substituteParams, substituteParamsExtended, SlashCommandParser, SlashCommand, SlashCommandArgument, SlashCommandNamedArgument, ARGUMENT_TYPE, executeSlashCommandsWithOptions, registerSlashCommand, executeSlashCommands, timestampToMoment, registerHelper, registerMacro, unregisterMacro, registerFunctionTool, unregisterFunctionTool, isToolCallingSupported, canPerformToolCalls, ToolManager, registerDebugFunction, renderExtensionTemplate, renderExtensionTemplateAsync, registerDataBankScraper, callPopup, callGenericPopup, showLoader, hideLoader, mainApi, extensionSettings, ModuleWorkerWrapper, getTokenizerModel, generateQuietPrompt, generateRaw, writeExtensionField, getThumbnailUrl, selectCharacterById, messageFormatting, shouldSendOnEnter, isMobile, t, translate, getCurrentLocale, addLocaleData, tags, tagMap, menuType, createCharacterData, event_types, Popup, POPUP_TYPE, POPUP_RESULT, chatCompletionSettings, textCompletionSettings, powerUserSettings, getCharacters, getCharacterCardFields, uuidv4, humanizedDateTime, updateMessageBlock, appendMediaToMessage, swipe, variables, loadWorldInfo, saveWorldInfo, reloadWorldInfoEditor, updateWorldInfoList, convertCharacterBook, getWorldInfoPrompt, CONNECT_API_MAP, getTextGenServer, extractMessageFromData, getPresetManager, getChatCompletionModel, printMessages, clearChat, ChatCompletionService, TextCompletionService, ConnectionManagerRequestService, updateReasoningUI, parseReasoningFromString, unshallowCharacter, unshallowGroupMembers, symbols.


