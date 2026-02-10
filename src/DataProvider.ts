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
    name_alt: string;
    member_type?: string;
    description?: string;
    length?: number;
    is_nullable?: boolean;
    is_derived?: boolean;
    is_indexed?: boolean;
}

interface VertecAssociation {
    name: string;
    name_alt: string;
    perceived_name: string;
    perceived_name_alt?: string;
    association_class: VertecClassRef;
    description?: string;
    is_derived?: boolean
    role1_class?: VertecClassRef;
    role1_class_alt?: VertecClassRef;
    role2_class?: VertecClassRef;
    role2_class_alt?: VertecClassRef;
    role1_name: string;
    role1_name_alt?: string;
    role2_name: string;
    role2_name_alt?: string;
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
    name_alt: string;
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

export interface VertecTranslation {
    NVD?: string;  // German (default)
    NVE?: string;  // English (default)
    EN0?: string;  // English project
    EN1?: string;  // English matters
    DE0?: string;  // Swiss german project
    DE1?: string;  // Siwss german matters
    DD0?: string;  // German project (DD)
    DD1?: string;  // German matters (DD)
    FR0?: string;  // French project
    FR1?: string;  // French matters
    IT0?: string;  // Italian project
    IT1?: string;  // Italian matters
}


/*
* Generic cache implementation with an in memory and gloablState cache layer.
* Each cache instance is identified by a unique key.
* The cache duration can be configured in the extension settings and defaults to 30 days.
*/
class DataCache<T> {
    private context: vscode.ExtensionContext | null = null;
    // private cache: Map<string, { data: T[]; timestamp: number }> = new Map(); // TODO
    private cache: Map<string, { data: T[]; timestamp: number }> = new Map<string, { data: T[]; timestamp: number }>();
    private cacheDataKey: string;
    private cacheTimestampKey: string;
    private cacheLifetimeDays: number;

    constructor(cacheDataKey: string, cacheTimestampKey: string, cacheLifetimeDays: number) {
        this.cacheDataKey = cacheDataKey;
        this.cacheTimestampKey = cacheTimestampKey;
        this.cacheLifetimeDays = cacheLifetimeDays;
    }

