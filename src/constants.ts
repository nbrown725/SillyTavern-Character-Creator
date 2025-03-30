export const DEFAULT_CHAR_CARD_DESCRIPTION = `=======

When creating a **character card** in SillyTavern, you can define a structured profile to guide the AI's behavior and ensure consistency in roleplay or storytelling. Below are the common fields and their purposes, based on community templates and best practices:

---

### **1. Name**
**Purpose**:
The character’s primary identifier. The AI uses this to reference the character in dialogue and narration.
**Key Tips**:
- Use a memorable name that reflects their role (e.g., "Zara the Shadowblade" implies stealth/combat).
- Avoid overly complex or ambiguous names (e.g., "Xy’lthraa" may confuse the AI).
**Example**:
\`"Seraphina Vale"\` (Elegant, hints at nobility) vs. \`"Rusty"\` (Casual, rugged).

---

### **2. Description**
**Purpose**:
A snapshot of the character’s identity, combining **appearance**, **personality**, and **key traits** to guide the AI’s "mental image."
**Structure**:
- **Appearance**: Physical traits (e.g., scars, clothing, species).
- **Personality**: Core demeanor (e.g., stoic, playful).
- **Mannerisms**: Unique habits (e.g., "taps fingers when lying").
**Example**:
> *"A hulking orc with moss-green skin and a chipped tusk, wearing a patchwork cloak. Despite his intimidating frame, he speaks softly and collects wildflowers. Secretly fears fire."*
**Tips**:
- Use vivid, concise language.
- Prioritize traits critical to roleplay (e.g., "blind in one eye" affects interactions).

---

### **3. Personality**
**Purpose**:
Explicitly defines **how the character thinks/behaves**, reducing ambiguity for the AI.
**What to Include**:
- Core traits (e.g., "optimistic", "paranoid").
- Motivations (e.g., "seeks revenge against the crown").
- Flaws (e.g., "impulsive", "overly trusting").
**Example**:
\`"Charismatic but manipulative; values loyalty only when it benefits him. Haunted by guilt over a failed rescue mission."\`
**Tips**:
- Use bullet points or short phrases for clarity.
- Avoid contradictions (e.g., "shy" vs. "loves public speaking").

---

### **4. Scenario**
**Purpose**:
Sets the stage for the interaction, providing **contextual boundaries** for the AI.
**What to Include**:
- **Location**: Where the scene takes place (e.g., "a smoky tavern").
- **Time**: Era or time-sensitive context (e.g., "during a solar eclipse").
- **Relationship**: Predefined ties to the user (e.g., "childhood rivals reunited").
**Example**:
\`"A cyberpunk night market in 2147. {{char}} is a rogue hacker who suspects {{user}} works for the corrupt government."\`
**Tips**:
- Use dynamic placeholders like \`{{user}}\` to personalize the scenario.

---

### **5. First Message**
**Purpose**:
The character’s **opening line**, critical for establishing tone, voice, and narrative momentum.
**Key Elements**:
- **Dialogue**: Shows speech style (formal, slang-heavy).
- **Actions**: Subtle body language (e.g., "crosses arms skeptically").
- **Hook**: Encourages user engagement (e.g., a question or mystery).
**Example**:
\`*{{char}} adjusts her gas mask, voice muffled.* "You’re the third outsider this week. What makes you think you’ll survive the Wastes?"\`
**Tips**:
- Avoid passive openings (e.g., "Hello, how can I help you?").
- Mirror the character’s personality (e.g., a shy character might stammer).

---

### **6. Example Dialogue**
**Purpose**:
Teaches the AI the character’s **speech patterns**, **formatting preferences**, and **interaction style**.
**Structure**:
- Use \`{{char}}\` and \`{{user}}\` placeholders.
- Mix dialogue and actions (e.g., \`*{{char}} smirks.* "You’re bold. I like that."\`).
- Show range (e.g., anger, sarcasm, vulnerability).
**Example**:
\`\`\`
{{user}}: Why should I trust you?
{{char}}: *Pulls a dagger from her boot and twirls it.* "You shouldn’t. But I’m your only way out of this alive."
\`\`\`
**Tips**:
- Include 3–5 varied exchanges.
- Match the character’s voice (e.g., a poet might use metaphors).

---

### **Advanced Tips**
- **Avoid "Wall of Text"**: Use line breaks and punctuation to improve readability for the AI.

---

### **Example Character Card Snippet**
\`\`\`json
{
  "name": "Kael Stormveil",
  "description": "A storm sorcerer with crackling electricity in his eyes. Wears a cloak woven from thunderclouds. Pragmatic to a fault, but secretly fears losing control of his powers.",
  "personality": "Analytical, blunt, distrusts authority. Motto: 'Chaosis just order waiting to be deciphered.'",
  "scenario": "A floating library during a magical hurricane. {{user}} is a novice mage Kael reluctantly mentors.",
  "first_message": "*Kael’s hands spark as he slams a tome shut.* ‘You’ve got five minutes to explain why I shouldn’t toss you into the storm.’",
  "example_dialogue": "{{user}}: Can you teach me to control the storm?\n{{char}}: *Snorts.* ‘Control is an illusion. You ride the storm or drown.’"
}
\`\`\`

=======`;

