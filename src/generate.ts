import { buildPrompt, BuildPromptOptions } from 'sillytavern-utils-lib';
import { ChatCompletionMessage, ExtractedData } from 'sillytavern-utils-lib/types';
import { parseResponse } from './parsers.js';
import { Character } from 'sillytavern-utils-lib/types'; // Assuming Character type exists

// @ts-ignore
import { Handlebars } from '../../../../../lib.js';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';
// @ts-ignore - Access global context
export const globalContext = SillyTavern.getContext();

// Define known character fields
export type CharacterFieldName = 'name' | 'description' | 'personality' | 'scenario' | 'first_mes' | 'mes_example';

export const CHARACTER_FIELDS: CharacterFieldName[] = [
  'name',
  'description',
  'personality',
  'scenario',
  'first_mes',
  'mes_example',
];

export interface Session {
  selectedCharacterIndexes: string[]; // Store IDs of characters selected for context
  selectedWorldNames: string[];
  fields: Record<CharacterFieldName, string>;
}

export interface ContextToSend {
  stDescription: boolean; // Description of ST and Char Cards
  messages: {
    type: 'none' | 'all' | 'first' | 'last' | 'range';
    first?: number;
    last?: number;
    range?: {
      start: number;
      end: number;
    };
  };
  charCard: boolean; // Whether to include selected characters' data
  existingFields: boolean; // Whether to include current values of fields being edited
  worldInfo: boolean;
}

export interface RunCharacterFieldGenerationParams {
  profileId: string;
  userPrompt: string; // The additional prompt from the main textarea
  buildPromptOptions: BuildPromptOptions;
  contextToSend: ContextToSend;
  session: Session;
  allCharacters: Character[]; // Pass the full characters array
  entriesGroupByWorldName: Record<string, WIEntry[]>;
  promptSettings: {
    stCharCardPrompt: string;
    charCardDefinitionPrompt: string; // Handlebars template for defining characters
    lorebookDefinitionPrompt: string;
    formatDescription: string; // Instructions for XML/JSON/None
  };
  maxResponseToken: number;
  targetField: CharacterFieldName; // Which field to generate (e.g., 'description')
  outputFormat: 'xml' | 'json' | 'none';
  currentFieldValues: Partial<Record<CharacterFieldName, string>>; // Values currently in textareas
}

