import { buildFancyDropdown, buildPresetSelect, BuildPromptOptions, DropdownItem } from 'sillytavern-utils-lib';
import { selected_group, st_echo, this_chid, world_names } from 'sillytavern-utils-lib/config';
import { POPUP_TYPE } from 'sillytavern-utils-lib/types/popup';

import {
  globalContext,
  runCharacterFieldGeneration,
  Session,
  ContextToSend,
  CharacterFieldName,
  CHARACTER_FIELDS,
} from './generate.js';

import {
  DEFAULT_CHAR_CARD_DEFINITION_TEMPLATE,
  DEFAULT_CHAR_CARD_DESCRIPTION,
  DEFAULT_JSON_FORMAT_DESC,
  DEFAULT_LOREBOOK_DEFINITION,
  DEFAULT_NONE_FORMAT_DESC,
  DEFAULT_XML_FORMAT_DESC,
} from './constants.js';

import { extensionName, settingsManager, ExtensionSettings, OutputFormat } from './settings.js';
import { Character } from 'sillytavern-utils-lib/types';
import { WIEntry } from 'sillytavern-utils-lib/types/world-info';

// @ts-ignore
import { Handlebars } from '../../../../../lib.js';
if (!Handlebars.helpers['join']) {
  Handlebars.registerHelper('join', function (array: any, separator: any) {
    if (Array.isArray(array)) {
      return array.join(typeof separator === 'string' ? separator : ', ');
    }
    return '';
  });
}

