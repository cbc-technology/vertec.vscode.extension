import * as vscode from 'vscode';
import { VertecClass, EnrichedVertecMember, EnrichedVertecAssociation, getModel, resolveInheritance, getAssociationRoleInfo } from './DataProvider';

/**
 * Show the model browser.
 */
export async function modelBrowse() {
    try {
        // Load data (uses the cache, if available)
        const classes = await getModel<VertecClass>(false);

        if (!classes || classes.length === 0) {
            vscode.window.showWarningMessage('No classes found.');
            return;
        }

        // Schleife für Navigation
        let keepBrowsing = true;

        while (keepBrowsing) {
            // Step 1 - choose the class
            const classItems = classes.map(cls => ({
                label: `${cls.name} | ${cls.name_alt}`,
                description: `(ID: ${cls.class_id})`,
                detail: `${cls.description} | DB: ${cls.table_mapping} | Parent: ${cls.superclass?.name} | Persistent: ${cls.is_persistent ? 'Yes' : 'No'}`,
                data: cls
            }));

            const selectedClassItem = await vscode.window.showQuickPick(classItems, {
                placeHolder: 'Search for a class ...',
                matchOnDescription: true,
                matchOnDetail: true
            });

            if (!selectedClassItem) {
                // User cancelled
                keepBrowsing = false;
                return;
            }

            const selectedClass = selectedClassItem.data;

            // Step 2 - Show members and associations
            const shouldGoBack = await showClassDetails(selectedClass, classes);

            if (!shouldGoBack) {
                // User cancelled or closed - exit completely
                keepBrowsing = false;
            }
            // If shouldGoBack is true, loop continues and shows class list again
        }

    } catch (error) {
        console.error('Error loading the data:', error);
        vscode.window.showErrorMessage('An error occured while loading the model data.');
    }
}


/**
 * Show the members and associations of a class
 * @returns true if user wants to go back, false if cancelled
 */
