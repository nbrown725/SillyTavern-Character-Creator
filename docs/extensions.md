## SillyTavern Extensions: A Comprehensive Guide

This guide explains how to build UI extensions for SillyTavern: how they load, where they live, how to interact with the app via the stable `getContext()` API, how to render UI, how to hook into generation, and how to package, localize, and ship your work.

Extensions run in the browser and have full access to the DOM, web APIs, and the SillyTavern context. Prefer using `getContext()` as your integration surface to avoid breaking changes if internals move.

---

### Quick start

1) Create a folder for your extension (see Layout) and add a `manifest.json` (see Manifest).
2) Implement an entry JS file (e.g. `index.js`).
3) Load your extension in SillyTavern and iterate.

Minimal example (`manifest.json` + `index.js`) is shown below.

```json
{
  "display_name": "Hello World",
  "loading_order": 10,
  "js": "index.js",
  "author": "you",
  "version": "1.0.0"
}
```

```javascript
// index.js
const st = globalThis.SillyTavern.getContext();
st.sendSystemMessage(st.system_message_types?.NARRATOR ?? 'narrator', 'Hello from my extension!');
```

---

## Layout, install locations, and loading

Extensions are discovered from a per-user directory and served as static files by the app. Downloaded third‑party extensions are mounted under `/scripts/extensions/third-party` for the running server.

- User-scoped folder: `data/<user-handle>/extensions/<your-extension>/`
- Served path (third‑party): `/scripts/extensions/third-party/<your-extension>/`

Tips:
- During development, placing your repo under `/public/scripts/extensions/third-party` simplifies relative imports.
- Extensions are picked up on refresh. Use the “Manage Extensions” menu to enable/disable.

Load order:
- The `loading_order` field controls ordering (higher loads later). Dependencies are honored (see Manifest fields below).

---

## Manifest

Every extension needs a `manifest.json` in its root. Example:

```json
{
  "display_name": "My Extension",
  "loading_order": 1,
  "dependencies": ["vectors", "third-party/Extension-WebLLM"],
  "js": "index.js",
  "css": "style.css",
  "author": "Your Name",
  "version": "1.0.0",
  "homePage": "https://github.com/your/extension",
  "auto_update": true,
  "i18n": {
    "de-de": "i18n/de-de.json"
  },
  "generate_interceptor": "myGenerateInterceptor"
}
``;

Field reference:
- display_name (required): Shown in the Extensions UI.
- loading_order (optional): Numeric sort; higher loads later.
- js (required): Entry JS module path, relative to the extension folder.
- css (optional): Stylesheet to load with the extension.
- author (required), version (optional), homePage (optional).
- auto_update (optional): Update with ST releases when possible.
- i18n (optional): Locale file mapping (see Localization).
- dependencies (optional): Other extensions (by folder name) that must be present/enabled.
- generate_interceptor (optional): Global function name to be called on generation (see Interceptors).

Deprecated (Extras-focused) fields:
- requires / optional: historical Extras module requirements. Not recommended for new extensions.

---

## Using getContext()

The stable way to interact with SillyTavern is via the global `getContext()` API.

```javascript
const st = globalThis.SillyTavern.getContext();
// Examples:
st.chat;                 // current chat array (mutable)
st.characters;           // loaded characters
st.generateQuietPrompt;  // background generation entrypoint
st.generateRaw;          // raw, no-chat generation
st.addOneMessage;        // render message into chat
st.sendSystemMessage;    // inject a system message
```

Highlights you’ll commonly use:
- Chat access/rendering: `chat`, `addOneMessage()`, `printMessages()`, `deleteLastMessage()`
- Generation: `generateQuietPrompt()`, `generateRaw()`, `sendGenerationRequest()`, `sendStreamingRequest()`, `stopGeneration()`
- Events: `eventSource`, `eventTypes`
- Popups: `callGenericPopup()`, `Popup`, `POPUP_TYPE`, `POPUP_RESULT`
- Tokenization: `getTokenCountAsync()`, `getTextTokens()`, `tokenizers`
- Tool calling: `ToolManager.registerFunctionTool(...)`
- Variables: `variables.local.get/set`, `variables.global.get/set`
- World Info: `getWorldInfoPrompt()`, `loadWorldInfo()`, `saveWorldInfo()`

See `getContext.md` in this repo for the full surface.

Best practices:
- Treat `chat` as mutable source of truth (UI reflects changes). Clone (`structuredClone`) if you need ephemeral copies.
- Prefer context functions over importing internals—direct imports may break when internal modules change.

---

## UI integration

You can freely manipulate the DOM, but prefer progressive enhancement:
- Create UI via DOM APIs or template rendering.
- Use `Popup`/`callGenericPopup` for dialogs.
- Listen to app events on `eventSource` to react to state changes (e.g., `eventTypes.MESSAGE_RECEIVED`, `eventTypes.GENERATION_STARTED`, `eventTypes.CHAT_CHANGED`).

Example (react to new messages):

```javascript
const st = SillyTavern.getContext();
st.eventSource.on(st.eventTypes.MESSAGE_RECEIVED, (messageId, type) => {
  // Update UI badge, etc.
});
```

---

## Prompt/generation interceptors

If your manifest defines `generate_interceptor`, SillyTavern calls a global function by that name before sending a generation request. Register it on `globalThis` from your entry file:

```javascript
globalThis.myGenerateInterceptor = async function(chat, contextSize, abort, type) {
  // chat: current chat array (mutable)
  // contextSize: tokens in upcoming context
  // abort(immediately?: boolean): stop generation, optionally preventing subsequent interceptors
  // type: 'quiet' | 'regenerate' | 'impersonate' | 'swipe' | ...

  // Example: inject a system note before last user message
  const systemNote = { is_user: false, name: 'System', send_date: Date.now(), mes: 'Note from my extension' };
  chat.splice(chat.length - 1, 0, systemNote);
};
```

Rules of thumb:
- Keep it fast. Don’t block the UI; use minimal async when needed.
- Mutate `chat` to alter the prompt. Avoid heavy parsing that could delay sending.
- Abort when your extension decides no generation should occur.

---

## Slash commands (optional)

You can add rich slash commands using the built‑in command framework available via context:
- Use `SlashCommandParser.addCommandObject(...)` and the `SlashCommand*` helpers.
- Return results as popup/chat/object per the return helper conventions.

---

## Tool calling (optional)

Register OpenAI‑style function tools so models can call back into your extension:

```javascript
const { ToolManager } = SillyTavern.getContext();

