import { eventSource, saveSettingsDebounced } from '../../../../script.js';

import { simpleSend } from './scripts/simpleSend.js';
import { recoverInput } from './scripts/inputRecovery.js';
import { guidedResponse } from './scripts/guidedResponse.js';
import { guidedSwipe } from './scripts/guidedSwipe.js';
import { guidedContinue, undoLastGuidedAddition, revertToOriginalGuidedContinue, initGuidedContinueListeners } from './scripts/guidedContinue.js';
import { guidedImpersonate } from './scripts/guidedImpersonate.js';
import { guidedImpersonate2nd } from './scripts/guidedImpersonate2nd.js';
import { guidedImpersonate3rd } from './scripts/guidedImpersonate3rd.js';
import { getContext, extension_settings, renderExtensionTemplateAsync } from '../../../extensions.js';
import { getPresetManager } from '../../../../scripts/preset-manager.js';
import { loadSettingsPanel } from './scripts/settingsPanel.js';
import { getProfileList } from './scripts/persistentGuides/guideExports.js';
import { initDrawer, teardownDrawer, isDrawerActive, applyDrawerTheme } from './scripts/ui/drawer.js';
import { addCustomPrompt, updateCustomPrompt, deleteCustomPrompt, executeCustomPrompt, renderCustomPromptButtons } from './scripts/customPrompts.js';

export const extensionName = 'GuidedGenerations-Extension';

let isSending = false;
let debugMessages = [];

function captureDebugMessage(level, ...args) {
    if (extension_settings[extensionName]?.debugMode) {
        const timestamp = new Date().toISOString();
        const stack = new Error().stack;
        let fileInfo = 'Unknown';
        let lineInfo = 'Unknown';
        if (stack) {
            const stackLines = stack.split('\n');
            for (let i = 1; i < stackLines.length; i++) {
                const line = stackLines[i];
                if (line && !line.includes('captureDebugMessage') && !line.includes('debugLog') && !line.includes('debugWarn')) {
                    const match = line.match(/\((.+):(\d+):(\d+)\)/) || line.match(/at (.+):(\d+):(\d+)/);
                    if (match) {
                        fileInfo = match[1].split('/').pop() || match[1].split('\\').pop() || match[1];
                        lineInfo = match[2];
                        break;
                    }
                }
            }
        }
        debugMessages.push({
            timestamp, level, file: fileInfo, line: lineInfo,
            args: args.map(arg => {
                if (typeof arg === 'object' && arg !== null) {
                    try { return JSON.stringify(arg, null, 2); } catch { return String(arg); }
                }
                return String(arg);
            }),
        });
        if (debugMessages.length > 1000) debugMessages = debugMessages.slice(-1000);
    }
}

export function debugLog(...args) {
    if (extension_settings[extensionName]?.debugMode) {
        captureDebugMessage('log', ...args);
        console.log(`[${extensionName}][DEBUG]`, ...args);
    }
}
export function debugWarn(...args) {
    if (extension_settings[extensionName]?.debugMode) {
        captureDebugMessage('warn', ...args);
        console.warn(`[${extensionName}][DEBUG]`, ...args);
    }
}
export function debugError(...args) {
    if (extension_settings[extensionName]?.debugMode) {
        captureDebugMessage('error', ...args);
        console.error(`[${extensionName}][DEBUG]`, ...args);
    }
}
export function getDebugMessages() { return [...debugMessages]; }
export function clearDebugMessages() { debugMessages = []; }
export function getDebugMessagesAsText() {
    return debugMessages.map(msg => {
        const level = msg.level.toUpperCase().padEnd(5);
        const fileLine = `${msg.file}:${msg.line}`.padEnd(20);
        return `[${msg.timestamp}] ${level} [${fileLine}] ${msg.args.join(' ')}`;
    }).join('\n');
}

// Shared state for impersonation input recovery
let previousImpersonateInput = '';
let lastImpersonateResult = '';
export function getPreviousImpersonateInput() { return previousImpersonateInput; }
export function setPreviousImpersonateInput(value) { previousImpersonateInput = value; }
export function getLastImpersonateResult() { return lastImpersonateResult; }
export function setLastImpersonateResult(value) { lastImpersonateResult = value; }

export function isGroupChat() {
    try {
        const context = getContext();
        return !!context.groupId;
    } catch (error) {
        console.error(`${extensionName}: Error checking group chat status:`, error);
        return false;
    }
}

