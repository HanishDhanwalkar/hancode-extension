import * as vscode from 'vscode';
import { streamComplete } from './api';

export class GhostTextProvider implements vscode.InlineCompletionItemProvider {
    async provideInlineCompletionItems(
        document: vscode.TextDocument, 
        position: vscode.Position
    ): Promise<vscode.InlineCompletionItem[]> {
        const linePrefix = document.getText(new vscode.Range(position.with(undefined, 0), position));
        if (linePrefix.length < 5) return []; // Don't trigger on tiny prefixes

        return new Promise((resolve) => {
            let completion = "";
            let resolved = false;
            let firstChunkReceived = false;

            const timeout = setTimeout(() => {
                if (!resolved) {
                    resolved = true;
                    console.warn(`GhostText: Timed out waiting for completions for ${linePrefix}`);
                    if (completion.trim().length > 0) {
                        resolve([new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))]);
                    } else {
                        resolve([]);
                    }
                }
            }, 800);

            streamComplete(
                `Complete this Code:\n${linePrefix}`,
                (chunk) => {
                    completion += chunk;
                    if (!firstChunkReceived) {
                        firstChunkReceived = true;
                        console.log(`GhostText: Received completions for ${linePrefix}`, completion.length);
                    }
                },
                (full) => {
                    clearTimeout(timeout);
                    if (!resolved) {
                        resolved = true;
                        console.log("GhostText: Stream Complete; total length:", completion.length);
                        if (completion.trim().length > 0) {
                            resolve([new vscode.InlineCompletionItem(completion, new vscode.Range(position, position))]);
                        } else {
                            resolve([]);
                        }
                    }
                },
                (error) => {
                    clearTimeout(timeout);
                    if (!resolved) {
                        resolved = true;
                        console.warn(`GhostText: Stream Error: ${error}`);
                        resolve([]);
                    }
                }
            )
        });
    }
}