export const DEFAULT_CHAR_CARD_DESCRIPTION = `=======

When creating a **character card** in SillyTavern, you can define a structured profile to guide the AI's behavior and ensure consistency in roleplay or storytelling. Below are the common fields and their purposes, based on community templates and best practices:

---

### **Core Fields (Basic Profile)**
1. **Name**
   The character’s name (e.g., "Luna the Wizard" or "Detective Grey").

2. **Description**
   A concise overview of the character’s **appearance**, **personality**, and key traits. Example:
   *"A stoic elf with silver hair, wearing a tattered cloak. She speaks cryptically and distrusts humans."*

3. **Personality** (Optional, but recommended)
   Explicitly outline traits, quirks, or motivations (e.g., "Sarcastic, loyal to allies, obsessed with ancient ruins").

4. **Scenario**
   Context for the interaction (e.g., "A haunted inn at midnight" or "First meeting in a dystopian city").

5. **First Message**
   The character’s opening line to set the tone (e.g., *"You shouldn’t be here... but since you are, tell me your name."*).

6. **Example Dialogue**
   Sample lines demonstrating the character’s speech style. Use quotes or asterisks for actions:
   \`\`\`
   *{{char}} narrows her eyes.* "You’re not from around here, are you?"
   {{char}}: "Trust is earned. Prove yourself."
   \`\`\`

---

### **Advanced Fields (Customization)**

7. **Alternate Greetings**
    Multiple opening messages for varied scenarios (e.g., a cheerful vs. hostile introduction).

---

### **Optional Extras**
8. **Appearance Schema**
    Detailed physical attributes (height, scars, clothing) in bullet points or JSON.

9. **Relationships**
    Define ties to other characters (e.g., "Rival: Captain Alden", "Ally: Mira the Healer").

10. **Voice/Accent Notes**
    Descriptions like "raspy voice" or "British accent" to influence text generation.

11. **NSFW/SFW Toggles**
    Flags to filter content intensity (if enabled in your SillyTavern setup).

---

### **Tips for Effective Character Cards**
- **Avoid Overloading**: Keep descriptions concise but vivid. Too much detail can confuse the AI.
- **Use Formatting**: Leverage \`*actions*\`, \`"quotes"\`, and line breaks for readability.
- **Test Iteratively**: Adjust fields based on the AI’s output (e.g., tweak **Example Dialogue** if responses feel off).

---

### **Example Character Card Snippet**
\`\`\`json
{
  "name": "Vex",
  "description": "A rogue android with a cracked visor, programmed to question humanity.",
  "personality": "Curious, cynical, secretly longs to feel emotions.",
  "scenario": "Post-apocalyptic lab where humans experiment on androids.",
  "first_message": "*Vex tilts their head, circuits humming.* 'Why do you fear what you create?'",
  "example_dialogue": "{{user}}: Can you feel pain?\\n{{char}}: *Cold laugh.* 'Pain requires a soul. Do *you* have one?'"
}
\`\`\`

=======`;

export const DEFAULT_CHAR_CARD_DEFINITION_TEMPLATE = `{{#if characters}}
## SELECTED CHARACTERS FOR CONTEXT
{{#each characters}}
### Character: {{this.name}} (ID: {{@key}})
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
Example:
<response>Generated content for the field goes here.</response>`;

export const DEFAULT_JSON_FORMAT_DESC = `You MUST provide your response as a JSON object with a single key "response" containing the generated content as a string.
Example:
{
  "response": "Generated content for the field goes here."
}`;

export const DEFAULT_NONE_FORMAT_DESC = `You MUST provide ONLY the raw text content for the field, without any formatting, XML tags, JSON structure, or explanatory text. Just the content itself.`;

// No longer needed, but kept for reference if rules are reintroduced
// export const DEFAULT_LOREBOOK_RULES = `- Don't suggest already existing or suggested entries.`;
