/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, window } from 'vscode';
import * as vscode from 'vscode';
import { getTranslations, getModel, VertecTranslation, VertecClass, EnrichedVertecMember, EnrichedVertecAssociation } from './DataProvider';

class TranslationQuickPickItem implements QuickPickItem {
	label: string;
	description: string;
	detail: string;

	constructor(translation: VertecTranslation) {
		let de = '';
		if (translation.NVD) {
			de = translation.NVD;
		} else if (translation.DD0) {
			de = translation.DD0;
		} else if (translation.DE0) {
			de = translation.DE0;
		} else if (translation.DD1) {
			de = translation.DD1;
		} else if (translation.DE1) {
			de = translation.DE1;
		}

		let en = '';
		if (translation.NVE) {
			en = translation.NVE;
		} else if (translation.EN0) {
			en = translation.EN0;
		} else if (translation.EN1) {
			en = translation.EN1;
		}

		this.label = de || en;
		this.description = '';
		this.detail = en || de;
	}
}

class ClassQuickPickItem implements QuickPickItem {
	label: string;
	description: string;
	detail: string;

	constructor(verteclass: VertecClass) {
		this.label = verteclass.name;
		this.description = '';
		this.detail = verteclass.name_alt || verteclass.name;
	}
}

class MemberQuickPickItem implements QuickPickItem {
	label: string;
	description: string;
	detail: string;

	constructor(member: EnrichedVertecMember) {
		this.label = member.name;
		this.description = '';
		this.detail = member.name_alt;
	}
}

class AssociationQuickPickItem implements QuickPickItem {
	label: string;
	description: string;
	detail: string;

	constructor(association: EnrichedVertecAssociation) {
		this.label = association.perceived_name;
		this.description = '';
		this.detail = association.perceived_name_alt || association.perceived_name;
	}
}

const LANGUAGES = ['Englisch', 'Deutsch'];
const TASK_COPY = 'Copy value';
const TASK_INSERT = 'Insert value';
const TASKS = [TASK_COPY, TASK_INSERT];

/**
 * Shows a quick pick to select a member, then a language and finally a task to do with the translation (copy or insert).
 */
async function showTranslationDialogues(
	quickpicks: QuickPickItem[],
	placeholder: string,
) {
	try {

		// Select translation
		const selection = await window.showQuickPick(
			quickpicks,
			{
				placeHolder: placeholder,
				matchOnDescription: true,
				matchOnDetail: true,
			}
		);
		if (!selection) {
			return;
		}

		// Select language
		const language = await pickLanguage();
		if (!language) {
			return;
		}

		// Get translation text.
		let translation = '';
		if (language == 'Deutsch') {
			translation = selection.label;
		} else {
			translation = selection.detail || selection.label;
		}
		translation = translation.trim();

		// Select task. If we have no editor, we can only copy the value, but not insert it.
		const editor = vscode.window.activeTextEditor;
		const task = await pickTask(editor);
		if (!task) {
			return;
		}

		// Exec task.
		if (task === TASK_COPY) {
			vscode.env.clipboard.writeText(translation);
		}
		if (editor && task === TASK_INSERT) {
			editor.edit(e => {
				e.replace(editor.selection.active, translation);
			});
		}

	} catch (error) {
		console.error('Error showing the translation dialogues:', error);
		vscode.window.showErrorMessage('Error showing the translation dialogues.');
	}
}

/**
 * Filters the array to unique items based on the specified keys.
 * @param array The array to filter.
 * @param keys The keys to determine uniqueness.
 * @returns A new array with unique items based on the specified keys.
 */
function filterUniqueBy<T>(array: T[], ...keys: (keyof T)[]): T[] {
    const seen = new Set<string>();
    return array.filter(item => {
        const compositeKey = keys.map(k => String(item[k])).join('|');
        if (seen.has(compositeKey)) {
			return false;
		}
        seen.add(compositeKey);
        return true;
    });
}

/**
 * Shows a quick pick to select a language.
 */
async function pickLanguage() {
	return await window.showQuickPick(
		LANGUAGES,
		{
			placeHolder: 'Search for a language ...',
		}
	);
}

/**
 * Shows a quick pick to select a task.
 */
async function pickTask(editor: vscode.TextEditor | undefined) {
	return await window.showQuickPick(
		editor ? TASKS : [TASK_COPY],
		{
			placeHolder: 'What would you like to do now?',
		}
	);
}

/**
 * Shows a quick pick to select a class, then a language and finally a task to do with the translation (copy or insert).
 */
export async function translateClass() {
	try {
		// Load data (uses the cache, if available)
		const classes = await getModel<VertecClass>(false);

		if (!classes || classes.length === 0) {
			vscode.window.showWarningMessage('No classes found.');
			return;
		}

		// Map classes to quick pick items.
		const classQuickPickItems = classes.map((vertecclass: VertecClass) => {
			return new ClassQuickPickItem(vertecclass);
		});

		await showTranslationDialogues(
			classQuickPickItems.sort((a, b) => a.label.localeCompare(b.label)),
			'Search for a class ...'
		);

	} catch (error) {
		console.error('Error loading the data:', error);
		vscode.window.showErrorMessage('An error occured while loading the model data.');
	}
}

/**
 * Shows a quick pick to select a member, then a language and finally a task to do with the translation (copy or insert).
 */
export async function translateMember() {
	try {
		// Load data (uses the cache, if available)
		const classes = await getModel<VertecClass>(false);

		if (!classes || classes.length === 0) {
			vscode.window.showWarningMessage('No classes found.');
			return;
		}

		// Create quick pick items for all members and associations of all classes.
		const memberQuickPickItems: QuickPickItem[] = [];
		classes.forEach(vertecclass => {
			if (vertecclass.members) {
				vertecclass.members.forEach(member => {
					memberQuickPickItems.push(new MemberQuickPickItem(member));
				});
			}
			if (vertecclass.associations) {
				vertecclass.associations.forEach(association => {
					memberQuickPickItems.push(new AssociationQuickPickItem(association));
				});
			}
		});

		await showTranslationDialogues(
			filterUniqueBy(memberQuickPickItems, 'label', 'detail').sort((a, b) => a.label.localeCompare(b.label)),
			'Search for a member or association ...'
		);


	} catch (error) {
		console.error('Error loading the data:', error);
		vscode.window.showErrorMessage('An error occured while loading the model data.');
	}
}

/**
 * Shows a quick pick to select a member, then a language and finally a task to do with the translation (copy or insert).
 */
export async function translateText() {
	try {
		// Load data (uses the cache, if available).
		const translations = await getTranslations<VertecTranslation>(false);

		if (!translations || translations.length === 0) {
			vscode.window.showWarningMessage('No translations found.');
			return;
		}

		// Map translations to quick pick items.
		const translationItems = translations.map((translation: VertecTranslation) => {
			return new TranslationQuickPickItem(translation);
		});

		await showTranslationDialogues(
			translationItems.sort((a, b) => a.label.localeCompare(b.label)),
			'Search for a text ...'
	);

	} catch (error) {
		console.error('Error loading the data:', error);
		vscode.window.showErrorMessage('An error occured while loading the translations data.');
	}
}