export const defaultSettings = {
    showImpersonate1stPerson: true,
    showImpersonate2ndPerson: false,
    showImpersonate3rdPerson: false,
    showGuidedContinue: false,
    showGuidedResponse: true,
    showGuidedSwipe: true,
    showSimpleSendButton: false,
    showRecoverInputButton: false,
    showEditIntrosButton: false,
    showClearInputButton: false,
    showUndoButton: false,
    showRevertButton: false,
    integrateQrBar: true,
    debugMode: false,
    injectionEndRole: 'system',
    // Profile/preset for kept features
    profileEditIntros: '',
    presetEditIntros: '',
    profileEditIntrosApiType: '',
    profileImpersonate1st: '',
    presetImpersonate1st: '',
    profileImpersonate1stApiType: '',
    profileImpersonate2nd: '',
    presetImpersonate2nd: '',
    profileImpersonate2ndApiType: '',
    profileImpersonate3rd: '',
    presetImpersonate3rd: '',
    profileImpersonate3rdApiType: '',
    // Prompt overrides
    promptImpersonate1st: 'Write in first Person perspective from {{user}}. {{input}}',
    promptImpersonate2nd: 'Write in second Person perspective from {{user}}, using you/yours for {{user}}. {{input}}',
    promptImpersonate3rd: 'Write in third Person perspective from {{user}} using third-person pronouns for {{user}}. {{input}}',
    promptGuidedResponse: '[Take the following into special consideration for your next message: {{input}}]',
    promptGuidedSwipe: '[Take the following into special consideration for your next message: {{input}}]',
    promptGuidedContinue: '[Continue the story based on the following input: {{input}}]',
    depthPromptGuidedResponse: 0,
    depthPromptGuidedSwipe: 0,
    // Drawer settings
    enableDrawer: false,
    drawerIcon: 'fa-solid fa-heart',
    drawerIconSize: 1.15,
    drawerBubbleSize: 58,
    drawerPanelWidth: 76,
    drawerButtonSize: 46,
    drawerEnablePulse: true,
    drawerBgGradient: 'linear-gradient(180deg, rgba(72,22,58,0.96), rgba(39,12,31,0.98))',
    drawerBorderColor: '#ff69b4',
    drawerAccentColor: '#ffd1e8',
    drawerGlowColor: '#ff1493',
    drawerImpersonateColor: '#ffd1e8',
    drawerResponseColor: '#7c6dfa',
    drawerSwipeColor: '#4da6ff',
    drawerContinueColor: '#4caf7d',
    drawerPositionTop: '22vh',
    drawerPositionRight: 18,
    drawerCssOverrides: '',
    drawerResetCommand: true,
    customPrompts: [],
    LastPatchNoteVersion: '2.0.0',
};

async function loadSettings() {
    extension_settings[extensionName] = extension_settings[extensionName] || {};
    if (Object.keys(extension_settings[extensionName]).length === 0) {
        Object.assign(extension_settings[extensionName], defaultSettings);
    } else {
        for (const key in defaultSettings) {
            if (extension_settings[extensionName][key] === undefined) {
                extension_settings[extensionName][key] = defaultSettings[key];
            }
        }
    }
    const debugStatus = extension_settings[extensionName]?.debugMode ? 'ACTIVE' : 'INACTIVE';
    console.log(`${extensionName}: Debug logging is ${debugStatus}`);
}

async function updateSettingsUI() {
    const settingsPanelId = `extension_settings_${extensionName}`;
    const container = document.getElementById(settingsPanelId);
    if (!container) return;

    // Update checkboxes
    document.querySelectorAll('.gg-setting-input[type="checkbox"]').forEach(checkbox => {
        const settingName = checkbox.name;
        if (settingName in extension_settings[extensionName]) {
            checkbox.checked = extension_settings[extensionName][settingName];
        }
    });

    // Update injection role dropdown
    const injectionRoleSelect = document.getElementById('gg_injectionEndRole');
    if (injectionRoleSelect && extension_settings[extensionName].injectionEndRole) {
        injectionRoleSelect.value = extension_settings[extensionName].injectionEndRole;
    }

    // Populate profile dropdowns
    try {
        const profileList = await getProfileList();
        const profileKeys = ['profileEditIntros', 'profileImpersonate1st', 'profileImpersonate2nd', 'profileImpersonate3rd'];
        profileKeys.forEach(key => {
            const select = document.getElementById(key);
            if (select) {
                select.innerHTML = '<option value="">None</option>';
                if (Array.isArray(profileList) && profileList.length > 0) {
                    profileList.forEach(profileName => {
                        const option = document.createElement('option');
                        option.value = profileName;
                        option.textContent = profileName;
                        select.appendChild(option);
                    });
                }
                select.value = extension_settings[extensionName][key] ?? defaultSettings[key] ?? '';
            }
        });
    } catch (error) {
        console.error(`[${extensionName}] Error populating profile dropdowns:`, error);
    }

    // Populate preset dropdowns
    ['presetEditIntros', 'presetImpersonate1st', 'presetImpersonate2nd', 'presetImpersonate3rd'].forEach(async (key) => {
        const select = document.getElementById(key);
        if (select) {
            await populatePresetDropdown(select);
            select.value = extension_settings[extensionName][key] ?? defaultSettings[key] ?? '';
        }
    });

    // Populate prompt override textareas
    ['promptImpersonate1st', 'promptImpersonate2nd', 'promptImpersonate3rd', 'promptGuidedResponse', 'promptGuidedSwipe', 'promptGuidedContinue'].forEach(key => {
        const textarea = document.getElementById(`gg_${key}`);
        if (textarea) {
            textarea.value = extension_settings[extensionName][key] ?? defaultSettings[key] ?? '';
        }
    });

    // Populate depth inputs
    ['depthPromptGuidedResponse', 'depthPromptGuidedSwipe'].forEach(key => {
        const input = document.getElementById(`gg_${key}`);
        if (input) {
            input.value = extension_settings[extensionName][key] ?? defaultSettings[key] ?? 0;
        }
    });

    // Populate drawer settings (text + number + color inputs + textareas)
    const drawerTextKeys = ['drawerIcon', 'drawerPositionTop'];
    const drawerNumberKeys = ['drawerIconSize', 'drawerBubbleSize', 'drawerPanelWidth', 'drawerButtonSize', 'drawerPositionRight'];
    const drawerTextareaKeys = ['drawerBgGradient', 'drawerCssOverrides'];
    const drawerColorKeys = ['drawerAccentColor', 'drawerBorderColor', 'drawerGlowColor', 'drawerImpersonateColor', 'drawerResponseColor', 'drawerSwipeColor', 'drawerContinueColor'];

    [...drawerTextKeys, ...drawerNumberKeys, ...drawerColorKeys].forEach(key => {
        const input = document.getElementById(`gg_${key}`);
        if (input) {
            input.value = extension_settings[extensionName][key] ?? defaultSettings[key] ?? '';
        }
    });

    drawerTextareaKeys.forEach(key => {
        const textarea = document.getElementById(`gg_${key}`);
        if (textarea) {
            textarea.value = extension_settings[extensionName][key] ?? defaultSettings[key] ?? '';
        }
    });
}

