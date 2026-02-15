import * as vscode from 'vscode';
import { VertecClass, EnrichedVertecMember, EnrichedVertecAssociation, getModel, resolveInheritance, getAssociationRoleInfo } from './DataProvider';

/**
 * Shared utilities for completion and hover providers
 */
class VertecModelHelper {
    /**
     * Loads class data from DataProvider
     */
    static async getClasses(): Promise<VertecClass[] | null> {
        try {
            return await getModel<VertecClass>(false);
        } catch (error) {
            console.error('Error loading Vertec model', error);
            return null;
        }
    }

    /**
     * Finds a class by name (German or English)
     */
    static findClass(classes: VertecClass[], className: string): VertecClass | null {
        const lowerClassName = className.toLowerCase();
        return classes.find(cls =>
            cls.name.toLowerCase() === lowerClassName ||
            cls.name_alt.toLowerCase() === lowerClassName
        ) || null;
    }

    /**
     * Try to map a member type to a class name
     */
    static mapMemberTypeToClassName(memberType: string, classes: VertecClass[]): string | null {
        const directMatch = classes.find(c =>
            c.name.toLowerCase() === memberType.toLowerCase() ||
            c.name_alt.toLowerCase() === memberType.toLowerCase()
        );

        if (directMatch) {
            return directMatch.name;
        }

        const typeLower = memberType.toLowerCase();

        const partialMatch = classes.find(c =>
            c.name.toLowerCase().includes(typeLower) ||
            c.name_alt.toLowerCase().includes(typeLower)
        );

        if (partialMatch) {
            return partialMatch.name;
        }

        return null;
    }

    /**
     * Builds documentation parts for a member
     */
    static buildMemberDocumentation(
        member: EnrichedVertecMember,
        ownerClass?: VertecClass
    ): string[] {
        const docParts: string[] = [];

        if (member.description) {
            docParts.push(member.description);
            docParts.push('');
        }

        docParts.push(`**Names:** ${member.name} | ${member.name_alt}`);
        docParts.push('');

        docParts.push(`**Type:** ${member.member_type || '-/-'}`);
        docParts.push('');

        if (member.sourceClass && ownerClass && member.sourceClass !== ownerClass.name && member.sourceClass !== ownerClass.name_alt) {
            docParts.push(`**Inherited from:** ${member.sourceClass}`);
            docParts.push('');
        }

        if (member.length) {
            docParts.push(`**Length:** ${member.length}`);
            docParts.push('');
        }

        docParts.push(`**Persistent:** ${!member.is_derived ? 'Yes' : 'No'}`);
        docParts.push('');
        docParts.push(`**Nullable:** ${member.is_nullable ? 'Yes' : 'No'}`);
        docParts.push('');
        docParts.push(`**Indexed:** ${member.is_indexed ? 'Yes' : 'No'}`);

        return docParts;
    }

    /**
     * Builds documentation parts for an association
     */
    static buildAssociationDocumentation(
        assoc: EnrichedVertecAssociation,
        currentClass: VertecClass,
        allClasses: VertecClass[]
    ): string[] {
        const roleInfo1 = getAssociationRoleInfo(assoc, currentClass, allClasses);
        const roleInfo2 = getAssociationRoleInfo(assoc, currentClass, allClasses, true);

        const docParts: string[] = [];

        if (roleInfo2?.role_description) {
            docParts.push(roleInfo2.role_description);
            docParts.push('\n');
        }

        docParts.push(`**Names:** ${assoc.perceived_name} | ${assoc.perceived_name_alt}`);
        docParts.push('\n');

        docParts.push(`**Class:** ${roleInfo1?.role_class?.name || '-/-'} | ${roleInfo1?.role_class_alt?.name || '-/-'}`);
        docParts.push('');

        if (assoc.sourceClass && assoc.sourceClass !== currentClass.name && assoc.sourceClass !== currentClass.name_alt) {
            docParts.push(`**Inherited from:** ${assoc.sourceClass}`);
            docParts.push('');
        }

        if (assoc.association_class) {
            docParts.push(`**Link Class:** ${assoc.association_class.name}`);
            docParts.push('');
        }

        docParts.push(`**Navigable:** ${roleInfo2?.is_role_navigable ? 'Yes' : 'No'}`);
        docParts.push('');

        docParts.push(`**Persistent:** ${!assoc.is_derived ? 'Yes' : 'No'}`);
        docParts.push('');

        docParts.push(`**Multi:** ${roleInfo2?.is_role_multi ? 'Yes' : 'No'}`);
        docParts.push('');

        return docParts;
    }

