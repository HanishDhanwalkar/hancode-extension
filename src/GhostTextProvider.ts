import * as vscode from 'vscode';
import { queryLocalLLM } from './api';

export class GhostTextProvider implements vscode.InlineCompletionItemProvider {
    async provideInlineCompletionItems(document: vscode.TextDocument, position: vscode.Position) {
        const linePrefix = document.getText(new vscode.Range(position.with(undefined, 0), position));
        if (linePrefix.length < 5) return []; // Don't trigger on tiny prefixes

        const completion = await queryLocalLLM(`Complete this code:\n${linePrefix}`, 'complete');
        
        return [new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))];
    }
}