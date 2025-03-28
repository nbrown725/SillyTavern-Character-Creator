import { buildFancyDropdown, buildPresetSelect, BuildPromptOptions, DropdownItem } from 'sillytavern-utils-lib';
import {
  selected_group,
  st_echo, // Use st_echo for user feedback
  st_getCharaFilename, // Useful for identifying current context
  this_chid,
  world_names,
} from 'sillytavern-utils-lib/config';
import { POPUP_TYPE } from 'sillytavern-utils-lib/types/popup';

import {
  globalContext,
  runCharacterFieldGeneration,
  Session,
  ContextToSend,
  CharacterFieldName,
  CHARACTER_FIELDS, // Import the list of fields
} from './generate.js';
// import { initializeCommands, setPopupIcon } from './commands.js'; // Keep if using commands

// @ts-ignore - Access Handlebars globally
import { Handlebars } from '../../../../../lib.js';
import { extensionName, settingsManager, ExtensionSettings, OutputFormat } from './settings.js';
import { Character } from 'sillytavern-utils-lib/types';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';

// Ensure Handlebars helpers are registered (if needed)
if (!Handlebars.helpers['join']) {
  Handlebars.registerHelper('join', function (array: any, separator: any) {
    if (Array.isArray(array)) {
      return array.join(typeof separator === 'string' ? separator : ', ');
    }
    return '';
  });
}
// Helper to check if a value is non-empty
Handlebars.registerHelper('ifValue', function (this: any, conditional: any, options: any) {
  if (conditional && String(conditional).trim().length > 0) {
    return options.fn(this);
  } else {
    return options.inverse(this);
  }
});

// const converter = new showdown.Converter(); // Keep if markdown rendering is needed anywhere

async function handleSettingsUI() {
  const settingsHtml = await globalContext.renderExtensionTemplateAsync(
    `third-party/${extensionName}`,
    'templates/settings',
  );
  $('#extensions_settings').append(settingsHtml);

  const settingsContainer = document.querySelector('.charCreator_settings');
  if (!settingsContainer) return;

  const settings = settingsManager.getSettings();

  // Helper function to setup textareas and restore buttons
  const setupPromptArea = (
    selector: string,
    settingKey: keyof ExtensionSettings,
    defaultKey: keyof typeof import('./constants.js'),
    defaultFlagKey: keyof ExtensionSettings,
  ) => {
    const container = settingsContainer.querySelector(`.${selector}`);
    if (!container) return;
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    const restoreButton = container.querySelector('.restore_default') as HTMLButtonElement;
    // @ts-ignore
    const defaultText = import('./constants.js')[defaultKey] as string;

    textarea.value = String(settings[settingKey]);

    restoreButton.addEventListener('click', async () => {
      const confirm = await globalContext.Popup.show.confirm(
        `Are you sure you want to restore the default for "${container.querySelector('span')?.textContent}"?`,
        'Character Creator',
      );
      if (confirm) {
        textarea.value = defaultText;
        // Trigger change event manually for vanilla JS
        textarea.dispatchEvent(new Event('change'));
      }
    });

    textarea.addEventListener('change', () => {
      (settings[settingKey] as any) = textarea.value;
      (settings[defaultFlagKey] as any) = textarea.value === defaultText;
      settingsManager.saveSettings();
    });
  };

  // Setup all prompt areas
  setupPromptArea(
    'stCharCardPrompt',
    'stCharCardPrompt',
    'DEFAULT_CHAR_CARD_DESCRIPTION',
    'usingDefaultStCharCardPrompt',
  );
  setupPromptArea(
    'charCardDefinitionPrompt',
    'charCardDefinitionPrompt',
    'DEFAULT_CHAR_CARD_DEFINITION_TEMPLATE',
    'usingDefaultCharCardDefinitionPrompt',
  );
  setupPromptArea(
    'lorebookDefinitionPrompt',
    'lorebookDefinitionPrompt',
    'DEFAULT_LOREBOOK_DEFINITION',
    'usingDefaultLorebookDefinitionPrompt',
  );
  setupPromptArea('xmlFormatDesc', 'xmlFormatDesc', 'DEFAULT_XML_FORMAT_DESC', 'usingDefaultXmlFormatDesc');
  setupPromptArea('jsonFormatDesc', 'jsonFormatDesc', 'DEFAULT_JSON_FORMAT_DESC', 'usingDefaultJsonFormatDesc');
  setupPromptArea('noneFormatDesc', 'noneFormatDesc', 'DEFAULT_NONE_FORMAT_DESC', 'usingDefaultNoneFormatDesc');
}

