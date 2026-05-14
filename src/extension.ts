import * as vscode from 'vscode';
import { SideChatProvider } from './SideChatProvider';
import { GhostTextProvider } from './GhostTextProvider';
import { WorkspaceKnowledgeManager } from './workspaceKnowledge';

export async function activate(context: vscode.ExtensionContext) {
    const knowledge = new WorkspaceKnowledgeManager();
    knowledge.setWorkspaceRoot(vscode.workspace.workspaceFolders?.[0]?.uri);
    await knowledge.initializeWorkspaceState();

    const chatProvider = new SideChatProvider(context.extensionUri, knowledge);
    const ghostProvider = new GhostTextProvider();

    const health_command = vscode.commands.registerCommand('hancode.health', () => {
        void vscode.window.showInformationMessage('Hancode is running.');
    });

    knowledge.attach(context);
    chatProvider.attachEditorBridge(context);

    context.subscriptions.push(health_command);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('hancode-chat', chatProvider));
    context.subscriptions.push(
        vscode.languages.registerInlineCompletionItemProvider({ pattern: '**' }, ghostProvider)
    );

    const ed = vscode.window.activeTextEditor;
    if (ed) {
        knowledge.indexDocumentIfSupported(ed.document);
    }
}

export function deactivate() {}
