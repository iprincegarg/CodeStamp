import * as vscode from 'vscode';
import * as fs from 'fs';
import * as diff from 'diff';

export function activate(context: vscode.ExtensionContext) {
    console.log('CodeStamp extension active');

    const commandDisposable = vscode.commands.registerCommand('codestamp.setAuthorName', async () => {
        const config = vscode.workspace.getConfiguration('codestamp');
        const currentName = config.get<string>('authorName');

        const newName = await vscode.window.showInputBox({
            prompt: 'Enter Author Name for CodeStamp',
            value: currentName,
            placeHolder: 'e.g. Prince'
        });

        if (newName !== undefined) {
            await config.update('authorName', newName, vscode.ConfigurationTarget.Global);
            vscode.window.showInformationMessage(`CodeStamp Author Name updated to: ${newName}`);
        }
    });

    context.subscriptions.push(commandDisposable);

    const disposable = vscode.workspace.onWillSaveTextDocument((event) => {
        const doc = event.document;
        if (doc.uri.scheme !== 'file') {
            return;
        }

        console.log('Processing save for:', doc.fileName);

        const config = vscode.workspace.getConfiguration('codestamp');
        const authorName = config.get<string>('authorName') || 'User';
        const timestamp = new Date().toLocaleString();

        const languageId = doc.languageId;
        let commentPrefix = '//';
        let commentSuffix = '';
        let forceCommentAbove = false;

        switch (languageId) {
            case 'python':
            case 'yaml':
            case 'shellscript':
            case 'dockerfile':
            case 'makefile':
            case 'gitignore':
            case 'ignore':
            case 'ini':
            case 'properties':
                commentPrefix = '#';
                forceCommentAbove = true;
                break;
            case 'html':
            case 'xml':
            case 'markdown':
                commentPrefix = '<!--';
                commentSuffix = ' -->';
                break;
            case 'css':
            case 'scss':
            case 'less':
                commentPrefix = '/*';
                commentSuffix = ' */';
                break;
            case 'bat':
                commentPrefix = 'REM';
                break;
            default:
                if (doc.fileName.endsWith('.gitignore') || doc.fileName.endsWith('.env')) {
                    commentPrefix = '#';
                    forceCommentAbove = true;
                } else {
                    commentPrefix = '//';
                }
                break;
        }

        let originalContent = '';
        try {
            if (fs.existsSync(doc.fileName)) {
                originalContent = fs.readFileSync(doc.fileName, 'utf8');
            }
        } catch (error) {
            console.error('Error reading file from disk:', error);
            return;
        }

        const newContent = doc.getText();
        const changes = diff.diffLines(originalContent, newContent);

        const edits: vscode.TextEdit[] = [];
        let currentLineIndex = 0;

        // Pass 1: Identify Changed Ranges
        interface Range {
            start: number;
            end: number;
        }
        const rawRanges: Range[] = [];

        changes.forEach((part) => {
            if (part.added) {
                const count = part.count || 0;
                rawRanges.push({
                    start: currentLineIndex,
                    end: currentLineIndex + count - 1
                });
                currentLineIndex += count;
            } else if (part.removed) {
            } else {
                currentLineIndex += (part.count || 0);
            }
        });

        // Pass 2: Cluster Ranges
        const mergedRanges: Range[] = [];
        if (rawRanges.length > 0) {
            let active = rawRanges[0];

            for (let i = 1; i < rawRanges.length; i++) {
                const next = rawRanges[i];
                const gapStart = active.end + 1;
                const gapEnd = next.start - 1;

                let isGapTrivial = true;
                if (gapStart <= gapEnd) {
                    for (let lineNum = gapStart; lineNum <= gapEnd; lineNum++) {
                        if (lineNum >= doc.lineCount) break;
                        const line = doc.lineAt(lineNum);
                        if (line.text.trim().length > 0) {
                            isGapTrivial = false;
                            break;
                        }
                    }
                }

                if (isGapTrivial) {
                    active.end = next.end;
                } else {
                    mergedRanges.push(active);
                    active = next;
                }
            }
            mergedRanges.push(active);
        }

        // Pass 3: Apply Comments
        mergedRanges.forEach(range => {
            const height = range.end - range.start + 1;

            if (height === 1) {
                // Single Line Behavior
                const lineNum = range.start;
                if (lineNum >= doc.lineCount) return;

                const line = doc.lineAt(lineNum);
                const text = line.text;

                // If line is empty/whitespace, don't comment
                if (text.trim().length === 0) return;

                if (forceCommentAbove) {
                    const match = text.match(/^(\s*)/);
                    const indentation = match ? match[1] : '';
                    const commentLineText = `${indentation}${commentPrefix} ${authorName} | ${timestamp}${commentSuffix}`;

                    let alreadyCommented = false;
                    if (lineNum > 0) {
                        const prevLine = doc.lineAt(lineNum - 1);
                        const prevText = prevLine.text.trim();
                        // Check if previous line is a codestamp comment
                        if (prevText.startsWith(commentPrefix) && prevText.includes(authorName) && prevText.includes('|')) {
                            edits.push(vscode.TextEdit.replace(prevLine.range, commentLineText));
                            alreadyCommented = true;
                        }
                    }

                    if (!alreadyCommented) {
                        edits.push(vscode.TextEdit.insert(line.range.start, commentLineText + '\n'));
                    }
                } else {
                    const commentStub = `${commentPrefix} ${authorName} |`;
                    const hasComment = text.includes(commentStub);
                    let newLineText = text;
                    const newComment = ` ${commentPrefix} ${authorName} | ${timestamp}${commentSuffix}`;

                    if (hasComment) {
                        const splitParts = text.split(commentStub);
                        newLineText = splitParts[0].trimEnd();
                    }

                    if (newLineText.trim().length === 0) return;

                    edits.push(vscode.TextEdit.replace(
                        line.range,
                        newLineText + newComment
                    ));
                }

            } else {
                // Block Behavior
                const startLineNum = range.start;
                const endLineNum = range.end;

                if (startLineNum >= doc.lineCount) return;

                const firstLine = doc.lineAt(startLineNum);
                const firstLineText = firstLine.text;
                // Use indentation of the first line
                const match = firstLineText.match(/^(\s*)/);
                const indentation = match ? match[1] : '';

                const startComment = `${commentPrefix} Start ${authorName} | ${timestamp}${commentSuffix}`;
                const endComment = `${commentPrefix} End ${authorName} | ${timestamp}${commentSuffix}`;

                const startLineText = `${indentation}${startComment}\n`;
                const endLineText = `\n${indentation}${endComment}`;

                // 1. Handle START comment
                let startHandled = false;
                if (startLineNum > 0) {
                    const prevLine = doc.lineAt(startLineNum - 1);
                    const prevText = prevLine.text;
                    const trimmedPrev = prevText.trim();
                    if (trimmedPrev.startsWith(commentPrefix.trim()) && trimmedPrev.includes('Start') && trimmedPrev.includes('|')) {
                        const newPrevLine = `${indentation}${startComment}`;
                        edits.push(vscode.TextEdit.replace(prevLine.range, newPrevLine));
                        startHandled = true;
                    }
                }
                if (!startHandled) {
                    edits.push(vscode.TextEdit.insert(firstLine.range.start, startLineText));
                }

                // 2. Handle END comment
                let endHandled = false;
                // Check if next line (after endLineNum) is a codestamp end comment
                if (endLineNum < doc.lineCount - 1) {
                    const nextLine = doc.lineAt(endLineNum + 1);
                    const nextText = nextLine.text;
                    const trimmedNext = nextText.trim();
                    if (trimmedNext.startsWith(commentPrefix.trim()) && trimmedNext.includes('End') && trimmedNext.includes('|')) {
                        const newNextLine = `${indentation}${endComment}`;
                        edits.push(vscode.TextEdit.replace(nextLine.range, newNextLine));
                        endHandled = true;
                    }
                }
                if (!endHandled) {
                    const lastLine = doc.lineAt(endLineNum);
                    edits.push(vscode.TextEdit.insert(lastLine.range.end, endLineText));
                }
            }
        });

        if (edits.length > 0) {
            event.waitUntil(Promise.resolve(edits));
        }
    });

    context.subscriptions.push(disposable);
}

export function deactivate() { }