const addSettingsEventListeners = () => {
    const containerId = `extension_settings_${extensionName}`;
    const settingsContainer = document.getElementById(containerId);
    if (settingsContainer) {
        settingsContainer.removeEventListener('change', handleSettingsChangeDelegated);
        settingsContainer.addEventListener('change', handleSettingsChangeDelegated);
    }

    // Add Custom Prompt button
    const addBtn = document.getElementById('gg_add_custom_prompt');
    if (addBtn && !addBtn.dataset.bound) {
        addBtn.dataset.bound = 'true';
        addBtn.addEventListener('click', () => {
            addCustomPrompt();
            renderCustomPromptsList();
            updateExtensionButtons();
        });
    }

    renderCustomPromptsList();
};

// ─── Custom Prompts CRUD UI ─────────────────────────────────────

function moveCustomPrompt(id, direction) {
    const prompts = extension_settings[extensionName]?.customPrompts ?? [];
    const idx = prompts.findIndex(p => p.id === id);
    if (idx === -1) return;

    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= prompts.length) return;

    // Swap
    [prompts[idx], prompts[newIdx]] = [prompts[newIdx], prompts[idx]];
    extension_settings[extensionName].customPrompts = prompts;

    renderCustomPromptsList();
    updateExtensionButtons();
}

