/**
 * @file Central import/export hub for GuidedGenerations extension modules.
 */

// External dependencies (SillyTavern)
import { getContext, extension_settings, renderExtensionTemplateAsync } from '../../../../../extensions.js';
import { chat, eventSource, event_types, saveChatConditional, addOneMessage, saveSettingsDebounced, deactivateSendButtons, activateSendButtons, setExternalAbortController, setSendButtonState } from '../../../../../../script.js';

const extensionName = 'GuidedGenerations-Extension';

function debugLog(...args) {
    if (extension_settings[extensionName]?.debugMode) {
        console.log(`[${extensionName}][DEBUG]`, ...args);
    }
}
function debugWarn(...args) {
    if (extension_settings[extensionName]?.debugMode) {
        console.warn(`[${extensionName}][DEBUG]`, ...args);
    }
}
function debugError(...args) {
    if (extension_settings[extensionName]?.debugMode) {
        console.error(`[${extensionName}][DEBUG]`, ...args);
    }
}

let previousImpersonateInput = '';
let lastImpersonateResult = '';
function setPreviousImpersonateInput(input) { previousImpersonateInput = input; }
function getPreviousImpersonateInput() { return previousImpersonateInput; }
function setLastImpersonateResult(result) { lastImpersonateResult = result; }
function getLastImpersonateResult() { return lastImpersonateResult; }

function isGroupChat() {
    const context = getContext();
    return context && context.groupId && context.groups;
}

// Optional prompt manager helpers (SillyTavern openai.js)
async function getOpenAIPromptManagerHelpers() {
    try {
        return await import('../../../../../../scripts/openai.js');
    } catch (error) {
        debugWarn(`[${extensionName}] Failed to load openai prompt manager helpers:`, error);
        return null;
    }
}

// Settings management functions
import { loadSettings, updateSettingsUI, addSettingsEventListeners, getDebugMessages, clearDebugMessages, getDebugMessagesAsText, debugProfileSystem, defaultSettings } from '../../index.js';

// Utility functions
import { handleSwitching, getProfileApiType, getPresetsForApiType, getCurrentProfile, getProfileList, switchToProfile, switchToPreset, withProfile, getConnectApiMap, initializeEventListeners, extractApiIdFromApiType } from '../utils/presetUtils.js';
import { requestCompletion, shouldUseDirectCall } from '../utils/llmClient.js';

// Tool functions
import editIntros from '../tools/editIntros.js';
import clearInput from '../tools/clearInput.js';

// Main script functions
import { guidedSwipe, generateNewSwipe } from '../guidedSwipe.js';
import { guidedContinue, initGuidedContinueListeners, undoLastGuidedAddition, revertToOriginalGuidedContinue } from '../guidedContinue.js';
import { guidedResponse } from '../guidedResponse.js';
import { guidedImpersonate } from '../guidedImpersonate.js';
import { guidedImpersonate2nd } from '../guidedImpersonate2nd.js';
import { guidedImpersonate3rd } from '../guidedImpersonate3rd.js';
import { simpleSend } from '../simpleSend.js';
import { recoverInput } from '../inputRecovery.js';
import { loadSettingsPanel } from '../settingsPanel.js';

export {
    // Context and settings
    getContext,
    extension_settings,
    extensionName,
    debugLog,
    debugWarn,
    debugError,

    // SillyTavern dependencies
    chat,
    eventSource,
    event_types,
    saveChatConditional,
    addOneMessage,
    deactivateSendButtons,
    activateSendButtons,
    setExternalAbortController,
    setSendButtonState,
    renderExtensionTemplateAsync,

    // Utility functions
    handleSwitching,
    getProfileApiType,
    getPresetsForApiType,
    getCurrentProfile,
    getProfileList,
    switchToProfile,
    switchToPreset,
    withProfile,
    getConnectApiMap,
    initializeEventListeners,
    extractApiIdFromApiType,
    requestCompletion,
    shouldUseDirectCall,

    // Tools
    clearInput,
    editIntros,

    // Main script functions
    guidedSwipe,
    generateNewSwipe,
    guidedContinue,
    initGuidedContinueListeners,
    undoLastGuidedAddition,
    revertToOriginalGuidedContinue,
    guidedResponse,
    guidedImpersonate,
    guidedImpersonate2nd,
    guidedImpersonate3rd,
    simpleSend,
    recoverInput,
    loadSettingsPanel,

    // Settings and other
    loadSettings,
    updateSettingsUI,
    addSettingsEventListeners,
    defaultSettings,
    saveSettingsDebounced,
    debugProfileSystem,
    isGroupChat,
    setPreviousImpersonateInput,
    getPreviousImpersonateInput,
    setLastImpersonateResult,
    getLastImpersonateResult,

    // Debug logging functions
    getDebugMessages,
    clearDebugMessages,
    getDebugMessagesAsText,
    getOpenAIPromptManagerHelpers,
};