async function handlePopupUI() {
  // Add popup icon to the UI
  // Choose appropriate location - e.g., next to send button or in character header
  const iconHtml = `<div class="menu_button fa-solid fa-user-astronaut interactable charCreator-icon" title="Character Creator"></div>`;
  // Example: Add to chat input area
  $('.form_create_bottom_buttons_block').prepend(iconHtml);
  $('#GroupFavDelOkBack').prepend(iconHtml); // Add to group management too if needed

  const popupIcons = document.querySelectorAll('.charCreator-icon');
  // setPopupIcon(popupIcons[0]); // If using commands.js helper

  popupIcons.forEach((icon) => {
    icon.addEventListener('click', async () => {
      const popupHtml = await globalContext.renderExtensionTemplateAsync(
        `third-party/${extensionName}`,
        'templates/popup',
      );
      globalContext.callGenericPopup(popupHtml, POPUP_TYPE.DISPLAY, undefined, {
        large: true, // Make popup larger
        wide: true, // Make popup wider
      });

      const popupContainer = document.getElementById('charCreatorPopup');
      if (!popupContainer) return;

      const settings = settingsManager.getSettings();

      // --- Setup Left Column ---

      // Connection Profile Dropdown
      globalContext.ConnectionManagerRequestService.handleDropdown(
        '#charCreatorPopup #charCreator_connectionProfile',
        settings.profileId,
        (profile: any) => {
          settings.profileId = profile?.id ?? '';
          settingsManager.saveSettings();
        },
      );

      // Context Sending Options
      const stDescriptionCheckbox = popupContainer.querySelector('#charCreator_stDescription') as HTMLInputElement;
      const includeCharsCheckbox = popupContainer.querySelector('#charCreator_includeChars') as HTMLInputElement;
      const includeWorldInfoCheckbox = popupContainer.querySelector(
        '#charCreator_includeWorldInfo',
      ) as HTMLInputElement;
      const includeExistingFieldsCheckbox = popupContainer.querySelector(
        '#charCreator_includeExistingFields',
      ) as HTMLInputElement;

      stDescriptionCheckbox.checked = settings.contextToSend.stDescription;
      includeCharsCheckbox.checked = settings.contextToSend.charCard;
      includeExistingFieldsCheckbox.checked = settings.contextToSend.existingFields;

      stDescriptionCheckbox.addEventListener('change', () => {
        settings.contextToSend.stDescription = stDescriptionCheckbox.checked;
        settingsManager.saveSettings();
      });
      includeCharsCheckbox.addEventListener('change', () => {
        settings.contextToSend.charCard = includeCharsCheckbox.checked;
        settingsManager.saveSettings();
      });
      includeWorldInfoCheckbox.addEventListener('change', () => {
        settings.contextToSend.worldInfo = includeWorldInfoCheckbox.checked;
        settingsManager.saveSettings();
      });
      includeExistingFieldsCheckbox.addEventListener('change', () => {
        settings.contextToSend.existingFields = includeExistingFieldsCheckbox.checked;
        settingsManager.saveSettings();
      });

      // Message Options Setup
      const messageTypeSelect = popupContainer.querySelector('#charCreator_messageType') as HTMLSelectElement;
      const firstXDiv = popupContainer.querySelector('#charCreator_firstX') as HTMLElement;
      const lastXDiv = popupContainer.querySelector('#charCreator_lastX') as HTMLElement;
      const rangeXDiv = popupContainer.querySelector('#charCreator_rangeX') as HTMLElement;
      const firstXInput = popupContainer.querySelector('#charCreator_firstXMessages') as HTMLInputElement;
      const lastXInput = popupContainer.querySelector('#charCreator_lastXMessages') as HTMLInputElement;
      const rangeStartInput = popupContainer.querySelector('#charCreator_rangeStart') as HTMLInputElement;
      const rangeEndInput = popupContainer.querySelector('#charCreator_rangeEnd') as HTMLInputElement;

      messageTypeSelect.value = settings.contextToSend.messages.type;
      firstXInput.value = String(settings.contextToSend.messages.first ?? 10);
      lastXInput.value = String(settings.contextToSend.messages.last ?? 10);
      rangeStartInput.value = String(settings.contextToSend.messages.range?.start ?? 0);
      rangeEndInput.value = String(settings.contextToSend.messages.range?.end ?? 10);

      const updateMessageInputVisibility = (type: string) => {
        firstXDiv.style.display = type === 'first' ? 'block' : 'none';
        lastXDiv.style.display = type === 'last' ? 'block' : 'none';
        rangeXDiv.style.display = type === 'range' ? 'block' : 'none';
      };
      updateMessageInputVisibility(messageTypeSelect.value);

      messageTypeSelect.addEventListener('change', () => {
        const type = messageTypeSelect.value as ContextToSend['messages']['type'];
        settings.contextToSend.messages.type = type;
        settingsManager.saveSettings();
        updateMessageInputVisibility(type);
      });
      firstXInput.addEventListener('change', () => {
        settings.contextToSend.messages.first = parseInt(firstXInput.value) || 10;
        settingsManager.saveSettings();
      });
      lastXInput.addEventListener('change', () => {
        settings.contextToSend.messages.last = parseInt(lastXInput.value) || 10;
        settingsManager.saveSettings();
      });
      rangeStartInput.addEventListener('change', () => {
        settings.contextToSend.messages.range = {
          start: parseInt(rangeStartInput.value) || 0,
          end: settings.contextToSend.messages.range?.end ?? 10,
        };
        settingsManager.saveSettings();
      });
      rangeEndInput.addEventListener('change', () => {
        settings.contextToSend.messages.range = {
          start: settings.contextToSend.messages.range?.start ?? 0,
          end: parseInt(rangeEndInput.value) || 10,
        };
        settingsManager.saveSettings();
      });

      // Max Context Options
      const maxContextTypeSelect = popupContainer.querySelector('#charCreator_maxContextType') as HTMLSelectElement;
      const maxTokensContainer = popupContainer.querySelector('#charCreator_maxTokens_container') as HTMLElement;
      const maxTokensInput = popupContainer.querySelector('#charCreator_maxTokens') as HTMLInputElement;

      maxContextTypeSelect.value = settings.maxContextType;
      maxTokensContainer.style.display = settings.maxContextType === 'custom' ? 'block' : 'none';
      maxTokensInput.value = String(settings.maxContextValue);

      maxContextTypeSelect.addEventListener('change', () => {
        const value = maxContextTypeSelect.value as 'profile' | 'sampler' | 'custom';
        settings.maxContextType = value;
        settingsManager.saveSettings();
        maxTokensContainer.style.display = value === 'custom' ? 'block' : 'none';
      });
      maxTokensInput.addEventListener('change', () => {
        settings.maxContextValue = Number(maxTokensInput.value) || 16384;
        settingsManager.saveSettings();
      });

      // Max Response Tokens
      const maxResponseTokensInput = popupContainer.querySelector('#charCreator_maxResponseTokens') as HTMLInputElement;
      maxResponseTokensInput.value = String(settings.maxResponseToken);
      maxResponseTokensInput.addEventListener('change', () => {
        settings.maxResponseToken = Number(maxResponseTokensInput.value) || 1024;
        settingsManager.saveSettings();
      });

      // Output Format Select
      const outputFormatSelect = popupContainer.querySelector('#charCreator_outputFormat') as HTMLSelectElement;
      outputFormatSelect.value = settings.outputFormat;
      outputFormatSelect.addEventListener('change', () => {
        settings.outputFormat = outputFormatSelect.value as OutputFormat;
        settingsManager.saveSettings();
      });

      // --- Setup Character Context ---
      const avatar = this_chid ? st_getCharaFilename(this_chid) : selected_group;
      const sessionKey = `charCreator_${avatar || 'default'}`;
      const activeSession: Session = JSON.parse(localStorage.getItem(sessionKey) ?? '{}');
      if (!activeSession.selectedCharacterIndexes) {
        activeSession.selectedCharacterIndexes = this_chid ? [this_chid] : []; // Default to current char if not group
      }
      if (!activeSession.selectedWorldNames) {
        activeSession.selectedWorldNames = []; // Default to none selected
      }
      const saveSession = () => {
        localStorage.setItem(sessionKey, JSON.stringify(activeSession));
      };

      const context = SillyTavern.getContext();

      // "Characters to Include" Dropdown
      const charSelectorContainer = popupContainer.querySelector('#charCreator_characterSelector');
      if (charSelectorContainer) {
        // Prepare items for the dropdown
        const characterItems: DropdownItem[] = context.characters.map((char: Character) => ({
          value: context.characters.indexOf(char).toString(),
          label: char.name,
        }));

        buildFancyDropdown('#charCreator_characterSelector', {
          initialList: characterItems, // Use the prepared list
          initialValues: activeSession.selectedCharacterIndexes, // Use stored IDs
          placeholderText: 'Select characters for context...',
          onSelectChange: (_previousValues: string[], newValues: string[]) => {
            activeSession.selectedCharacterIndexes = newValues;
            saveSession();
          },
        });
      }

      // "Lorebooks to Include" Dropdown
      const worldInfoSelectorContainer = popupContainer.querySelector('#charCreator_worldInfoSelector');
      let allWorldNames: string[] = structuredClone(world_names);
      try {
        if (worldInfoSelectorContainer && allWorldNames.length > 0) {
          buildFancyDropdown('#charCreator_worldInfoSelector', {
            initialList: allWorldNames, // List of names
            initialValues: activeSession.selectedWorldNames, // Use stored names
            placeholderText: 'Select lorebooks for context...',
            onSelectChange: (_previousValues: string[], newValues: string[]) => {
              activeSession.selectedWorldNames = newValues;
              saveSession();
            },
          });
        } else if (worldInfoSelectorContainer) {
          worldInfoSelectorContainer.textContent = 'No active lorebooks found.';
        }
      } catch (error) {
        console.error('Failed to get active world info:', error);
        if (worldInfoSelectorContainer) {
          worldInfoSelectorContainer.textContent = 'Error loading lorebooks.';
        }
      }

      // Additional Instructions / Prompt Preset
      const promptTextarea = popupContainer.querySelector('#charCreator_prompt') as HTMLTextAreaElement;
      buildPresetSelect('#charCreatorPopup #charCreator_promptPreset', {
        label: 'instructionPreset', // Unique label
        initialValue: settings.promptPreset,
        initialList: Object.keys(settings.promptPresets),
        readOnlyValues: ['default'],
        onSelectChange: async (_previousValue, newValue) => {
          const newPresetValue = newValue ?? 'default';
          settings.promptPreset = newPresetValue;
          settingsManager.saveSettings();
          promptTextarea.value = settings.promptPresets[newPresetValue]?.content ?? '';
        },
        create: {
          onAfterCreate: (value) => {
            const currentPreset = settings.promptPresets[settings.promptPreset];
            settings.promptPresets[value] = {
              content: currentPreset?.content ?? '',
            };
            settingsManager.saveSettings(); // Save after create
          },
        },
        rename: {
          onAfterRename: (previousValue, newValue) => {
            settings.promptPresets[newValue] = settings.promptPresets[previousValue];
            delete settings.promptPresets[previousValue];
            settingsManager.saveSettings(); // Save after rename
          },
        },
        delete: {
          onAfterDelete: (value) => {
            delete settings.promptPresets[value];
            settingsManager.saveSettings(); // Save after delete
          },
        },
      });
      promptTextarea.value = settings.promptPresets[settings.promptPreset]?.content ?? '';
      promptTextarea.addEventListener('change', () => {
        if (settings.promptPresets[settings.promptPreset]) {
          settings.promptPresets[settings.promptPreset].content = promptTextarea.value;
          settingsManager.saveSettings();
        }
      });

      // --- Setup Right Column (Character Fields) ---

      // Get all field textareas and generate buttons
      const fieldTextareas: Partial<Record<CharacterFieldName, HTMLTextAreaElement>> = {};
      const generateButtons: Partial<Record<CharacterFieldName, HTMLButtonElement>> = {};

      CHARACTER_FIELDS.forEach((fieldName) => {
        fieldTextareas[fieldName] = popupContainer.querySelector(
          `#charCreator_field_${fieldName}`,
        ) as HTMLTextAreaElement;
        generateButtons[fieldName] = popupContainer.querySelector(
          `button[data-field="${fieldName}"]`,
        ) as HTMLButtonElement;
      });

      // --- Generation Logic ---
      Object.entries(generateButtons).forEach(([fieldName, button]) => {
        if (button) {
          button.addEventListener('click', async () => {
            const targetField = fieldName as CharacterFieldName;
            const targetTextarea = fieldTextareas[targetField];
            if (!targetTextarea) return;

            // Disable button and show loading state
            button.disabled = true;
            const originalIcon = button.innerHTML;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>'; // Use FA spinner

            try {
              const userPrompt = (popupContainer.querySelector('#charCreator_prompt') as HTMLTextAreaElement).value;

              if (!settings.profileId) {
                st_echo('warning', 'Please select a connection profile.');
                return;
              }

              const profile = context.extensionSettings.connectionManager?.profiles?.find(
                (p) => p.id === settings.profileId,
              );
              if (!profile) {
                st_echo('warning', 'Connection profile not found.');
                return;
              }

              // Collect current values from all fields
              const currentFieldValues: Partial<Record<CharacterFieldName, string>> = {};
              CHARACTER_FIELDS.forEach((fname) => {
                if (fieldTextareas[fname]) {
                  currentFieldValues[fname] = fieldTextareas[fname]?.value;
                }
              });

              // Build Prompt Options
              const buildPromptOptions: BuildPromptOptions = {
                presetName: profile?.preset,
                contextName: profile?.context,
                instructName: profile?.instruct,
                // Determine which character's card fields to potentially ignore/use based on group mode
                // If in group mode and using a specific member's persona, target that ID.
                // Otherwise (single chat or no specific group target), use the default behavior (which uses this_chid).
                targetCharacterId: this_chid,
                // We want the base persona/description etc. from the targetCharacterId
                ignoreCharacterFields: true, // Use the target char's fields
                ignoreWorldInfo: true, // Not relevant here
                ignoreAuthorNote: true, // Removed
                maxContext:
                  settings.maxContextType === 'custom'
                    ? settings.maxContextValue
                    : settings.maxContextType === 'profile'
                      ? 'preset'
                      : 'active',
                includeNames: !!selected_group, // Include {{user}} / {{char}} names in group chat
              };

              // Add message range options
              const msgContext = settings.contextToSend.messages;
              switch (msgContext.type) {
                case 'none':
                  buildPromptOptions.messageIndexesBetween = { start: -1, end: -1 };
                  break;
                case 'first':
                  buildPromptOptions.messageIndexesBetween = { start: 0, end: msgContext.first ?? 10 };
                  break;
                case 'last':
                  const chatLength = globalContext.chat?.length ?? 0;
                  const lastCount = msgContext.last ?? 10;
                  buildPromptOptions.messageIndexesBetween = {
                    end: Math.max(0, chatLength - 1),
                    start: Math.max(0, chatLength - lastCount),
                  };
                  break;
                case 'range':
                  buildPromptOptions.messageIndexesBetween = {
                    start: msgContext.range?.start ?? 0,
                    end: msgContext.range?.end ?? 10,
                  };
                  break;
                case 'all':
                default:
                  break; // No specific range needed
              }

              // Determine which format description to send
              let formatDescription = '';
              switch (settings.outputFormat) {
                case 'xml':
                  formatDescription = settings.xmlFormatDesc;
                  break;
                case 'json':
                  formatDescription = settings.jsonFormatDesc;
                  break;
                case 'none':
                  formatDescription = settings.noneFormatDesc;
                  break;
              }

              const entriesGroupByWorldName: Record<string, WIEntry[]> = {};
              world_names
                .filter((name: string) => activeSession.selectedWorldNames.includes(name))
                .forEach(async (name: string) => {
                  const worldInfo = await globalContext.loadWorldInfo(name);
                  if (worldInfo) {
                    entriesGroupByWorldName[name] = Object.values(worldInfo.entries);
                  }
                });

              // Call generation function
              const generatedContent = await runCharacterFieldGeneration({
                profileId: settings.profileId,
                userPrompt: userPrompt,
                buildPromptOptions: buildPromptOptions,
                contextToSend: settings.contextToSend,
                session: activeSession, // Pass current session state
                allCharacters: context.characters, // Pass all characters
                entriesGroupByWorldName: entriesGroupByWorldName,
                promptSettings: {
                  stCharCardPrompt: settings.stCharCardPrompt,
                  charCardDefinitionPrompt: settings.charCardDefinitionPrompt,
                  lorebookDefinitionPrompt: settings.lorebookDefinitionPrompt,
                  formatDescription: formatDescription,
                },
                maxResponseToken: settings.maxResponseToken,
                targetField: targetField,
                outputFormat: settings.outputFormat,
                currentFieldValues: currentFieldValues,
              });

              // Update the textarea
              targetTextarea.value = generatedContent;
              // Optionally trigger change event if other parts listen to it
              targetTextarea.dispatchEvent(new Event('change'));
              st_echo('success', `Generated content for "${targetField}".`);
            } catch (error: any) {
              console.error(`Error generating field ${targetField}:`, error);
              st_echo('error', `Failed to generate ${targetField}: ${error.message || error}`);
            } finally {
              // Restore button state
              button.disabled = false;
              button.innerHTML = originalIcon;
            }
          });
        }
      });
    });
  });
}