function renderCustomPromptsList() {
    const container = document.getElementById('gg_custom_prompts_list');
    if (!container) return;

    const prompts = extension_settings[extensionName]?.customPrompts ?? [];
    container.innerHTML = '';

    if (prompts.length === 0) {
        container.innerHTML = '<small style="opacity: 0.6;">No custom prompts yet.</small>';
        return;
    }

    for (const prompt of prompts) {
        const card = document.createElement('div');
        card.className = 'gg-custom-prompt-card';
        card.style.cssText = 'border: 1px solid var(--SmartThemeBorderColor, rgba(128,128,128,0.3)); border-radius: 6px; padding: 8px; margin-bottom: 6px; background: var(--SmartThemeBodyBgColor, var(--SmartThemeBg));';

        // Header row: icon + name + toggle + delete
        const header = document.createElement('div');
        header.style.cssText = 'display: flex; align-items: center; gap: 8px; cursor: pointer;';

        const iconPreview = document.createElement('i');
        iconPreview.className = prompt.icon || 'fa-solid fa-star';
        iconPreview.style.cssText = 'width: 20px; text-align: center;';

        const nameSpan = document.createElement('span');
        nameSpan.textContent = prompt.name || 'Untitled';
        nameSpan.style.cssText = 'flex: 1; font-weight: 500;';

        const typeTag = document.createElement('small');
        typeTag.textContent = prompt.type;
        typeTag.style.cssText = 'opacity: 0.5; font-size: 0.8em;';

        const toggle = document.createElement('input');
        toggle.type = 'checkbox';
        toggle.checked = prompt.enabled;
        toggle.title = 'Enable/disable this prompt';
        toggle.addEventListener('change', () => {
            updateCustomPrompt(prompt.id, { enabled: toggle.checked });
            updateExtensionButtons();
        });

        const deleteBtn = document.createElement('i');
        deleteBtn.className = 'fa-solid fa-trash interactable';
        deleteBtn.style.cssText = 'cursor: pointer; opacity: 0.6; color: var(--SmartThemeBodyColor);';
        deleteBtn.title = 'Delete this prompt';
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            deleteCustomPrompt(prompt.id);
            renderCustomPromptsList();
            updateExtensionButtons();
        });

        const moveUpBtn = document.createElement('i');
        moveUpBtn.className = 'fa-solid fa-chevron-up interactable';
        moveUpBtn.style.cssText = 'cursor: pointer; opacity: 0.6; color: var(--SmartThemeBodyColor);';
        moveUpBtn.title = 'Move up';
        moveUpBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moveCustomPrompt(prompt.id, -1);
        });

        const moveDownBtn = document.createElement('i');
        moveDownBtn.className = 'fa-solid fa-chevron-down interactable';
        moveDownBtn.style.cssText = 'cursor: pointer; opacity: 0.6; color: var(--SmartThemeBodyColor);';
        moveDownBtn.title = 'Move down';
        moveDownBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            moveCustomPrompt(prompt.id, 1);
        });

        header.append(moveUpBtn, moveDownBtn, iconPreview, nameSpan, typeTag, toggle, deleteBtn);

        // Expandable details
        const details = document.createElement('div');
        details.style.cssText = 'display: none; margin-top: 8px;';

        header.addEventListener('click', () => {
            details.style.display = details.style.display === 'none' ? 'block' : 'none';
        });

        details.innerHTML = `
            <div style="display: flex; gap: 6px; margin-bottom: 6px;">
                <div style="flex: 1;">
                    <small>Name</small>
                    <input type="text" class="text_pole gg-cp-field" data-id="${prompt.id}" data-field="name" value="${prompt.name || ''}" style="width: 100%;">
                </div>
                <div style="width: 140px;">
                    <small>Icon (FA class)</small>
                    <input type="text" class="text_pole gg-cp-field" data-id="${prompt.id}" data-field="icon" value="${prompt.icon || ''}" style="width: 100%;" placeholder="fa-solid fa-star">
                </div>
            </div>
            <div style="margin-bottom: 6px;">
                <small>Type</small>
                <select class="text_pole gg-cp-field gg-cp-type-select" data-id="${prompt.id}" data-field="type" style="width: 100%;">
                    <option value="impersonate" ${prompt.type === 'impersonate' ? 'selected' : ''}>Impersonate</option>
                    <option value="guided-response" ${prompt.type === 'guided-response' ? 'selected' : ''}>Guided Response</option>
                    <option value="guided-swipe" ${prompt.type === 'guided-swipe' ? 'selected' : ''}>Guided Swipe</option>
                    <option value="guided-continue" ${prompt.type === 'guided-continue' ? 'selected' : ''}>Guided Continue</option>
                </select>
            </div>
            <div style="margin-bottom: 6px;">
                <small>Prompt Template</small>
                <textarea class="text_pole gg-cp-field" data-id="${prompt.id}" data-field="prompt" rows="3" style="width: 100%; font-family: monospace; font-size: 12px;">${prompt.prompt || ''}</textarea>
            </div>
            <div style="display: flex; gap: 6px; margin-bottom: 6px;">
                <div style="width: 70px;">
                    <small>Depth</small>
                    <input type="number" class="text_pole gg-cp-field" data-id="${prompt.id}" data-field="depth" value="${prompt.depth ?? 0}" min="0" style="width: 100%;">
                </div>
                <div style="flex: 1;">
                    <small>Role</small>
                    <select class="text_pole gg-cp-field" data-id="${prompt.id}" data-field="role" style="width: 100%;">
                        <option value="" ${!prompt.role ? 'selected' : ''}>Global default</option>
                        <option value="system" ${prompt.role === 'system' ? 'selected' : ''}>system</option>
                        <option value="user" ${prompt.role === 'user' ? 'selected' : ''}>user</option>
                        <option value="assistant" ${prompt.role === 'assistant' ? 'selected' : ''}>assistant</option>
                    </select>
                </div>
            </div>
            <div class="gg-cp-profile-preset-row" style="display: ${prompt.type === 'impersonate' ? 'flex' : 'none'}; gap: 6px;">
                <div style="flex: 1;">
                    <small>Connection Profile</small>
                    <select class="text_pole gg-cp-field gg-cp-profile" data-id="${prompt.id}" data-field="connectionProfile" style="width: 100%;">
                        <option value="">Global default</option>
                    </select>
                </div>
                <div style="flex: 1;">
                    <small>Preset</small>
                    <select class="text_pole gg-cp-field gg-cp-preset" data-id="${prompt.id}" data-field="preset" style="width: 100%;">
                        <option value="">Global default</option>
                    </select>
                </div>
            </div>
            <div class="gg-cp-skipwi-row" style="display: ${prompt.type === 'impersonate' ? 'flex' : 'none'}; align-items: center; gap: 8px; margin-top: 4px;">
                <input type="checkbox" class="gg-cp-field" data-id="${prompt.id}" data-field="skipWorldInfo" ${prompt.skipWorldInfo ? 'checked' : ''} />
                <small>Skip World Info activation (faster, no WI entries injected)</small>
            </div>
        `;

        // Type change: show/hide profile/preset row and skip WI row
        const typeSelect = details.querySelector('.gg-cp-type-select');
        const profilePresetRow = details.querySelector('.gg-cp-profile-preset-row');
        const skipWIRow = details.querySelector('.gg-cp-skipwi-row');
        if (typeSelect) {
            typeSelect.addEventListener('change', () => {
                const isImpersonate = typeSelect.value === 'impersonate';
                if (profilePresetRow) profilePresetRow.style.display = isImpersonate ? 'flex' : 'none';
                if (skipWIRow) skipWIRow.style.display = isImpersonate ? 'flex' : 'none';
            });
        }

        // Bind change events on detail fields
        details.addEventListener('change', (e) => {
            const field = e.target.dataset?.field;
            const id = e.target.dataset?.id;
            if (!field || !id) return;

            let value;
            if (e.target.type === 'checkbox') {
                value = e.target.checked;
            } else if (e.target.type === 'number') {
                value = parseInt(e.target.value) || 0;
            } else {
                value = e.target.value.trim();
            }

            updateCustomPrompt(id, { [field]: value });

            // Update header preview
            if (field === 'name') nameSpan.textContent = value || 'Untitled';
            if (field === 'icon') iconPreview.className = value || 'fa-solid fa-star';
            if (field === 'type') typeTag.textContent = value;

            updateExtensionButtons();
        });

        // Real-time icon preview on input
        details.addEventListener('input', (e) => {
            if (e.target.dataset?.field === 'icon') {
                iconPreview.className = e.target.value.trim() || 'fa-solid fa-star';
            }
        });

        card.append(header, details);
        container.appendChild(card);

        // Populate profile dropdown asynchronously
        populateCustomPromptDropdowns(prompt.id, details);
    }
}

async function populateCustomPromptDropdowns(promptId, detailsEl) {
    try {
        const profileSelect = detailsEl.querySelector('.gg-cp-profile');
        const presetSelect = detailsEl.querySelector('.gg-cp-preset');

        if (profileSelect) {
            const { getProfileList } = await import('./scripts/persistentGuides/guideExports.js');
            const profiles = await getProfileList();
            if (Array.isArray(profiles)) {
                for (const name of profiles) {
                    const opt = document.createElement('option');
                    opt.value = name;
                    opt.textContent = name;
                    profileSelect.appendChild(opt);
                }
            }
            const current = extension_settings[extensionName]?.customPrompts?.find(p => p.id === promptId);
            if (current?.connectionProfile) profileSelect.value = current.connectionProfile;
        }

        if (presetSelect) {
            await populatePresetDropdown(presetSelect);
            const current = extension_settings[extensionName]?.customPrompts?.find(p => p.id === promptId);
            if (current?.preset) presetSelect.value = current.preset;
        }
    } catch (error) {
        console.error(`[GuidedGenerations] Error populating custom prompt dropdowns:`, error);
    }
}

