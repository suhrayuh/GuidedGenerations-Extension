/**
 * @file Custom Guided Prompts — user-defined action buttons
 * that reuse the existing impersonate/swipe/response/continue pipelines
 * with custom templates, icons, and per-prompt profile/preset switching.
 */

import {
    getContext,
    extension_settings,
    isGroupChat,
    setPreviousImpersonateInput,
    getPreviousImpersonateInput,
    getLastImpersonateResult,
    setLastImpersonateResult,
    debugLog,
    requestCompletion,
    shouldUseDirectCall,
    saveSettingsDebounced,
} from './persistentGuides/guideExports.js';

const extensionName = 'GuidedGenerations-Extension';

// ─── CRUD helpers ───────────────────────────────────────────────

function getCustomPrompts() {
    return extension_settings[extensionName]?.customPrompts ?? [];
}

function setCustomPrompts(prompts) {
    if (!extension_settings[extensionName]) extension_settings[extensionName] = {};
    extension_settings[extensionName].customPrompts = prompts;
}

function generateId() {
    return `cp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function addCustomPrompt(overrides = {}) {
    const prompts = getCustomPrompts();
    const newPrompt = {
        id: generateId(),
        type: 'impersonate',
        name: 'Custom Prompt',
        icon: 'fa-solid fa-star',
        prompt: '',
        enabled: true,
        depth: 0,
        role: '',
        connectionProfile: '',
        preset: '',
        ...overrides,
    };
    prompts.push(newPrompt);
    setCustomPrompts(prompts);
    saveSettingsDebounced();
    return newPrompt;
}

export function updateCustomPrompt(id, updates) {
    const prompts = getCustomPrompts();
    const idx = prompts.findIndex(p => p.id === id);
    if (idx === -1) return null;
    prompts[idx] = { ...prompts[idx], ...updates };
    setCustomPrompts(prompts);
    saveSettingsDebounced();
    return prompts[idx];
}

export function deleteCustomPrompt(id) {
    const prompts = getCustomPrompts().filter(p => p.id !== id);
    setCustomPrompts(prompts);
    saveSettingsDebounced();
}

export function getCustomPromptById(id) {
    return getCustomPrompts().find(p => p.id === id) ?? null;
}

let regexModuleCache = false;

async function loadRegexModule() {
    if (regexModuleCache !== false) return regexModuleCache;
    try {
        regexModuleCache = await import('/scripts/extensions/regex/engine.js');
    } catch (_) {
        regexModuleCache = null;
    }
    return regexModuleCache;
}

async function applyRegex(text, placementName, depth) {
    if (typeof text !== 'string' || !text) return text;
    try {
        const mod = await loadRegexModule();
        if (!mod?.getRegexedString) return text;
        const placement = mod.regex_placement?.[placementName];
        if (placement === undefined) return text;
        const params = { isPrompt: true };
        if (typeof depth === 'number') params.depth = depth;
        const result = mod.getRegexedString(text, placement, params);
        const resolved = result instanceof Promise ? await result : result;
        return typeof resolved === 'string' ? resolved : text;
    } catch (_) {
        return text;
    }
}

async function applyRegexToChatContextIfEnabled(chat, enabled) {
    if (!enabled || !Array.isArray(chat)) return chat;

    const result = [];
    for (const message of chat) {
        if (!message || typeof message !== 'object') {
            result.push(message);
            continue;
        }

        if (typeof message.mes !== 'string' || !message.mes) {
            result.push({ ...message });
            continue;
        }

        const placementName = message.is_user ? 'USER_INPUT' : 'AI_OUTPUT';
        const mes = await applyRegex(message.mes, placementName);
        result.push({ ...message, mes });
    }

    return result;
}

// ─── Execution logic ────────────────────────────────────────────

async function executeCustomImpersonate(prompt) {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) return;

    const currentInput = textarea.value;
    const lastGenerated = getLastImpersonateResult();

    // Toggle: if input matches last generated, restore original
    if (lastGenerated && currentInput === lastGenerated) {
        textarea.value = getPreviousImpersonateInput();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        return;
    }

    setPreviousImpersonateInput(currentInput);

    const profileValue = prompt.connectionProfile || '';
    const presetValue = prompt.preset || '';
    const filledPrompt = (prompt.prompt || '').replace('{{input}}', currentInput);

    try {
        const useDirectCall = await shouldUseDirectCall(profileValue, presetValue);
        if (useDirectCall) {
            debugLog(`[CustomImpersonate] Using direct completion for "${prompt.name}"...`);
            const context = getContext();
            const extensionPrompts = { ...(context?.extensionPrompts || {}) };
            const regexEnabled = Boolean(extension_settings[extensionName]?.customImpersonateApplyRegex);
            const regexedChat = await applyRegexToChatContextIfEnabled(context?.chat || [], regexEnabled);

            // Prevent stale guided-response injections from leaking into direct
            // impersonation requests. Keep normal/contextual outlet prompts intact.
            delete extensionPrompts.script_inject_instruct;
            delete extensionPrompts.QUIET_PROMPT;
            delete extensionPrompts.DEPTH_PROMPT;

            const completion = await requestCompletion({
                profileName: profileValue,
                presetName: presetValue,
                prompt: filledPrompt,
                messages: regexedChat,
                contextOverrides: {
                    extensionPrompts,
                    quietPrompt: '',
                },
                debugLabel: `custom-impersonate:${prompt.name}`,
            });

            if (completion && completion.trim() !== '') {
                textarea.value = completion;
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                setLastImpersonateResult(completion);
                debugLog(`[CustomImpersonate] Completion received for "${prompt.name}".`);
            } else {
                debugLog(`[CustomImpersonate] Empty completion for "${prompt.name}".`);
            }
        } else {
            // Fallback to /impersonate slash command (same profile/preset as current)
            const context = getContext();
            if (typeof context.executeSlashCommandsWithOptions === 'function') {
                const stscriptCommand = `/impersonate await=true ${filledPrompt} |`;
                await context.executeSlashCommandsWithOptions(stscriptCommand);
                setLastImpersonateResult(textarea.value);
                debugLog(`[CustomImpersonate] Slash command completed for "${prompt.name}".`);
            } else {
                console.error('[GuidedGenerations] context.executeSlashCommandsWithOptions not found!');
            }
        }
    } catch (error) {
        console.error(`[GuidedGenerations][CustomImpersonate] Error:`, error);
        setLastImpersonateResult('');
    }
}

async function executeCustomSwipe(prompt) {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) return;

    const originalInput = textarea.value;
    const depth = prompt.depth ?? 0;
    const role = prompt.role || extension_settings[extensionName]?.injectionEndRole || 'system';

    if (!originalInput.trim() && !(prompt.prompt || '').trim()) {
        // Plain swipe — no injection
        try {
            const context = getContext();
            context.swipe.right();
        } catch (error) {
            console.error(`[GuidedGenerations][CustomSwipe] Plain swipe error:`, error);
        }
        return;
    }

    setPreviousImpersonateInput(originalInput);

    const filledPrompt = (prompt.prompt || '').replace('{{input}}', originalInput);
    const injectCmd = `/inject id=instruct position=chat ephemeral=true scan=true depth=${depth} role=${role} ${filledPrompt} |`;

    try {
        const context = getContext();
        await context.executeSlashCommandsWithOptions(injectCmd);

        // Wait for injection to register
        for (let i = 0; i < 5; i++) {
            const ctx = getContext();
            if (ctx.chatMetadata?.script_injects?.instruct) break;
            await new Promise(r => setTimeout(r, 150));
        }

        // Navigate to last swipe then generate new one
        const chat = context.chat;
        if (chat.length > 0) {
            const lastMsg = chat[chat.length - 1];
            if (Array.isArray(lastMsg.swipes) && lastMsg.swipes.length > 1) {
                const targetIdx = lastMsg.swipes.length - 1;
                if (lastMsg.swipe_id !== targetIdx) {
                    lastMsg.swipe_id = targetIdx;
                    lastMsg.mes = lastMsg.swipes[targetIdx];
                    context.eventSource.emit(context.event_types.MESSAGE_SWIPED, chat.length - 1);
                    await new Promise(r => setTimeout(r, 150));
                }
            }
        }

        context.swipe.right();
        await new Promise(r => setTimeout(r, 3000));
    } catch (error) {
        console.error(`[GuidedGenerations][CustomSwipe] Error:`, error);
    } finally {
        textarea.value = getPreviousImpersonateInput();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
        try {
            const ctx = getContext();
            await ctx.executeSlashCommandsWithOptions('/flushinject instruct');
        } catch (_) { /* ignore */ }
    }
}

async function executeCustomResponse(prompt) {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) return;

    const originalInput = textarea.value;
    const depth = prompt.depth ?? 0;
    const role = prompt.role || extension_settings[extensionName]?.injectionEndRole || 'system';

    setPreviousImpersonateInput(originalInput);

    const filledPrompt = (prompt.prompt || '').replace('{{input}}', originalInput);

    let stscriptCommand;

    if (isGroupChat()) {
        const context = getContext();
        let characterListJson = '[]';
        try {
            const groups = context?.groups;
            const currentGroupId = context?.groupId;
            if (currentGroupId && Array.isArray(groups)) {
                const group = groups.find(g => g.id === currentGroupId);
                if (group?.members) {
                    const names = group.members
                        .map(m => typeof m === 'string' && m.endsWith('.png') ? m.slice(0, -4) : m)
                        .filter(Boolean);
                    if (names.length > 0) characterListJson = JSON.stringify(names);
                }
            }
        } catch (_) { /* ignore */ }

        if (characterListJson !== '[]') {
            stscriptCommand = `/buttons labels=${characterListJson} "Select member to respond as" |\n/setglobalvar key=selection {{pipe}} |\n/inject id=instruct position=chat ephemeral=true scan=true depth=${depth} role=${role} ${filledPrompt} |\n/trigger await=true {{getglobalvar::selection}}|`;
        } else {
            stscriptCommand = `/inject id=instruct position=chat ephemeral=true scan=true depth=${depth} role=${role} ${filledPrompt}|\n/trigger await=true|`;
        }
    } else {
        stscriptCommand = `/inject id=instruct position=chat ephemeral=true scan=true depth=${depth} role=${role} ${filledPrompt}|\n/trigger await=true|`;
    }

    try {
        const context = getContext();
        await context.executeSlashCommandsWithOptions(stscriptCommand);
    } catch (error) {
        console.error(`[GuidedGenerations][CustomResponse] Error:`, error);
    } finally {
        textarea.value = getPreviousImpersonateInput();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

async function executeCustomContinue(prompt) {
    const textarea = document.getElementById('send_textarea');
    if (!textarea) return;

    const originalInput = textarea.value;
    const promptTemplate = prompt.prompt || '';
    let commandParameter = originalInput;

    if (promptTemplate.includes('{{input}}')) {
        commandParameter = promptTemplate.replace('{{input}}', originalInput);
    } else if (promptTemplate.trim()) {
        commandParameter = promptTemplate;
    }

    setPreviousImpersonateInput(originalInput);

    const stscript = `/continue await=true ${commandParameter} |`;

    try {
        const context = getContext();
        await context.executeSlashCommandsWithOptions(stscript);
    } catch (error) {
        console.error(`[GuidedGenerations][CustomContinue] Error:`, error);
    } finally {
        textarea.value = getPreviousImpersonateInput();
        textarea.dispatchEvent(new Event('input', { bubbles: true }));
    }
}

export async function executeCustomPrompt(id) {
    const prompt = getCustomPromptById(id);
    if (!prompt || !prompt.enabled) return;

    debugLog(`[CustomPrompt] Executing: "${prompt.name}" (${prompt.type})`);

    switch (prompt.type) {
        case 'impersonate':
            await executeCustomImpersonate(prompt);
            break;
        case 'guided-swipe':
            await executeCustomSwipe(prompt);
            break;
        case 'guided-response':
            await executeCustomResponse(prompt);
            break;
        case 'guided-continue':
            await executeCustomContinue(prompt);
            break;
        default:
            console.warn(`[CustomPrompt] Unknown type: ${prompt.type}`);
    }
}

// ─── Button rendering ───────────────────────────────────────────

const typeColorMap = {
    'impersonate': 'drawerImpersonateColor',
    'guided-response': 'drawerResponseColor',
    'guided-swipe': 'drawerSwipeColor',
    'guided-continue': 'drawerContinueColor',
};

export function renderCustomPromptButtons() {
    const prompts = getCustomPrompts().filter(p => p.enabled);
    const settings = extension_settings[extensionName] || {};
    const fragment = document.createDocumentFragment();

    for (const prompt of prompts) {
        const colorKey = typeColorMap[prompt.type];
        const color = colorKey ? (settings[colorKey] || '') : '';

        const btn = document.createElement('div');
        btn.className = 'gg-action-button interactable';
        btn.title = prompt.name;
        btn.setAttribute('data-custom-prompt-id', prompt.id);
        btn.innerHTML = `<i class="${prompt.icon || 'fa-solid fa-star'}" ${color ? `style="color: ${color}"` : ''}></i>`;
        btn.addEventListener('click', () => executeCustomPrompt(prompt.id));
        fragment.appendChild(btn);
    }

    return fragment;
}
