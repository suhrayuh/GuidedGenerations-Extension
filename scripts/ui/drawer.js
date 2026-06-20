/**
 * @file Floating drawer for GG + QR buttons.
 * When enabled via settings, moves action buttons out of the input box
 * into a draggable floating side drawer.
 */

import { extension_settings } from '../../../../../extensions.js';

const extensionName = 'GuidedGenerations-Extension';

const DRAWER_ID = 'st-side-drawer';
const TOGGLE_ID = 'st-side-drawer-toggle';
const PANEL_ID = 'st-side-drawer-panel';
const CONTENT_ID = 'st-side-drawer-content';
const QR_CONTAINER_ID = 'st-side-drawer-qr';
const STORAGE_KEY = 'st-side-drawer-position';

let drawerStyleEl = null;
let drawerOverridesStyleEl = null;
let qrObserver = null;

function getSettings() {
    return extension_settings[extensionName] || {};
}

// ─── Drawer lifecycle ───────────────────────────────────────────

export function isDrawerActive() {
    return !!document.getElementById(DRAWER_ID);
}

export function createDrawer() {
    if (document.getElementById(DRAWER_ID)) return;

    const settings = getSettings();
    const drawerRoot = document.createElement('div');
    drawerRoot.id = DRAWER_ID;

    // ── Toggle button ──
    const drawerToggle = document.createElement('button');
    drawerToggle.id = TOGGLE_ID;
    drawerToggle.type = 'button';
    drawerToggle.title = 'Toggle action drawer';
    drawerToggle.setAttribute('aria-label', 'Toggle action drawer');
    drawerToggle.setAttribute('aria-expanded', 'false');

    const icon = settings.drawerIcon || 'fa-solid fa-heart';
    drawerToggle.innerHTML = `<i class="${icon}"></i>`;

    // ── Panel ──
    const drawerPanel = document.createElement('div');
    drawerPanel.id = PANEL_ID;

    const drawerContent = document.createElement('div');
    drawerContent.id = CONTENT_ID;

    const qrContainer = document.createElement('div');
    qrContainer.id = QR_CONTAINER_ID;

    drawerContent.appendChild(qrContainer);
    drawerPanel.appendChild(drawerContent);
    drawerRoot.appendChild(drawerPanel);
    drawerRoot.appendChild(drawerToggle);
    document.body.appendChild(drawerRoot);

    // ── Drag logic ──
    let isDragging = false;
    let pointerId = null;
    let startX = 0;
    let startY = 0;
    let startLeft = 0;
    let startTop = 0;
    let suppressClick = false;

    const clamp = (left, top) => {
        const w = drawerToggle.offsetWidth || 58;
        const h = drawerToggle.offsetHeight || 58;
        const minL = 8, minT = 8;
        const maxL = Math.max(minL, window.innerWidth - w - 8);
        const maxT = Math.max(minT, window.innerHeight - h - 8);
        return {
            left: Math.min(Math.max(left, minL), maxL),
            top: Math.min(Math.max(top, minT), maxT),
        };
    };

    const updatePanelDirection = () => {
        const rect = drawerRoot.getBoundingClientRect();
        const toggleCenterY = rect.top + (rect.height / 2);
        const screenMidpoint = window.innerHeight / 2;
        
        if (toggleCenterY < screenMidpoint) {
            drawerRoot.classList.add('gg-drawer-down');
            drawerRoot.classList.remove('gg-drawer-up');
        } else {
            drawerRoot.classList.add('gg-drawer-up');
            drawerRoot.classList.remove('gg-drawer-down');
        }
    };

    const setPosition = (left, top) => {
        const pos = clamp(left, top);
        drawerRoot.style.left = `${pos.left}px`;
        drawerRoot.style.top = `${pos.top}px`;
        drawerRoot.style.right = 'auto';
        drawerRoot.style.transform = 'none';
        updatePanelDirection();
    };

    const persistPosition = () => {
        try {
            const rect = drawerRoot.getBoundingClientRect();
            localStorage.setItem(STORAGE_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
        } catch (_) { /* ignore */ }
    };

    const restorePosition = () => {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            if (!raw) return;
            const pos = JSON.parse(raw);
            if (typeof pos?.left === 'number' && typeof pos?.top === 'number') {
                setPosition(pos.left, pos.top);
            }
        } catch (_) { /* ignore */ }
    };

    drawerToggle.addEventListener('pointerdown', (e) => {
        pointerId = e.pointerId;
        isDragging = false;
        suppressClick = false;
        startX = e.clientX;
        startY = e.clientY;
        const rect = drawerRoot.getBoundingClientRect();
        startLeft = rect.left;
        startTop = rect.top;
        drawerToggle.setPointerCapture?.(e.pointerId);
    });

    drawerToggle.addEventListener('pointermove', (e) => {
        if (pointerId !== e.pointerId) return;
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        if (!isDragging && Math.hypot(dx, dy) > 6) {
            isDragging = true;
            suppressClick = true;
        }
        if (!isDragging) return;
        e.preventDefault();
        setPosition(startLeft + dx, startTop + dy);
    });

    const endDrag = (e) => {
        if (pointerId !== e.pointerId) return;
        drawerToggle.releasePointerCapture?.(e.pointerId);
        pointerId = null;
        if (isDragging) persistPosition();
        isDragging = false;
        window.setTimeout(() => { suppressClick = false; }, 0);
    };

    drawerToggle.addEventListener('pointerup', endDrag);
    drawerToggle.addEventListener('pointercancel', endDrag);

    drawerToggle.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (suppressClick) return;
        const isOpen = drawerRoot.classList.toggle('is-open');
        drawerToggle.setAttribute('aria-expanded', String(isOpen));
    });

    // Click outside to close
    document.addEventListener('click', (e) => {
        if (!drawerRoot.classList.contains('is-open')) return;
        if (drawerRoot.contains(e.target)) return;
        drawerRoot.classList.remove('is-open');
        drawerToggle.setAttribute('aria-expanded', 'false');
    });

    // Resize handler
    window.addEventListener('resize', () => {
        const rect = drawerRoot.getBoundingClientRect();
        setPosition(rect.left, rect.top);
        persistPosition();
        updatePanelDirection();
    });

    restorePosition();
    updatePanelDirection();
    applyDrawerTheme(settings);
}

