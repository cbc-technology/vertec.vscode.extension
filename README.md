# Vertec Visual Studio Code Extension

A comprehensive extension providing useful utilities for day-to-day Vertec administrators and developers.

## Features

### Translation Tools
- **Translate Text** - Translate general text strings used in Vertec
- **Translate Class** - Look up translations for Vertec class names
- **Translate Member** - Find translations for class member names

### Model Browser
- **Browse Model** - Explore the Vertec data model structure and relationships

### Comparison Tools
- **Compare with Clipboard** - Compare the current file with clipboard content and optionally replace it. This is useful to check if the local script matches the production version.

### Cache Management
- **Reload Model Cache** - Refresh the cached Vertec model data
- **Reload Translation Cache** - Refresh the cached translation data

## Commands

All commands are available via the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`):

- `Vertec: Translate text`
- `Vertec: Translate class`
- `Vertec: Translate member`
- `Vertec: Browse Model`
- `Vertec: Compare with clipboard`
- `Vertec: Reload model cache`
- `Vertec: Reload translation cache`

## Configuration

Configure the extension in your VS Code settings:

| Setting | Default | Description |
|---------|---------|-------------|
| `vertecVscodeExtension.TranslationsUrl` | `https://downloads.vertec.com/downloads/Translations.json` | URL to the translations JSON file |
| `vertecVscodeExtension.ModelUrl` | `https://www.vertec.com/api/erp-model-browser/get-classes` | URL to the model browser backend |
| `vertecVscodeExtension.CacheLifetime` | `30` | Cache lifetime in days |

## Requirements

- Visual Studio Code version 1.73.0 or higher

## Installation

Either:
1. Clone the repository
2. Run `npm install`
3. Run `npm run compile`
4. Press F5 to open a new VS Code window with the extension loaded

Or:
1. Download the vsix file
2. Install the vsix file within VS Code

## License

MIT

## Repository

[GitHub - cbc-technology/vertec.vscode.extension](https://github.com/cbc-technology/vertec-vscode-extension)