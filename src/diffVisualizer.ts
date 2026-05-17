import * as vscode from 'vscode';

interface DiffLine {
    type: 'add' | 'delete' | 'unchanged';
    content: string;
    lineNumber: number;
}

/**
 * Calculates line-by-line diff between original and suggested code
*/
export class DiffVisualizer {
    private addedDecoration: vscode.TextEditorDecorationType;
    private deletedDecoration: vscode.TextEditorDecorationType;
    private modifiedDecoration: vscode.TextEditorDecorationType;

    constructor() {
        // Green highlight for added lines
        this.addedDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(76, 175, 80, 0.25)',
            border: '2px solid rgba(76, 175, 80, 0.8)',
            overviewRulerColor: 'rgba(76, 175, 80, 0.8)',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        });

        // Red highlight for deleted lines
        this.deletedDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(244, 67, 54, 0.25)',
            border: '2px solid rgba(244, 67, 54, 0.8)',
            textDecoration: 'line-through',
            overviewRulerColor: 'rgba(244, 67, 54, 0.8)',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        });

        // Blue highlight for modified lines
        this.modifiedDecoration = vscode.window.createTextEditorDecorationType({
            backgroundColor: 'rgba(33, 150, 243, 0.15)',
            border: '2px solid rgba(33, 150, 243, 0.8)',
            overviewRulerColor: 'rgba(33, 150, 243, 0.8)',
            overviewRulerLane: vscode.OverviewRulerLane.Left,
        });
    }

    //  Simple line-level diff (can be upgraded to word-level later)
    calculateDiff(original: string, suggested: string): DiffLine[] {
        const originalLines = original.split('\n');
        const suggestedLines = suggested.split('\n');
        const diff: DiffLine[] = [];

        let origIndex = 0;
        let suggIndex = 0;

        while (origIndex < originalLines.length || suggIndex < suggestedLines.length) {
            if (origIndex >= originalLines.length) {
                // Remaining suggested lines are additions
                diff.push({
                    type: 'add',
                    content: suggestedLines[suggIndex],
                    lineNumber: suggIndex,
                });
                suggIndex++;
            } else if (suggIndex >= suggestedLines.length) {
                // Remaining original lines are deletions
                diff.push({
                    type: 'delete',
                    content: originalLines[origIndex],
                    lineNumber: origIndex,
                });
                origIndex++;
            } else if (originalLines[origIndex].trim() === suggestedLines[suggIndex].trim()) {
                // Same line (whitespace might differ)
                diff.push({
                    type: 'unchanged',
                    content: suggestedLines[suggIndex],
                    lineNumber: suggIndex,
                });
                origIndex++;
                suggIndex++;
            } else {
                // Different lines - check for similarity
                const origTrimmed = originalLines[origIndex].trim();
                const suggTrimmed = suggestedLines[suggIndex].trim();

                if (this.similarity(origTrimmed, suggTrimmed) > 0.7) {
                    // Similar line - mark as modified
                    diff.push({
                        type: 'unchanged', // Will be shown with blue highlight instead
                        content: suggestedLines[suggIndex],
                        lineNumber: suggIndex,
                    });
                } else {
                    // Different line - treat as deletion + addition
                    diff.push({
                        type: 'delete',
                        content: originalLines[origIndex],
                        lineNumber: origIndex,
                    });
                    diff.push({
                        type: 'add',
                        content: suggestedLines[suggIndex],
                        lineNumber: suggIndex,
                    });
                }
                origIndex++;
                suggIndex++;
            }
        }

        return diff;
    }

    /**
     * Highlight the diff in the editor
     * Shows visual feedback before user presses Tab
     */
    showDiffPreview(
        editor: vscode.TextEditor,
        startLine: number,
        original: string,
        suggested: string
    ) {
        const diff = this.calculateDiff(original, suggested);
        const addedRanges: vscode.Range[] = [];
        const deletedRanges: vscode.Range[] = [];
        const modifiedRanges: vscode.Range[] = [];

        const originalLines = original.split('\n');
        let currentLine = startLine;

        for (const _ of originalLines) {
            // Get diff info for this line
            const diffEntry = diff.find(d => d.lineNumber === currentLine - startLine);

            if (diffEntry?.type === 'add') {
                addedRanges.push(new vscode.Range(currentLine, 0, currentLine, Infinity));
            } else if (diffEntry?.type === 'delete') {
                deletedRanges.push(new vscode.Range(currentLine, 0, currentLine, Infinity));
            }
            currentLine++;
        }

        editor.setDecorations(this.addedDecoration, addedRanges);
        editor.setDecorations(this.deletedDecoration, deletedRanges);
        editor.setDecorations(this.modifiedDecoration, modifiedRanges);
    }

    /**
     * Clear all diff highlights
     */
    clearDiffPreview(editor: vscode.TextEditor) {
        editor.setDecorations(this.addedDecoration, []);
        editor.setDecorations(this.deletedDecoration, []);
        editor.setDecorations(this.modifiedDecoration, []);
    }

    /**
     * Simple string similarity calculation (Levenshtein-based)
     */
    private similarity(s1: string, s2: string): number {
        const longer = s1.length > s2.length ? s1 : s2;
        const shorter = s1.length > s2.length ? s2 : s1;

        if (longer.length === 0) return 1.0;

        const editDistance = this.levenshteinDistance(longer, shorter);
        return (longer.length - editDistance) / longer.length;
    }

    /**
     * Calculate Levenshtein distance between two strings
     */
    private levenshteinDistance(s1: string, s2: string): number {
        const costs = [];
        for (let i = 0; i <= s1.length; i++) {
            let lastValue = i;
            for (let j = 0; j <= s2.length; j++) {
                if (i === 0) {
                    costs[j] = j;
                } else if (j > 0) {
                    let newValue = costs[j - 1];
                    if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
                        newValue = Math.min(Math.min(newValue, lastValue), costs[j]) + 1;
                    }
                    costs[j - 1] = lastValue;
                    lastValue = newValue;
                }
            }
            if (i > 0) costs[s2.length] = lastValue;
        }
        return costs[s2.length];
    }

    dispose() {
        this.addedDecoration.dispose();
        this.deletedDecoration.dispose();
        this.modifiedDecoration.dispose();
    }
}