function moveButtonsIntoDrawer() {
    const drawerContent = document.getElementById(CONTENT_ID);
    const qrContainer = document.getElementById(QR_CONTAINER_ID);
    if (!drawerContent || !qrContainer) return;

    const buttonContainer = document.getElementById('gg-action-button-container');
    const originalQrContainer = document.getElementById('gg-qr-container');
    if (!buttonContainer) return;

    // Move button container into drawer (before QR container)
    if (!drawerContent.contains(buttonContainer)) {
        drawerContent.insertBefore(buttonContainer, qrContainer);
    }

    // Hide original QR container
    if (originalQrContainer) {
        originalQrContainer.style.display = 'none';
    }

    // Move QR bar into drawer's QR container
    const qrBar = document.getElementById('qr--bar');
    if (qrBar && qrBar.parentElement !== qrContainer) {
        qrContainer.appendChild(qrBar);
    }
}

function patchMenuPositioning() {
    const ggMenuButton = document.getElementById('gg_menu_button');
    const ggToolsMenu = document.getElementById('gg_tools_menu');

    if (ggMenuButton && ggToolsMenu && !ggMenuButton.dataset.drawerPatched) {
        ggMenuButton.dataset.drawerPatched = 'true';

        ggMenuButton.addEventListener('click', () => {
            ggToolsMenu.style.visibility = 'hidden';
            ggToolsMenu.style.display = 'block';
            const menuH = ggToolsMenu.offsetHeight;
            ggToolsMenu.style.display = '';
            ggToolsMenu.style.visibility = '';

            const panel = document.getElementById(PANEL_ID);
            const panelRect = panel ? panel.getBoundingClientRect() : { top: 0 };
            const btnRect = ggMenuButton.getBoundingClientRect();

            const gap = 8;
            const drawerW = 76;
            const menuLeft = btnRect.right - drawerW - ggToolsMenu.offsetWidth - gap;
            let menuTop = btnRect.top + (btnRect.height / 2) - (menuH / 2);
            menuTop = Math.max(menuTop, panelRect.top);
            const maxBottom = window.innerHeight - 20;
            if (menuTop + menuH > maxBottom) menuTop = maxBottom - menuH;

            ggToolsMenu.style.top = `${menuTop}px`;
            ggToolsMenu.style.left = `${menuLeft}px`;
        }, true);
    }
}

