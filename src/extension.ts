import * as vscode from 'vscode';
import axios from 'axios';

const API_URL = 'http://127.0.0.1:8000/process';

export function activate(context: vscode.ExtensionContext) {
    console.log('Hancode Activated');

    // Health Check Command
    const health_command = vscode.commands.registerCommand('hancode.health', () => {
        vscode.window.showInformationMessage('Hello Coder: Hancode is up and running!');
    });

    // Main 'Ask' Command
    const ask_command = vscode.commands.registerCommand('hancode.ask', async () => {
        const editor = vscode.window.activeTextEditor;

        if (!editor) {
            vscode.window.showInformationMessage('No active editor found');
            return;
        }

        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);

        if (!selectedText || selectedText.trim().length === 0) {
            vscode.window.showInformationMessage('Please select some code first');
            return;
        }

        // 1. Get instruction from user
        const instruction = await vscode.window.showInputBox({
            prompt: "What should Hancode do with this code?",
            placeHolder: "e.g., Add Google style docstrings, Refactor for readability..."
        });

        if (!instruction) return;

        // 2. Show progress notification
        vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "Hancode is thinking...",
            cancellable: false
        }, async (progress) => {
            try {
                const response = await axios.post(API_URL, {
                    code: selectedText,
                    instruction: instruction
                }, {
                    headers: { 'Content-Type': 'application/json' }
                });

                const newCode = response.data.result;

                // 4. Replace the text in the editor
                await editor.edit(editBuilder => {
                    editBuilder.replace(selection, newCode);
                });

                vscode.window.showInformationMessage('Code updated successfully!');

            } catch (error: any) {
                console.error("Full Error:", error);
                vscode.window.showErrorMessage(`Backend Error: ${error.message}`);
            }
        });
    });

    context.subscriptions.push(health_command);
    context.subscriptions.push(ask_command);
}

export function deactivate() { }