import * as vscode from 'vscode';
import { streamCompleteRaw } from './api';
import { extractInsertion } from './helpers/completion';

const CONTEXT_LINES = 5;

export class GhostTextProvider implements vscode.InlineCompletionItemProvider {
    provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[]> {
        const lineStart = Math.max(0, position.line - CONTEXT_LINES);
        const lineEnd = Math.min(document.lineCount - 1, position.line + CONTEXT_LINES);

        const pre_cursor = document.getText(
            new vscode.Range(lineStart, 0, position.line, position.character)
        );
        const post_cursor = document.getText(
            new vscode.Range(position, document.lineAt(lineEnd).range.end)
        );

        if (pre_cursor.trim().length < 5) {
            return Promise.resolve([]);
        }

        return new Promise((resolve) => {
            if (token.isCancellationRequested) {
                resolve([]);
                return;
            }

            const cancel = token.onCancellationRequested(() => resolve([]));

            streamCompleteRaw(
                pre_cursor,
                post_cursor,
                () => {},
                (completion) => {
                    cancel.dispose();
                    const text = extractInsertion(completion, pre_cursor, post_cursor);
                    if (!text.trim()) {
                        resolve([]);
                        return;
                    }
                    resolve([
                        new vscode.InlineCompletionItem(text, new vscode.Range(position, position))
                    ]);
                },
                () => {
                    cancel.dispose();
                    resolve([]);
                }
            );
        });
    }
}