// ─── Theme / CSS variables ──────────────────────────────────────

export function applyDrawerTheme(settings) {
    const el = document.getElementById(DRAWER_ID);
    if (!el) return;

    const s = settings || getSettings();
    const set = (prop, val) => el.style.setProperty(prop, val);

    set('--gg-drawer-bubble-size', `${s.drawerBubbleSize || 58}px`);
    set('--gg-drawer-panel-width', `${s.drawerPanelWidth || 76}px`);
    set('--gg-drawer-button-size', `${s.drawerButtonSize || 46}px`);
    set('--gg-drawer-icon-size', `${s.drawerIconSize || 1.15}rem`);
    set('--gg-drawer-pos-top', s.drawerPositionTop || '22vh');
    set('--gg-drawer-pos-right', `${s.drawerPositionRight ?? 18}px`);
    set('--gg-drawer-accent', s.drawerAccentColor || '#ffd1e8');
    set('--gg-drawer-border', s.drawerBorderColor || '#ff69b4');
    set('--gg-drawer-glow', s.drawerGlowColor || '#ff1493');
    set('--gg-drawer-bg', s.drawerBgGradient || 'linear-gradient(180deg, rgba(72,22,58,0.96), rgba(39,12,31,0.98))');

    if (s.drawerEnablePulse) {
        el.classList.add('gg-drawer-pulse');
    } else {
        el.classList.remove('gg-drawer-pulse');
    }

    // Update icon
    const toggle = document.getElementById(TOGGLE_ID);
    if (toggle) {
        const icon = s.drawerIcon || 'fa-solid fa-heart';
        toggle.innerHTML = `<i class="${icon}"></i>`;
    }

    // CSS overrides
    const overrides = s.drawerCssOverrides || '';
    if (overrides.trim()) {
        if (!drawerOverridesStyleEl) {
            drawerOverridesStyleEl = document.createElement('style');
            drawerOverridesStyleEl.id = 'gg-drawer-overrides';
            document.head.appendChild(drawerOverridesStyleEl);
        }
        drawerOverridesStyleEl.textContent = overrides;
    } else if (drawerOverridesStyleEl) {
        drawerOverridesStyleEl.remove();
        drawerOverridesStyleEl = null;
    }
}

// ─── CSS injection ──────────────────────────────────────────────

export function injectDrawerCSS() {
    if (drawerStyleEl) return;

    drawerStyleEl = document.createElement('style');
    drawerStyleEl.id = 'gg-drawer-styles';
    drawerStyleEl.textContent = getDrawerCSS();
    document.head.appendChild(drawerStyleEl);
}

export function removeDrawerCSS() {
    if (drawerStyleEl) {
        drawerStyleEl.remove();
        drawerStyleEl = null;
    }
    if (drawerOverridesStyleEl) {
        drawerOverridesStyleEl.remove();
        drawerOverridesStyleEl = null;
    }
}