Handlebars.registerHelper('ifValue', function (this: any, conditional: any, options: any) {
  if (conditional && String(conditional).trim().length > 0) {
    return options.fn(this);
  } else {
    return options.inverse(this);
  }
});

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
    defaultText: string,
    defaultFlagKey: keyof ExtensionSettings,
  ) => {
    const container = settingsContainer.querySelector(`.${selector}`);
    if (!container) return;
    const textarea = container.querySelector('textarea') as HTMLTextAreaElement;
    const restoreButton = container.querySelector('.restore_default') as HTMLButtonElement;

    textarea.value = String(settings[settingKey]);

    restoreButton.addEventListener('click', async () => {
      const confirm = await globalContext.Popup.show.confirm(
        'Character Creator',
        `Are you sure you want to restore the default for "${container.querySelector('span')?.textContent}"?`,
      );
      if (confirm) {
        textarea.value = defaultText;
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
    DEFAULT_CHAR_CARD_DESCRIPTION,
    'usingDefaultStCharCardPrompt',
  );
  setupPromptArea(
    'charCardDefinitionPrompt',
    'charCardDefinitionPrompt',
    DEFAULT_CHAR_CARD_DEFINITION_TEMPLATE,
    'usingDefaultCharCardDefinitionPrompt',
  );
  setupPromptArea(
    'lorebookDefinitionPrompt',
    'lorebookDefinitionPrompt',
    DEFAULT_LOREBOOK_DEFINITION,
    'usingDefaultLorebookDefinitionPrompt',
  );
  setupPromptArea('xmlFormatDesc', 'xmlFormatDesc', DEFAULT_XML_FORMAT_DESC, 'usingDefaultXmlFormatDesc');
  setupPromptArea('jsonFormatDesc', 'jsonFormatDesc', DEFAULT_JSON_FORMAT_DESC, 'usingDefaultJsonFormatDesc');
  setupPromptArea('noneFormatDesc', 'noneFormatDesc', DEFAULT_NONE_FORMAT_DESC, 'usingDefaultNoneFormatDesc');
}

async function handlePopupUI() {
  const iconHtml = `<div class="menu_button fa-solid fa-user-astronaut interactable charCreator-icon" title="Character Creator"></div>`;

  $('.form_create_bottom_buttons_block').prepend(iconHtml);
  $('#GroupFavDelOkBack').prepend(iconHtml); // Add to group management too if needed
  $('#form_character_search_form').prepend(iconHtml);

  const popupIcons = document.querySelectorAll('.charCreator-icon');

  popupIcons.forEach((icon) => {
    icon.addEventListener('click', async () => {
      const popupHtml = await globalContext.renderExtensionTemplateAsync(
        `third-party/${extensionName}`,
        'templates/popup',
      );
      globalContext.callGenericPopup(popupHtml, POPUP_TYPE.DISPLAY, undefined, {
        large: true,
        wide: true,
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
      const includeCharsContainer = popupContainer.querySelector('#charCreator_charIncludeContainer') as HTMLDivElement;
      const includeWorldInfoCheckbox = popupContainer.querySelector(
        '#charCreator_includeWorldInfo',
      ) as HTMLInputElement;
      const includeWorldInfoContainer = popupContainer.querySelector(
        '#charCreator_worldInfoIncludeContainer',
      ) as HTMLDivElement;
      const includeExistingFieldsCheckbox = popupContainer.querySelector(
        '#charCreator_includeExistingFields',
      ) as HTMLInputElement;

      stDescriptionCheckbox.checked = settings.contextToSend.stDescription;
      includeCharsCheckbox.checked = settings.contextToSend.charCard;
      includeExistingFieldsCheckbox.checked = settings.contextToSend.existingFields;
      includeWorldInfoCheckbox.checked = settings.contextToSend.worldInfo;

      includeCharsContainer.style.display = includeCharsCheckbox.checked ? 'block' : 'none';
      includeWorldInfoContainer.style.display = includeWorldInfoCheckbox.checked ? 'block' : 'none';

      stDescriptionCheckbox.addEventListener('change', () => {
        settings.contextToSend.stDescription = stDescriptionCheckbox.checked;
        settingsManager.saveSettings();
      });
      includeCharsCheckbox.addEventListener('change', () => {
        settings.contextToSend.charCard = includeCharsCheckbox.checked;
        includeCharsContainer.style.display = includeCharsCheckbox.checked ? 'block' : 'none';
        settingsManager.saveSettings();
      });
      includeWorldInfoCheckbox.addEventListener('change', () => {
        settings.contextToSend.worldInfo = includeWorldInfoCheckbox.checked;
        includeWorldInfoContainer.style.display = includeWorldInfoCheckbox.checked ? 'block' : 'none';
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
      const sessionKey = `charCreator`;
      const activeSession: Session = JSON.parse(localStorage.getItem(sessionKey) ?? '{}');
      if (!activeSession.selectedCharacterIndexes) {
        activeSession.selectedCharacterIndexes = this_chid ? [this_chid] : [];
      }
      if (!activeSession.selectedWorldNames) {
        activeSession.selectedWorldNames = [];
      }
      if (!activeSession.fields) {
        // @ts-ignore
        activeSession.fields = {};
      }
      CHARACTER_FIELDS.forEach((field) => {
        if (!activeSession.fields[field]) {
          activeSession.fields[field] = {
            value: '',
            prompt: '',
          };
        }
      });
      const saveSession = () => {
        localStorage.setItem(sessionKey, JSON.stringify(activeSession));
      };

      const context = SillyTavern.getContext();

      // "Characters to Include" Dropdown
      const charSelectorContainer = popupContainer.querySelector('#charCreator_characterSelector');
      if (charSelectorContainer) {
        const characterItems: DropdownItem[] = context.characters.map((char: Character) => ({
          value: context.characters.indexOf(char).toString(),
          label: char.name,
        }));

        buildFancyDropdown('#charCreator_characterSelector', {
          initialList: characterItems,
          initialValues: activeSession.selectedCharacterIndexes,
          placeholderText: 'Select characters for context...',
          enableSearch: characterItems.length > 10,
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
            initialList: allWorldNames,
            initialValues: activeSession.selectedWorldNames,
            placeholderText: 'Select lorebooks for context...',
            enableSearch: allWorldNames.length > 10,
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
        label: 'instructionPreset',
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
          },
        },
        rename: {
          onAfterRename: (previousValue, newValue) => {
            settings.promptPresets[newValue] = settings.promptPresets[previousValue];
            delete settings.promptPresets[previousValue];
          },
        },
        delete: {
          onAfterDelete: (value) => {
            delete settings.promptPresets[value];
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

      // Define field configurations
      const fieldConfigs = {
        name: { label: 'Name', rows: 1, large: false, promptEnabled: false },
        description: { label: 'Description', rows: 5, large: true, promptEnabled: true },
        personality: { label: 'Personality', rows: 4, large: true, promptEnabled: true },
        scenario: { label: 'Scenario', rows: 3, large: true, promptEnabled: true },
        first_mes: { label: 'First Message', rows: 3, large: true, promptEnabled: true },
        mes_example: { label: 'Example Dialogue', rows: 6, large: true, promptEnabled: true },
      };

      // Get template and container
      const template = popupContainer.querySelector<HTMLTemplateElement>('#charCreator_fieldTemplate');
      const fieldsContainer = popupContainer.querySelector('#charCreator_fieldsContainer');

      // Initialize storage for field elements
      // @ts-ignore
      const fieldElements: Record<
        CharacterFieldName,
        {
          textarea: HTMLTextAreaElement;
          button: HTMLButtonElement;
          promptTextarea?: HTMLTextAreaElement;
        }
      > = {};

      if (template && fieldsContainer) {
        // Generate fields from template
        CHARACTER_FIELDS.forEach((fieldName) => {
          const config = fieldConfigs[fieldName];
          const clone = template.content.cloneNode(true) as DocumentFragment;

          // Configure the cloned elements
          const fieldDiv = clone.querySelector('.character-field');
          const label = clone.querySelector('label');
          const textarea = clone.querySelector('.field-container textarea') as HTMLTextAreaElement;
          const button = clone.querySelector('.generate-field-button') as HTMLButtonElement;
          const promptTextarea = clone.querySelector('.field-prompt-container textarea') as HTMLTextAreaElement;

          if (fieldDiv && label && textarea && button && promptTextarea) {
            // Set IDs and attributes
            textarea.id = `charCreator_field_${fieldName}`;
            promptTextarea.id = `charCreator_prompt_${fieldName}`;
            label.dataset.for = textarea.id;

            // Set content
            label.textContent = config.label;
            textarea.rows = config.rows;
            textarea.value = activeSession.fields[fieldName]?.value ?? '';
            button.dataset.field = fieldName;
            button.title = `Generate ${config.label}`;
            promptTextarea.placeholder = `Enter custom prompt for ${config.label.toLowerCase()} generation...`;
            promptTextarea.value = activeSession.fields[fieldName]?.prompt ?? '';

            if (!config.promptEnabled) {
              promptTextarea.closest('.field-prompt-container')?.remove();
            }

            // Add large-field class if needed
            if (config.large) {
              textarea.closest('.field-container')?.classList.add('large-field');
            }

            // Store references
            fieldElements[fieldName] = {
              textarea,
              button,
              promptTextarea,
            };
          }

          fieldsContainer.appendChild(clone);
        });
      }

      // --- Button Actions ---
      // Setup Load Character Dropdown
      const loadCharSelectorContainer = popupContainer.querySelector('#charCreator_loadCharSelector');
      if (loadCharSelectorContainer) {
        const characterItems: DropdownItem[] = context.characters.map((char: Character) => ({
          value: context.characters.indexOf(char).toString(),
          label: char.name,
        }));

        buildFancyDropdown('#charCreator_loadCharSelector', {
          initialList: characterItems,
          initialValues: [],
          placeholderText: 'Load Character Data...',
          enableSearch: characterItems.length > 10,
          multiple: false,
          closeOnSelect: true,
          onSelectChange: async (_previousValues: string[], newValues: string[]) => {
            if (newValues.length === 0) return;
            const selectedId = newValues[0];
            if (selectedId.length === 0) return;

            const allFieldEmpty = CHARACTER_FIELDS.every((fieldName) => {
              const textarea = fieldElements[fieldName]?.textarea;
              return textarea && textarea.value.trim() === '';
            });

            if (!allFieldEmpty) {
              const confirm = await globalContext.Popup.show.confirm(
                'Load Character Data',
                'Are you sure you want to overwrite existing data? This cannot be undone.',
              );
              if (!confirm) return;
            }

            const character = context.characters[parseInt(selectedId)];
            if (!character) {
              st_echo('warning', 'Selected character not found.');
              return;
            }

            // Load the character fields
            CHARACTER_FIELDS.forEach((fieldName) => {
              const textarea = fieldElements[fieldName]?.textarea;
              const promptTextarea = fieldElements[fieldName]?.promptTextarea;

              if (textarea) {
                // @ts-ignore
                textarea.value = character[fieldName] ?? '';
                textarea.dispatchEvent(new Event('change'));
              }
              if (promptTextarea && promptTextarea.value.trim() !== '') {
                promptTextarea.value = '';
                promptTextarea.dispatchEvent(new Event('change'));
              }
            });
          },
        });
      }

      const resetButton = popupContainer.querySelector('#charCreator_reset') as HTMLButtonElement;
      resetButton.addEventListener('click', async () => {
        const confirm = await globalContext.Popup.show.confirm(
          'Reset Fields',
          'Are you sure you want to reset all fields? This cannot be undone.',
        );
        if (confirm) {
          CHARACTER_FIELDS.forEach((fieldName) => {
            if (fieldElements[fieldName]?.textarea) {
              fieldElements[fieldName].textarea.value = '';
              fieldElements[fieldName].textarea.dispatchEvent(new Event('change'));
            }
            if (fieldElements[fieldName]?.promptTextarea) {
              fieldElements[fieldName].promptTextarea.value = '';
              fieldElements[fieldName].promptTextarea.dispatchEvent(new Event('change'));
            }
          });
        }
      });

      // --- Generation Logic ---
      Object.entries(fieldElements).forEach(([fieldName, { textarea, button, promptTextarea }]) => {
        if (button) {
          button.addEventListener('click', async () => {
            const targetField = fieldName as CharacterFieldName;

            // Disable button and show loading state
            button.disabled = true;
            const originalIcon = button.innerHTML;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';

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

              // @ts-ignore
              const currentFieldValues: Record<CharacterFieldName, { value: string; prompt: string }> = {};
              CHARACTER_FIELDS.forEach((fname) => {
                currentFieldValues[fname] = {
                  value: textarea.value,
                  prompt: promptTextarea?.value || '',
                };
              });

              const buildPromptOptions: BuildPromptOptions = {
                presetName: profile?.preset,
                contextName: profile?.context,
                instructName: profile?.instruct,
                targetCharacterId: this_chid,
                ignoreCharacterFields: true,
                ignoreWorldInfo: true,
                ignoreAuthorNote: true,
                maxContext:
                  settings.maxContextType === 'custom'
                    ? settings.maxContextValue
                    : settings.maxContextType === 'profile'
                      ? 'preset'
                      : 'active',
                includeNames: !!selected_group,
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
                  break;
              }

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
                session: activeSession,
                allCharacters: context.characters,
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

              textarea.value = generatedContent;
              textarea.dispatchEvent(new Event('change'));
            } catch (error: any) {
              console.error(`Error generating field ${targetField}:`, error);
              st_echo('error', `Failed to generate ${targetField}: ${error.message || error}`);
            } finally {
              button.disabled = false;
              button.innerHTML = originalIcon;
            }
          });

          textarea.addEventListener('change', () => {
            const field = fieldName as CharacterFieldName;
            activeSession.fields[field] = {
              ...activeSession.fields[field],
              value: textarea.value,
            };
            saveSession();
          });

          promptTextarea?.addEventListener('change', () => {
            const field = fieldName as CharacterFieldName;
            activeSession.fields[field] = {
              ...activeSession.fields[field],
              prompt: promptTextarea.value,
            };
            saveSession();
          });
        }
      });
    });
  });
}

function stagingCheck(): boolean {
  if (!globalContext.ConnectionManagerRequestService) return false;
  return true;
}

function main() {
  handleSettingsUI();
  handlePopupUI();
}

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

        const checkAndUpdateDefault = (
          settingKey: keyof ExtensionSettings,
          defaultText: string,
          usingDefaultKey: keyof ExtensionSettings,
        ) => {
          // @ts-ignore
          if (settings[usingDefaultKey] && settings[settingKey] !== defaultText) {
            console.log(`[${extensionName}] Updating default for ${settingKey}`);
            (settings[settingKey] as any) = defaultText;
            settingsChanged = true;
          }
        };

        checkAndUpdateDefault('stCharCardPrompt', DEFAULT_CHAR_CARD_DESCRIPTION, 'usingDefaultStCharCardPrompt');
        checkAndUpdateDefault(
          'charCardDefinitionPrompt',
          DEFAULT_CHAR_CARD_DEFINITION_TEMPLATE,
          'usingDefaultCharCardDefinitionPrompt',
        );
        checkAndUpdateDefault('xmlFormatDesc', DEFAULT_XML_FORMAT_DESC, 'usingDefaultXmlFormatDesc');
        checkAndUpdateDefault('jsonFormatDesc', DEFAULT_JSON_FORMAT_DESC, 'usingDefaultJsonFormatDesc');
        checkAndUpdateDefault('noneFormatDesc', DEFAULT_NONE_FORMAT_DESC, 'usingDefaultNoneFormatDesc');

        if (settingsChanged) {
          console.log(`[${extensionName}] Saving updated default settings.`);
          settingsManager.saveSettings();
        }
      }
      main();
    })
    .catch((error) => {
      console.error(`[${extensionName}] Error initializing settings:`, error);
      st_echo('error', `[${extensionName}] Failed to initialize settings: ${error.message}`);
      globalContext.Popup.show
        .confirm(
          `[${extensionName}] Failed to load settings. This might be due to an update. Reset settings to default?`,
          'Extension Error',
        )
        .then((result: boolean) => {
          if (result) {
            settingsManager.resetSettings();
            st_echo('success', `[${extensionName}] Settings reset. Reloading may be required.`);
            main();
          }
        });
    });
}
