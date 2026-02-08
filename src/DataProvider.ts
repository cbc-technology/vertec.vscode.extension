import * as vscode from 'vscode';
import axios from 'axios';

interface ModelApiResponse<T> {
    count: number;
    next: string | null;
    previous: string | null;
    results: T[];
}

interface VertecMember {
    name: string;
    name_alt?: string;
    member_type?: string;
    description?: string;
    length?: number;
    is_nullable?: boolean;
    is_derived?: boolean;
    is_indexed?: boolean;
}

interface VertecAssociation {
    name: string;
    name_alt?: string;
    perceived_name?: string;
    association_class: VertecClassRef;
    description?: string;
    is_derived?: boolean
    role1_class?: VertecClassRef;
    role2_class?: VertecClassRef;
    role1_name?: string;
    role2_name?: string;
    is_role1_navigable?: boolean;
    is_role2_navigable?: boolean;
    is_role1_multi?: boolean;
    is_role2_multi?: boolean;
    is_role1_composite?: boolean;
    is_role2_composite?: boolean;
    is_role1_hidden?: boolean;
    is_role2_hidden?: boolean;
    role1_description?: string;
    role2_description?: string;
}

interface VertecClassRef {
    name: string;
    class_id: number;
}

export interface VertecClass {
    name: string;
    name_alt?: string;
    class_id: number;
    superclass?: VertecClassRef;
    table_mapping?: string,
    is_abstract?: boolean,
    is_persistent?: boolean,
    is_hidden?: boolean,
    description?: string,
    members?: VertecMember[];
    associations?: VertecAssociation[];
}

export interface EnrichedVertecMember extends VertecMember {
    sourceClass?: string; // Name of the class from which the member originates.
}

export interface EnrichedVertecAssociation extends VertecAssociation {
    sourceClass?: string; // Name of the class from which the association originates.
}


/*
* Model cache implementation with an in memory and gloablState cache layer.
* The cache duration can be configured in the extension settings and defaults to 30 days.
*/
class ModelCache<T> {
    private context: vscode.ExtensionContext | null = null;
    private cache: Map<string, { data: T[]; timestamp: number }> = new Map<string, { data: T[]; timestamp: number }>();

    /**
     * Initialisiert den Cache mit Extension Context für persistenten Storage
     */
    initialize(context: vscode.ExtensionContext): void {
        this.context = context;
        this.loadFromGlobalState();
    }

    /**
     * Loads the cache from globalState if it exists and is not expired.
     * Otherwise, clears the globalState cache.
     */
    private loadFromGlobalState(): void {
        if (!this.context) {
            return;
        }

        try {
            const cachedData = this.context.globalState.get<T[]>(CACHE_MODEL_KEY);
            const timestamp = this.context.globalState.get<number>(CACHE_TIMESTAMP_KEY);

            if (cachedData && timestamp) {
                const isExpired = Date.now() - timestamp > CACHE_LIFETIME * 24 * 60 * 60 * 1000; // Conversion from days to milliseconds.

                // If the cache data is still valid, load it into the in-memory cache.
                // Elese, clear the globalState cache.
                if (!isExpired) {
                    this.cache.set(CACHE_MODEL_KEY, {
                        data: cachedData,
                        timestamp: timestamp
                    });
                    console.log('Data loaded from cache.');
                } else {
                    console.log('Cached data expired, clearing data.');
                    this.clearGlobalState();
                }
            }
        } catch (error) {
            console.error('Error loading data from cache:', error);
        }
    }

    /**
     * Saves the data into the globalState cache with the current timestamp.
     */
    private async saveToGlobalState(data: T[], timestamp: number): Promise<void> {
        if (!this.context) {
            return;
        }

        try {
            await this.context.globalState.update(CACHE_MODEL_KEY, data);
            await this.context.globalState.update(CACHE_TIMESTAMP_KEY, timestamp);
            console.log('Data saved to cache');
        } catch (error) {
            console.error('Error saving data to cache:', error);
        }
    }

    /**
     * Cleas the the globalState cache entries for model data and timestamp.
     */
    private async clearGlobalState(): Promise<void> {
        if (!this.context) {
            return;
        }

        try {
            await this.context.globalState.update(CACHE_MODEL_KEY, undefined);
            await this.context.globalState.update(CACHE_TIMESTAMP_KEY, undefined);
            console.log('Cache cleared');
        } catch (error) {
            console.error('Error clearing cache:', error);
        }
    }

    get(): T[] | null {
        const cached = this.cache.get(CACHE_MODEL_KEY);
        if (!cached) {
            return null;
        }

        const isExpired = Date.now() - cached.timestamp > CACHE_LIFETIME * 24 * 60 * 60 * 1000; // Conversion from days to milliseconds.
        if (isExpired) {
            this.cache.delete(CACHE_MODEL_KEY);
            this.clearGlobalState();
            return null;
        }

        return cached.data;
    }

    set(data: T[]): void {
        const timestamp = Date.now();

        this.cache.set(CACHE_MODEL_KEY, {
            data,
            timestamp
        });
        this.saveToGlobalState(data, timestamp);
    }

    clear(): void {
        this.cache.clear();
        this.clearGlobalState();
    }
}


