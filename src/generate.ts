import { buildPrompt, BuildPromptOptions, ExtensionSettingsManager, Message } from 'sillytavern-utils-lib';
import { parseResponse, getPrefilled } from './parsers.js';
import { ExtractedData } from 'sillytavern-utils-lib/types';
import { Character } from 'sillytavern-utils-lib/types';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';
import { name1, st_echo } from 'sillytavern-utils-lib/config';
import { ExtensionSettings, MessageRole, OutputFormat, settingsManager } from './settings.js';
import { Session, CreatorChatMessage, ContentPart } from './types.js';
import { MessageBuilder } from './services/messageBuilder.js';

import * as Handlebars from 'handlebars';

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

export const CHARACTER_LABELS: Record<CharacterFieldName, string> = {
  name: 'Name',
  description: 'Description',
  personality: 'Personality',
  scenario: 'Scenario',
  first_mes: 'First Message',
  mes_example: 'Example Dialogue',
};

// Moved to types.ts - keeping exports for backward compatibility
export type { CharacterField, Session, CreatorChatMessage as ChatMessage } from './types.js';

// @ts-ignore
const dumbSettings = new ExtensionSettingsManager<ExtensionSettings>('dumb', {}).getSettings();

export interface RunCharacterFieldGenerationParams {
  profileId: string;
  userPrompt: string;
  buildPromptOptions: BuildPromptOptions;
  continueFrom?: string;
  session: Session;
  allCharacters: Character[];
  entriesGroupByWorldName: Record<string, WIEntry[]>;
  formatDescription: {
    content: string;
  };
  includeUserMacro: boolean;
  maxResponseToken: number;
  targetField: CharacterFieldName | string;
  outputFormat: OutputFormat;
  // Optional: append extra content parts (e.g., inline images) as a separate user message
  additionalContentPartsForCurrentUserMessage?: ContentPart[];
}

export async function runCharacterFieldGeneration({
  profileId,
  userPrompt,
  buildPromptOptions,
  continueFrom,
  session,
  allCharacters,
  entriesGroupByWorldName,
  formatDescription,
  includeUserMacro,
  maxResponseToken,
  targetField,
  outputFormat,
  additionalContentPartsForCurrentUserMessage,
}: RunCharacterFieldGenerationParams): Promise<string> {
  if (!profileId) {
    throw new Error('No connection profile selected.');
  }
  const profile = globalContext.extensionSettings.connectionManager?.profiles?.find((p: any) => p.id === profileId);
  if (!profile) {
    throw new Error(`Connection profile with ID "${profileId}" not found.`);
  }

  const selectedApi = profile.api ? globalContext.CONNECT_API_MAP[profile.api].selected : undefined;
  if (!selectedApi) {
    throw new Error(`Could not determine API for profile "${profile.name}".`);
  }

  // Use MessageBuilder to construct the full message array
  const messageBuilder = MessageBuilder.getInstance();
  const messages = await messageBuilder.buildMessages({
    targetField,
    userPrompt,
    session,
    allCharacters,
    entriesGroupByWorldName,
    buildPromptOptions,
    formatDescription,
    includeUserMacro,
    continueFrom,
    additionalContentPartsForCurrentUserMessage,
  });

  // console.log("Sending messages:", JSON.stringify(messages, null, 2)); // For debugging

  const response = (await globalContext.ConnectionManagerRequestService.sendRequest(
    profileId,
    messages,
    maxResponseToken,
    { includePreset: false },
  )) as ExtractedData;

  // console.log("Received raw content:", response.content); // For debugging

  // Parse the response based on the expected format
  const parsedContent = parseResponse(response.content, outputFormat, {
    previousContent: continueFrom,
  });

  return parsedContent;
}