const handleSettingsChangeDelegated = async (event) => {
    if (event.target.classList.contains('gg-setting-input')) {
        handleSettingChange(event);
        if (event.target.name && event.target.name.startsWith('profile')) {
            const guideName = event.target.name.replace('profile', '');
            const presetSelect = document.getElementById(`preset${guideName}`);
            if (presetSelect) {
                const selectedProfile = event.target.value;
                if (selectedProfile && selectedProfile.trim() !== '') {
                    const { getProfileApiType } = await import('./scripts/persistentGuides/guideExports.js');
                    const apiType = await getProfileApiType(selectedProfile);
                    if (apiType) {
                        extension_settings[extensionName][`${event.target.name}ApiType`] = apiType;
                    }
                }
                await handleProfileChangeForPresets(selectedProfile, presetSelect);
            }
        }
    }
};

function handleSettingChange(event) {
    const target = event.target;
    const settingName = target.name;
    if (!settingName) return;
    let settingValue;

    if (target.type === 'checkbox') {
        settingValue = target.checked;
    } else if (target.tagName === 'SELECT') {
        settingValue = target.value.trim();
    } else if (target.tagName === 'INPUT' && target.type === 'text') {
        settingValue = target.value.trim().replace(/\r?\n/g, '\n');
    } else if (target.tagName === 'INPUT' && target.type === 'color') {
        settingValue = target.value;
    } else if (target.tagName === 'TEXTAREA') {
        settingValue = target.value.trim().replace(/\r?\n/g, '\n');
    } else if (target.type === 'number') {
        const numValue = parseFloat(target.value);
        settingValue = isNaN(numValue) ? 0 : numValue;
    } else {
        return;
    }

    if (extension_settings[extensionName]) {
        extension_settings[extensionName][settingName] = settingValue;
        saveSettingsDebounced();
        updateExtensionButtons();
    }
}

async function handleProfileChangeForPresets(selectedProfile, presetDropdown) {
    try {
        presetDropdown.innerHTML = '';
        if (!selectedProfile || selectedProfile.trim() === '') {
            await populatePresetDropdown(presetDropdown);
            return;
        }
        const { getProfileApiType, getPresetsForApiType } = await import('./scripts/persistentGuides/guideExports.js');
        const apiType = await getProfileApiType(selectedProfile);
        if (!apiType) {
            await populatePresetDropdown(presetDropdown);
            return;
        }
        const presetList = await getPresetsForApiType(apiType);
        if (!presetList) {
            await populatePresetDropdown(presetDropdown);
            return;
        }
        await populatePresetDropdownWithList(presetDropdown, presetList);
    } catch (error) {
        console.error(`[${extensionName}] Error handling profile change for presets:`, error);
        await populatePresetDropdown(presetDropdown);
    }
}

function populatePresetDropdownWithList(presetSelect, presetList) {
    presetSelect.innerHTML = '<option value="">None</option>';
    if (!presetList) return;
    if (presetList.preset_names) {
        const presetNames = presetList.preset_names;
        if (Array.isArray(presetNames)) {
            presetNames.forEach((name) => {
                const option = document.createElement('option');
                option.value = name;
                option.textContent = name;
                presetSelect.appendChild(option);
            });
        } else {
            Object.entries(presetNames).forEach(([name, id]) => {
                const option = document.createElement('option');
                option.value = id;
                option.textContent = name;
                presetSelect.appendChild(option);
            });
        }
    } else if (Array.isArray(presetList)) {
        presetList.forEach(preset => {
            if (preset.name && preset.id !== undefined) {
                const option = document.createElement('option');
                option.value = preset.id;
                option.textContent = preset.name;
                presetSelect.appendChild(option);
            }
        });
    }
}

