import { commands, ExtensionContext } from 'vscode';
import { translateClass, translateMember, translateText } from './Translator';
import { initializeCaches, reloadModel, reloadTranslations } from './DataProvider';
import { modelBrowse } from './ModelBrowser';
import { compareClipboard } from './Comparator';
import { activateAutoCompletor } from './AutoCompletor';
import { activateStubProvider, reloadStubs } from './StubProvider';

export function activate(context: ExtensionContext) {
	// Initialize the model cache with the extension context
    initializeCaches(context);

	// Vertec: In-Memory Stub Provider
	activateStubProvider(context);

	// Vertec: Auto completion and hover information for Python files
	activateAutoCompletor(context);

	// Vertec: Caches and stubs
	commands.registerCommand('vertec.reload.model', () => reloadModel());
	commands.registerCommand('vertec.reload.translations', () => reloadTranslations());
	commands.registerCommand('vertec.reload.stubs', () => reloadStubs());

	// Vertec: Translator
	commands.registerCommand('vertec.translator.class', () => translateClass());
	commands.registerCommand('vertec.translator.member', () => translateMember());
	commands.registerCommand('vertec.translator.text', () => translateText());

	// Vertec: Model Browser
	commands.registerCommand('vertec.modelbrowser.browse', () => modelBrowse());

	// Vertec: Comparator
	commands.registerCommand('vertec.comparator.compareClipboard', () => compareClipboard());
}