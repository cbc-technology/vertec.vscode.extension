import * as vscode from 'vscode';

export async function compareClipboard() {
    // Get active editor.
    const activeEditor = vscode.window.activeTextEditor;
    if (!activeEditor) {
        vscode.window.showWarningMessage('Please open a file in the editor first.');
        return;
    }

    // Read clipboard content.
    const clipboardContent = await vscode.env.clipboard.readText();
    if (!clipboardContent) {
        vscode.window.showWarningMessage('The clipboard is empty.');
        return;
    }

    // Get current editor content and compare with clipboard content.
    const currentContent = activeEditor.document.getText();
    if (currentContent === clipboardContent) {
        vscode.window.showInformationMessage('File and clipboard content are identical.');
        return;
    }

    // Get language ID from current document and create new untitled document with clipboard content.
    const languageId = activeEditor.document.languageId;
    const newDocument = await vscode.workspace.openTextDocument({
        content: clipboardContent,
        language: languageId
    });

    // Open the new document in a new editor.
    const newEditor = await vscode.window.showTextDocument(newDocument, {
        viewColumn: vscode.ViewColumn.Beside,
        preview: false
    });

    // Show diff between current document and clipboard content.
    await vscode.commands.executeCommand('vscode.diff',
        activeEditor.document.uri,
        newEditor.document.uri,
        `File content ↔ Clipboard content`
    );

    // Ask user if they want to replace the file content.
    const choice = await vscode.window.showInformationMessage(
        'Do you want to replace the file content with the clipboard content?',
        'Yes',
        'No'
    );

    if (choice === 'Yes') {
        // Replace the content in the original editor
        const edit = new vscode.WorkspaceEdit();
        const fullRange = new vscode.Range(
            activeEditor.document.positionAt(0),
            activeEditor.document.positionAt(currentContent.length)
        );
        edit.replace(activeEditor.document.uri, fullRange, clipboardContent);
        await vscode.workspace.applyEdit(edit);

        // Save the document if it's a file (not untitled)
        if (!activeEditor.document.isUntitled) {
            await activeEditor.document.save();
        }
    }

    // Close the diff view and the temporary clipboard document
    await vscode.window.showTextDocument(newDocument, { preview: false });
    await vscode.commands.executeCommand('workbench.action.revertAndCloseActiveEditor');

    // Focus back on the original editor
    await vscode.window.showTextDocument(activeEditor.document, {
        viewColumn: activeEditor.viewColumn,
        preview: false
    });
}