function updateExtensionButtons() {
    const settings = extension_settings[extensionName];
    if (!settings) return;

    const sendForm = document.getElementById('send_form');
    const nonQRFormItems = document.getElementById('nonQRFormItems');
    if (!sendForm || !nonQRFormItems) return;

    // Get or create the action button container
    let buttonContainer = document.getElementById('gg-action-button-container');
    if (!buttonContainer) {
        buttonContainer = document.createElement('div');
        buttonContainer.id = 'gg-action-button-container';
        buttonContainer.className = 'gg-action-buttons-container';
        nonQRFormItems.parentNode.insertBefore(buttonContainer, nonQRFormItems.nextSibling);
    }
    buttonContainer.innerHTML = '';

    const menuButtonsContainer = document.createElement('div');
    menuButtonsContainer.id = 'gg-menu-buttons-container';
    menuButtonsContainer.className = 'gg-menu-buttons-container';

    const actionButtonsContainer = document.createElement('div');
    actionButtonsContainer.id = 'gg-regular-buttons-container';
    actionButtonsContainer.className = 'gg-regular-buttons-container';

    const qrContainer = document.createElement('div');
    qrContainer.id = 'gg-qr-container';
    qrContainer.className = 'gg-qr-container';

    buttonContainer.appendChild(menuButtonsContainer);
    buttonContainer.appendChild(qrContainer);
    buttonContainer.appendChild(actionButtonsContainer);

    // --- GG Tools Menu Button ---
    let ggMenuButton = document.getElementById('gg_menu_button');
    if (!ggMenuButton) {
        ggMenuButton = document.createElement('div');
        ggMenuButton.id = 'gg_menu_button';
        ggMenuButton.className = 'gg-menu-button fa-solid fa-bookmark';
        ggMenuButton.classList.add('interactable');
        ggMenuButton.title = 'Guided Generations Tools';

        const ggToolsMenu = document.createElement('div');
        ggToolsMenu.id = 'gg_tools_menu';
        ggToolsMenu.className = 'gg-tools-menu';

        // Simple Send
        const simpleSendMenuItem = document.createElement('a');
        simpleSendMenuItem.href = '#';
        simpleSendMenuItem.className = 'interactable';
        simpleSendMenuItem.innerHTML = '<i class="fa-solid fa-paper-plane fa-fw"></i><span data-i18n="Simple Send">Simple Send</span>';
        simpleSendMenuItem.title = 'Sends the current input directly without triggering a response.';
        simpleSendMenuItem.addEventListener('click', (event) => { simpleSend(); ggToolsMenu.classList.remove('shown'); event.stopPropagation(); });

        // Recover Input
        const recoverInputMenuItem = document.createElement('a');
        recoverInputMenuItem.href = '#';
        recoverInputMenuItem.className = 'interactable';
        recoverInputMenuItem.innerHTML = '<i class="fa-solid fa-arrow-rotate-left fa-fw"></i><span data-i18n="Recover Input">Recover Input</span>';
        recoverInputMenuItem.title = 'Restores your previously typed input.';
        recoverInputMenuItem.addEventListener('click', (event) => { recoverInput(); ggToolsMenu.classList.remove('shown'); event.stopPropagation(); });

        // Edit Intros
        const editIntrosMenuItem = document.createElement('a');
        editIntrosMenuItem.href = '#';
        editIntrosMenuItem.className = 'interactable';
        editIntrosMenuItem.innerHTML = '<i class="fa-solid fa-user-edit fa-fw"></i><span data-i18n="Edit Intros">Edit Intros</span>';
        editIntrosMenuItem.title = 'Opens a popup to edit or regenerate character introductions.';
        editIntrosMenuItem.addEventListener('click', async (event) => {
            const editIntros = await import('./scripts/tools/editIntros.js');
            await editIntros.default();
            ggToolsMenu.classList.remove('shown');
            event.stopPropagation();
        });

        // Clear Input
        const clearInputMenuItem = document.createElement('a');
        clearInputMenuItem.href = '#';
        clearInputMenuItem.className = 'interactable';
        clearInputMenuItem.innerHTML = '<i class="fa-solid fa-trash fa-fw"></i><span data-i18n="Clear Input">Clear Input</span>';
        clearInputMenuItem.addEventListener('click', async (event) => {
            const clearInput = await import('./scripts/tools/clearInput.js');
            await clearInput.default();
            ggToolsMenu.classList.remove('shown');
            event.stopPropagation();
        });

        // Undo Last Addition
        const undoMenuItem = document.createElement('a');
        undoMenuItem.href = '#';
        undoMenuItem.className = 'interactable';
        undoMenuItem.innerHTML = '<i class="fa-solid fa-rotate-left fa-fw"></i><span data-i18n="Undo Last Addition">Undo Last Addition</span>';
        undoMenuItem.title = 'Removes the last segment added by a guided continue action.';
        undoMenuItem.addEventListener('click', (event) => {
            if (window.GuidedGenerations && typeof window.GuidedGenerations.undoLastGuidedAddition === 'function') {
                window.GuidedGenerations.undoLastGuidedAddition();
            }
            ggToolsMenu.classList.remove('shown');
            event.stopPropagation();
        });

        // Revert to Original
        const revertMenuItem = document.createElement('a');
        revertMenuItem.href = '#';
        revertMenuItem.className = 'interactable';
        revertMenuItem.innerHTML = '<i class="fa-solid fa-history fa-fw"></i><span data-i18n="Revert to Original">Revert to Original</span>';
        revertMenuItem.title = 'Restores the message to its state before any guided continues.';
        revertMenuItem.addEventListener('click', (event) => {
            if (window.GuidedGenerations && typeof window.GuidedGenerations.revertToOriginalGuidedContinue === 'function') {
                window.GuidedGenerations.revertToOriginalGuidedContinue();
            }
            ggToolsMenu.classList.remove('shown');
            event.stopPropagation();
        });

        // Help
        const helpMenuItem = document.createElement('a');
        helpMenuItem.href = '#';
        helpMenuItem.className = 'interactable';
        helpMenuItem.innerHTML = '<i class="fa-solid fa-question-circle fa-fw"></i><span data-i18n="Help">Help</span>';
        helpMenuItem.title = 'Opens the extension wiki.';
        helpMenuItem.addEventListener('click', (event) => {
            window.open('https://github.com/Samueras/GuidedGenerations-Extension/wiki', '_blank');
            ggToolsMenu.classList.remove('shown');
            event.stopPropagation();
        });

        // Assemble menu
        ggToolsMenu.appendChild(simpleSendMenuItem);
        ggToolsMenu.appendChild(recoverInputMenuItem);
        const separator = document.createElement('hr');
        separator.className = 'pg-separator';
        ggToolsMenu.appendChild(separator);
        ggToolsMenu.appendChild(undoMenuItem);
        ggToolsMenu.appendChild(revertMenuItem);
        const separator2 = document.createElement('hr');
        separator2.className = 'pg-separator';
        ggToolsMenu.appendChild(separator2);
        ggToolsMenu.appendChild(editIntrosMenuItem);
        ggToolsMenu.appendChild(clearInputMenuItem);
        ggToolsMenu.appendChild(helpMenuItem);

        document.body.appendChild(ggToolsMenu);

        ggMenuButton.addEventListener('click', (event) => {
            ggToolsMenu.style.visibility = 'hidden';
            ggToolsMenu.style.display = 'block';
            const menuHeight = ggToolsMenu.offsetHeight;
            ggToolsMenu.style.display = '';
            ggToolsMenu.style.visibility = '';
            const buttonRect = ggMenuButton.getBoundingClientRect();
            const gap = 5;
            const targetMenuBottomY = buttonRect.top - gap + window.scrollY;
            const targetMenuTopY = targetMenuBottomY - menuHeight;
            const targetMenuLeftX = buttonRect.left + window.scrollX;
            ggToolsMenu.style.top = `${targetMenuTopY}px`;
            ggToolsMenu.style.left = `${targetMenuLeftX}px`;
            ggToolsMenu.classList.toggle('shown');
            event.stopPropagation();
        });

        document.addEventListener('click', (event) => {
            if (ggToolsMenu.classList.contains('shown') && !ggMenuButton.contains(event.target)) {
                ggToolsMenu.classList.remove('shown');
            }
        });
    }
    menuButtonsContainer.appendChild(ggMenuButton);

    // --- Action Buttons ---
    const createActionButton = (id, title, iconClass, actionFunc) => {
        const button = document.createElement('div');
        button.id = id;
        button.className = 'gg-action-button';
        if (iconClass) {
            iconClass.split(' ').forEach(cls => { if (cls) button.classList.add(cls); });
        }
        button.classList.add('interactable');
        button.title = title;
        button.addEventListener('click', (event) => { actionFunc(event); });
        return button;
    };

    const regularButtons = [];

    if (settings.showSimpleSendButton) {
        regularButtons.push(createActionButton('gg_simple_send_button', 'Simple Send', 'fa-solid fa-paper-plane', simpleSend));
    }
    if (settings.showRecoverInputButton) {
        regularButtons.push(createActionButton('gg_recover_input_button', 'Recover Input', 'fa-solid fa-arrow-rotate-left', recoverInput));
    }
    if (settings.showEditIntrosButton) {
        regularButtons.push(createActionButton('gg_edit_intros_button', 'Edit Intros', 'fa-solid fa-user-edit', async () => {
            const editIntros = await import('./scripts/tools/editIntros.js');
            await editIntros.default();
        }));
    }
    if (settings.showClearInputButton) {
        regularButtons.push(createActionButton('gg_clear_input_button', 'Clear Input', 'fa-solid fa-trash', async () => {
            const clearInput = await import('./scripts/tools/clearInput.js');
            await clearInput.default();
        }));
    }
    if (settings.showImpersonate1stPerson) {
        regularButtons.push(createActionButton('gg_impersonate_button', 'Guided Impersonate (1st Person)', 'fa-solid fa-user', guidedImpersonate));
    }
    if (settings.showImpersonate2ndPerson) {
        regularButtons.push(createActionButton('gg_impersonate_button_2nd', 'Guided Impersonate (2nd Person)', 'fa-solid fa-user-group', guidedImpersonate2nd));
    }
    if (settings.showImpersonate3rdPerson) {
        regularButtons.push(createActionButton('gg_impersonate_button_3rd', 'Guided Impersonate (3rd Person)', 'fa-solid fa-users', guidedImpersonate3rd));
    }
    if (settings.showGuidedSwipe) {
        regularButtons.push(createActionButton('gg_swipe_button', 'Guided Swipe', 'fa-solid fa-forward', guidedSwipe));
    }
    if (settings.showGuidedResponse) {
        regularButtons.push(createActionButton('gg_response_button', 'Guided Response', 'fa-solid fa-dog', guidedResponse));
    }
    if (settings.showGuidedContinue) {
        regularButtons.push(createActionButton('gg_continue_button', 'Guided Continue', 'fa-solid fa-arrow-right', guidedContinue));
    }
    if (settings.showUndoButton) {
        regularButtons.push(createActionButton('gg_undo_button', 'Undo Last Addition', 'fa-solid fa-rotate-left', undoLastGuidedAddition));
    }
    if (settings.showRevertButton) {
        regularButtons.push(createActionButton('gg_revert_button', 'Revert to Original', 'fa-solid fa-history', revertToOriginalGuidedContinue));
    }

    regularButtons.forEach(button => { actionButtonsContainer.appendChild(button); });

    // Custom guided prompt buttons
    const customButtons = renderCustomPromptButtons();
    if (customButtons.childNodes.length > 0) {
        actionButtonsContainer.appendChild(customButtons);
    }

    integrateQRBar();

    // Drawer mode: move buttons into floating drawer, or restore to input box
    if (settings.enableDrawer) {
        initDrawer(settings);
    } else if (isDrawerActive()) {
        teardownDrawer();
    }
}