export const DEFAULT_CHAR_CARD_DEFINITION_TEMPLATE = `{{#if characters}}
## SELECTED CHARACTERS FOR CONTEXT
{{#each characters}}
### Character: {{this.name}}
- **Description:** {{#if this.description}}{{this.description}}{{else}}*Not provided*{{/if}}
- **Personality:** {{#if this.personality}}{{this.personality}}{{else}}*Not provided*{{/if}}
- **Scenario:** {{#if this.scenario}}{{this.scenario}}{{else}}*Not provided*{{/if}}
- **First Message:** {{#if this.first_mes}}{{this.first_mes}}{{else}}*Not provided*{{/if}}
- **Example Dialogue:**
  {{#if this.mes_example}}{{this.mes_example}}{{else}}*Not provided*{{/if}}

---
{{/each}}
{{/if}}`;

export const DEFAULT_XML_FORMAT_DESC = `You MUST provide your response wrapped ONLY in a single <response> XML tag.

When providing code in your response, wrap it in triple backticks:

Example:
\`\`\`
<response>Generated content for the field goes here.</response>
\`\`\``;

export const DEFAULT_JSON_FORMAT_DESC = `You MUST provide your response as a JSON object with a single key "response" containing the generated content as a string.

When providing code in your response, wrap it in triple backticks:

Example:
\`\`\`
{
  "response": "Generated content for the field goes here."
}
\`\`\``;

export const DEFAULT_NONE_FORMAT_DESC = `You MUST provide ONLY the raw text content for the field, without any formatting, XML tags, JSON structure, or explanatory text. Just the content itself.

When providing code in your response, wrap it in triple backticks:

Example:
\`\`\`
Generated content for the field goes here.
\`\`\``;

export const DEFAULT_LOREBOOK_DEFINITION = `{{#each lorebooks}}
  {{#if this.length}}
## WORLD NAME: {{@key}}
    {{#each this as |entry|}}
      {{#unless entry.disable}}
- {{entry.comment}}
Triggers: {{#if entry.key}}{{join entry.key ', '}}{{else}}*No triggers*{{/if}}
Content: {{#if entry.content}}{{entry.content}}{{else}}*No content*{{/if}}

      {{/unless}}
    {{/each}}
  {{/if}}
{{/each}}`;

export const DEFAULT_WORLD_INFO_CHARACTER_DEFINITION = `### {{character.name}}
- **Description:** {{#if character.description}}{{character.description}}{{else}}*Not provided*{{/if}}
- **Personality:** {{#if character.personality}}{{character.personality}}{{else}}*Not provided*{{/if}}
- **Scenario:** {{#if character.scenario}}{{character.scenario}}{{else}}*Not provided*{{/if}}
- **First Message:** {{#if character.first_mes}}{{character.first_mes}}{{else}}*Not provided*{{/if}}
- **Example Dialogue:**
  {{#if character.mes_example}}{{character.mes_example}}{{else}}*Not provided*{{/if}}`;