    /**
     * Builds documentation for a class
     */
    static buildClassDocumentation(cls: VertecClass): string[] {
        const docParts: string[] = [];

        if (cls.description) {
            docParts.push(cls.description);
            docParts.push('');
        }

        docParts.push(`**Names:** ${cls.name} | ${cls.name_alt} (ID: ${cls.class_id})`);
        docParts.push('\n');

        if (cls.table_mapping) {
            docParts.push(`**DB:** ${cls.table_mapping}`);
            docParts.push('');
        }

        if (cls.superclass) {
            docParts.push(`**Parent:** ${cls.superclass.name}`);
            docParts.push('');
        }

        docParts.push(`**Persistent:** ${cls.is_persistent ? 'Yes' : 'No'}`);
        docParts.push('');

        return docParts;
    }
}

/**
 * Activates the AutoCompletor by registering the completion provider
 */
export function activateAutoCompletor(context: vscode.ExtensionContext): void {
    const providerInstance = new VertecCompletionProvider();

    const provider = vscode.languages.registerCompletionItemProvider(
        [
            { scheme: 'file', language: 'python' },
            { scheme: 'untitled', language: 'python' }
        ],
        providerInstance,
        '.', // Trigger on dot
        ...('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ_'.split('')) // Trigger on any letter or underscore
    );

    context.subscriptions.push(provider);

    activateHoverProvider(context, providerInstance);
}

/**
 * Completion Item Provider for Vertec Python scripts
 */
class VertecCompletionProvider implements vscode.CompletionItemProvider {
    /**
     * Provides completion items for the current cursor position
     */
    async provideCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.CompletionItem[] | vscode.CompletionList | undefined> {

        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        // Match: object.property.another OR object.partial
        // Captures the full chain before the last dot
        const match = textBeforeCursor.match(/(\w+(?:\.\w+|\[[\d\w]+\])*)\.(\w*)$/);
        if (!match) {
            return undefined;
        }

        const fullChain = match[1];

        // Resolve the full chain
        const { className, isList } = await this.resolveChain(document, position, fullChain);

        // If we end with a list, NO completions (user needs to add [0])
        if (isList || !className) {
            return undefined;
        }

        const classes = await VertecModelHelper.getClasses();
        if (!classes || classes.length === 0) {
            return undefined;
        }

        const cls = VertecModelHelper.findClass(classes, className);
        if (!cls) {
            return undefined;
        }

        const items = this.generateCompletionItems(cls, classes);

        return items;
    }

    /**
     * Resolves a chain expression to its final type
     * Centralized function used by all completion and hover features
     */
    private async resolveChain(
        document: vscode.TextDocument,
        position: vscode.Position,
        chain: string
    ): Promise<{ className: string | null; isList: boolean }> {
        const parts = this.parseChainParts(chain);
        if (parts.length === 0) {
            return { className: null, isList: false };
        }

        // Find type of base variable
        const baseVar = parts[0].name;
        let currentClassName = await this.findVariableTypeSimple(document, position, baseVar);
        if (!currentClassName) {
            return { className: null, isList: false };
        }

        const classes = await VertecModelHelper.getClasses();
        if (!classes) {
            return { className: null, isList: false };
        }

        // Check if the base variable itself is a list
        // This handles cases like: phases = projekt.phasen; phases[0].aktiv
        let isList = await this.isVariableAList(document, position, baseVar);

        // Walk through the chain
        for (let i = 1; i < parts.length; i++) {
            const part = parts[i];

            if (part.isListAccess) {
                // [0] or [i] - can only be used on lists
                if (!isList) {
                    return { className: null, isList: false };
                }
                // After accessing [0], we have a single element
                isList = false;
                continue;
            }

            // Cannot access properties on a list without indexing first
            if (isList) {
                return { className: null, isList: false };
            }

            const currentClass = VertecModelHelper.findClass(classes, currentClassName);
            if (!currentClass) {
                return { className: null, isList: false };
            }

            const { members, associations } = resolveInheritance(currentClass, classes);

            const member = members.find(m =>
                m.name.toLowerCase() === part.name.toLowerCase() ||
                m.name_alt.toLowerCase() === part.name.toLowerCase()
            );

            if (member && member.member_type) {
                const mappedType = VertecModelHelper.mapMemberTypeToClassName(member.member_type, classes);
                if (mappedType) {
                    currentClassName = mappedType;
                    isList = false; // Members are never lists
                    continue;
                } else {
                    return { className: null, isList: false };
                }
            }

            const association = associations.find(a =>
                a.perceived_name.toLowerCase() === part.name.toLowerCase() ||
                a.perceived_name_alt?.toLowerCase() === part.name.toLowerCase()
            );

            if (association) {
                const roleInfo = getAssociationRoleInfo(association, currentClass, classes);
                const roleInfo2 = getAssociationRoleInfo(association, currentClass, classes, true);
                if (roleInfo?.role_class) {
                    currentClassName = roleInfo.role_class.name;
                    // THIS IS THE KEY: Check if association is multi
                    isList = roleInfo2?.is_role_multi === true;
                    continue;
                } else {
                    return { className: null, isList: false };
                }
            }

            return { className: null, isList: false };
        }

        return { className: currentClassName, isList };
    }

