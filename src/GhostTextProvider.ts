import * as vscode from 'vscode';
import { StreamCompleteRaw } from './api';

// interface DiffChange {
//     type: 'add' | 'delete' | 'replace';
//     start: number;
//     end: number;
//     startLine: number;
//     endLine: number;
// }

export class GhostTextProvider implements vscode.InlineCompletionItemProvider {
    private readonly CONTEXT_LINES = 5; // Lines before and after cursor
    private decorationAddedType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(76, 175, 80, 0.2)',
        border: '1px solid rgba(76, 175, 80, 0.5)',
        isWholeLine: true,
    });

    private decorationDeletedType = vscode.window.createTextEditorDecorationType({
        backgroundColor: 'rgba(244, 67, 54, 0.2)',
        border: '1px solid rgba(244, 67, 54, 0.5)',
        textDecoration: 'line-through',
        isWholeLine: true,
    });

    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position
    ): Promise<vscode.InlineCompletionItem[]> {
        // Capture multi-line context (5 lines before and after)
        const lineStart = Math.max(0, position.line - this.CONTEXT_LINES);
        const lineEnd = Math.min(document.lineCount - 1, position.line + this.CONTEXT_LINES);

        // Get pre_cursor (everything from lineStart to cursor)
        const pre_cursor = document.getText(
            new vscode.Range(lineStart, 0, position.line, position.character)
        );

        // Get post_cursor (everything from cursor to lineEnd)
        const post_cursor = document.getText(
            new vscode.Range(position, new vscode.Position(lineEnd, Infinity))
        );

        // Don't trigger on very small context
        if (pre_cursor.trim().length < 5) return [];

        return new Promise((resolve) => {
            let completion = "";
            let resolved = false;

            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.warn(`GhostText: Timed out waiting for completions`);
                    resolve([]);
                }
            }, 800); // Fast timeout for small models

            StreamCompleteRaw(
                pre_cursor,
                post_cursor,
                (chunk: string) => { completion += chunk; },
                (full: string) => {
                    clearTimeout(timeout);
                    if (!resolved) {
                        resolved = true;

                        if (completion.trim().length > 0) {
                            // Get the original text that will be replaced
                            const originalText = document.getText(
                                new vscode.Range(
                                    new vscode.Position(lineStart, 0),
                                    new vscode.Position(lineEnd, Infinity)
                                )
                            );

                            console.log("GhostText: Suggestion generated, length:", completion.length);

                            // Create completion with range that covers multiple lines
                            const item = new vscode.InlineCompletionItem(
                                completion,
                                new vscode.Range(
                                    new vscode.Position(lineStart, 0),
                                    new vscode.Position(lineEnd, Infinity)
                                )
                            );

                            // Store metadata for visual diff display
                            (item as any).originalText = originalText;
                            (item as any).suggestedText = completion;

                            resolve([item]);
                        } else {
                            resolve([]);
                        }
                    }
                },
                (error: string) => {
                    clearTimeout(timeout);
                    if (!resolved) {
                        resolved = true;
                        console.warn(`GhostText: Stream Error: ${error}`);
                        resolve([]);
                    }
                }
            );
        });
    }
}