ToolManager.registerFunctionTool({
  name: 'Echo',
  displayName: 'Echo Message',
  description: 'Echoes a message back to the chat',
  parameters: {
    type: 'object',
    properties: { message: { type: 'string', description: 'Message to echo' } },
    required: ['message']
  },
  action: async ({ message }) => `You said: ${message}`,
});
```

Tips:
- Use `formatMessage` to show a custom toast while executing.
- Use `stealth: true` for tools that should not appear as tool call messages in chat.

---

## Persistent settings

You can use:
- `accountStorage` (per‑account) for small key/value flags your UI needs.
- `extension_settings` for extension‑specific settings exposed in the Extensions UI.
- Your own UI (panels/popups) to gather configuration and call `saveSettingsDebounced()`.

Minimal example (account storage):

```javascript
const st = SillyTavern.getContext();
const enabled = st.accountStorage.getItem('myext_enabled') === 'true';
st.accountStorage.setItem('myext_enabled', String(!enabled));
```

---

## Popups and notifications

Use the Popup API to collect user input, confirm operations, or present rich content:

```javascript
const { Popup, POPUP_TYPE, POPUP_RESULT, callGenericPopup, t } = SillyTavern.getContext();

// Simple confirm
const result = await Popup.show.confirm(t`Please confirm`, t`Proceed with action?`);
if (result === POPUP_RESULT.AFFIRMATIVE) {
  // ...
}

// Text popup with custom inputs
const html = document.createElement('div');
html.textContent = 'Custom content';
await callGenericPopup(html, POPUP_TYPE.TEXT, '', { wide: true, allowVerticalScrolling: true });
```

---

## Rendering templates

For quick HTML generation, you can render server‑bundled templates:
- `renderExtensionTemplateAsync(extensionName, templateId, data, sanitize?, localize?)`
  - Returns HTML string with sanitization and i18n applied.

Note: legacy `renderExtensionTemplate` is deprecated.

---

## Generation APIs from extensions

Two common entry points when you need model output:

1) Background (in chat context): `generateQuietPrompt({ quietPrompt, quietToLoud?, skipWIAN?, quietImage?, quietName?, responseLength?, forceChId?, jsonSchema? }) => Promise<string>`
   - Uses current chat, character, WI, and settings.

2) Raw (no chat context): `generateRaw({ prompt, api?, instructOverride?, quietToLoud?, systemPrompt?, responseLength?, trimNames?, prefill?, jsonSchema? }) => Promise<string>`
   - `prompt` can be a string (text completion) or array of chat messages for chat completion providers.
   - Optional structured outputs via `jsonSchema` on supported chat APIs.

Supporting helpers:
- `extractMessageFromData(data, activeApi?)` to normalize provider outputs.
- `getTokenCountAsync(str)` for token budgeting.
- `getChatCompletionModel()`, `getTextGenServer()` if you need to branch on provider.

---

## Localization (i18n)

Add localized strings by listing locale files in `manifest.json` under `i18n`.

Example `manifest.json` snippet:

```json
{
  "i18n": {
    "de-de": "i18n/de-de.json"
  }
}
```

Notes:
- Use the context `t` helper to mark/translate text in your UI.
- You can also programmatically add data via `addLocaleData(locale, data)`.

---

## Bundling and imports

Extensions can be bundled (e.g., Webpack + TypeScript) and ship their own dependencies.

When bundlers rewrite imports, use an “import from URL” helper to pull live members from ST modules if absolutely necessary:

```javascript
export async function importFromUrl(url, what, defaultValue = null) {
  try {
    const module = await import(/* webpackIgnore: true */ url);
    if (!Object.hasOwn(module, what)) throw new Error(`No ${what} in module`);
    return module[what];
  } catch (e) {
    console.error(`Failed to import ${what} from ${url}:`, e);
    return defaultValue;
  }
}