async function showClassDetails(vertecClass: VertecClass, allClasses: VertecClass[]): Promise<boolean> {
    const items = [];

    // Add a back option to return to the class list. Always on top.
    items.push({
        label: '$(arrow-left) back to classes',
        description: '',
        detail: '',
        alwaysShow: true,
    });

    // Resolve the full class hierarchy.
    const { members, associations } = resolveInheritance(vertecClass, allClasses);

    // Header for the classes
    if (members.length > 0) {
        // Add own members
        items.push({
            label: 'Own members',
            kind: vscode.QuickPickItemKind.Separator
        });
        members.forEach(member => {
            if (member.sourceClass === vertecClass.name || member.sourceClass === vertecClass.name_alt) {
                items.push({
                    label: `${member.name} | ${member.name_alt}`,
                    description: `${member.member_type} | Length: ${member.length}`,
                    detail: `${member.description || '-/-'} | Persistent: ${member.is_derived ? 'No' : 'Yes'} | Nullable: ${member.is_nullable ? 'Yes' : 'No'} | Indexed: ${member.is_indexed ? 'Yes' : 'No'}`,
                    data: member
                });
            }
        });

        // Add inherited members
        items.push({
            label: 'Inherited members',
            kind: vscode.QuickPickItemKind.Separator
        });
        members.forEach(member => {
            if (member.sourceClass !== vertecClass.name && member.sourceClass !== vertecClass.name_alt) {
                items.push({
                    label: `${member.name} | ${member.name_alt}`,
                    description: `${member.member_type} | Length: ${member.length} (from ${member.sourceClass})`,
                    detail: `${member.description || '-/-'} | Persistent: ${member.is_derived ? 'No' : 'Yes'} | Nullable: ${member.is_nullable ? 'Yes' : 'No'} | Indexed: ${member.is_indexed ? 'Yes' : 'No'}`,
                    data: member
                });
            }
        });
    }

    // Header for the associations
    if (associations.length > 0) {
        // Add own associations
        items.push({
            label: 'Own associations',
            kind: vscode.QuickPickItemKind.Separator,
            data: {}
        });
        associations.forEach(assoc => {
            if (assoc.sourceClass === vertecClass.name || assoc.sourceClass === vertecClass.name_alt){
                const roleInfo1 = getAssociationRoleInfo(assoc, vertecClass, allClasses);
                const roleInfo2 = getAssociationRoleInfo(assoc, vertecClass, allClasses, true);

                items.push({
                    label: `${assoc.perceived_name} | ${assoc.perceived_name_alt}`,
                    description: `→ ${roleInfo1?.role_class?.name || '-/-'} | ${roleInfo1?.role_class_alt?.name || '-/-'}`,
                    detail: `${roleInfo2?.role_description || '-/-'} | Link class: ${assoc.association_class?.name || '-/-'} | Persistent: ${assoc.is_derived ? 'No' : 'Yes'} | Multi: ${roleInfo2?.is_role_multi ? 'Yes' : 'No'}`,
                    data: assoc
                });
            }
        });

        // Add inherited associations
        items.push({
            label: 'Inherited associations',
            kind: vscode.QuickPickItemKind.Separator
        });
        associations.forEach(assoc => {
            if (assoc.sourceClass !== vertecClass.name && assoc.sourceClass !== vertecClass.name_alt){
                const roleInfo1 = getAssociationRoleInfo(assoc, vertecClass, allClasses);
                const roleInfo2 = getAssociationRoleInfo(assoc, vertecClass, allClasses, true);

                items.push({
                    label: `${assoc.perceived_name} | ${assoc.perceived_name_alt}`,
                    description: `→ ${roleInfo1?.role_class?.name || '-/-'} | ${roleInfo1?.role_class_alt?.name || '-/-'} (from ${assoc.sourceClass})`,
                    detail: `${roleInfo2?.role_description || '-/-'} | Link class: ${assoc.association_class?.name || '-/-'} | Persistent: ${assoc.is_derived ? 'No' : 'Yes'} | Multi: ${roleInfo2?.is_role_multi ? 'Yes' : 'No'}`,
                    data: assoc
                });
                }
        });
    }

    if (items.length === 0) {
        vscode.window.showInformationMessage(
            `Class "${vertecClass.name} | ${vertecClass.name_alt}" has no members or associations`
        );
        return false;
    }

    const selection = await vscode.window.showQuickPick(items, {
        placeHolder: `Search for a member or association ...`,
        matchOnDescription: true,
        matchOnDetail: true
    });

    // Go back?
    if (selection && selection.label.includes('back to classes')) {
        return true;
    }

    // Show details in Webview if something was selected.
    if (selection && selection.data && ('length' in selection.data || 'perceived_name' in selection.data)) {
        const shouldGoBack = await showClassDetailView(
            selection.data as EnrichedVertecMember | EnrichedVertecAssociation,
            vertecClass,
            allClasses
        );

        if (shouldGoBack) {
            // User wants to go back to member/association list, show it again.
            return showClassDetails(vertecClass, allClasses);
        }
    }

    return false;
}


/**
 * Shows all the detail information for a member / association in a web view panel.
 * @returns true if the user choose to go back to the member/association list, false otherwise.
 */
async function showClassDetailView(
    data: EnrichedVertecMember | EnrichedVertecAssociation,
    currentClass: VertecClass,
    allClasses: VertecClass[]
): Promise<boolean> {
    return new Promise((resolve) => {
        const panel = vscode.window.createWebviewPanel(
            'vertecMemberAssociationDetails',
            'length' in data ? 'Member Details' : 'Association Details',
            vscode.ViewColumn.One,
            {
                enableScripts: true
            }
        );

        // Generate the html content based on whether it's a member or an association.
        if ('length' in data) {
            panel.webview.html = getMemberDetailHtml(data as EnrichedVertecMember);
        } else if ('perceived_name' in data) {
            panel.webview.html = getAssociationDetailHtml(
                data as EnrichedVertecAssociation,
                currentClass,
                allClasses
            );
        } else {
            resolve(false);
        }

        // Get click on "back" button and go back to member/association list.
        panel.webview.onDidReceiveMessage(
            message => {
                if (message.command === 'goBack') {
                    resolve(true);
                    panel.dispose();
                }
            }
        );

        // If the user closes the panel, cancel full process.
        panel.onDidDispose(() => {
            resolve(false);
        });
    });
}


/**
 * Generates the HTML head content for the member/association details view.
 */
