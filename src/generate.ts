import { buildPrompt, BuildPromptOptions } from 'sillytavern-utils-lib';
import { ChatCompletionMessage, ExtractedData } from 'sillytavern-utils-lib/types';
import { parseResponse } from './parsers.js';
import { Character } from 'sillytavern-utils-lib/types';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';

// @ts-ignore
import { Handlebars } from '../../../../../lib.js';

// @ts-ignore
export const globalContext = SillyTavern.getContext();

export type CharacterFieldName = 'name' | 'description' | 'personality' | 'scenario' | 'first_mes' | 'mes_example';

export const CHARACTER_FIELDS: CharacterFieldName[] = [
  'name',
  'description',
  'personality',
  'scenario',
  'first_mes',
  'mes_example',
];

export interface CharacterField {
  prompt: string;
  value: string;
}

export interface Session {
  selectedCharacterIndexes: string[];
  selectedWorldNames: string[];
  fields: Record<CharacterFieldName, CharacterField>;
}

export interface ContextToSend {
  stDescription: boolean;
  messages: {
    type: 'none' | 'all' | 'first' | 'last' | 'range';
    first?: number;
    last?: number;
    range?: {
      start: number;
      end: number;
    };
  };
  charCard: boolean;
  existingFields: boolean;
  worldInfo: boolean;
}

export interface RunCharacterFieldGenerationParams {
  profileId: string;
  userPrompt: string;
  buildPromptOptions: BuildPromptOptions;
  contextToSend: ContextToSend;
  session: Session;
  allCharacters: Character[];
  entriesGroupByWorldName: Record<string, WIEntry[]>;
  promptSettings: {
    stCharCardPrompt: string;
    charCardDefinitionPrompt: string;
    lorebookDefinitionPrompt: string;
    formatDescription: string;
  };
  maxResponseToken: number;
  targetField: CharacterFieldName;
  outputFormat: 'xml' | 'json' | 'none';
  currentFieldValues: Record<CharacterFieldName, CharacterField>;
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
  if (!profileId) {
    throw new Error('No connection profile selected.');
  }
  const profile = globalContext.extensionSettings.connectionManager?.profiles?.find((p: any) => p.id === profileId);
  if (!profile) {
    throw new Error(`Connection profile with ID "${profileId}" not found.`);
  }

  const processedUserPrompt = globalContext.substituteParams(userPrompt.trim());

  const messages: ChatCompletionMessage[] = [];
  const selectedApi = profile.api ? globalContext.CONNECT_API_MAP[profile.api].selected : undefined;
  if (!selectedApi) {
    throw new Error(`Could not determine API for profile "${profile.name}".`);
  }

  // Build base prompt (system, memory, messages, persona - if applicable)
  messages.push(...(await buildPrompt(selectedApi, buildPromptOptions)));

  // Add ST/Character Card Description
  if (contextToSend.stDescription) {
    messages.push({
      role: 'system',
      content: promptSettings.stCharCardPrompt,
    });
  }

  // Add Definitions of Selected Characters (if enabled and characters selected)
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
  // Add Definitions of Selected Lorebooks (World Info)
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

  // Add Current Field Values (if enabled)
  if (contextToSend.existingFields && session.fields && Object.keys(session.fields).length > 0) {
    let existingFieldsPrompt = '=== CURRENT CHARACTER FIELD VALUES ===\n';
    for (const field of CHARACTER_FIELDS) {
      const fieldData = session.fields[field];
      // Don't include the target field itself if it's empty, provide context from others
      if (field !== targetField || (fieldData?.value && fieldData.value.trim() !== '')) {
        existingFieldsPrompt += `- ${field}: ${fieldData?.value || '*Not filled*'}\n`;
      }
    }
    messages.push({
      role: 'system',
      content: existingFieldsPrompt,
    });
  }

  // Add Output Format Instructions
  messages.push({
    role: 'system',
    content: `=== RESPONSE FORMAT INSTRUCTIONS ===\n${promptSettings.formatDescription}`,
  });

  // Construct and Add Final User Task
  let taskDescription = `Your task is to generate the content for the "${targetField}" field of a character card.`;
  taskDescription += ` Base your response on the chat history, persona (if provided), existing field values (if provided), context from other characters (if provided), and context from relevant lorebooks (if provided).`;

  // Add field-specific prompt if exists
  const fieldData = session.fields[targetField];
  if (fieldData?.prompt) {
    taskDescription += `\n\nField-specific instructions: ${fieldData.prompt}`;
  }

  // Add user's custom prompt if provided
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

  // Parse the response based on the expected format
  const parsedContent = parseResponse(response.content, outputFormat);

  return parsedContent;
}