function stagingCheck(): boolean {
  // Add checks for any absolutely essential ST staging functions if needed
  if (!globalContext.ConnectionManagerRequestService) return false;
  if (!globalContext.renderExtensionTemplateAsync) return false;
  if (!globalContext.callGenericPopup) return false;
  // buildFancyDropdown and buildPresetSelect are assumed available via sillytavern-utils-lib
  return true;
}

function main() {
  handleSettingsUI(); // Setup settings panel
  handlePopupUI(); // Setup popup icon and its functionality
  // initializeCommands(); // If using slash commands
}

// Initialization logic
if (!stagingCheck()) {
  console.error(`[${extensionName}] Error: Required SillyTavern functions not found. Make sure ST is up-to-date.`);
  st_echo('error', `[${extensionName}] Initialization failed. Please ensure SillyTavern is updated.`);
} else {
  settingsManager
    .initializeSettings()
    .then((result) => {
      if (result.version.changed) {
        const settings = settingsManager.getSettings();
        let settingsChanged = false;

        // Helper to update default prompts if needed
        const checkAndUpdateDefault = (
          settingKey: keyof ExtensionSettings,
          defaultKey: keyof typeof import('./constants.js'),
          usingDefaultKey: keyof ExtensionSettings,
        ) => {
          // @ts-ignore
          const defaultText = import('./constants.js')[defaultKey] as string;
          if (settings[usingDefaultKey] && settings[settingKey] !== defaultText) {
            console.log(`[${extensionName}] Updating default for ${settingKey}`);
            (settings[settingKey] as any) = defaultText;
            settingsChanged = true;
          }
        };

        // Check and update all relevant default prompts
        checkAndUpdateDefault('stCharCardPrompt', 'DEFAULT_CHAR_CARD_DESCRIPTION', 'usingDefaultStCharCardPrompt');
        checkAndUpdateDefault(
          'charCardDefinitionPrompt',
          'DEFAULT_CHAR_CARD_DEFINITION_TEMPLATE',
          'usingDefaultCharCardDefinitionPrompt',
        );
        checkAndUpdateDefault('xmlFormatDesc', 'DEFAULT_XML_FORMAT_DESC', 'usingDefaultXmlFormatDesc');
        checkAndUpdateDefault('jsonFormatDesc', 'DEFAULT_JSON_FORMAT_DESC', 'usingDefaultJsonFormatDesc');
        checkAndUpdateDefault('noneFormatDesc', 'DEFAULT_NONE_FORMAT_DESC', 'usingDefaultNoneFormatDesc');

        if (settingsChanged) {
          console.log(`[${extensionName}] Saving updated default settings.`);
          settingsManager.saveSettings();
        }
      }
      main(); // Run the main extension setup
    })
    .catch((error) => {
      console.error(`[${extensionName}] Error initializing settings:`, error);
      st_echo('error', `[${extensionName}] Failed to initialize settings: ${error.message}`);
      // Offer to reset settings as a recovery option
      globalContext.Popup.show
        .confirm(
          `[${extensionName}] Failed to load settings. This might be due to an update. Reset settings to default?`,
          'Extension Error',
        )
        .then((result: boolean) => {
          if (result) {
            settingsManager.resetSettings();
            st_echo('success', `[${extensionName}] Settings reset. Reloading may be required.`);
            main(); // Try to run main again after reset
          }
        });
    });
}
