import * as vscode from 'vscode';

export function escapeHtml(s: string): string {
    return s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

export function getDiagnosticsSummary(document: vscode.TextDocument, max = 12): string {
    const diagnostics = vscode.languages.getDiagnostics(document.uri);
    const errors = diagnostics.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).slice(0, max);
    if (errors.length === 0) return '';
    return errors.map((d) => `L${d.range.start.line + 1}: ${d.message}`).join('\n');
}

/**
 * Shapes raw LLM output into text that should appear after the cursor as inline completion.
 */
export function sanitizeInlineCompletion(raw: string, linePrefix: string): string {
    let s = raw.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    s = s.replace(/^```[\w-]*\s*\n?/m, '').replace(/\n?```\s*$/m, '').trimStart();

    const trimmedPrefix = linePrefix;
    if (s.startsWith(trimmedPrefix)) {
        s = s.slice(trimmedPrefix.length);
    }

    // Drop obvious prose lines (heuristic)
    const lines = s.split('\n');
    const codeLike = lines.filter((line) => {
        const t = line.trim();
        if (!t) return false;
        if (/^(here|note|sure|this|the following)/i.test(t) && t.length < 80) return false;
        return true;
    });
    s = codeLike.join('\n').trimEnd();

    // Prefer a bounded first chunk for ghost text
    if (s.length > 800) {
        s = s.slice(0, 800);
    }
    return s;
}

export function relativeWorkspacePath(uri: vscode.Uri): string {
    const wf = vscode.workspace.getWorkspaceFolder(uri);
    if (!wf) return uri.fsPath;
    return vscode.workspace.asRelativePath(uri, false);
}
