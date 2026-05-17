// // helper to your context gathering logic to pull existing errors
// import * as vscode from 'vscode';

// function getDiagnostics(document: vscode.TextDocument) {
//     const diagnostics = vscode.languages.getDiagnostics(document.uri);
//     return diagnostics
//         .filter(d => d.severity === vscode.DiagnosticSeverity.Error)
//         .map(d => `Line ${d.range.start.line}: ${d.message}`)
//         .join('\n');
// }


// ====================================================



// // Replace selected text with code
// const document = editor.document;
//     const startLineNumber = document.lineAt(selection.start.line).lineNumber;
//     const endLineNumber = document.lineAt(selection.end.line).lineNumber;
    
//     const lines = selectedText.split('\n');

//     const code = lines.map((line, index) => {
//         const lineNumber = index + startLineNumber;
//         return `${lineNumber}: ${line}`;
//     }).join('\n');

//     const success = await editor.edit(editBuilder => {
//         editBuilder.replace(
//             selection,
//             code
//         );
//     });
