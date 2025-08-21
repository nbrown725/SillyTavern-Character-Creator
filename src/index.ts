import {
  buildFancyDropdown,
  buildPresetSelect,
  buildSortableList,
  DropdownItem,
  SortableListItemData,
} from 'sillytavern-utils-lib';
import { selected_group, st_echo, this_chid, world_names } from 'sillytavern-utils-lib/config';
import { POPUP_TYPE } from 'sillytavern-utils-lib/types/popup';

import {
  globalContext,
  CharacterFieldName,
  CHARACTER_FIELDS,
  CHARACTER_LABELS,
} from './generate.js';
import { Session, CharacterField } from './types.js';
import { SessionService } from './services/sessionService.js';
import { CharacterController } from './controllers/characterController.js';
import { UIHelpers } from './utils/uiHelpers.js';

import {
  extensionName,
  settingsManager,
  OutputFormat,
  SYSTEM_PROMPT_KEYS,
  DEFAULT_PROMPT_CONTENTS,
  PromptSetting,
  convertToVariableName,
  VERSION,
  DEFAULT_SETTINGS,
  MessageRole,
  ContextToSend,
  SystemPromptKey,
  initializeSettings,
} from './settings.js';
import { Character } from 'sillytavern-utils-lib/types';
import { initializeChat, loadChatUI } from './chat.js';

import * as Handlebars from 'handlebars';

if (!Handlebars.helpers['join']) {
  Handlebars.registerHelper('join', function (array: any, separator: any) {
    if (Array.isArray(array)) {
      return array.join(typeof separator === 'string' ? separator : ', ');
    }
    return '';
  });
}