function getDrawerCSS() {
    return `
/* ── GG Drawer ───────────────────────────────────────── */

#st-side-drawer {
    --gg-drawer-bubble-size: 58px;
    --gg-drawer-panel-width: 76px;
    --gg-drawer-button-size: 46px;
    --gg-drawer-icon-size: 1.15rem;
    --gg-drawer-pos-top: 22vh;
    --gg-drawer-pos-right: 18px;
    --gg-drawer-accent: #ffd1e8;
    --gg-drawer-border: #ff69b4;
    --gg-drawer-glow: #ff1493;
    --gg-drawer-bg: linear-gradient(180deg, rgba(72,22,58,0.96), rgba(39,12,31,0.98));
    --gg-drawer-gap: 8px;

    position: fixed;
    top: var(--gg-drawer-pos-top);
    right: var(--gg-drawer-pos-right);
    z-index: 4000;
    width: var(--gg-drawer-bubble-size);
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    touch-action: none;
    display: flex;
    flex-direction: column;
    align-items: center;
}

/* Upward direction: panel above toggle (default) */
#st-side-drawer.gg-drawer-up {
    flex-direction: column;
}

/* Downward direction: reverse order so panel appears below toggle */
#st-side-drawer.gg-drawer-down {
    flex-direction: column-reverse;
}

#st-side-drawer-toggle,
#st-side-drawer-panel {
    pointer-events: auto;
}

/* ── Toggle button ── */

#st-side-drawer-toggle {
    width: var(--gg-drawer-bubble-size);
    height: var(--gg-drawer-bubble-size);
    border-radius: 999px;
    border: 1px solid var(--gg-drawer-border);
    background: var(--gg-drawer-bg);
    color: var(--gg-drawer-accent);
    box-shadow: 0 0 22px var(--gg-drawer-glow), inset 0 0 18px rgba(255,255,255,0.07);
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
    cursor: grab;
    transition: transform 0.18s ease, box-shadow 0.22s ease, color 0.22s ease;
}

#st-side-drawer.gg-drawer-pulse #st-side-drawer-toggle {
    animation: gg-drawer-heartbeat 2.25s ease-in-out infinite;
}

#st-side-drawer-toggle:active {
    cursor: grabbing;
}

#st-side-drawer-toggle:hover {
    color: #ffffff;
    box-shadow: 0 0 28px var(--gg-drawer-glow), inset 0 0 18px rgba(255,255,255,0.1);
}

#st-side-drawer-toggle i {
    font-size: var(--gg-drawer-icon-size);
    text-shadow: 0 0 12px var(--gg-drawer-glow);
    transition: transform 0.2s ease, filter 0.2s ease;
}

#st-side-drawer.is-open #st-side-drawer-toggle i {
    transform: scale(1.05);
    filter: drop-shadow(0 0 8px var(--gg-drawer-glow));
}

@keyframes gg-drawer-heartbeat {
    0%, 100% { transform: scale(1); }
    50% { transform: scale(1.06); }
}

/* ── Panel ── */

#st-side-drawer-panel {
    width: var(--gg-drawer-panel-width);
    max-height: min(68vh, 560px);
    margin-left: calc((var(--gg-drawer-bubble-size) - var(--gg-drawer-panel-width)) / 2);
    border-radius: 999px;
    border: 1px solid var(--gg-drawer-border);
    background: var(--gg-drawer-bg);
    box-shadow: 0 0 22px var(--gg-drawer-glow);
    backdrop-filter: blur(10px);
    -webkit-backdrop-filter: blur(10px);
    padding: 12px 10px 12px 12px;
    opacity: 0;
    transition: transform 0.22s ease, opacity 0.22s ease;
    overflow: hidden;
    visibility: hidden;
    box-sizing: border-box;
}

/* Default: panel opens above toggle (upward) */
#st-side-drawer.gg-drawer-up #st-side-drawer-panel {
    margin-bottom: 10px;
    transform-origin: bottom center;
    transform: translateY(-10px) scale(0.96);
}

#st-side-drawer.gg-drawer-up.is-open #st-side-drawer-panel {
    opacity: 1;
    transform: translateY(0) scale(1);
    visibility: visible;
}

/* Panel opens below toggle (downward) */
#st-side-drawer.gg-drawer-down #st-side-drawer-panel {
    margin-top: 10px;
    transform-origin: top center;
    transform: translateY(10px) scale(0.96);
}

#st-side-drawer.gg-drawer-down.is-open #st-side-drawer-panel {
    opacity: 1;
    transform: translateY(0) scale(1);
    visibility: visible;
}

/* Default to upward if no direction class */
#st-side-drawer:not(.gg-drawer-up):not(.gg-drawer-down) #st-side-drawer-panel {
    margin-bottom: 10px;
    transform-origin: bottom center;
    transform: translateY(-10px) scale(0.96);
}

#st-side-drawer:not(.gg-drawer-up):not(.gg-drawer-down).is-open #st-side-drawer-panel {
    opacity: 1;
    transform: translateY(0) scale(1);
    visibility: visible;
}

/* ── Content layout ── */

#st-side-drawer-content,
.gg-action-buttons-container,
.gg-menu-buttons-container,
.gg-regular-buttons-container,
#st-side-drawer-qr,
#st-side-drawer-qr #qr--bar,
#st-side-drawer-qr #qr--bar > .qr--buttons,
#st-side-drawer-qr #qr--bar > .qr--buttons > .qr--buttons {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--gg-drawer-gap);
}

#st-side-drawer-content {
    width: 100%;
    max-height: calc(min(68vh, 560px) - 24px);
    overflow-y: auto;
    overflow-x: hidden;
    padding-right: 2px;
    scrollbar-width: none;
    -ms-overflow-style: none;
    box-sizing: border-box;
    pointer-events: auto;
    touch-action: pan-y;
}

#st-side-drawer-content::-webkit-scrollbar {
    width: 0;
    height: 0;
    display: none;
}

.gg-action-buttons-container,
.gg-menu-buttons-container,
.gg-regular-buttons-container,
#st-side-drawer-qr {
    width: 100%;
    box-sizing: border-box;
    flex-shrink: 0;
}

/* ── QR section ── */

#st-side-drawer-qr {
    margin-top: 10px;
    padding-top: 6px;
    border-top: 1px solid rgba(255,171,223,0.12);
}

#st-side-drawer-qr #qr--bar {
    width: 100%;
    margin: 0 !important;
    padding: 0 !important;
    opacity: 1;
    overflow: visible;
    position: static;
    justify-content: center;
    background: transparent !important;
}

#st-side-drawer-qr .qr--buttons,
#st-side-drawer-qr .qr--buttons.qr--color,
#st-side-drawer-qr .qr--buttons.qr--borderColor {
    background: transparent !important;
    border: none !important;
    margin: 0 !important;
    padding: 0 !important;
}

#st-side-drawer-qr .qr--buttons:before,
#st-side-drawer-qr .qr--buttons:after,
#st-side-drawer-qr .qr--buttons.qr--color:before,
#st-side-drawer-qr .qr--buttons.qr--color:after {
    display: none !important;
}

#st-side-drawer-qr #qr--bar.popoutVisible {
    padding-right: 0 !important;
}

#st-side-drawer-qr #qr--popoutTrigger {
    display: none !important;
}

/* ── Buttons inside drawer ── */

.gg-action-button,
.gg-menu-button,
#st-side-drawer-qr .qr--button {
    width: var(--gg-drawer-button-size) !important;
    min-width: var(--gg-drawer-button-size) !important;
    max-width: var(--gg-drawer-button-size) !important;
    height: var(--gg-drawer-button-size) !important;
    min-height: var(--gg-drawer-button-size) !important;
    max-height: var(--gg-drawer-button-size) !important;
    padding: 0 !important;
    margin: 0 !important;
    border: 1px solid rgba(255,171,223,0.35) !important;
    border-radius: 999px !important;
    cursor: pointer;
    font-size: 1rem !important;
    display: inline-flex !important;
    align-items: center !important;
    justify-content: center !important;
    transition: background-color 0.2s, color 0.2s, transform 0.18s ease, box-shadow 0.18s ease;
    background: rgba(255,255,255,0.06) !important;
    color: var(--gg-drawer-accent) !important;
    box-sizing: border-box !important;
    box-shadow: inset 0 0 0 1px rgba(255,255,255,0.04), 0 0 10px var(--gg-drawer-glow);
}

.gg-action-button:hover,
.gg-menu-button:hover,
#st-side-drawer-qr .qr--button:hover {
    background: rgba(255,105,180,0.16) !important;
    color: #ffffff !important;
    transform: scale(1.04);
    box-shadow: 0 0 14px var(--gg-drawer-glow);
}

.gg-menu-button {
    position: relative;
}

#st-side-drawer-qr .qr--button-label,
#st-side-drawer-qr .qr--button-expander,
#st-side-drawer-qr #qr--bar > #qr--popoutTrigger {
    display: none !important;
}

#st-side-drawer-qr .qr--button-icon,
#st-side-drawer-qr .fa-solid,
#st-side-drawer-qr .fa-regular,
#st-side-drawer-qr .fa-brands,
.gg-action-button.fa-solid,
.gg-menu-button.fa-solid {
    margin: 0 !important;
    font-size: 1rem !important;
}

/* ── GG tools menu in drawer mode ── */

.gg-tools-menu {
    position: fixed;
}

/* ── Spacer when drawer is active ── */

body.gg-drawer-active #send_form::before {
    content: '';
    display: block;
    height: 32px;
    width: 100%;
    flex-shrink: 0;
}

/* ── Mobile ── */

@media screen and (max-width: 768px) {
    #st-side-drawer {
        --gg-drawer-bubble-size: 52px;
        --gg-drawer-panel-width: 76px;
        --gg-drawer-button-size: 40px;
        --gg-drawer-gap: 9px;
        right: 12px;
    }

    #st-side-drawer-panel {
        max-height: min(60vh, 460px);
        padding: 12px 10px 12px 11px;
    }

    #st-side-drawer-content {
        max-height: calc(min(60vh, 460px) - 24px);
        padding-right: 1px;
    }

    #st-side-drawer-qr {
        margin-top: 36px;
        padding-top: 24px;
        border-top: 0px;
    }

    body.gg-drawer-active #send_form::before {
        height: 28px;
    }
}

@media only screen and (min-device-width: 810px) and (max-device-width: 1024px) {
    #st-side-drawer {
        --gg-drawer-bubble-size: 52px;
        --gg-drawer-panel-width: 76px;
        --gg-drawer-button-size: 40px;
        --gg-drawer-gap: 9px;
        right: 12px;
    }

    #st-side-drawer-panel {
        max-height: min(60vh, 460px);
        padding: 12px 10px 12px 11px;
    }

    #st-side-drawer-content {
        max-height: calc(min(60vh, 460px) - 24px);
        padding-right: 1px;
    }

    #st-side-drawer-qr {
        margin-top: 36px;
        padding-top: 24px;
        border-top: 0px;
    }
}
`;
}

