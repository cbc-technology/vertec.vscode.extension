import { commands, ExtensionContext } from 'vscode';
import { translateClass, translateMember, translateText } from './Translator';
import { initializeCaches, reloadModel, reloadTranslations } from './DataProvider';
import { modelBrowse } from './ModelBrowser';
import { compareClipboard } from './Comparator';

export function activate(context: ExtensionContext) {
	// Initialize the model cache with the extension context
    initializeCaches(context);

	// Vertec: Caches
	commands.registerCommand('vertec.reload.model', () => reloadModel());
	commands.registerCommand('vertec.reload.translations', () => reloadTranslations());

	// Vertec: Translator
	commands.registerCommand('vertec.translator.class', () => translateClass());
	commands.registerCommand('vertec.translator.member', () => translateMember());
	commands.registerCommand('vertec.translator.text', () => translateText());

	// Vertec: Model Browser
	commands.registerCommand('vertec.modelbrowser.browse', () => modelBrowse());

	// Vertec: Comparator
	commands.registerCommand('vertec.comparator.compareClipboard', () => compareClipboard());
}