async function handleSettingsUI() {
  const settingsHtml = await globalContext.renderExtensionTemplateAsync(
    `third-party/${extensionName}`,
    'templates/settings',
  );
  $('#extensions_settings').append(settingsHtml);

  const settingsContainer = document.querySelector('.charCreator_settings');
  if (!settingsContainer) return;

  const settings = settingsManager.getSettings();
  const sessionService = SessionService.getInstance();

  let setMainContextList: (list: SortableListItemData[]) => void;
  let getMainContextList: () => SortableListItemData[];
  // --- Setup Main Context Template ---
  {
    const promptSelect = settingsContainer.querySelector('#charCreator_mainContextTemplatePreset') as HTMLSelectElement;
    const promptList = settingsContainer.querySelector('#charCreator_mainContextList') as HTMLTextAreaElement;
    const restoreMainContextTemplateButton = settingsContainer.querySelector(
      '#charCreator_restoreMainContextTemplateDefault',
    ) as HTMLButtonElement;

    // promptTextarea.value = settings.mainContextTemplatePresets[settings.mainContextTemplatePreset]?.content;
    buildPresetSelect('#charCreator_mainContextTemplatePreset', {
      initialList: Object.keys(settings.mainContextTemplatePresets),
      initialValue: settings.mainContextTemplatePreset,
      readOnlyValues: ['default'],
      onSelectChange(_, newValue) {
        const newPresetValue = newValue ?? 'default';
        setList(
          settings.mainContextTemplatePresets[newPresetValue].prompts.map((prompt) => {
            let label = prompt.promptName;
            if (settings.prompts[prompt.promptName]) {
              label = `${settings.prompts[prompt.promptName].label} (${prompt.promptName})`;
            }
            return {
              enabled: prompt.enabled,
              id: prompt.promptName,
              label,
              selectOptions: [
                { value: 'user', label: 'User' },
                { value: 'assistant', label: 'Assistant' },
                { value: 'system', label: 'System' },
              ],
              selectValue: prompt.role,
            };
          }),
        );

        settings.mainContextTemplatePreset = newPresetValue;
        settingsManager.saveSettings();
      },
      create: {
        onAfterCreate(value) {
          let currentPreset = settings.mainContextTemplatePresets[settings.mainContextTemplatePreset];
          if (!currentPreset) {
            currentPreset = settings.mainContextTemplatePresets['default'];
          }
          settings.mainContextTemplatePresets[value] = structuredClone(currentPreset);
        },
      },
      rename: {
        onAfterRename(previousValue, newValue) {
          settings.mainContextTemplatePresets[newValue] = settings.mainContextTemplatePresets[previousValue];
          delete settings.mainContextTemplatePresets[previousValue];
        },
      },
      delete: {
        onAfterDelete(value) {
          delete settings.mainContextTemplatePresets[value];
        },
      },
    });

    const initialPromptList: SortableListItemData[] = settings.mainContextTemplatePresets[
      settings.mainContextTemplatePreset
    ].prompts.map((prompt) => {
      let label = prompt.promptName;
      if (settings.prompts[prompt.promptName]) {
        label = `${settings.prompts[prompt.promptName].label} (${prompt.promptName})`;
      }
      return {
        enabled: prompt.enabled,
        id: prompt.promptName,
        label,
        selectOptions: [
          { value: 'user', label: 'User' },
          { value: 'assistant', label: 'Assistant' },
          { value: 'system', label: 'System' },
        ],
        selectValue: prompt.role,
      };
    });
    const { setList, getList } = buildSortableList(promptList, {
      initialList: initialPromptList,
      showSelectInput: true,
      showToggleButton: true,
      onSelectChange(itemId, newValue) {
        const item = settings.mainContextTemplatePresets[settings.mainContextTemplatePreset].prompts.find(
          (prompt) => prompt.promptName === itemId,
        );
        if (item) {
          item.role = newValue as MessageRole;
          settingsManager.saveSettings();
        }
      },
      onToggle(itemId, newState) {
        const item = settings.mainContextTemplatePresets[settings.mainContextTemplatePreset].prompts.find(
          (prompt) => prompt.promptName === itemId,
        );
        if (item) {
          item.enabled = newState;
          settingsManager.saveSettings();
        }
      },
      onOrderChange(newItemOrderIds) {
        const newOrder = newItemOrderIds
          .map((id) => {
            const item = settings.mainContextTemplatePresets[settings.mainContextTemplatePreset].prompts.find(
              (prompt) => prompt.promptName === id,
            );
            return item;
          })
          .filter((item) => item !== undefined);
        settings.mainContextTemplatePresets[settings.mainContextTemplatePreset].prompts = newOrder;
        settingsManager.saveSettings();
      },
    });
    setMainContextList = setList;
    getMainContextList = getList;

    restoreMainContextTemplateButton.addEventListener('click', async () => {
      const confirm = await globalContext.Popup.show.confirm(
        'Restore default',
        'Are you sure you want to restore the default prompt?',
      );
      if (!confirm) {
        return;
      }

      settings.mainContextTemplatePresets['default'] = {
        prompts: DEFAULT_SETTINGS.mainContextTemplatePresets['default'].prompts,
      };
      if (promptSelect.value !== 'default') {
        promptSelect.value = 'default';
        promptSelect.dispatchEvent(new Event('change'));
      } else {
        setList(
          settings.mainContextTemplatePresets['default'].prompts.map((prompt) => {
            let label = prompt.promptName;
            if (settings.prompts[prompt.promptName]) {
              label = `${settings.prompts[prompt.promptName].label} (${prompt.promptName})`;
            }
            return {
              enabled: prompt.enabled,
              id: prompt.promptName,
              label,
              selectOptions: [
                { value: 'user', label: 'User' },
                { value: 'assistant', label: 'Assistant' },
                { value: 'system', label: 'System' },
              ],
              selectValue: prompt.role,
            };
          }),
        );
        settingsManager.saveSettings();
      }
    });
  }

  // --- Setup Consolidated System Prompts ---
  {
    const promptSelect = settingsContainer.querySelector('#charCreator_systemPromptPreset') as HTMLSelectElement;
    const promptTextarea = settingsContainer.querySelector('#charCreator_systemPromptContent') as HTMLTextAreaElement;
    const restoreSystemPromptButton = settingsContainer.querySelector(
      '#charCreator_restoreSystemPromptDefault',
    ) as HTMLButtonElement;

    buildPresetSelect('#charCreator_systemPromptPreset', {
      initialList: Object.keys(settings.prompts),
      readOnlyValues: SYSTEM_PROMPT_KEYS,
      initialValue: SYSTEM_PROMPT_KEYS[0],
      label(value) {
        if (value === '') {
          return 'prompt';
        }

        const promptSetting = settings.prompts[value];
        if (promptSetting) {
          return `${promptSetting.label} (${value})`;
        }
        return value;
      },
      create: {
        onBeforeCreate(value) {
          const variableName = convertToVariableName(value);
          if (!variableName) {
            st_echo('error', `Invalid prompt name: ${value}`);
            return false;
          }
          if (settings.prompts[variableName]) {
            st_echo('error', `Prompt name already exists: ${variableName}`);
            return false;
          }

          return true;
        },
        onAfterCreate(value) {
          const variableName = convertToVariableName(value);
          settings.prompts[variableName] = {
            content: promptTextarea.value,
            isDefault: false,
            label: value,
          };
          Object.entries(settings.mainContextTemplatePresets).forEach(([presetName, preset]) => {
            preset.prompts.push({
              enabled: true,
              promptName: variableName,
              role: 'user',
            });
          });
          setMainContextList([
            ...getMainContextList(),
            {
              enabled: true,
              id: variableName,
              label: `${value} (${variableName})`,
              selectOptions: [
                { value: 'user', label: 'User' },
                { value: 'assistant', label: 'Assistant' },
                { value: 'system', label: 'System' },
              ],
              selectValue: 'user',
            },
          ]);

          return variableName;
        },
      },
      rename: {
        onBeforeRename(_previousValue, newValue) {
          const variableName = convertToVariableName(newValue);
          if (!variableName) {
            st_echo('error', `Invalid prompt name: ${newValue}`);
            return false;
          }
          if (settings.prompts[variableName]) {
            st_echo('error', `Prompt name already exists: ${variableName}`);
            return false;
          }

          return true;
        },
        onAfterRename(previousValue, newValue) {
          const filteredValue = convertToVariableName(newValue);
          settings.prompts[filteredValue] = { ...settings.prompts[previousValue], label: newValue };
          delete settings.prompts[previousValue];
          Object.entries(settings.mainContextTemplatePresets).forEach(([presetName, preset]) => {
            preset.prompts.forEach((prompt) => {
              if (prompt.promptName === previousValue) {
                prompt.promptName = filteredValue;
              }
            });
          });

          setMainContextList(
            getMainContextList().map((item) => {
              if (item.id === previousValue) {
                return {
                  ...item,
                  id: filteredValue,
                  label: `${newValue} (${filteredValue})`,
                };
              }
              return item;
            }),
          );
          return filteredValue;
        },
      },
      delete: {
        onAfterDelete(value) {
          delete settings.prompts[value];
          Object.entries(settings.mainContextTemplatePresets).forEach(([presetName, preset]) => {
            preset.prompts = preset.prompts.filter((prompt) => prompt.promptName !== value);
          });
          setMainContextList(getMainContextList().filter((item) => item.id !== value));
        },
      },
      onSelectChange(_, newValue) {
        const newPresetValue = newValue ?? '';
        const promptSetting: PromptSetting | undefined = settings.prompts[newPresetValue];
        if (promptSetting) {
          promptTextarea.value = promptSetting.content ?? '';
          restoreSystemPromptButton.style.display = SYSTEM_PROMPT_KEYS.includes(newPresetValue as SystemPromptKey)
            ? 'block'
            : 'none';
          settingsManager.saveSettings();
        }
      },
    });

    // Initial state
    const selectedKey = promptSelect.value;
    const prompSetting: PromptSetting | undefined = settings.prompts[selectedKey];
    if (prompSetting) {
      promptTextarea.value = prompSetting.content ?? '';
      restoreSystemPromptButton.style.display = SYSTEM_PROMPT_KEYS.includes(selectedKey as SystemPromptKey)
        ? 'block'
        : 'none';
    }

    // Event listener for textarea change
    promptTextarea.addEventListener('change', () => {
      const selectedKey = promptSelect.value as SystemPromptKey;
      const currentContent = promptTextarea.value;

      const prompSetting: PromptSetting | undefined = settings.prompts[selectedKey];
      if (prompSetting) {
        prompSetting.content = currentContent;
        prompSetting.isDefault = SYSTEM_PROMPT_KEYS.includes(selectedKey)
          ? DEFAULT_PROMPT_CONTENTS[selectedKey] === currentContent
          : false;
        restoreSystemPromptButton.style.display = SYSTEM_PROMPT_KEYS.includes(selectedKey) ? 'block' : 'none';
        settingsManager.saveSettings();
      }
    });

    restoreSystemPromptButton.addEventListener('click', async () => {
      const selectedKey = promptSelect.value as SystemPromptKey;
      const defaultContent = DEFAULT_PROMPT_CONTENTS[selectedKey];
      const promptSetting: PromptSetting | undefined = settings.prompts[selectedKey];
      if (promptSetting) {
        const confirm = await globalContext.Popup.show.confirm(
          'Restore Default',
          `Are you sure you want to restore the default for "${promptSetting.label}"?`,
        );
        if (confirm) {
          promptTextarea.value = defaultContent;
          promptTextarea.dispatchEvent(new Event('change'));
        }
      } else {
        st_echo('warning', 'No prompt selected.');
      }
    });
  }

  const showSaveAsWorldInfoCheckbox = settingsContainer.querySelector(
    '#charCreator_showSaveAsWorldInfo',
  ) as HTMLInputElement;
  if (showSaveAsWorldInfoCheckbox) {
    showSaveAsWorldInfoCheckbox.checked = settings.showSaveAsWorldInfoEntry.show;
    showSaveAsWorldInfoCheckbox.addEventListener('change', () => {
      settings.showSaveAsWorldInfoEntry.show = showSaveAsWorldInfoCheckbox.checked;
      settingsManager.saveSettings();
    });
  }

  // Reset Everything Button
  const resetEverythingButton = settingsContainer.querySelector('#charCreator_resetEverything') as HTMLButtonElement;
  resetEverythingButton.addEventListener('click', async () => {
    const confirm = await globalContext.Popup.show.confirm(
      'Reset Everything',
      'Are you sure? This will reset all settings to default and clear your data in popup. This cannot be undone. This is a destructive action.',
    );
    if (confirm) {
      // Clear active session
      sessionService.resetSession();

      // Reset all settings to default
      settingsManager.resetSettings();

      setTimeout(() => {
        st_echo('success', 'Everything has been reset to default. Please reload the page.');
      }, 1500);
    }
  });
}