function getHtmlHead(): string {
    return `<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Member Details</title>
    <style>
        body {
            font-family: var(--vscode-font-family);
            padding: 20px;
            color: var(--vscode-foreground);
            background-color: var(--vscode-editor-background);
        }
        .back-button {
            background-color: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            cursor: pointer;
            margin-bottom: 20px;
            border-radius: 2px;
        }
        .back-button:hover {
            background-color: var(--vscode-button-hoverBackground);
        }
        h1 {
            color: var(--vscode-foreground);
            border-bottom: 1px solid var(--vscode-panel-border);
            padding-bottom: 10px;
        }
        h2 {
            color: var(--vscode-foreground);
            margin-top: 20px;
            font-size: 1.2em;
        }
        table {
            width: 100%;
            border-collapse: collapse;
            margin: 15px 0;
        }
        th, td {
            text-align: left;
            padding: 8px 12px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        th {
            background-color: var(--vscode-editor-inactiveSelectionBackground);
            font-weight: 600;
        }
        tr:hover {
            background-color: var(--vscode-list-hoverBackground);
        }
        .section {
            margin: 20px 0;
        }
        .badge {
            display: inline-block;
            padding: 2px 8px;
            border-radius: 3px;
            font-size: 0.85em;
            margin-right: 5px;
        }
        .badge-yes {
            background-color: #28a745;
            color: white;
        }
        .badge-no {
            background-color: #6c757d;
            color: white;
        }
        .info-row {
            display: flex;
            margin: 8px 0;
        }
        .info-label {
            font-weight: 600;
            width: 150px;
            color: var(--vscode-foreground);
        }
        .info-value {
            flex: 1;
            color: var(--vscode-descriptionForeground);
        }
    </style>
</head>`;
}


/**
 * Generates the HTML script content for the member/association details view.
 */
function getHtmlScript(): string {
    return `<script>
        const vscode = acquireVsCodeApi();

        function goBack() {
            vscode.postMessage({
                command: 'goBack'
            });
        }
    </script>`;
}


/**
 * Generates the HTML content for the member details view.
 */
function getMemberDetailHtml(member: EnrichedVertecMember): string {
    return `<!DOCTYPE html>
<html lang="en">
    ${getHtmlHead()}
    <body>
        <button class="back-button" onclick="goBack()">← Back to Members/Associations</button>

        <h1>Member: ${member.name || ''} | ${member.name_alt}</h1>

        <div class="section">
            <h2>Description</h2>
            <p>${member.description || '-/-'}</p>
        </div>

        <div class="section">
            <h2>Member attributes</h2>
            <table>
                <thead>
                    <tr>
                        <th>Property name</th>
                        <th>Value</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="info-label">Type:</td>
                        <td class="info-value">${member.member_type || '-/-'}</td>
                    </tr>
                    <tr>
                        <td class="info-label">Length:</td>
                        <td class="info-value">${member.length || '-/-'}</td>
                    </tr>
                    <tr>
                        <td class="info-label">Source Class:</td>
                        <td class="info-value">${member.sourceClass || '-/-'}</td>
                    </tr>
                    <tr>
                        <td>Persistent</td>
                        <td><span class="badge ${!member.is_derived ? 'badge-yes' : 'badge-no'}">${!member.is_derived ? 'Yes' : 'No'}</span></td>
                    </tr>
                    <tr>
                        <td>Nullable</td>
                        <td><span class="badge ${member.is_nullable ? 'badge-yes' : 'badge-no'}">${member.is_nullable ? 'Yes' : 'No'}</span></td>
                    </tr>
                    <tr>
                        <td>Indexed</td>
                        <td><span class="badge ${member.is_indexed ? 'badge-yes' : 'badge-no'}">${member.is_indexed ? 'Yes' : 'No'}</span></td>
                    </tr>
                </tbody>
            </table>
        </div>

        ${getHtmlScript()}
    </body>
</html>`;
}


/**
 * Generates the HTML content for the association details view.
 */
