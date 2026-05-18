import * as vscode from 'vscode';
import { streamCompleteRaw } from './api';
import { extractInsertion } from './helpers/completion';

const MAX_PREFIX_CHARS = 6000;
const MAX_SUFFIX_CHARS = 2000;
const DEBOUNCE_MS = 180;

export class GhostTextProvider implements vscode.InlineCompletionItemProvider {
    private debounceTimer?: ReturnType<typeof setTimeout>;
    private activeAbort?: AbortController;
    private requestVersion = 0;
    private lastContextKey = "";
    private lastSuggestion = "";
    private lastSuggestionNormalized = "";

    private normalizeSuggestion(text: string): string {
        return text
            .toLowerCase()
            .replace(/["'`]/g, "")
            .replace(/\s+/g, "")
            .replace(/[^\w]/g, "");
    }

    provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[]> {
        const fullPrefix = document.getText(new vscode.Range(new vscode.Position(0, 0), position));
        const pre_cursor = fullPrefix.slice(-MAX_PREFIX_CHARS);

        const fullSuffix = document.getText(
            new vscode.Range(position, document.lineAt(document.lineCount - 1).range.end)
        );
        const post_cursor = fullSuffix.slice(0, MAX_SUFFIX_CHARS);

        if (pre_cursor.trim().length < 5) {
            return Promise.resolve([]);
        }

        const contextKey = `${document.uri.toString()}|${document.version}|${position.line}:${position.character}|${pre_cursor}|${post_cursor}`;

        return new Promise((resolve) => {
            if (token.isCancellationRequested) {
                resolve([]);
                return;
            }

            if (this.debounceTimer) {
                clearTimeout(this.debounceTimer);
            }

            const version = ++this.requestVersion;
            const cancel = token.onCancellationRequested(() => {
                if (version === this.requestVersion) {
                    this.activeAbort?.abort();
                }
                resolve([]);
            });

            this.debounceTimer = setTimeout(() => {
                if (token.isCancellationRequested || version !== this.requestVersion) {
                    cancel.dispose();
                    resolve([]);
                    return;
                }

                this.activeAbort?.abort();
                const controller = new AbortController();
                this.activeAbort = controller;

                streamCompleteRaw(
                    pre_cursor,
                    post_cursor,
                    () => { },
                    (completion) => {
                        cancel.dispose();

                        if (token.isCancellationRequested || version !== this.requestVersion) {
                            resolve([]);
                            return;
                        }

                        const text = extractInsertion(completion, pre_cursor, post_cursor);
                        if (!text.trim()) {
                            resolve([]);
                            return;
                        }

                        const normalized = this.normalizeSuggestion(text);
                        if (!normalized) {
                            resolve([]);
                            return;
                        }

                        if (
                            contextKey !== this.lastContextKey &&
                            (text === this.lastSuggestion || normalized === this.lastSuggestionNormalized)
                        ) {
                            resolve([]);
                            return;
                        }

                        this.lastContextKey = contextKey;
                        this.lastSuggestion = text;
                        this.lastSuggestionNormalized = normalized;

                        resolve([
                            new vscode.InlineCompletionItem(text, new vscode.Range(position, position))
                        ]);
                    },
                    () => {
                        cancel.dispose();
                        resolve([]);
                    },
                    {
                        signal: controller.signal,
                        timeoutMs: 5000,
                        suppressAbortError: true
                    }
                );
            }, DEBOUNCE_MS);
        });
    }
}
