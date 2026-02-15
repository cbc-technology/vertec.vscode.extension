import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { VertecClass, getModel } from './DataProvider';

/**
 * Minimal Stub Provider for Vertec Classes
 *
 * Generates minimal stubs that only define class names for type checking
 * without interfering with the dynamic completion provider
 */

let stubsDirectory: string | null = null;

export async function activateStubProvider(context: vscode.ExtensionContext): Promise<void> {
    const globalStoragePath = context.globalStorageUri.fsPath;
    stubsDirectory = path.join(globalStoragePath, 'vertec_stubs');

    if (!fs.existsSync(stubsDirectory)) {
        fs.mkdirSync(stubsDirectory, { recursive: true });
    }

    const stubsExist = fs.existsSync(path.join(stubsDirectory, '__init__.pyi'));

    if (stubsExist) {
        await configurePylance(stubsDirectory);
    } else {
        await reloadStubs();
    }
}

/**
 * Force regeneration of stubs (can be called externally)
 */
export async function reloadStubs(): Promise<void> {
    if (!stubsDirectory) {
        throw new Error('Stub directory not initialized');
    }

    const classes = await getModel<VertecClass>(false);
    if (!classes || classes.length === 0) {
        throw new Error('No model data available');
    }

    await generateStubfile(classes, stubsDirectory);

    await configurePylance(stubsDirectory);

    vscode.window.showInformationMessage(
        `Reloaded ${classes.length} stub files!`
    );
}

/**
 * Generate minimal stub files that don't interfere with completion
 */
async function generateStubfile(classes: VertecClass[], outputDir: string): Promise<void> {
    const vertecModuleDir = path.join(outputDir, 'vertec');
    if (!fs.existsSync(vertecModuleDir)) {
        fs.mkdirSync(vertecModuleDir, { recursive: true });
    }

    // Generate __init__.pyi
    const initContent = generateInitStub(classes);
    fs.writeFileSync(path.join(vertecModuleDir, '__init__.pyi'), initContent);

    // Generate class stubs
    for (const vertecClass of classes) {
        const stubContent = generateClassStub(vertecClass);
        const fileName = `${vertecClass.name}.pyi`;
        fs.writeFileSync(path.join(vertecModuleDir, fileName), stubContent);
    }

    fs.writeFileSync(path.join(vertecModuleDir, 'py.typed'), '');

    // Root stub for type hints without import
    const rootStubContent = generateRootStub(classes);
    fs.writeFileSync(path.join(outputDir, '__builtins__.pyi'), rootStubContent);
}

/**
 * Generate class stub - only class definition with __getattr__
 * This allows type checking but doesn't provide completion items
 */
function generateClassStub(vertecClass: VertecClass): string {
    const lines: string[] = [];

    lines.push('"""Auto-generated stub for Vertec class"""');
    lines.push('from typing import Any');
    lines.push('');

    // Import parent class if needed
    if (vertecClass.superclass) {
        lines.push('from typing import TYPE_CHECKING');
        lines.push('if TYPE_CHECKING:');
        lines.push(`    from .${vertecClass.superclass.name} import ${vertecClass.superclass.name}`);
        lines.push('');
    }

    const parentClass = vertecClass.superclass ? vertecClass.superclass.name : 'object';
    lines.push(`class ${vertecClass.name}(${parentClass}):`);

    if (vertecClass.description) {
        lines.push(`    """${vertecClass.description}"""`);
    } else {
        lines.push(`    """Vertec class: ${vertecClass.name}"""`);
    }
    lines.push('');

    // __getattr__ allows any attribute without defining them
    lines.push('    def __getattr__(self, name: str) -> Any:');
    lines.push('        """Dynamic attribute access - allows any attribute"""');
    lines.push('        ...');
    lines.push('');

    return lines.join('\n');
}

function generateRootStub(classes: VertecClass[]): string {
    const lines: string[] = [];

    lines.push('"""Vertec Type Hints - Minimal stub for type checking"""');
    lines.push('from typing import TYPE_CHECKING');
    lines.push('');
    lines.push('if TYPE_CHECKING:');

    for (const cls of classes) {
        lines.push(`    from vertec.${cls.name} import ${cls.name} as ${cls.name}`);
    }

    lines.push('');
    lines.push('__all__ = [');
    for (const cls of classes) {
        lines.push(`    "${cls.name}",`);
    }
    lines.push(']');

    return lines.join('\n');
}

function generateInitStub(classes: VertecClass[]): string {
    const lines: string[] = [];

    lines.push('"""Vertec API Type Stubs - Minimal mode for type checking"""');
    lines.push('');

    for (const cls of classes) {
        lines.push(`from .${cls.name} import ${cls.name}`);
    }

    lines.push('');
    lines.push('__all__ = [');
    for (const cls of classes) {
        lines.push(`    "${cls.name}",`);
    }
    lines.push(']');

    return lines.join('\n');
}

async function configurePylance(stubDir: string): Promise<void> {
    const config = vscode.workspace.getConfiguration('python');
    const extraPaths = config.get<string[]>('analysis.extraPaths') || [];

    if (!extraPaths.includes(stubDir)) {
        extraPaths.push(stubDir);
        await config.update('analysis.extraPaths', extraPaths, vscode.ConfigurationTarget.Global);
    }
}

export function getStubDirectory(): string | null {
    return stubsDirectory;
}