// ─── Destroy / restore ──────────────────────────────────────────

export function destroyDrawer() {
    const drawerRoot = document.getElementById(DRAWER_ID);
    if (!drawerRoot) return;

    // Move button container back to send form
    const buttonContainer = document.getElementById('gg-action-button-container');
    const nonQRFormItems = document.getElementById('nonQRFormItems');
    if (buttonContainer && nonQRFormItems) {
        nonQRFormItems.parentNode.insertBefore(buttonContainer, nonQRFormItems.nextSibling);
    }

    // Move QR bar back
    const qrBar = document.getElementById('qr--bar');
    const sendForm = document.getElementById('send_form');
    if (qrBar && sendForm) {
        sendForm.appendChild(qrBar);
    }

    // Show original QR container
    const originalQrContainer = document.getElementById('gg-qr-container');
    if (originalQrContainer) {
        originalQrContainer.style.display = '';
    }

    // Clean up CSS vars
    drawerRoot.style.removeProperty('--gg-drawer-bubble-size');
    drawerRoot.style.removeProperty('--gg-drawer-panel-width');
    drawerRoot.style.removeProperty('--gg-drawer-button-size');
    drawerRoot.style.removeProperty('--gg-drawer-icon-size');
    drawerRoot.style.removeProperty('--gg-drawer-pos-top');
    drawerRoot.style.removeProperty('--gg-drawer-pos-right');
    drawerRoot.style.removeProperty('--gg-drawer-accent');
    drawerRoot.style.removeProperty('--gg-drawer-border');
    drawerRoot.style.removeProperty('--gg-drawer-glow');
    drawerRoot.style.removeProperty('--gg-drawer-bg');

    drawerRoot.remove();
    document.body.classList.remove('gg-drawer-active');

    // Clean up patch flags
    const ggMenuButton = document.getElementById('gg_menu_button');
    if (ggMenuButton) delete ggMenuButton.dataset.drawerPatched;

    removeDrawerCSS();
}