    /**
     * Initializes the cache with Extension Context for persistent storage
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
            const cachedData = this.context.globalState.get<T[]>(this.cacheDataKey);
            const timestamp = this.context.globalState.get<number>(this.cacheTimestampKey);

            if (cachedData && timestamp) {
                const age = Date.now() - timestamp;
                const maxAge = this.cacheLifetimeDays * 24 * 60 * 60 * 1000;
                const isExpired = age > maxAge;

                // If the cache data is still valid, load it into the in-memory cache.
                // Else, clear the globalState cache.
                if (!isExpired) {
                    this.cache.set(this.cacheDataKey, {
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
            await this.context.globalState.update(this.cacheDataKey, data);
            await this.context.globalState.update(this.cacheTimestampKey, timestamp);
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
            await this.context.globalState.update(this.cacheDataKey, undefined);
            await this.context.globalState.update(this.cacheTimestampKey, undefined);
            console.log('Cache cleared');
        } catch (error) {
            console.error('Error clearing cache:', error);
        }
    }

    get(): T[] | null {
        const cached = this.cache.get(this.cacheDataKey);
        if (!cached) {
            return null;
        }

        const age = Date.now() - cached.timestamp;
        const maxAge = this.cacheLifetimeDays * 24 * 60 * 60 * 1000;
        const isExpired = age > maxAge;
        if (isExpired) {
            this.cache.delete(this.cacheDataKey);
            this.clearGlobalState();
            return null;
        }

        return cached.data;
    }

    set(data: T[]): void {
        const timestamp = Date.now();

        this.cache.set(this.cacheDataKey, {
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
const MODEL_CACHE = new DataCache<unknown>(
    CACHE_MODEL_KEY,
    CACHE_TIMESTAMP_KEY,
    CACHE_LIFETIME
);

const TRANSLATIONS_CACHE = new DataCache<unknown>(
    CACHE_TRANSLATION_KEY,
    CACHE_TIMESTAMP_KEY,
    CACHE_LIFETIME
);


/**
 * Initializes both caches with the given extension context.
 * Must be called in the activate function of the extension to enable caching
 */
export function initializeCaches(context: vscode.ExtensionContext): void {
    MODEL_CACHE.initialize(context);
    TRANSLATIONS_CACHE.initialize(context);
}

/**
 * Loads all data from a paginated url and caches the results
 * @param forceRefresh optional: ignore cache and reload data.
 * @returns Array with the results
 */
export async function getModel<T = unknown>(
    forceRefresh: boolean
): Promise<T[]> {
    const modelUrl = vscode.workspace.getConfiguration("vertecVscodeExtension").get("ModelUrl", "");

    // must we use the cache?
    if (!forceRefresh) {
        const cachedData = MODEL_CACHE.get() as unknown as T[] | null;
        if (cachedData) {
            console.log('Data loaded from cache.');
            return cachedData;
        }
        console.log('No cache found, fetching from URL.');
    } else {
        console.log('Fetching from URL.');
    }

    try {
        // Lade zuerst das deutsche Modell
        const germanResults = await loadModelFromUrl<T>(modelUrl, 'de');

        // Lade dann das englische Modell (nur für perceived_name_alt)
        const englishModelUrl = modelUrl.includes('?')
            ? `${modelUrl}&lang=en-ch`
            : `${modelUrl}?lang=en-ch`;
        const englishResults = await loadModelFromUrl<T>(englishModelUrl, 'en');

        // Merge die perceived_name Werte aus dem englischen Modell
        const mergedResults = mergeEnglishPerceivedNames(germanResults, englishResults);

        console.log(`Loaded ${mergedResults.length} entries in total`);

        // Store data in cache (cache typed as unknown[])
        MODEL_CACHE.set(mergedResults);

        return mergedResults;

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
 * Loads model data from a specified URL with progress indication
 */
async function loadModelFromUrl<T>(modelUrl: string, language: 'de' | 'en'): Promise<T[]> {

    const allResults: T[] = [];
    let currentUrl: string | null = modelUrl;
    let objectCount = 0;
    let totalCount = 0;

    // Show progress to user, because backend is kinda slow.
    await vscode.window.withProgress(
        {
            location: vscode.ProgressLocation.Notification,
            title: `Loading ${language === 'de' ? 'german' : 'english'} model data`,
            cancellable: false
        },
        async (progress) => {
            while (currentUrl) {
                if (totalCount === 0) {
                    progress.report({ message: 'Loading first page' });
                }

                const response = await axios.get<ModelApiResponse<T>>(currentUrl);

                // Set total count on first page load
                if (totalCount === 0) {
                    totalCount = response.data.count;
                }

                // Normalisiere die Daten, falls es VertecClass-Objekte sind
                const normalizedResults = language === 'de'
                    ? response.data.results.map(item => {
                    // Type guard: Prüfe ob es ein VertecClass-Objekt ist
                    if (isVertecClass(item)) {
                        return normalizeVertecClass(item) as unknown as T;
                    }
                    return item;
                })
                : response.data.results;

                // Merge results
                objectCount += normalizedResults.length;
                allResults.push(...normalizedResults);

                // Set next url
                currentUrl = response.data.next;

                // Display progress
                const message = `${objectCount} of ${totalCount} entries loaded`;
                progress.report({
                    message: message,
                    increment: (normalizedResults.length / totalCount * 100.0)
                });
                console.log(message);
            }

            progress.report({ message: 'All done!' });
        }
    );

    return allResults;
}

/**
 * Merges the perceived_name from English model into perceived_name_alt of German model
 */
function mergeEnglishPerceivedNames<T>(germanResults: T[], englishResults: T[]): T[] {

    // Erstelle eine Map für schnelleren Zugriff auf englische Klassen
    const englishClassMap = new Map<number, VertecClass>();

    englishResults.forEach(item => {
        if (isVertecClass(item)) {
            englishClassMap.set(item.class_id, item);
        }
    });

    const result = germanResults.map(item => {
        if (!isVertecClass(item)) {
            return item;
        }

        const germanClass = item as VertecClass;
        const englishClass = englishClassMap.get(germanClass.class_id);

        if (!englishClass) {
            return item;
        }

        if (!germanClass.associations || germanClass.associations.length === 0) {
            return item;
        }

        if (!englishClass.associations || englishClass.associations.length === 0) {
            return item;
        }

        // Erstelle eine Map der englischen Associations basierend auf ihrem Namen
        const englishAssocMap = new Map<string, VertecAssociation>();
        englishClass.associations.forEach(assoc => {
            englishAssocMap.set(assoc.name.toLowerCase(), assoc);
        });

        // Merge perceived_name_alt
        const updatedAssociations = germanClass.associations.map(germanAssoc => {
            const englishAssoc = englishAssocMap.get(germanAssoc.name);

            if (englishAssoc) {

                return {
                    ...germanAssoc,
                    perceived_name_alt: englishAssoc.perceived_name.toLowerCase(),
                    role1_name_alt: englishAssoc.role1_name.toLowerCase(),
                    role2_name_alt: englishAssoc.role2_name.toLowerCase(),
                    role1_class_alt: englishAssoc.role1_class,
                    role2_class_alt: englishAssoc.role2_class,
                };
            }

            return germanAssoc;
        });

        return {
            ...germanClass,
            associations: updatedAssociations
        } as unknown as T;
    });

    return result;
}

/**
 * Helper function to normalize VertecMember by converting name and name_alt to lowercase.
 */
function normalizeVertecMember(member: VertecMember): VertecMember {
    return {
        ...member,
        name: member.name.toLowerCase(),
        name_alt: member.name_alt.toLowerCase()
    };
}

/**
 * Helper function to normalize VertecAssociation by converting name, name_alt and perceived_name to lowercase.
 */
function normalizeVertecAssociation(assoc: VertecAssociation): VertecAssociation {
    return {
        ...assoc,
        name: assoc.name.toLowerCase(),
        name_alt: assoc.name_alt.toLowerCase(),
        perceived_name: assoc.perceived_name.toLowerCase(),
        perceived_name_alt: assoc.perceived_name_alt?.toLowerCase(),
        role1_name: assoc.role1_name?.toLowerCase(),
        role1_name_alt: assoc.role1_name_alt?.toLowerCase(),
        role2_name: assoc.role2_name?.toLowerCase(),
        role2_name_alt: assoc.role2_name_alt?.toLowerCase(),
    };
}

/**
 * Helper function to normalize VertecClass by converting its members and associations.
 */
function normalizeVertecClass(vertecClass: VertecClass): VertecClass {
    return {
        ...vertecClass,
        // name und name_alt bleiben unverändert für VertecClass
        members: vertecClass.members?.map(normalizeVertecMember),
        associations: vertecClass.associations?.map(normalizeVertecAssociation)
    };
}

/**
 * Checks if something is a VertecClass.
 */
function isVertecClass(obj: unknown): obj is VertecClass {
    return (
        typeof obj === 'object' &&
        obj !== null &&
        'class_id' in obj &&
        'name' in obj &&
        'name_alt' in obj
    );
}

/**
 * Empties the Model Browser cache
 */
export function clearModelCache(): void {
    MODEL_CACHE.clear();
    vscode.window.showInformationMessage('Model cache cleared.');
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
            `Reloaded ${classes.length} classes!`
        );

    } catch (error) {
        console.error('Error loading the data:', error);
        vscode.window.showErrorMessage('An error occured while loading the model data.');
    }
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
 * Loads translation data from the API (simple JSON file)
 * @param forceRefresh If true, ignores cache and reloads data
 */
export async function getTranslations<T = unknown>(
    forceRefresh: boolean
): Promise<T[]> {
    const translationsUrl = vscode.workspace.getConfiguration("vertecVscodeExtension").get("TranslationsUrl", "");

    // must we use the cache?
    if (!forceRefresh) {
        const cachedData = TRANSLATIONS_CACHE.get() as unknown as T[] | null;
        if (cachedData) {
            console.log('Data loaded from cache.');
            return cachedData;
        }
        console.log('No cache found, fetching from URL.');
    } else {
        console.log('Fetching from URL.');
    }

    let translationData: T[] = [];

    try {
        // Show progress to user.
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: 'Loading translation data',
                cancellable: false
            },
            async (progress) => {
                progress.report({ message: 'Downloading file' });

                const response = await axios.get<T[]>(translationsUrl);

                translationData = response.data;

                console.log(`Translation data loaded: ${translationData.length} entries`);

                progress.report({ message: 'All done!' });
            }
        );

        // Store data in cache (cache typed as unknown[])
        TRANSLATIONS_CACHE.set(translationData);

        return translationData;

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
 * Clears the translations cache
 */
export function clearTranslationsCache(): void {
    TRANSLATIONS_CACHE.clear();
    vscode.window.showInformationMessage('Translation cache cleared.');
}

/**
 * Reloads the translation data by clearing the cache and fetching the data again from the API.
 */
export async function reloadTranslations() {
    try {
        // Empty cache
        clearTranslationsCache();

        // Reload translations and force refresh cache.
        const translations = await getTranslations<VertecTranslation>(true);

        vscode.window.showInformationMessage(
            `Reloaded ${translations.length} translations!`
        );

    } catch (error) {
        console.error('Error loading the data:', error);
        vscode.window.showErrorMessage('An error occured while loading the translations data.');
    }
}