function getAssociationDetailHtml(
    assoc: EnrichedVertecAssociation,
    currentClass: VertecClass,
    allClasses: VertecClass[]
): string {
    const roleInfo1 = getAssociationRoleInfo(assoc, currentClass, allClasses);
    const roleInfo2 = getAssociationRoleInfo(assoc, currentClass, allClasses, true);

    return `<!DOCTYPE html>
<html lang="en">
    ${getHtmlHead()}
    <body>
        <button class="back-button" onclick="goBack()">← Back to Members/Associations</button>

        <h1>Association: ${assoc.perceived_name || ''} | ${assoc.perceived_name_alt || ''}</h1>

        <div class="section">
            <h2>Description</h2>
            <p>${roleInfo1?.role_description || '-/-'}</p>
        </div>

        <div class="section">
            <h2>Association attributes</h2>
            <table>
                <thead>
                    <tr>
                        <th>Property name</th>
                        <th>Value</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td class="info-label">Association Class:</td>
                        <td class="info-value">${assoc.association_class?.name || '-/-'} (ID: ${assoc.association_class?.class_id || '-/-'})</td>
                    </tr>
                    <tr>
                        <td class="info-label">Source Class:</td>
                        <td class="info-value">${assoc.sourceClass || '-/-'}</td>
                    </tr>
                    <tr>
                        <td>Persistent</td>
                        <td><span class="badge ${!assoc.is_derived ? 'badge-yes' : 'badge-no'}">${!assoc.is_derived ? 'Yes' : 'No'}</span></td>
                    </tr>
                </tbody>
            </table>
        </div>

        <div class="section">
            <h2>Role attributes</h2>
            <table>
                <thead>
                    <tr>
                        <th>Property name</th>
                        <th>Role 1 value</th>
                        <th>Role 2 value</th>
                    </tr>
                </thead>
                <tbody>
                    <tr>
                        <td>Class</td>
                        <td>${roleInfo1?.role_class?.name || '-/-'} | ${roleInfo1?.role_class_alt?.name || '-/-'}</td>
                        <td>${roleInfo2?.role_class?.name || '-/-'} | ${roleInfo2?.role_class_alt?.name || '-/-'}</td>
                    </tr>
                    <tr>
                        <td>Name</td>
                        <td>${roleInfo1?.role_name || '-/-'} | ${roleInfo1?.role_name_alt || '-/-'}</td>
                        <td>${roleInfo2?.role_name || '-/-'} | ${roleInfo2?.role_name_alt || '-/-'}</td>
                    </tr>
                    <tr>
                        <td>Description</td>
                        <td>${roleInfo1?.role_description || '-/-'}</td>
                        <td>${roleInfo2?.role_description || '-/-'}</td>
                    </tr>
                    <tr>
                        <td>Navigable</td>
                        <td><span class="badge ${roleInfo1?.is_role_navigable ? 'badge-yes' : 'badge-no'}">${roleInfo1?.is_role_navigable ? 'Yes' : 'No'}</span></td>
                        <td><span class="badge ${roleInfo2?.is_role_navigable ? 'badge-yes' : 'badge-no'}">${roleInfo2?.is_role_navigable ? 'Yes' : 'No'}</span></td>
                    </tr>
                    <tr>
                        <td>Multi</td>
                        <td><span class="badge ${roleInfo1?.is_role_multi ? 'badge-yes' : 'badge-no'}">${roleInfo1?.is_role_multi ? 'Yes' : 'No'}</span></td>
                        <td><span class="badge ${roleInfo2?.is_role_multi ? 'badge-yes' : 'badge-no'}">${roleInfo2?.is_role_multi ? 'Yes' : 'No'}</span></td>
                    </tr>
                    <tr>
                        <td>Composite</td>
                        <td><span class="badge ${roleInfo1?.is_role_composite ? 'badge-yes' : 'badge-no'}">${roleInfo1?.is_role_composite ? 'Yes' : 'No'}</span></td>
                        <td><span class="badge ${roleInfo2?.is_role_composite ? 'badge-yes' : 'badge-no'}">${roleInfo2?.is_role_composite ? 'Yes' : 'No'}</span></td>
                    </tr>
                    <tr>
                        <td>Hidden</td>
                        <td><span class="badge ${roleInfo1?.is_role_hidden ? 'badge-yes' : 'badge-no'}">${roleInfo1?.is_role_hidden ? 'Yes' : 'No'}</span></td>
                        <td><span class="badge ${roleInfo2?.is_role_hidden ? 'badge-yes' : 'badge-no'}">${roleInfo2?.is_role_hidden ? 'Yes' : 'No'}</span></td>
                    </tr>
                </tbody>
            </table>
        </div>

        ${getHtmlScript()}
    </body>
</html>`;
}