import * as vscode from 'vscode';
import { SideChatProvider } from './SideChatProvider';
import { GhostTextProvider } from './GhostTextProvider';

export function activate(context: vscode.ExtensionContext) {
    console.log('Hancode Activated');

    // Health Check Command
    const health_command = vscode.commands.registerCommand('hancode.health', () => {
        vscode.window.showInformationMessage('Hello Coder: Hancode is up and running!');
    });

    const chatProvider = new SideChatProvider(context.extensionUri);
    const ghostProvider = new GhostTextProvider();

    context.subscriptions.push(health_command);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider("hancode-chat", chatProvider));
    context.subscriptions.push(vscode.languages.registerInlineCompletionItemProvider({ pattern: "**" }, ghostProvider));
}

export function deactivate() { }