// ─── Slash command ──────────────────────────────────────────────

function registerResetSlashCommand() {
    if (window.__ggDrawerResetRegistered) return;

    try {
        const parser = window.SillyTavern?.SlashCommandParser;
        const slash = window.SillyTavern?.SlashCommand;
        if (!parser || !slash || typeof parser.addCommandObject !== 'function' || typeof slash.fromProps !== 'function') return;

        parser.addCommandObject(slash.fromProps({
            name: 'gg-drawer-reset',
            callback: () => {
                const drawerRoot = document.getElementById(DRAWER_ID);
                if (!drawerRoot) return 'Drawer not active.';

                localStorage.removeItem(STORAGE_KEY);
                drawerRoot.style.left = '';
                drawerRoot.style.top = '';
                drawerRoot.style.right = '';
                drawerRoot.style.bottom = '';
                drawerRoot.classList.remove('is-open');
                const toggle = document.getElementById(TOGGLE_ID);
                if (toggle) toggle.setAttribute('aria-expanded', 'false');
                if (typeof toastr !== 'undefined') toastr.success('Drawer position reset.');
                return 'Drawer position reset.';
            },
            helpString: 'Resets the GG drawer position to its default location.',
        }));

        window.__ggDrawerResetRegistered = true;
    } catch (_) { /* ignore */ }
}

// ─── QR observer (for late-loading QR bar) ──────────────────────

function startQRObserver() {
    if (qrObserver) return;
    qrObserver = new MutationObserver(() => {
        const qrBar = document.getElementById('qr--bar');
        const qrContainer = document.getElementById(QR_CONTAINER_ID);
        if (qrBar && qrContainer && qrBar.parentElement !== qrContainer) {
            qrContainer.appendChild(qrBar);
        }
    });
    qrObserver.observe(document.body, { childList: true, subtree: true });
}

function stopQRObserver() {
    if (qrObserver) {
        qrObserver.disconnect();
        qrObserver = null;
    }
}

// ─── Main entry point (called from updateExtensionButtons) ──────

export function initDrawer(settings) {
    injectDrawerCSS();
    createDrawer();
    moveButtonsIntoDrawer();
    patchMenuPositioning();
    registerResetSlashCommand();
    startQRObserver();
    applyDrawerTheme(settings);
    document.body.classList.add('gg-drawer-active');
}

export function teardownDrawer() {
    stopQRObserver();
    destroyDrawer();
}