// QR Bar integration
function integrateQRBar() {
    const qrBar = document.getElementById('qr--bar');
    const qrContainer = document.getElementById('gg-qr-container');
    const sendForm = document.getElementById('send_form');
    if (!qrBar || !qrContainer) return false;
    const currentSettings = extension_settings[extensionName];
    if (!currentSettings) return false;
    if (currentSettings.integrateQrBar) {
        if (qrBar.parentElement !== qrContainer) {
            try { qrContainer.appendChild(qrBar); } catch (error) { return false; }
        }
    } else {
        if (qrBar.parentElement === qrContainer && sendForm) {
            try { sendForm.appendChild(qrBar); } catch (error) { return false; }
        }
    }
    return true;
}

function startQRBarIntegration() {
    let integrated = integrateQRBar();
    if (!integrated) {
        const interval = setInterval(() => {
            integrated = integrateQRBar();
            if (integrated) clearInterval(interval);
        }, 1000);
        setTimeout(() => { if (!integrated) clearInterval(interval); }, 30000);
    }
}

function setupQRMutationObserver() {
    const integrationTimer = setInterval(() => {
        integrateQRBar();
        setTimeout(() => { clearInterval(integrationTimer); }, 30000);
    }, 1000);
    setTimeout(() => {
        const observer = new MutationObserver((mutations) => {
            const shouldTry = mutations.some(mutation => {
                if (mutation.addedNodes.length) {
                    return Array.from(mutation.addedNodes).some(node => {
                        if (node.id === 'qr--bar') return true;
                        if (node.querySelector && node.querySelector('#qr--bar')) return true;
                        return false;
                    });
                }
                return false;
            });
            if (shouldTry) integrateQRBar();
        });
        observer.observe(document.body, { childList: true, subtree: true });
    }, 1000);
}

