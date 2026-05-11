import * as vscode from 'vscode';


export function activate(context: vscode.ExtensionContext) {
    const disposable = vscode.commands.registerCommand('hancode.health', () => {
        vscode.window.showInformationMessage('Hancode Extension Activated!');
    });

    context.subscriptions.push(disposable);
}