export async function runCharacterFieldGeneration({
  profileId,
  userPrompt,
  buildPromptOptions,
  contextToSend,
  session,
  allCharacters,
  entriesGroupByWorldName,
  promptSettings,
  maxResponseToken,
  targetField,
  outputFormat,
  currentFieldValues,
}: RunCharacterFieldGenerationParams): Promise<string> {
  // Returns the generated string content
  if (!profileId) {
    throw new Error('No connection profile selected.');
  }
  const profile = globalContext.extensionSettings.connectionManager?.profiles?.find((p: any) => p.id === profileId);
  if (!profile) {
    throw new Error(`Connection profile with ID "${profileId}" not found.`);
  }

  const processedUserPrompt = globalContext.substituteParams(userPrompt.trim());
  // Note: processedUserPrompt can be empty, it's just extra context

  const messages: ChatCompletionMessage[] = [];
  const selectedApi = profile.api ? globalContext.CONNECT_API_MAP[profile.api].selected : undefined;
  if (!selectedApi) {
    throw new Error(`Could not determine API for profile "${profile.name}".`);
  }

  // 1. Build base prompt (system, memory, messages, persona - if applicable)
  messages.push(...(await buildPrompt(selectedApi, buildPromptOptions)));

  // 2. Add ST/Character Card Description
  if (contextToSend.stDescription) {
    messages.push({
      role: 'system',
      content: promptSettings.stCharCardPrompt,
    });
  }

  // 3. Add Definitions of Selected Characters (if enabled and characters selected)
  if (contextToSend.charCard && session.selectedCharacterIndexes.length > 0) {
    try {
      const template = Handlebars.compile(promptSettings.charCardDefinitionPrompt, { noEscape: true });
      const charactersData: Record<number, Character> = {};
      session.selectedCharacterIndexes.forEach((charIndex) => {
        const charIndexNumber = parseInt(charIndex);
        const char = allCharacters[charIndexNumber];
        if (char) {
          charactersData[charIndexNumber] = char;
        }
      });

      if (Object.keys(charactersData).length > 0) {
        const charDefinitionsPrompt = template({ characters: charactersData });
        if (charDefinitionsPrompt) {
          messages.push({
            role: 'system', // Using system role for context seems appropriate
            content: `=== CONTEXT FROM SELECTED CHARACTERS ===\n${charDefinitionsPrompt}`,
          });
        }
      }
    } catch (error) {
      console.error('Error compiling or executing Handlebars template for character definitions:', error);
      messages.push({
        role: 'system',
        content: 'Error: Could not generate character definitions for context.',
      });
    }
  }
  // 4. Add Definitions of Selected Lorebooks (World Info)
  if (contextToSend.worldInfo && session.selectedWorldNames.length > 0) {
    try {
      const template = Handlebars.compile(promptSettings.lorebookDefinitionPrompt, { noEscape: true });
      const lorebooksData: Record<string, WIEntry[]> = {};
      Object.entries(entriesGroupByWorldName)
        .filter(([worldName, entries]) => entries.length > 0 && session.selectedWorldNames.includes(worldName))
        .forEach(([worldName, entries]) => {
          lorebooksData[worldName] = entries;
        });

      if (Object.keys(lorebooksData).length > 0) {
        const lorebookPrompt = template({ lorebooks: lorebooksData });
        if (lorebookPrompt) {
          messages.push({
            role: 'system',
            content: `=== CONTEXT FROM SELECTED LOREBOOKS (WORLD INFO) ===\n${lorebookPrompt}`,
          });
        }
      }
    } catch (error) {
      console.error('Error compiling or executing Handlebars template for lorebook definitions:', error);
      messages.push({ role: 'system', content: 'Error: Could not generate lorebook definitions for context.' });
    }
  }

  // 5. Add Current Field Values (if enabled)
  if (contextToSend.existingFields && Object.keys(currentFieldValues).length > 0) {
    let existingFieldsPrompt = '=== CURRENT CHARACTER FIELD VALUES ===\n';
    for (const field of CHARACTER_FIELDS) {
      const value = currentFieldValues[field];
      // Don't include the target field itself if it's empty, provide context from others
      if (field !== targetField || (value && value.trim() !== '')) {
        existingFieldsPrompt += `- ${field}: ${value || '*Not filled*'}\n`;
      }
    }
    messages.push({
      role: 'system',
      content: existingFieldsPrompt,
    });
  }

  // 6. Add Output Format Instructions
  messages.push({
    role: 'system',
    content: `=== RESPONSE FORMAT INSTRUCTIONS ===\n${promptSettings.formatDescription}`,
  });

  // 7. Construct and Add Final User Task
  // Basic task description
  let taskDescription = `Your task is to generate the content for the "${targetField}" field of a character card.`;
  taskDescription += ` Base your response on the chat history, persona (if provided), existing field values (if provided), context from other characters (if provided), and context from relevant lorebooks (if provided).`;
  if (processedUserPrompt) {
    taskDescription += `\n\nFollow these specific instructions: ${processedUserPrompt}`;
  }

  messages.push({
    role: 'user',
    content: taskDescription,
  });

  // console.log("Sending messages:", JSON.stringify(messages, null, 2)); // For debugging

  const response = (await globalContext.ConnectionManagerRequestService.sendRequest(
    profileId,
    messages,
    maxResponseToken,
  )) as ExtractedData;

  // console.log("Received raw content:", response.content); // For debugging

  // 8. Parse the response based on the expected format
  const parsedContent = parseResponse(response.content, outputFormat);

  return parsedContent;
}