// Preset installation
async function installPreset() {
    const presetFileName = 'GGSytemPrompt.json';
    const presetName = presetFileName.replace(/\.json$/i, '');
    const presetApiId = 'openai';
    const presetPath = `scripts/extensions/third-party/${extensionName}/${presetFileName}`;
    try {
        const response = await fetch(presetPath);
        if (!response.ok) return;
        const presetData = await response.json();
        if (!presetData || typeof presetData !== 'object' || !Array.isArray(presetData.prompts) || presetData.prompts.length === 0) return;
        const presetManager = getPresetManager(presetApiId);
        if (!presetManager) return;
        const existingPreset = presetManager.findPreset(presetName);
        if (existingPreset === undefined || existingPreset === null) {
            await presetManager.savePreset(presetName, presetData);
        }
    } catch (error) {
        console.error(`${extensionName}: Error during preset installation:`, error);
    }
}

// Profile/preset helpers
async function populatePresetDropdown(presetDropdown) {
    try {
        const guideName = presetDropdown.id.replace('preset', '');
        const profileFieldName = `profile${guideName}`;
        const selectedProfile = extension_settings[extensionName]?.[profileFieldName];
        if (selectedProfile && selectedProfile.trim() !== '') {
            const { getProfileApiType, getPresetsForApiType } = await import('./scripts/persistentGuides/guideExports.js');
            const apiType = await getProfileApiType(selectedProfile);
            if (apiType) {
                const presetList = await getPresetsForApiType(apiType);
                if (presetList) {
                    await populatePresetDropdownWithList(presetDropdown, presetList);
                    return;
                }
            }
        }
        const context = getContext();
        const presetManager = context?.getPresetManager?.();
        if (presetManager) {
            const presetList = presetManager.getPresetList();
            await populatePresetDropdownWithList(presetDropdown, presetList);
        }
    } catch (error) {
        console.error(`[${extensionName}] Error populating preset dropdown:`, error);
    }
}

// Version check
async function checkVersionAndNotify() {
    if (!extension_settings[extensionName]) return;
    const currentVersionInSettings = extension_settings[extensionName].LastPatchNoteVersion;
    const defaultVersion = defaultSettings.LastPatchNoteVersion;
    if (!currentVersionInSettings || currentVersionInSettings < defaultVersion) {
        extension_settings[extensionName].LastPatchNoteVersion = defaultVersion;
        await saveSettingsDebounced();
    }
}

// Setup
async function setup() {
    loadSettings();
    try {
        const { initializeEventListeners } = await import('./scripts/utils/presetUtils.js');
        initializeEventListeners();
    } catch (error) {
        console.warn(`${extensionName}: Could not initialize event listeners:`, error);
    }
    updateExtensionButtons();
    startQRBarIntegration();
    setupQRMutationObserver();
    initGuidedContinueListeners();
}

// Exports for settingsPanel.js
export { loadSettings, updateSettingsUI, addSettingsEventListeners };

// Expose to global scope
window.GuidedGenerations = {
    simpleSend,
    guidedSwipe,
    guidedContinue,
    undoLastGuidedAddition,
    revertToOriginalGuidedContinue,
    guidedResponse,
};

// Init
$(document).ready(async function () {
    clearDebugMessages();
    setup();
    setTimeout(() => { loadSettingsPanel(getContext()); }, 1000);
    installPreset();
    const observer = new MutationObserver(() => { integrateQRBar(); });
    setTimeout(() => {
        const sendForm = document.getElementById('send_form');
        if (sendForm) observer.observe(sendForm, { childList: true, subtree: true });
    }, 2000);
    checkVersionAndNotify();
});

export async function debugProfileSystem() {
    const statusElement = document.getElementById('profileDebugStatus');
    if (!statusElement) return;
    try {
        statusElement.textContent = 'Testing profile system...';
        const profileList = await getProfileList();
        if (Array.isArray(profileList) && profileList.length > 0) {
            statusElement.textContent = `Found ${profileList.length} profiles.`;
            statusElement.style.color = 'green';
        } else {
            statusElement.textContent = 'No profiles found.';
            statusElement.style.color = 'orange';
        }
        await updateSettingsUI();
    } catch (error) {
        statusElement.textContent = `Error: ${error.message}`;
        statusElement.style.color = 'red';
    }
}