    /**
     * Finds the type of a variable by scanning for type hints in comments
     */
    async findVariableType(
        document: vscode.TextDocument,
        position: vscode.Position,
        variableName: string
    ): Promise<string | null> {

        const lineText = document.lineAt(position).text;
        const textBeforeCursor = lineText.substring(0, position.character);

        const chainMatch = textBeforeCursor.match(/(\w+(?:\.\w+|\[[\d\w]+\])+)\.$/);
        if (chainMatch) {
            const fullChain = chainMatch[1];
            const { className, isList } = await this.resolveChain(document, position, fullChain);

            // If ends with a list, cannot get type
            if (isList) {
                return null;
            }

            return className;
        }

        return this.findVariableTypeSimple(document, position, variableName);
    }

    /**
     * Finds where a variable was assigned and returns its type with list info
     * This is specifically for tracking list variables through assignments
     */
    private async findVariableAssignmentWithListInfo(
        document: vscode.TextDocument,
        startLine: number,
        variableName: string
    ): Promise<{ className: string | null; isList: boolean } | null> {
        for (let i = startLine; i >= 0; i--) {
            const line = document.lineAt(i).text;

            // Look for assignment
            const assignmentRegex = new RegExp(`${variableName}\\s*=\\s*(\\w+(?:\\.\\w+|\\[[\\d\\w]+\\])*)`);
            const assignmentMatch = line.match(assignmentRegex);
            if (assignmentMatch) {
                const sourceExpression = assignmentMatch[1];

                // Check if there's a type hint on previous line
                if (i > 0) {
                    const prevLine = document.lineAt(i - 1).text;
                    const typeMatch = prevLine.match(/#\s*type:\s*([\w]+)/);
                    if (typeMatch) {
                        // Type hint doesn't tell us if it's a list, so we default to non-list
                        return { className: typeMatch[1], isList: false };
                    }
                }

                // Resolve the source expression with list info
                return await this.resolveExpressionWithListInfo(document, i, sourceExpression);
            }

            // Don't scan beyond function or class boundaries
            if (line.match(/^(def|class)\s+/)) {
                break;
            }
        }

        return null;
    }

    /**
     * Checks if a variable contains a list by tracking its assignment
     */
    private async isVariableAList(
        document: vscode.TextDocument,
        position: vscode.Position,
        variableName: string
    ): Promise<boolean> {
        for (let i = position.line; i >= 0; i--) {
            const line = document.lineAt(i).text;

            // Check for assignment (e.g., phases = projekt.phasen)
            const assignmentRegex = new RegExp(`${variableName}\\s*=\\s*(\\w+(?:\\.\\w+|\\[[\\d\\w]+\\])*)`);
            const assignmentMatch = line.match(assignmentRegex);
            if (assignmentMatch) {
                const sourceExpression = assignmentMatch[1];

                // Resolve the source expression with list info
                const resolvedInfo = await this.resolveExpressionWithListInfo(document, i, sourceExpression);
                if (resolvedInfo) {
                    return resolvedInfo.isList;
                }

                return false;
            }

            // Don't scan beyond function or class boundaries
            if (line.match(/^(def|class)\s+/)) {
                break;
            }
        }

        return false;
    }

    /**
     * Parses a chain like "projekt.aktivitaeten[0].phase" into parts
     */
    private parseChainParts(chain: string): { name: string; isListAccess: boolean }[] {
        const parts: { name: string; isListAccess: boolean }[] = [];
        const regex = /(\w+)|\[[\d\w]+\]/g;
        let match;

        while ((match = regex.exec(chain)) !== null) {
            if (match[0].startsWith('[')) {
                parts.push({ name: '', isListAccess: true });
            } else {
                parts.push({ name: match[0], isListAccess: false });
            }
        }

        return parts;
    }

    /**
     * Simple type hint search with improved variable tracking
     * Returns the element type (for lists) or the direct type
     */
    private async findVariableTypeSimple(
        document: vscode.TextDocument,
        position: vscode.Position,
        variableName: string
    ): Promise<string | null> {

        for (let i = position.line; i >= 0; i--) {
            const line = document.lineAt(i).text;

            // Pattern 1: Inline type hint
            const inlineRegex = new RegExp(`${variableName}\\s*=.*#\\s*type:\\s*([\\w]+)`);
            const inlineMatch = line.match(inlineRegex);
            if (inlineMatch) {
                return inlineMatch[1];
            }

            // Pattern 2: For-loop iteration (e.g., for phase in phases:)
            const forLoopRegex = new RegExp(`for\\s+${variableName}\\s+in\\s+(\\w+(?:\\.\\w+|\\[[\\d\\w]+\\])*)\\s*:`);
            const forLoopMatch = line.match(forLoopRegex);
            if (forLoopMatch) {
                const iterableExpression = forLoopMatch[1];

                // Check if there's a type hint on previous line
                if (i > 0) {
                    const prevLine = document.lineAt(i - 1).text;
                    const typeMatch = prevLine.match(/#\s*type:\s*([\w]+)/);
                    if (typeMatch) {
                        return typeMatch[1];
                    }
                }

                // Check if iterableExpression is a simple variable name (no dots or brackets)
                if (/^\w+$/.test(iterableExpression)) {
                    // It's a variable - we need to find what it contains
                    // First, find where this variable was assigned
                    const iterableInfo = await this.findVariableAssignmentWithListInfo(document, i, iterableExpression);
                    if (iterableInfo && iterableInfo.isList && iterableInfo.className) {
                        // Return the element type of the list
                        return iterableInfo.className;
                    }
                } else {
                    // It's an expression like projekt.phasen - resolve it directly
                    const resolvedInfo = await this.resolveExpressionWithListInfo(document, i, iterableExpression);
                    if (resolvedInfo && resolvedInfo.isList && resolvedInfo.className) {
                        // Return the element type of the list
                        return resolvedInfo.className;
                    }
                }

                return null;
            }

            // Pattern 3: Assignment from another variable (e.g., pl = projekt.projektleiter)
            const assignmentRegex = new RegExp(`${variableName}\\s*=\\s*(\\w+(?:\\.\\w+|\\[[\\d\\w]+\\])*)`);
            const assignmentMatch = line.match(assignmentRegex);
            if (assignmentMatch) {
                const sourceExpression = assignmentMatch[1];

                // Check if there's a type hint on previous line
                if (i > 0) {
                    const prevLine = document.lineAt(i - 1).text;
                    const typeMatch = prevLine.match(/#\s*type:\s*([\w]+)/);
                    if (typeMatch) {
                        return typeMatch[1];
                    }
                }

                // Try to resolve the source expression
                const resolvedType = await this.resolveExpression(document, i, sourceExpression);
                if (resolvedType) {
                    return resolvedType;
                }

                return null;
            }

            // Pattern 4: Function parameter with type hint
            const paramRegex = new RegExp(`def\\s+\\w+\\s*\\([^)]*${variableName}[^)]*\\).*#\\s*type:\\s*\\(([^)]+)\\)`);
            const paramMatch = line.match(paramRegex);
            if (paramMatch) {
                const types = paramMatch[1].split(',').map(t => t.trim());
                if (types.length > 0) {
                    return types[0];
                }
            }

            // Don't scan beyond function or class boundaries
            if (line.match(/^(def|class)\s+/)) {
                break;
            }
        }

        return null;
    }

    /**
     * Resolves an expression like "projekt.projektleiter" or "liste[0]" to its type
     */
    private async resolveExpression(
        document: vscode.TextDocument,
        currentLine: number,
        expression: string
    ): Promise<string | null> {
        // Create a position at the end of the line for proper context
        const line = document.lineAt(currentLine).text;
        const position = new vscode.Position(currentLine, line.length);

        const { className, isList } = await this.resolveChain(document, position, expression);

        // If ends with a list, cannot use as a type
        if (isList) {
            return null;
        }

        return className;
    }

    /**
     * Resolves an expression and returns both className and isList info
     * Used for tracking list types in variables
     */
    private async resolveExpressionWithListInfo(
        document: vscode.TextDocument,
        currentLine: number,
        expression: string
    ): Promise<{ className: string | null; isList: boolean } | null> {
        // Create a position at the end of the line for proper context
        const line = document.lineAt(currentLine).text;
        const position = new vscode.Position(currentLine, line.length);

        return await this.resolveChain(document, position, expression);
    }

    /**
     * Generates completion items for a class (members and associations)
     */
    private generateCompletionItems(
        cls: VertecClass,
        allClasses: VertecClass[]
    ): vscode.CompletionItem[] {
        const items: vscode.CompletionItem[] = [];

        const { members, associations } = resolveInheritance(cls, allClasses);

        members.forEach(member => {
            items.push(this.createMemberCompletionItem(member, cls));
        });

        associations.forEach(assoc => {
            items.push(this.createAssociationCompletionItem(assoc, cls, allClasses));
        });

        return items;
    }

    /**
     * Creates a completion item for a member
     */
    private createMemberCompletionItem(
        member: EnrichedVertecMember,
        ownerClass: VertecClass
    ): vscode.CompletionItem {

        const item = new vscode.CompletionItem(
            member.name,
            member.completionKind
        );

        const docParts = VertecModelHelper.buildMemberDocumentation(member, ownerClass);
        item.documentation = new vscode.MarkdownString(docParts.join('\n'));
        item.filterText = `${member.name} | ${member.name_alt}`;
        item.sortText = `${member.name} | ${member.name_alt}`;
        item.detail = member.member_type || 'Member';

        return item;
    }

    /**
     * Creates a completion item for an association
     */
    private createAssociationCompletionItem(
        assoc: EnrichedVertecAssociation,
        ownerClass: VertecClass,
        allClasses: VertecClass[]
    ): vscode.CompletionItem {

        const roleInfo = getAssociationRoleInfo(assoc, ownerClass, allClasses);

        const item = new vscode.CompletionItem(
            assoc.perceived_name,
            assoc.completionKind
        );

        const docParts = VertecModelHelper.buildAssociationDocumentation(assoc, ownerClass, allClasses);
        item.documentation = new vscode.MarkdownString(docParts.join('\n'));
        item.detail = `→ ${roleInfo?.role_class?.name} | ${roleInfo?.role_class_alt?.name}`;
        item.filterText = `${assoc.perceived_name} | ${assoc.perceived_name_alt}`;
        item.sortText = `${assoc.perceived_name} | ${assoc.perceived_name_alt}`;

        return item;
    }
}

/**
 * Provides hover information for Vertec objects.
 */
class VertecHoverProvider implements vscode.HoverProvider {
    private completionProvider: VertecCompletionProvider;

    constructor(completionProvider: VertecCompletionProvider) {
        this.completionProvider = completionProvider;
    }

    async provideHover(
        document: vscode.TextDocument,
        position: vscode.Position,
    ): Promise<vscode.Hover | undefined> {

        const wordRange = document.getWordRangeAtPosition(position);
        if (!wordRange) {
            return undefined;
        }
        const word = document.getText(wordRange);
        const line = document.lineAt(position.line).text;

        // Case 1: Hover over type hint (e.g., "# type: Projekt")
        const typeHintMatch = line.match(/#\s*type:\s*(\w+)/);
        if (typeHintMatch && typeHintMatch[1] === word) {
            return this.createClassHover(word);
        }

        // Case 2: Hover over variable or property access (e.g., "projekt" or "projekt.kunde")
        const textBeforeWord = line.substring(0, wordRange.start.character);
        const textAfterWord = line.substring(wordRange.end.character);

        // Check if this is a property access (something.word)
        const beforeMatch = textBeforeWord.match(/(\w+(?:\.\w+)*)\.$/);
        if (beforeMatch) {
            return this.createPropertyHover(document, position, beforeMatch[1], word);
        }

        // Check if this is the start of a chain (word.something)
        const afterMatch = textAfterWord.match(/^\./);
        if (afterMatch) {
            return this.createVariableHover(document, position, word);
        }

        // Check if this is just a variable name
        const varMatch = textBeforeWord.match(/\b$/);
        if (varMatch && !textAfterWord.match(/^\w/)) {
            return this.createVariableHover(document, position, word);
        }

        return undefined;
    }

    /**
     * Creates hover info for a class name in a type hint
     */
    private async createClassHover(className: string): Promise<vscode.Hover | undefined> {
        const classes = await VertecModelHelper.getClasses();
        if (!classes) {
            return undefined;
        }

        const cls = VertecModelHelper.findClass(classes, className);
        if (!cls) {
            return undefined;
        }

        const hoverParts: string[] = [];
        const docParts = VertecModelHelper.buildClassDocumentation(cls);
        hoverParts.push(...docParts);

        return new vscode.Hover(new vscode.MarkdownString(hoverParts.join('\n')));
    }

    /**
     * Creates hover info for a variable (shows its class)
     */
    private async createVariableHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        variableName: string
    ): Promise<vscode.Hover | undefined> {
        const className = await this.completionProvider.findVariableType(document, position, variableName);
        if (!className) {
            return undefined;
        }

        return this.createClassHover(className);
    }

    /**
     * Creates hover info for a property access (shows member or association info)
     */
    private async createPropertyHover(
        document: vscode.TextDocument,
        position: vscode.Position,
        basePath: string,
        propertyName: string
    ): Promise<vscode.Hover | undefined> {
        const classes = await VertecModelHelper.getClasses();
        if (!classes) {
            return undefined;
        }

        // Resolve the base path to get current class
        const { className: currentClassName, isList } = await this.completionProvider['resolveChain'](document, position, basePath);

        // Cannot show hover if we're on a list
        if (isList || !currentClassName) {
            return undefined;
        }

        // Now find the property in the current class
        const currentClass = VertecModelHelper.findClass(classes, currentClassName);
        if (!currentClass) {
            return undefined;
        }

        const { members, associations } = resolveInheritance(currentClass, classes);

        // Check if it's a member
        const member = members.find(m =>
            m.name.toLowerCase() === propertyName.toLowerCase() ||
            m.name_alt.toLowerCase() === propertyName.toLowerCase()
        );

        if (member) {
            return this.createMemberHover(member, currentClass);
        }

        // Check if it's an association
        const association = associations.find(a =>
            a.perceived_name.toLowerCase() === propertyName.toLowerCase() ||
            a.perceived_name_alt?.toLowerCase() === propertyName.toLowerCase()
        );

        if (association) {
            return this.createAssociationHover(association, currentClass, classes);
        }

        return undefined;
    }

    /**
     * Creates hover info for a member
     */
    private createMemberHover(member: EnrichedVertecMember, ownerClass: VertecClass): vscode.Hover {
        const hoverParts: string[] = [];
        const docParts = VertecModelHelper.buildMemberDocumentation(member, ownerClass);
        hoverParts.push(...docParts);

        return new vscode.Hover(new vscode.MarkdownString(hoverParts.join('\n')));
    }

    /**
     * Creates hover info for an association
     */
    private createAssociationHover(
        association: EnrichedVertecAssociation,
        currentClass: VertecClass,
        allClasses: VertecClass[]
    ): vscode.Hover {
        const hoverParts: string[] = [];
        const docParts = VertecModelHelper.buildAssociationDocumentation(association, currentClass, allClasses);
        hoverParts.push(...docParts);

        return new vscode.Hover(new vscode.MarkdownString(hoverParts.join('\n')));
    }
}

/**
 * Activates hover support
 */
export function activateHoverProvider(
    context: vscode.ExtensionContext,
    completionProvider: VertecCompletionProvider
): void {
    try {
        const provider = vscode.languages.registerHoverProvider(
            [
                { scheme: 'file', language: 'python' },
                { scheme: 'untitled', language: 'python' }
            ],
            new VertecHoverProvider(completionProvider)
        );

        context.subscriptions.push(provider);
    } catch (error) {
        console.error('Failed to activate Hover Provider', error);
    }
}