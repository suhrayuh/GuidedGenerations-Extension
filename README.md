# Guided Generations Extension — Fork

A streamlined fork of [Samueras/GuidedGenerations-Extension](https://github.com/Samueras/GuidedGenerations-Extension) for SillyTavern. Keeps the core action buttons and utility tools while removing the persistent guides system and related features because frankly, I never touched them. Also adds a floating drawer mode for mobile-friendly access.

---

## Table of Contents
- [Features](#features)
- [Floating Drawer](#floating-drawer)
- [Installation](#installation)
- [Settings](#settings)
- [License](#license)

---

## Features

### Guided Response 🐕
Type instructions in the input box and press the button. Your instructions are injected before the AI generates its next response.

### Guided Swipe 👈
Enter new instructions and press to regenerate the last AI message with your guidance. Only available when the last message is from the AI.

### Guided Continue ▶️
Press to have the AI continue its last message. Supports undo/revert to restore the original message if needed.

### Impersonation
Expand brief outlines into rich, in-character narratives from different perspectives:
- **1st Person 👤** — Default, toggleable in settings
- **2nd Person 👥** — Toggleable in settings
- **3rd Person 🗣️** — Toggleable in settings

### Tools Menu 🔖
Access utility functions via the gear button:
- **✈️ Simple Send** — Send input as a user message without triggering a model response
- **🖋️ Edit Intros** — Rewrite or transform introductory messages
- **↩️ Input Recovery** — Restore previously cleared input
- **🗑️ Clear Input** — Clear the input box

---

## Floating Drawer

When enabled in settings, the GG and QR buttons move out of the input box into a draggable floating side drawer. This is useful for mobile devices or when you want more screen space.

**Features:**
- Draggable toggle button with position persistence
- Configurable icon, sizes, and colors
- Pulse animation toggle
- `/gg-drawer-reset` slash command to reset position
- Custom CSS overrides for advanced styling

**Default appearance:** Pink heart icon with a purple-ish gradient drawer panel. Because I'm just a girl who likes pink stuff, sorry.

---

## Installation

1. In SillyTavern's Extension Manager, click **Install Extension**
2. Enter: `https://github.com/suhrayuh/GuidedGenerations-Extension`

---

## Settings

All settings are in **SillyTavern → Extensions → Guided Generations Extension**.

### Button Visibility
Show or hide individual action buttons:
- 1st Person Impersonation (👤)
- 2nd Person Impersonation (👥)
- 3rd Person Impersonation (🗣️)
- Guided Response (🐕)
- Guided Swipe (👈)

### Injection Role
Select the role (`system`, `assistant`, or `user`) used when injecting instructions.

### Prompt Overrides
Customize the raw prompt template for each action. Use `{{input}}` for your input text. Applies to:
- Impersonate 1st/2nd/3rd Person
- Guided Response
- Guided Swipe
- Guided Continue

### Presets
Choose a SillyTavern preset per action. Before running, the extension switches to that preset (and its configured API/model), executes, then restores your previous preset — allowing different models per action.

### Floating Drawer
- **Enable Floating Drawer** — Move buttons into a floating side drawer
- **Enable Pulse Animation** — Toggle the heartbeat animation on the floating icon
- **Register /gg-drawer-reset** — Register the slash command for resetting drawer position
- **Toggle Icon** — FontAwesome icon class (default: `fa-solid fa-heart`)
- **Icon Size, Bubble Size, Panel Width, Button Size** — Dimension controls in px/rem
- **Position Top, Position Right** — Initial position
- **Accent, Border, Glow Colors** — Native color pickers for theming
- **Background Gradient** — CSS gradient for the drawer panel and toggle
- **Custom CSS Overrides** — Raw CSS for advanced customization

### Debug Mode
Enable detailed debug logging in the browser console.

---

## License

This project is licensed under the GNU General Public License v3.0. See the [LICENSE](LICENSE) file for details.

---

## Credits

Original extension by [Samueras](https://github.com/Samueras/GuidedGenerations-Extension). Fork maintained by [suhrayuh](https://github.com/suhrayuh).