const generateRaw = await importFromUrl('/script.js', 'generateRaw');
```

Recommendation: prefer `getContext()` over direct imports whenever possible.

---

## Shared libraries

Most common libraries are exposed under `SillyTavern.libs` for convenience:
- `lodash`, `localforage`, `Fuse`, `DOMPurify`, `Handlebars`, `moment`, `showdown`, etc.

Example:

```javascript
const { DOMPurify } = SillyTavern.libs;
const safe = DOMPurify.sanitize('<script>bad()</script>');
```

---

## TypeScript support

Add a minimal `global.d.ts` to get autocompletion for `SillyTavern` and `getContext()` in your extension project:

```ts
export {};

// 1. For user-scoped installs
import '../../../../public/global';
// 2. For server-scoped installs
import '../../../../global';

declare global {
  // augment if needed
}
```

---

## Extras API (deprecated)

`doExtrasFetch()` and `getApiUrl()` let you call an external Extras server. This path is deprecated and not recommended for new work. If you still need it:

```javascript
import { getApiUrl, doExtrasFetch } from '../../extensions.js';

const url = new URL(getApiUrl());
url.pathname = '/api/summarize';

const res = await doExtrasFetch(url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'Bypass-Tunnel-Reminder': 'bypass' },
  body: JSON.stringify({ /* ... */ })
});
```

---

## Packaging guidance and best practices

- Prefer the stable `getContext()` API. Avoid importing deep internals.
- Keep interceptors fast; they execute on every generation.
- Avoid blocking the UI thread. Use async where needed but keep flows responsive.
- Sanitize any dynamic HTML you render (`DOMPurify`) and avoid unsafe HTML in chat to prevent user confusion.
- Namespacing: prefix DOM IDs/classes and storage keys with your extension name.
- Clean up listeners and timers if you create long‑lived UI.
- Test against the latest SillyTavern release. Keep your manifest and README up to date.

---

## API appendix (selected)

From `getContext()` (see `getContext.md` for full details):
- State: `chat`, `characters`, `groups`, `characterId`, `groupId`, `chatId()`
- Events: `eventSource`, `eventTypes`
- Chat/UI: `addOneMessage()`, `printMessages()`, `deleteLastMessage()`, `updateMessageBlock()`, `appendMediaToMessage()`
- Generation: `generateQuietPrompt()`, `generateRaw()`, `sendGenerationRequest()`, `sendStreamingRequest()`, `stopGeneration()`
- Popups: `Popup`, `callGenericPopup()`, `POPUP_TYPE`, `POPUP_RESULT`
- Tool calling: `ToolManager.registerFunctionTool()`, `ToolManager.invokeFunctionTool()`
- Tokenization: `getTokenCountAsync()`, `getTextTokens()`, `tokenizers`
- World Info: `getWorldInfoPrompt()`, `loadWorldInfo()`, `saveWorldInfo()`
- Variables: `variables.local/global.get/set`
- Utilities: `uuidv4()`, `timestampToMoment()`, `getThumbnailUrl()`, `t()`, `translate()`, `getCurrentLocale()`

---

## Minimal working example

```
my-extension/
  manifest.json
  index.js
  style.css
  i18n/
    en-us.json
```

manifest.json
```json
{
  "display_name": "My Extension",
  "loading_order": 20,
  "js": "index.js",
  "css": "style.css",
  "author": "me",
  "version": "1.0.0",
  "i18n": { "en-us": "i18n/en-us.json" },
  "generate_interceptor": "myInterceptor"
}
```

index.js
```javascript
const st = SillyTavern.getContext();

// Intercept generations
globalThis.myInterceptor = async (chat, ctxSize, abort, type) => {
  if (type === 'quiet') return; // ignore background runs
  chat.push({ is_user: false, name: 'System', send_date: Date.now(), mes: 'Intercepted!' });
};

// Add a button that posts a system message
const btn = document.createElement('button');
btn.textContent = 'Post system note';
btn.className = 'menu_button';
btn.onclick = () => st.sendSystemMessage(st.system_message_types?.NARRATOR ?? 'narrator', 'Hello from my extension');
document.querySelector('#extensionsMenu')?.appendChild(btn);
```

style.css
```css
.myext-badge { background: #333; color: #fff; padding: 2px 6px; border-radius: 6px; }
```


