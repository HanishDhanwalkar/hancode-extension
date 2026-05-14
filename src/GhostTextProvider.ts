import * as vscode from 'vscode';
import { queryLocalLLM } from './api';
import { sanitizeInlineCompletion } from './helpers/utils';

export class GhostTextProvider implements vscode.InlineCompletionItemProvider {
    async provideInlineCompletionItems(
        document: vscode.TextDocument,
        position: vscode.Position,
        _context: vscode.InlineCompletionContext,
        token: vscode.CancellationToken
    ): Promise<vscode.InlineCompletionItem[] | vscode.InlineCompletionList | undefined> {
        const line = document.lineAt(position.line);
        const linePrefix = line.text.slice(0, position.character);
        if (linePrefix.trim().length < 2) {
            return undefined;
        }

        const prevStart = Math.max(0, position.line - 2);
        const prev = document
            .getText(new vscode.Range(new vscode.Position(prevStart, 0), position))
            .split('\n')
            .slice(-4)
            .join('\n');

        const prompt =
            `Language: ${document.languageId}\n` +
            `File: ${document.fileName}\n` +
            `Context (recent lines ending at cursor):\n${prev}\n` +
            `Complete from the cursor onward on the current line (and short continuation if needed). ` +
            `Return ONLY code, no markdown, no commentary.`;

        try {
            const raw = await queryLocalLLM(prompt, 'complete', { conversationId: 'INLINE_COMPLETE' });
            if (token.isCancellationRequested) {
                return undefined;
            }
            const insertText = sanitizeInlineCompletion(raw, linePrefix);
            if (!insertText) {
                return undefined;
            }
            const item = new vscode.InlineCompletionItem(insertText, new vscode.Range(position, position));
            return { items: [item] };
        } catch {
            return undefined;
        }
    }
}