async function handlePopupUI() {
  const iconHtml = `<div class="menu_button fa-solid fa-user-astronaut interactable charCreator-icon" title="Character Creator"></div>`;

  const buttonsContainer = document.getElementById('rm_buttons_container') ?? document.getElementById('form_character_search_form');
  if (buttonsContainer) {
    $(buttonsContainer).prepend(iconHtml);
  }
  $('.form_create_bottom_buttons_block').prepend(iconHtml);
  $('#GroupFavDelOkBack').prepend(iconHtml); // Add to group management too if needed

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

      const popupCloseButton = document.querySelector('.popup-button-close') as HTMLElement;
      if (!popupCloseButton) return;
      popupCloseButton.style.right = '0px';
      popupCloseButton.style.top = '5px';

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
      const includePersonaCheckbox = popupContainer.querySelector('#charCreator_includePersona') as HTMLInputElement;
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
      includePersonaCheckbox.checked = settings.contextToSend.persona;
      includeCharsCheckbox.checked = settings.contextToSend.charCard;
      includeExistingFieldsCheckbox.checked = settings.contextToSend.existingFields;
      includeWorldInfoCheckbox.checked = settings.contextToSend.worldInfo;

      const dontSendOtherGreetingsCheckbox = popupContainer.querySelector(
        '#charCreator_dontSendOtherGreetings',
      ) as HTMLInputElement;
      dontSendOtherGreetingsCheckbox.checked = settings.contextToSend.dontSendOtherGreetings;

      includeCharsContainer.style.display = includeCharsCheckbox.checked ? 'block' : 'none';
      includeWorldInfoContainer.style.display = includeWorldInfoCheckbox.checked ? 'block' : 'none';

      stDescriptionCheckbox.addEventListener('change', () => {
        settings.contextToSend.stDescription = stDescriptionCheckbox.checked;
        settingsManager.saveSettings();
      });
      includePersonaCheckbox.addEventListener('change', () => {
        settings.contextToSend.persona = includePersonaCheckbox.checked;
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

      dontSendOtherGreetingsCheckbox.addEventListener('change', () => {
        settings.contextToSend.dontSendOtherGreetings = dontSendOtherGreetingsCheckbox.checked;
        settingsManager.saveSettings();
      });

      // Message Options Setup
      const messageOptionsContainer = popupContainer.querySelector('.message-options') as HTMLDivElement;
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
      if (this_chid === undefined && !selected_group) {
        messageOptionsContainer.style.display = 'none';
      }

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
      const sessionService = SessionService.getInstance();
      const activeSession = sessionService.getSession();
      const saveSession = () => {
        // Session is automatically saved by sessionService, no need for manual save
      };

      const context = SillyTavern.getContext();

      activeSession.selectedCharacterIndexes = activeSession.selectedCharacterIndexes.filter(
        (chid) => context.characters[Number(chid)],
      );

      // "Characters to Include" Dropdown
      const charSelectorContainer = popupContainer.querySelector('#charCreator_characterSelector');
      if (charSelectorContainer) {
        const characterItems: DropdownItem[] = context.characters.map((char: Character) => ({
          value: context.characters.indexOf(char).toString(),
          label: char.name,
        }));

        const characterSelector = buildFancyDropdown('#charCreator_characterSelector', {
          initialList: characterItems,
          initialValues: activeSession.selectedCharacterIndexes,
          placeholderText: 'Select characters...',
          enableSearch: characterItems.length > 10,
          onSelectChange: (_previousValues: string[], newValues: string[]) => {
            sessionService.updateSession({ selectedCharacterIndexes: newValues });
          },
        });
        const includeCharsClearButton = popupContainer.querySelector(
          '#charCreator_clear-includeChars-button',
        ) as HTMLInputElement;
        includeCharsClearButton.addEventListener('click', () => {
          characterSelector.deselectAll();
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
            placeholderText: 'Select lorebooks...',
            enableSearch: allWorldNames.length > 10,
            onSelectChange: (_previousValues: string[], newValues: string[]) => {
              sessionService.updateSession({ selectedWorldNames: newValues });
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
        name: { label: CHARACTER_LABELS.name, rows: 1, large: false, promptEnabled: false },
        description: { label: CHARACTER_LABELS.description, rows: 5, large: true, promptEnabled: true },
        personality: { label: CHARACTER_LABELS.personality, rows: 4, large: true, promptEnabled: true },
        scenario: { label: CHARACTER_LABELS.scenario, rows: 3, large: true, promptEnabled: true },
        first_mes: { label: CHARACTER_LABELS.first_mes, rows: 3, large: true, promptEnabled: true },
        mes_example: { label: CHARACTER_LABELS.mes_example, rows: 6, large: true, promptEnabled: true },
      };

      // Get template and container
      const coreFieldTemplate = popupContainer.querySelector('#charCreator_coreFieldTemplate') as HTMLTemplateElement;
      const draftFieldTemplate = popupContainer.querySelector('#charCreator_draftFieldTemplate') as HTMLTemplateElement;
      const coreFieldsContainer = popupContainer.querySelector('#charCreator_coreFieldsContainer') as HTMLDivElement;
      const draftFieldsList = popupContainer.querySelector('#charCreator_draftFieldsList') as HTMLDivElement;
      const tabButtons = popupContainer.querySelectorAll('.tab-button');
      const tabContents = popupContainer.querySelectorAll('.tab-content');
      const addDraftFieldButton = popupContainer.querySelector('#charCreator_addDraftField') as HTMLButtonElement;
      const exportDraftFieldsButton = popupContainer.querySelector(
        '#charCreator_exportDraftFields',
      ) as HTMLButtonElement;
      const importDraftFieldsButton = popupContainer.querySelector(
        '#charCreator_importDraftFields',
      ) as HTMLButtonElement;

      // Initialize storage for field elements
      // @ts-ignore
      const coreFieldElements: Record<
        CharacterFieldName,
        {
          textarea: HTMLTextAreaElement;
          button: HTMLButtonElement;
          continueButton: HTMLButtonElement;
          promptTextarea?: HTMLTextAreaElement;
          clearButton?: HTMLButtonElement;
        }
      > = {};

      // --- Tab Switching Logic ---
      const setActiveTab = (targetTabId: string) => {
        tabButtons.forEach((button) => {
          button.classList.toggle('active', button.getAttribute('data-tab') === targetTabId);
        });
        tabContents.forEach((content) => {
          content.classList.toggle('active', content.id === targetTabId);
        });
        const isDraft = targetTabId === 'charCreator_draftFieldsContainer';
        addDraftFieldButton.style.display = isDraft ? 'block' : 'none';
        exportDraftFieldsButton.style.display = isDraft ? 'block' : 'none';
        importDraftFieldsButton.style.display = isDraft ? 'block' : 'none';

        // Load chat UI when chat tab is clicked
        if (targetTabId === 'charCreator_chatContainer') {
          const chatContainer = document.querySelector('#charCreator_chatContainer');
          if (chatContainer && !chatContainer.querySelector('#chat_container')) {
            loadChatUI();
          }
        }
      };

      tabButtons.forEach((button) => {
        button.addEventListener('click', () => {
          const targetTabId = button.getAttribute('data-tab');
          if (targetTabId) {
            setActiveTab(targetTabId);
          }
        });
      });

      setActiveTab('charCreator_coreFieldsContainer');

      // Function to get sorted alternate greeting field names
      const getAlternateGreetingFieldNames = (): string[] => {
        return Object.keys(activeSession.fields)
          .filter((key) => key.startsWith('alternate_greetings_'))
          .sort((a, b) => {
            const indexA = parseInt(a.split('_')[2] || '1');
            const indexB = parseInt(b.split('_')[2] || '1');
            return indexA - indexB;
          });
      };

      // Function to render the alternate greetings UI within the core fields container
      let activeTabIndex = 0;
      const renderAlternateGreetingsUI = (parentElement: HTMLElement) => {
        const agTemplate = popupContainer.querySelector(
          '#charCreator_alternateGreetingTabContentTemplate',
        ) as HTMLTemplateElement;
        const tabButtonContainer = parentElement.querySelector('.alternate-greetings-tabs') as HTMLDivElement;
        const contentArea = parentElement.querySelector('.alternate-greetings-content-area') as HTMLDivElement;
        const placeholder = parentElement.querySelector('.no-greetings-placeholder') as HTMLParagraphElement;
        const addButton = parentElement.querySelector('.add-alternate-greeting-button') as HTMLButtonElement;
        const deleteButton = parentElement.querySelector('.delete-alternate-greeting-button') as HTMLButtonElement;
        const sideButtonContainer = parentElement.querySelector('.field-container > div:last-child');
        const generateButton = sideButtonContainer?.querySelector(
          '.generate-alternate-greeting-button',
        ) as HTMLButtonElement;
        const continueButton = sideButtonContainer?.querySelector(
          '.continue-alternate-greeting-button',
        ) as HTMLButtonElement;
        const compareButton = sideButtonContainer?.querySelector(
          '.compare-alternate-greeting-button',
        ) as HTMLButtonElement;
        const clearButton = sideButtonContainer?.querySelector('.clear-alternate-greeting-button') as HTMLButtonElement;

        tabButtonContainer.innerHTML = '';
        contentArea.innerHTML = '';

        const greetingFieldNames = getAlternateGreetingFieldNames();

        const switchTab = (index: number) => {
          activeTabIndex = index;
          tabButtonContainer.querySelectorAll('.alternate-greeting-tab-button').forEach((btn, i) => {
            btn.classList.toggle('active', i === index);
          });
          contentArea.querySelectorAll('.alternate-greeting-tab-content').forEach((contentDiv, i) => {
            (contentDiv as HTMLElement).style.display = i === index ? 'block' : 'none';
          });
          const hasGreetings = greetingFieldNames.length > 0;
          generateButton.disabled = !hasGreetings;
          continueButton.disabled = !hasGreetings;
          compareButton.disabled = !hasGreetings;
          clearButton.disabled = !hasGreetings;
          deleteButton.disabled = !hasGreetings; // Enable/disable delete button
        };

        if (greetingFieldNames.length === 0) {
          placeholder.style.display = 'block';
          contentArea.style.display = 'none';
          generateButton.disabled = true;
          clearButton.disabled = true;
          deleteButton.disabled = true;
        } else {
          placeholder.style.display = 'none';
          contentArea.style.display = 'block';

          greetingFieldNames.forEach((fieldName, index) => {
            const greetingField = activeSession.fields[fieldName];
            if (!greetingField) return; // Should not happen, but safety check

            // Create Tab Button
            const tabButton = document.createElement('button');
            tabButton.className = 'menu_button alternate-greeting-tab-button';
            const displayNumber = parseInt(fieldName.split('_')[2]) || 1;
            tabButton.textContent = `Greeting ${displayNumber}`;
            tabButton.dataset.index = index.toString();
            tabButton.addEventListener('click', () => switchTab(index));
            tabButtonContainer.appendChild(tabButton);

            // Create Tab Content
            const contentClone = agTemplate.content.cloneNode(true) as DocumentFragment;
            const valueTextarea = contentClone.querySelector('.alternate-greeting-textarea') as HTMLTextAreaElement;
            const promptTextarea = contentClone.querySelector(
              '.alternate-greeting-prompt-textarea',
            ) as HTMLTextAreaElement;

            valueTextarea.value = greetingField.value ?? '';
            promptTextarea.value = greetingField.prompt ?? '';
            valueTextarea.rows = 8;

            // Add change listener for value textarea
            valueTextarea.addEventListener('change', () => {
              sessionService.updateField(fieldName, { value: valueTextarea.value });
            });

            // Add change listener for prompt textarea
            promptTextarea.addEventListener('change', () => {
              sessionService.updateField(fieldName, { prompt: promptTextarea.value });
            });

            contentArea.appendChild(contentClone);
          });

          // Initial tab state
          switchTab(0);
        }

        // --- Setup Control Buttons ---
        const newAddButton = addButton.cloneNode(true) as HTMLButtonElement;
        addButton.parentNode?.replaceChild(newAddButton, addButton);
        const newDeleteButton = deleteButton.cloneNode(true) as HTMLButtonElement;
        deleteButton.parentNode?.replaceChild(newDeleteButton, deleteButton);
        const newGenerateButton = generateButton.cloneNode(true) as HTMLButtonElement;
        generateButton.parentNode?.replaceChild(newGenerateButton, generateButton);
        const newContinueButton = continueButton.cloneNode(true) as HTMLButtonElement;
        continueButton.parentNode?.replaceChild(newContinueButton, continueButton);
        const newCompareButton = compareButton.cloneNode(true) as HTMLButtonElement;
        compareButton.parentNode?.replaceChild(newCompareButton, compareButton);
        const newClearButton = clearButton.cloneNode(true) as HTMLButtonElement;
        clearButton.parentNode?.replaceChild(newClearButton, clearButton);

        // Add Button Listener
        newAddButton.addEventListener('click', () => {
          const nextNumber = greetingFieldNames.length + 1;
          const newFieldName = `alternate_greetings_${nextNumber}`;
          sessionService.updateField(newFieldName, { prompt: '', value: '', label: `Alternate Greeting ${nextNumber}` });
          renderAlternateGreetingsUI(parentElement); // Re-render
          switchTab(greetingFieldNames.length);
        });

        // Delete Button Listener
        newDeleteButton.addEventListener('click', async () => {
          if (activeTabIndex < 0 || activeTabIndex >= greetingFieldNames.length) return;

          const fieldNameToDelete = greetingFieldNames[activeTabIndex];
          const confirm = await globalContext.Popup.show.confirm(
            'Delete Greeting',
            `Are you sure you want to delete Greeting ${activeTabIndex + 1}? This cannot be undone.`,
          );
          if (confirm) {
            // Get current session to work with
            const currentSession = sessionService.getSession();
            delete currentSession.fields[fieldNameToDelete];
            
            // Re-index subsequent greetings
            const subsequentFieldNames = greetingFieldNames.slice(activeTabIndex + 1);
            subsequentFieldNames.forEach((oldName, i) => {
              const newNumber = activeTabIndex + i + 1;
              const newName = `alternate_greetings_${newNumber}`;
              if (oldName !== newName) {
                currentSession.fields[newName] = currentSession.fields[oldName];
                currentSession.fields[newName].label = `Alternate Greeting ${newNumber}`;
                delete currentSession.fields[oldName];
              }
            });

            // Update the session with all changes
            sessionService.updateSession({ fields: currentSession.fields });
            renderAlternateGreetingsUI(parentElement); // Re-render
            // Adjust active tab if the last one was deleted
            const newFieldNames = getAlternateGreetingFieldNames();
            if (newFieldNames.length > 0) {
              switchTab(Math.min(activeTabIndex, newFieldNames.length - 1));
            }
          }
        });

        // Generate Button Listener
        newGenerateButton.addEventListener('click', () => {
          if (activeTabIndex < 0 || activeTabIndex >= greetingFieldNames.length) return;
          const targetFieldName = greetingFieldNames[activeTabIndex];
          const contentDiv = contentArea.querySelectorAll('.alternate-greeting-tab-content')[activeTabIndex];
          const textarea = contentDiv?.querySelector('.alternate-greeting-textarea') as HTMLTextAreaElement | null;

          UIHelpers.handleFieldGeneration({
            targetField: targetFieldName,
            button: newGenerateButton,
            textarea: textarea!,
            isDraft: false,
          });
        });

        // Continue Button Listener
        newContinueButton.addEventListener('click', () => {
          if (activeTabIndex < 0 || activeTabIndex >= greetingFieldNames.length) return;
          const targetFieldName = greetingFieldNames[activeTabIndex];
          const contentDiv = contentArea.querySelectorAll('.alternate-greeting-tab-content')[activeTabIndex];
          const textarea = contentDiv?.querySelector('.alternate-greeting-textarea') as HTMLTextAreaElement | null;

          if (!textarea?.value.trim()) {
            st_echo('warning', 'No content to continue from');
            return;
          }

          UIHelpers.handleFieldGeneration({
            targetField: targetFieldName,
            button: newContinueButton,
            textarea: textarea!,
            isDraft: false,
            continueFrom: textarea.value,
          });
        });

        // Compare Button Listener
        newCompareButton.addEventListener('click', () => {
          if (activeTabIndex < 0 || activeTabIndex >= greetingFieldNames.length) return;
          const targetFieldName = greetingFieldNames[activeTabIndex];
          const contentDiv = contentArea.querySelectorAll('.alternate-greeting-tab-content')[activeTabIndex];
          const textarea = contentDiv?.querySelector('.alternate-greeting-textarea') as HTMLTextAreaElement | null;

          if (!textarea?.value.trim()) {
            st_echo('warning', 'No content to compare');
            return;
          }

          // Find loaded character content for the current alternate greeting
          const selectedId = loadCharDropdown?.getValues()?.[0];
          if (!selectedId) {
            st_echo('warning', 'Please select a character first to compare against.');
            return;
          }

          const character = context.characters[parseInt(selectedId)];
          if (!character) {
            st_echo('warning', 'Selected character not found.');
            return;
          }

          const characterGreetings = character.data?.alternate_greetings ?? [];
          const characterValue = characterGreetings[activeTabIndex] ?? '';

          UIHelpers.handleFieldComparison(targetFieldName, textarea.value, characterValue);
        });

        // Clear Button Listener
        newClearButton.addEventListener('click', () => {
          if (activeTabIndex < 0 || activeTabIndex >= greetingFieldNames.length) return;
          const targetFieldName = greetingFieldNames[activeTabIndex];
          const contentDiv = contentArea.querySelectorAll('.alternate-greeting-tab-content')[activeTabIndex];
          const valueTextarea = contentDiv?.querySelector('.alternate-greeting-textarea') as HTMLTextAreaElement | null;
          const promptTextarea = contentDiv?.querySelector(
            '.alternate-greeting-prompt-textarea',
          ) as HTMLTextAreaElement | null;

          if (activeSession.fields[targetFieldName]) {
            valueTextarea!.value = '';
            sessionService.updateField(targetFieldName, { value: '' });
          }
        });
      };

      // Generate core fields from template
      CHARACTER_FIELDS.forEach((fieldName) => {
        // Type guard to ensure fieldName is a key of fieldConfigs
        if (!(fieldName in fieldConfigs)) {
          console.warn(`Skipping unknown core field: ${fieldName}`);
          return;
        }
        const config = fieldConfigs[fieldName as keyof typeof fieldConfigs];
        const clone = coreFieldTemplate.content.cloneNode(true) as DocumentFragment;

        // Configure the cloned elements
        const label = clone.querySelector('label') as HTMLLabelElement;
        const textarea = clone.querySelector('.field-value-textarea') as HTMLTextAreaElement;
        const button = clone.querySelector('.generate-field-button') as HTMLButtonElement;
        const continueButton = clone.querySelector('.continue-field-button') as HTMLButtonElement;
        const clearButton = clone.querySelector('.clear-field-button') as HTMLButtonElement;
        const promptTextarea = clone.querySelector('.field-prompt-textarea') as HTMLTextAreaElement;

        // Set IDs and attributes
        textarea.id = `charCreator_field_${fieldName}`;
        promptTextarea.id = `charCreator_prompt_${fieldName}`;
        label.textContent = config.label;
        label.htmlFor = textarea.id; // Set label 'for' attribute

        // Set content
        textarea.rows = config.rows;

        const fieldData = activeSession.fields[fieldName];
        textarea.value = fieldData?.value ?? '';
        button.dataset.field = fieldName;
        button.title = `Generate ${config.label}`;
        promptTextarea.placeholder = `Enter additional prompt for ${config.label.toLowerCase()}...`;
        promptTextarea.value = fieldData?.prompt ?? '';

        if (!config.promptEnabled) {
          promptTextarea.closest('.field-prompt-container')?.remove();
        }

        if (config.large) {
          textarea.closest('.field-container')?.classList.add('large-field');
        }

        // Event listener for clear button (Core Fields)
        clearButton?.addEventListener('click', () => {
          textarea.value = '';
          textarea.dispatchEvent(new Event('change')); // Trigger change to update session
        });

        // Store references
        coreFieldElements[fieldName] = {
          textarea,
          button,
          continueButton,
          promptTextarea,
          clearButton,
        };

        coreFieldsContainer.appendChild(clone);
      });

      // --- Render Alternate Greetings using its template ---
      const agTemplateElement = popupContainer.querySelector(
        '#charCreator_alternateGreetingsTemplate',
      ) as HTMLTemplateElement;
      const agContent = agTemplateElement.content.cloneNode(true) as DocumentFragment;
      const agFieldElement = agContent.querySelector('.alternate-greetings-field') as HTMLElement;
      coreFieldsContainer.appendChild(agContent); // Append the whole template content
      renderAlternateGreetingsUI(agFieldElement); // Initialize UI logic within the appended element

      // --- Render Draft Fields ---
      const renderDraftField = (fieldName: string, fieldData: CharacterField) => {
        if (!draftFieldTemplate || !draftFieldsList) return;

        const clone = draftFieldTemplate.content.cloneNode(true) as DocumentFragment;
        const fieldDiv = clone.querySelector('.character-field') as HTMLElement;
        const label = clone.querySelector('label') as HTMLLabelElement;
        const textarea = clone.querySelector('.field-value-textarea') as HTMLTextAreaElement;
        const promptTextarea = clone.querySelector('.field-prompt-textarea') as HTMLTextAreaElement;
        const deleteButton = clone.querySelector('.delete-draft-field-button') as HTMLButtonElement;
        const generateButton = clone.querySelector('.generate-field-button') as HTMLButtonElement;
        const continueButton = clone.querySelector('.continue-field-button') as HTMLButtonElement;
        const clearButton = clone.querySelector('.clear-field-button') as HTMLButtonElement;

        fieldDiv.dataset.draftFieldName = fieldName;
        label.textContent = fieldData.label; // Use the key as the label for now
        label.htmlFor = `charCreator_draft_field_${fieldName}`;
        textarea.id = `charCreator_draft_field_${fieldName}`;
        textarea.value = fieldData.value ?? '';
        promptTextarea.value = fieldData.prompt ?? '';
        promptTextarea.id = `charCreator_draft_prompt_${fieldName}`;
        promptTextarea.placeholder = `Enter additional prompt for ${fieldData.label}...`;
        deleteButton.dataset.draftFieldName = fieldName;
        generateButton.dataset.field = fieldName;

        clearButton.dataset.draftFieldName = fieldName;
        // Event listener for value change using UIHelpers
        textarea.addEventListener('change', UIHelpers.createTextChangeHandler(fieldName, true));

        // Event listener for prompt change using UIHelpers
        promptTextarea.addEventListener('change', UIHelpers.createPromptChangeHandler(fieldName, true));

        // Event listener for clear button (Draft Fields)
        clearButton.addEventListener('click', () => {
          textarea.value = ''; // Clear the textarea visually
          sessionService.updateDraftField(fieldName, { value: '' });
        });

        // Event listener for delete button
        deleteButton.addEventListener('click', async () => {
          const confirm = await UIHelpers.showConfirmation(
            'Delete Draft Field',
            `Are you sure you want to delete the draft field "${fieldData.label}"? This cannot be undone.`,
          );
          if (confirm) {
            sessionService.deleteDraftField(fieldName);
            fieldDiv.remove();
          }
        });

        // Generate button click handler
        generateButton.addEventListener('click', () => {
          UIHelpers.handleFieldGeneration({
            targetField: fieldName,
            button: generateButton,
            textarea,
            isDraft: true,
          });
        });

        // Continue button click handler
        continueButton.addEventListener('click', () => {
          if (!textarea.value.trim()) {
            st_echo('warning', 'No content to continue from');
            return;
          }
          UIHelpers.handleFieldGeneration({
            targetField: fieldName,
            button: continueButton,
            textarea,
            isDraft: true,
            continueFrom: textarea.value,
          });
        });

        draftFieldsList.appendChild(clone);
      };

      const renderAllDraftFields = () => {
        if (!draftFieldsList) return;
        draftFieldsList.innerHTML = ''; // Clear existing draft fields
        Object.entries(activeSession.draftFields || {}).forEach(([name, data]) => {
          renderDraftField(name, data);
        });
      };

      // Initial rendering of draft fields
      renderAllDraftFields();

      // --- Export/Import Draft Fields Logic ---
      exportDraftFieldsButton?.addEventListener('click', () => {
        const characterController = CharacterController.getInstance();
        characterController.exportDraftFields();
      });

      importDraftFieldsButton?.addEventListener('click', async () => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';

        input.addEventListener('change', async () => {
          const file = input.files?.[0];
          if (!file) return;

          try {
            const characterController = CharacterController.getInstance();
            await characterController.importDraftFields(file);
            renderAllDraftFields();
          } catch (error: any) {
            st_echo('error', `Failed to import draft fields: ${error.message}`);
          }
        });

        input.click();
      });

      // --- Add Draft Field Button Logic ---
      if (addDraftFieldButton) {
        addDraftFieldButton.addEventListener('click', async () => {
          const fieldNameInput = await UIHelpers.showInput('Enter Draft Field Name', '');
          if (!fieldNameInput || !fieldNameInput.trim()) {
            return;
          }
          const fieldName = convertToVariableName(fieldNameInput.trim()); // Sanitize name
          if (!fieldName) {
            st_echo('error', 'Invalid field name provided.');
            return;
          }

          if (activeSession.draftFields[fieldName] || CHARACTER_LABELS[fieldName as CharacterFieldName]) {
            st_echo('warning', `Field name "${fieldName}" already exists.`);
            return;
          }

          // Add the new draft field
          sessionService.updateDraftField(fieldName, { value: '', prompt: '', label: fieldNameInput });
          const updatedSession = sessionService.getSession();
          renderDraftField(fieldName, updatedSession.draftFields[fieldName]);
        });
      }

      let loadCharDropdown: ReturnType<typeof buildFancyDropdown> | null = null;

      // --- Button Actions ---
      // Setup Load Character Dropdown
      const loadCharSelectorContainer = popupContainer.querySelector('#charCreator_loadCharSelector');
      if (loadCharSelectorContainer) {
        const characterItems: DropdownItem[] = context.characters.map((char: Character) => ({
          value: context.characters.indexOf(char).toString(),
          label: char.name,
        }));

        // Find the character index that matches the stored avatar
        const initialCharacterIndex = activeSession.lastLoadedCharacterId
          ? context.characters.findIndex((char: Character) => char.avatar === activeSession.lastLoadedCharacterId)
          : -1;
        const initialValues = initialCharacterIndex >= 0 ? [initialCharacterIndex.toString()] : [];

        loadCharDropdown = buildFancyDropdown('#charCreator_loadCharSelector', {
          initialList: characterItems,
          initialValues: initialValues,
          placeholderText: 'Load Character Data...',
          enableSearch: characterItems.length > 10,
          multiple: false,
          closeOnSelect: true,
          async onBeforeSelection(_currentValues, proposedValues) {
            if (proposedValues.length === 0) return false;
            const selectedId = proposedValues[0];
            if (selectedId.length === 0) return false;

            const allFieldEmpty = CHARACTER_FIELDS.every((fieldName) => {
              const textarea = coreFieldElements[fieldName]?.textarea;
              return textarea && textarea.value.trim() === '';
            });

            if (!allFieldEmpty) {
              const confirm = await globalContext.Popup.show.confirm(
                'Load Character Data',
                'Are you sure you want to overwrite existing data? This cannot be undone.',
              );
              if (!confirm) return false;
            }

            return true;
          },
          onSelectChange: async (_previousValues: string[], newValues: string[]) => {
            if (newValues.length === 0) return;
            const selectedId = newValues[0];
            if (selectedId.length === 0) return;

            try {
              const characterController = CharacterController.getInstance();
              await characterController.loadCharacter(selectedId);

              // Update UI with loaded data
              const updatedSession = sessionService.getSession();
              
              // Update core field textareas
              CHARACTER_FIELDS.forEach((fieldName) => {
                const elements = coreFieldElements[fieldName];
                if (elements) {
                  const textarea = elements.textarea;
                  const promptTextarea = elements.promptTextarea;
                  const fieldData = updatedSession.fields[fieldName];

                  if (textarea && fieldData) {
                    textarea.value = fieldData.value || '';
                  }
                  if (promptTextarea && fieldData) {
                    promptTextarea.value = fieldData.prompt || '';
                  }
                }
              });

              // Re-render the alternate greetings UI
              const agFieldElement = coreFieldsContainer?.querySelector(
                '.alternate-greetings-field',
              ) as HTMLElement | null;
              if (agFieldElement) {
                renderAlternateGreetingsUI(agFieldElement);
              }
            } catch (error: any) {
              st_echo('error', `Failed to load character: ${error.message}`);
            }
          },
        });
      }

      const resetButton = popupContainer.querySelector('#charCreator_reset') as HTMLButtonElement;
      resetButton.addEventListener('click', async () => {
        const confirm = await UIHelpers.showConfirmation(
          'Reset Fields',
          'Are you sure? This will reset core fields and remove draft fields. This cannot be undone.',
        );
        if (confirm) {
          try {
            const characterController = CharacterController.getInstance();
            await characterController.resetFields();

            // Update UI with reset data
            CHARACTER_FIELDS.forEach((fieldName) => {
              const elements = coreFieldElements[fieldName];
              if (elements) {
                if (elements.textarea) {
                  elements.textarea.value = '';
                }
                if (elements.promptTextarea) {
                  elements.promptTextarea.value = '';
                }
              }
            });

            // Re-render the alternate greetings UI (will show empty state)
            const agFieldElement = coreFieldsContainer?.querySelector('.alternate-greetings-field') as HTMLElement | null;
            if (agFieldElement) {
              renderAlternateGreetingsUI(agFieldElement);
            }

            // Reset load character selector
            loadCharDropdown!.deselectAll();

            // Re-render draft fields (will be empty)
            renderAllDraftFields();
          } catch (error: any) {
            st_echo('error', `Failed to reset fields: ${error.message}`);
          }
        }
      });

      const loadCurrentCharacterButton = popupContainer.querySelector(
        '#charCreator_loadCurrentCharacter',
      ) as HTMLButtonElement;
      loadCurrentCharacterButton.addEventListener('click', async () => {
        try {
          // Check if a character is currently selected
          if (this_chid === undefined || this_chid === null || this_chid === '') {
            st_echo('error', 'No character is currently selected in SillyTavern.');
            return;
          }

          // Find the character in the characters array
          const context = globalContext;
          const characterIndex = parseInt(this_chid.toString());
          const character = context.characters[characterIndex];
          
          if (!character) {
            st_echo('error', 'Current character not found.');
            return;
          }

          // Show confirmation
          const confirm = await UIHelpers.showConfirmation(
            'Load Current Character',
            `Load data from "${character.name}"? This will replace any existing field content.`
          );
          if (!confirm) return;

          const characterController = CharacterController.getInstance();
          await characterController.loadCharacter(this_chid.toString());

          // Update UI with loaded data
          const updatedSession = sessionService.getSession();
          
          // Update core field textareas
          CHARACTER_FIELDS.forEach((fieldName) => {
            const elements = coreFieldElements[fieldName];
            if (elements) {
              const textarea = elements.textarea;
              const promptTextarea = elements.promptTextarea;
              const fieldData = updatedSession.fields[fieldName];

              if (textarea && fieldData) {
                textarea.value = fieldData.value || '';
              }
              if (promptTextarea && fieldData) {
                promptTextarea.value = fieldData.prompt || '';
              }
            }
          });

          // Re-render the alternate greetings UI
          const agFieldElement = coreFieldsContainer?.querySelector(
            '.alternate-greetings-field',
          ) as HTMLElement | null;
          if (agFieldElement) {
            renderAlternateGreetingsUI(agFieldElement);
          }

          // Update the load character dropdown to show the loaded character
          if (loadCharDropdown) {
            loadCharDropdown.setValues([this_chid.toString()]);
          }

          st_echo('success', `Successfully loaded character "${character.name}"`);
        } catch (error: any) {
          st_echo('error', `Failed to load current character: ${error.message}`);
        }
      });

      const saveAsNewCharacterButton = popupContainer.querySelector(
        '#charCreator_saveAsNewCharacter',
      ) as HTMLButtonElement;
      saveAsNewCharacterButton.addEventListener('click', async () => {
        const confirm = await UIHelpers.showConfirmation('Save as New Character', `Are you sure?`);
        if (!confirm) return;
        
        try {
          const characterController = CharacterController.getInstance();
          await characterController.saveCharacter({ asNew: true });
        } catch (error: any) {
          st_echo('error', `Failed to create character: ${error.message}`);
        }
      });

      const overrideCharacterButton = popupContainer.querySelector(
        '#charCreator_overrideCharacter',
      ) as HTMLButtonElement;
      overrideCharacterButton.addEventListener('click', async () => {
        const selectedId = loadCharDropdown?.getValues()?.[0];
        if (!selectedId) {
          st_echo('warning', 'Please load a character first to override.');
          return;
        }

        const characterToOverride = context.characters[parseInt(selectedId)];
        if (!characterToOverride) {
          st_echo('warning', 'Selected character not found for override.');
          return;
        }

        const confirm = await UIHelpers.showConfirmation(
          'Override Character',
          `Are you sure you want to override "${characterToOverride.name}"? This cannot be undone.`,
        );
        if (!confirm) return;

        try {
          const characterController = CharacterController.getInstance();
          await characterController.saveCharacter({ asNew: false, selectedCharacterId: selectedId });
        } catch (error: any) {
          st_echo('error', `Failed to override character: ${error.message}`);
        }
      });

      const saveAsWorldInfoEntrySelector = popupContainer.querySelector(
        '#charCreator_saveAsWorldInfoSelector',
      ) as HTMLSelectElement;

      // Hide the selector if the feature is disabled in settings
      if (!settings.showSaveAsWorldInfoEntry.show) {
        saveAsWorldInfoEntrySelector.style.display = 'none';
      } else {
        const { close } = buildFancyDropdown(saveAsWorldInfoEntrySelector, {
          placeholderText: 'Save as World Info Entry',
          initialList: world_names,
          closeOnSelect: true,
          multiple: false,
          enableSearch: true,
          async onBeforeSelection(_currentValues, proposedValues) {
            if (proposedValues.length === 0) return false;

            const selectedWorldName = proposedValues[0];
            
            try {
              const characterController = CharacterController.getInstance();
              await characterController.saveAsWorldInfo({ selectedWorldName });
            } catch (error: any) {
              st_echo('error', `Failed to create world info entry: ${error.message}`);
            }

            close();
            return false;
          },
        });
      }

      // --- Field Generation Logic is now handled by UIHelpers ---

      // --- Field Comparison Logic is now handled by UIHelpers ---

      // Setup core field event listeners
      Object.entries(coreFieldElements).forEach(([fieldName, { textarea, button, continueButton, promptTextarea }]) => {
        const compareButton = textarea
          .closest('.field-container')
          ?.querySelector('.compare-field-button') as HTMLButtonElement;

        // Compare button click handler using UIHelpers
        if (compareButton) {
          compareButton.addEventListener('click', async () => {
            const selectedCharIndex = loadCharDropdown?.getValues()?.[0];
            const characterValue = selectedCharIndex
              ? context.characters[parseInt(selectedCharIndex)]?.[fieldName as CharacterFieldName] ??
                context.characters[parseInt(selectedCharIndex)]?.data?.[fieldName] ?? ''
              : '';
            
            await UIHelpers.handleFieldComparison(fieldName, textarea.value, characterValue);
          });
        }

        // Continue button click handler
        if (continueButton) {
          continueButton.addEventListener('click', () => {
            if (!textarea.value.trim()) {
              st_echo('warning', 'No content to continue from');
              return;
            }
            UIHelpers.handleFieldGeneration({
              targetField: fieldName as CharacterFieldName,
              button: continueButton,
              textarea,
              continueFrom: textarea.value,
              isDraft: false,
            });
          });
        }
        if (button) {
          button.addEventListener('click', () => {
            UIHelpers.handleFieldGeneration({
              targetField: fieldName as CharacterFieldName,
              button,
              textarea,
              isDraft: false,
            });
          });

          // Text area change listener using UIHelpers
          textarea.addEventListener('change', UIHelpers.createTextChangeHandler(fieldName, false));

          // Prompt text area change listener using UIHelpers
          if (promptTextarea) {
            promptTextarea.addEventListener('change', UIHelpers.createPromptChangeHandler(fieldName, false));
          }
        }
      });
    });
  });
}

function importCheck(): boolean {
  if (!globalContext.ConnectionManagerRequestService) return false;
  return true;
}

function main() {
  handleSettingsUI();
  handlePopupUI();
  initializeChat();
}

if (!importCheck()) {
  st_echo('error', `[${extensionName}] Make sure ST is updated.`);
} else {
  initializeSettings().then(() => {
    main();
  });
}