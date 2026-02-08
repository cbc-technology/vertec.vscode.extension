/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { QuickPickItem, window } from 'vscode';
import * as fs from 'fs';
import * as vscode from 'vscode';

/**
 * A multi-step input using window.createQuickPick() and window.createInputBox().
 *
 * This first part uses the helper class `Translator` that wraps the API for the multi-step case.
 */

const title = 'Vertec Visual Studio Code extension';
const languages = ['Englisch', 'Deutsch'];
const tasks = ['Copy value', 'Insert value'];

export async function translateClass() {
	// Select classname
	const classname = await window.showQuickPick(
		getClassesAndMembersJsonFile('class'),
		{
			placeHolder: 'Input the class name',
			title: title,
			matchOnDescription: true,
			matchOnDetail: true,
		}
	);
	if (!classname) {
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
		translation = classname.label;
	} else {
		translation = classname.description ? classname.description : '';
	}
	translation = translation.trim();

	// Get task to do
	const editor = vscode.window.activeTextEditor;
	const task = await pickTask();
	if (!task || !editor) {
		return;
	}

	// Exec task
	if (task == 'Copy value') {
		vscode.env.clipboard.writeText(translation);
	}
	if (task == 'Insert value') {
		editor.edit(e => {
            e.replace(editor.selection.active, translation);
        });
	}
}

export async function translateMember() {
	// Select membername
	const membername = await window.showQuickPick(
		getClassesAndMembersJsonFile('member'),
		{
			placeHolder: 'Input the member name',
			title: title,
			matchOnDescription: true,
			matchOnDetail: true,
		}
	);
	if (!membername) {
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
		translation = membername.label;
	} else {
		translation = membername.description ? membername.description : '';
	}
	translation = translation.trim();

	// Get task to do
	const editor = vscode.window.activeTextEditor;
	const task = await pickTask();
	if (!task || !editor) {
		return;
	}

	// Exec task
	if (task == 'Copy value') {
		vscode.env.clipboard.writeText(translation);
	}
	if (task == 'Insert value') {
		editor.edit(e => {
            e.replace(editor.selection.active, translation);
        });
	}
}

export async function translateText() {
	// Select membername
	const membername = await window.showQuickPick(
		getTranslationsJsonFile(),
		{
			placeHolder: 'Input the member name',
			title: title,
			matchOnDescription: true,
			matchOnDetail: true,
		}
	);
	if (!membername) {
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
		translation = membername.label;
	} else {
		translation = membername.detail ? membername.detail : '';
	}
	translation = translation.trim();

	// Get task to do
	const editor = vscode.window.activeTextEditor;
	const task = await pickTask();
	if (!task || !editor) {
		return;
	}

	// Exec task
	if (task == 'Copy value') {
		vscode.env.clipboard.writeText(translation);
	}
	if (task == 'Insert value') {
		editor.edit(e => {
            e.replace(editor.selection.active, translation);
        });
	}
}

async function pickLanguage() {
	return await window.showQuickPick(
		languages,
		{
			placeHolder: 'Select your language',
			title: title,
		}
	);
}

async function pickTask() {
	return await window.showQuickPick(
		tasks,
		{
			placeHolder: 'What should we do now?',
			title: title,
		}
	);
}

async function getClassesAndMembersJsonFile(type: string): Promise<QuickPickItem[]> {
	let jsonString = "";
	const path = vscode.workspace.getConfiguration("vertecVscodeExtension").get("ClassesMembersUrl", "");
	if (path === '') {
		window.showWarningMessage('No JSON file path found in the settings. Please specify file path.');
		return [].map(label => ({ label }));
	}

	try {
		jsonString = fs.readFileSync(path, 'utf8');
	} catch (err) {
		window.showWarningMessage(`Could not load JSON file from path: ${path} (Error: ${err})`);
		return [].map(label => ({ label }));
	}
	const jsonData = JSON.parse(jsonString);
	if (!jsonData) {
		return [].map(label => ({ label }));
	}

	let data = [];
	if (type === 'class') {
		data = jsonData.map((item: any) => {
			return new ClassTranslationItem(item.ClassDE, item.ClassEN);
		});
	} else {
		data = jsonData.map((item: any) => {
			return new ClassTranslationItem(item.MemberDE, item.MemberEN, jsonData.filter((subitem: any) => subitem.MemberDE === item.MemberDE).map((subitem: any) => {
				return `${subitem.ClassDE}, ${subitem.ClassEN}`;
			}).join(', '));
		});
	}

	return remove_object_duplicates(data, 'label');
}

async function getTranslationsJsonFile(): Promise<QuickPickItem[]> {
	let jsonString = "";
	const path = vscode.workspace.getConfiguration("vertecVscodeExtension").get("TranslationsUrl", "");
	if (path === '') {
		window.showWarningMessage('No JSON file path found in the settings. Please specify file path.');
		return [].map(label => ({ label }));
	}

	try {
		jsonString = fs.readFileSync(path, 'utf8');
	} catch (err) {
		window.showWarningMessage(`Could not load JSON file from path: ${path} (Error: ${err})`);
		return [].map(label => ({ label }));
	}
	const jsonData = JSON.parse(jsonString);
	if (!jsonData) {
		return [].map(label => ({ label }));
	}

	const data = jsonData.map((item: any) => {
		let de = '';
		if (item.NVD) {
			de = item.NVD;
		} else if (item.DD0) {
			de = item.DD0;
		} else if (item.DE0) {
			de = item.DE0;
		} else if (item.DD1) {
			de = item.DD1;
		} else {
			de = item.DE1;
		}

		let en = '';
		if (item.NVE) {
			en = item.NVE;
		} else if (item.EN0) {
			en = item.EN0;
		} else {
			en = item.EN1;
		}

		return new ClassTranslationItem(de, '', en);
	});

	return data;
}

function remove_object_duplicates(arr: [], key: any) {
    return [...new Map(arr.map(item => [item[key], item])).values()];
}

class ClassTranslationItem implements QuickPickItem {
	label: string;
	description = '';
	detail = '';

	constructor(label: string, description: string, detail = '') {
		this.label = label;
		this.description = description;
		this.detail = detail;
	}
}