const CACHE_MODEL_KEY = 'vertec.cache.modeldata';
const CACHE_TRANSLATION_KEY = 'vertec.cache.translationdata';
const CACHE_TIMESTAMP_KEY = 'vertec.cache.timestamp';
const CACHE_LIFETIME = vscode.workspace.getConfiguration("vertecVscodeExtension").get("CacheLifetime", 30);
const MODEL_CACHE = new ModelCache<unknown>();


/**
 * Initionizes the model cache with the given extension context.
 * Must be called in the activate function of the extension to enable caching for the Model Browser data.
 */
export function initializeModelCache(context: vscode.ExtensionContext): void {
    MODEL_CACHE.initialize(context);
}

/**
 * Loads all data from a paginated url and caches the results
 * @param forceRefresh optional: ignore cache and reload data.
 * @returns Array with the results
 */
export async function getModel<T = unknown>(
    forceRefresh: boolean
): Promise<T[]> {
    const baseUrl = vscode.workspace.getConfiguration("vertecVscodeExtension").get("ModelUrl", "");

    // must we use the cache?
    if (!forceRefresh) {
        const cachedData = MODEL_CACHE.get() as unknown as T[] | null;
        if (cachedData) {
            console.log('Data loaded from cache.');
            return cachedData;
        }
    }

    const allResults: T[] = [];
    let currentUrl: string | null = baseUrl;
    let pageCount = 0;

    try {
        // Show progess to user, because backend is kinda slow.
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Loading Model Browser data',
                cancellable: false
            },
            async (progress) => {
                while (currentUrl) {
                    pageCount++;
                    progress.report({
                        message: `Page ${pageCount}`,
                        increment: pageCount === 1 ? 0 : undefined
                    });

                    const response = await axios.get<ModelApiResponse<T>>(currentUrl);

                    // Merge results
                    allResults.push(...response.data.results);

                    // Set net url
                    currentUrl = response.data.next;

                    console.log(`Page ${pageCount} loaded: ${response.data.results.length} entries.`);
                }

                progress.report({ message: 'All done!' });
            }
        );

        console.log(`Loaded ${allResults.length} entries in total from ${pageCount} pages.`);

        // Store data in cache (cache typed as unknown[])
        MODEL_CACHE.set(allResults);

        return allResults;

    } catch (error) {
        if (axios.isAxiosError(error)) {
            const errorMsg = `API error: ${error.message}`;
            vscode.window.showErrorMessage(errorMsg);
            throw new Error(errorMsg);
        }
        throw error;
    }
}

/**
 * Empties the Model Browser cache
 */
export function clearModelCache(): void {
    MODEL_CACHE.clear();
    vscode.window.showInformationMessage('Cleared Model Browser cache.');
}

/**
 * Resolves the inheritance hierarchy of a given class and collects all members and associations,
 * including the source class information.
 */
export function resolveInheritance(
    targetClass: VertecClass,
    allClasses: VertecClass[]
): {
    members: EnrichedVertecMember[];
    associations: EnrichedVertecAssociation[];
} {
    const EnrichedVertecMembers: EnrichedVertecMember[] = [];
    const EnrichedVertecAssociations: EnrichedVertecAssociation[] = [];

    // Helper function to recursively collect members and associations from the class hierarchy.
    function collectFromClass(currentClass: VertecClass): void {
        // Add members of the current class.
        if (currentClass.members) {
            currentClass.members.forEach(member => {
                EnrichedVertecMembers.push({
                    ...member,
                    sourceClass: currentClass.name_alt || currentClass.name
                });
            });
        }

        // Add associations of the current class.
        if (currentClass.associations) {
            currentClass.associations.forEach(assoc => {
                EnrichedVertecAssociations.push({
                    ...assoc,
                    sourceClass: currentClass.name_alt || currentClass.name
                });
            });
        }

        // Go the the parent class if it exists.
        if (currentClass.superclass) {
            const superclass = allClasses.find(
                cls => cls.class_id === currentClass.superclass!.class_id
            );

            if (superclass) {
                collectFromClass(superclass);
            }
        }
    }

    // Start collection from the target class.
    collectFromClass(targetClass);

    return {
        members: EnrichedVertecMembers,
        associations: EnrichedVertecAssociations
    };
}


/**
 * Reloads the translation data by clearing the cache and fetching the data again from the API.
 */
export async function reloadTranslations() {
    try {
        return;  // TODO
        // Empty cache
        clearTranslationsCache();

        // Reload Model Browser and force refresh cache.
        const translations = await getTranslations<VertecClass>(true);

        vscode.window.showInformationMessage(
            `Cache cleared and reloaded ${translations.length} translations!`
        );

    } catch (error) {
        console.error('Error loading the data:', error);
        vscode.window.showErrorMessage('An error occured while loading the translations data.');
    }
}

/**
 * Reloads the model data by clearing the cache and fetching the data again from the API.
 */
export async function reloadModel() {
    try {
        // Empty cache
        clearModelCache();

        // Reload Model Browser and force refresh cache.
        const classes = await getModel<VertecClass>(true);

        vscode.window.showInformationMessage(
            `Cache cleared and reloaded ${classes.length} classes!`
        );

    } catch (error) {
        console.error('Error loading the data:', error);
        vscode.window.showErrorMessage('An error occured while loaded the Model Browser data.');
    }
}
