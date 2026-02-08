/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { commands, ExtensionContext } from 'vscode';
import { translateClass, translateMember, translateText } from './Translator';
import { initializeModelCache, reloadModel, reloadTranslations } from './DataProvider';
import { modelBrowse } from './ModelBrowser';

export function activate(context: ExtensionContext) {
	// Initialize the model cache with the extension context
    initializeModelCache(context);

	// Vertec: Caches
	commands.registerCommand('vertec.reload.model', () => reloadModel());
	commands.registerCommand('vertec.reload.translations', () => reloadTranslations());

	// Vertec: Translator
	commands.registerCommand('vertec.translator.class', () => translateClass());
	commands.registerCommand('vertec.translator.member', () => translateMember());
	commands.registerCommand('vertec.translator.text', () => translateText());

	// Vertec: Model Browser
	commands.registerCommand('vertec.modelbrowser.browse', () => modelBrowse());
}
