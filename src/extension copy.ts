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
        } // Prince Garg | 30/12/2025, 21:32:28
    });

    context.subscriptions.push(commandDisposable);

    // Start Prince Garg | 30/12/2025, 21:02:33 // Prince Garg | 30/12/2025, 21:05:10

    const disposable = vscode.workspace.onWillSaveTextDocument(async (event) => {
        // End Prince Garg | 30/12/2025, 21:02:33 // Prince Garg | 30/12/2025, 21:05:10
        const doc = event.document;
        if (doc.uri.scheme !== 'file') {
            return;
        }

        // Start Prince Garg | 30/12/2025, 21:13:38
        // --- Fix: Undesirable File Types ---
        if (doc.languageId === 'json' || doc.fileName.endsWith('.json')) {
            // JSON does not support comments, avoid breaking files like package.json
            return;
        }

        // End Prince Garg | 30/12/2025, 21:13:38
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

        // Start Prince Garg | 30/12/2025, 21:02:33
        // --- Git Undo Logic Start ---
        const edits: vscode.TextEdit[] = [];
        const handledLines = new Set<number>(); // Track lines handled by Undo logic

        try {
            const workspaceFolder = vscode.workspace.getWorkspaceFolder(doc.uri);
            if (workspaceFolder) {
                const gitContent = await new Promise<string | null>((resolve) => {
                    const cp = require('child_process');
                    cp.exec(`git show HEAD:"${vscode.workspace.asRelativePath(doc.uri)}"`, { cwd: workspaceFolder.uri.fsPath }, (err: any, stdout: string) => {
                        if (err) resolve(null);
                        else resolve(stdout);
                    });
                });

                if (gitContent !== null) {
                    const gitChanges = diff.diffLines(gitContent, doc.getText());
                    let gitCurrentLine = 0;

                    // Strip comments helper
                    const strip = (text: string) => {
                        // Simple strip based on prefix
                        // We handle multi-line strings by splitting
                        return text.split('\n').map(line => {
                            const trimmed = line.trim();
                            if (commentSuffix) {
                                // Block comment style
                                // very naive check for prefix...
                                // Ideally regex replacement
                                // escape prefix

                                // Fallback: just use logic similar to existing
                                // If line has comment stub, remove it.
                                const stub = `${commentPrefix} ${authorName} |`;
                                if (line.includes(stub)) {
                                    return line.split(stub)[0].trimEnd();
                                }
                            } else {
                                // Single line style
                                if (line.includes(commentPrefix)) {
                                    // Check if it looks like OUR comment?
                                    // "Remove the comment on save" -> maybe remove ANY codestamp comment?
                                    // Check for <Author> | <Date> pattern is safer
                                    const stub = `${commentPrefix} ${authorName} |`;
                                    if (line.includes(stub)) {
                                        return line.split(stub)[0].trimEnd();
                                    }
                                }
                            }
                            return line; // Return as is if no comment match
                        }).join('\n');
                    };

                    gitChanges.forEach(part => {
                        if (part.added) {
                            // This part is in Buffer but NOT in Git (or different in Git)
                            // We need to see if it corresponds to a REMOVED part from Git that is code-identical
                            // diffLines usually groups [ { removed: true, value: 'A' }, { added: true, value: 'A // comment' } ]
                            // We need to look at adjacent parts? 
                            // diffLines output is flat. We need to find the "partner" removed block.
                            // BUT wait, `forEach` is iterating sequentially.
                            // We need to access previous element.
                        }
                        if (!part.removed) {
                            gitCurrentLine += part.count || 0;
                        }
                    });

                    // Re-iterate with standard loop to peek back/forward
                    let gLine = 0;
                    for (let i = 0; i < gitChanges.length; i++) {
                        const part = gitChanges[i];
                        if (part.removed) {
                            // This block is in Git but NOT in Buffer.
                            // Check if next part is Added (Buffer replacement)
                            if (i + 1 < gitChanges.length && gitChanges[i + 1].added) {
                                const addedPart = gitChanges[i + 1];

                                // Compare Stripped Content
                                // We strictly check if Code is Identical.
                                // We also assume Git version is "Clean" (or acceptable target).
                                // If stripped(Buffer) === stripped(Git), we revert to Git.

                                if (strip(addedPart.value).replace(/\s/g, '') === strip(part.value).replace(/\s/g, '')) {
                                    // Match! 
                                    // But replace whitespace sensitive? 
                                    // `strip` might leave different whitespace if we trimmed end.
                                    // Let's rely on `strip` returning consistent text.
                                    // If I typed `var a = 1;` then added comment. `strip` -> `var a = 1;`.
                                    // Git: `var a = 1;`. `strip` -> `var a = 1;`.
                                    // Equality holds.

                                    // apply REVERT
                                    // We need the Range in the Document to replace.
                                    // We need to track `currentLineIndex` for Document separately?
                                    // Yes. `gitChanges` iterates (Git + Buffer) space.
                                    // `part` (Removed) is NOT in Buffer. So it doesn't advance Buffer line count.
                                    // `addedPart` (Added) IS in Buffer. It advances Buffer line count.
                                    // Unchanged parts advance BOTH.
                                }
                            }
                        }
                    }

                    // Better approach: Calculate Buffer Range keying off `diffLines`.
                    let bufLine = 0;
                    for (let i = 0; i < gitChanges.length; i++) {
                        const part = gitChanges[i];

                        if (!part.added && !part.removed) {
                            bufLine += part.count || 0;
                        } else if (part.removed) {
                            // Git content, not in Buffer.
                            // Look ahead for Added
                            if (i + 1 < gitChanges.length && gitChanges[i + 1].added) {
                                const addedPart = gitChanges[i + 1];

                                // Check equality
                                const s1 = strip(part.value).trim();
                                const s2 = strip(addedPart.value).trim();

                                if (s1 === s2) {
                                    // REVERT
                                    const start = bufLine;
                                    const end = bufLine + (addedPart.count || 0); // exclusive?
                                    // range: start line to end line - 1

                                    const range = new vscode.Range(
                                        new vscode.Position(start, 0),
                                        new vscode.Position(end, 0) // replacing entire block lines?
                                        // TextEdit.replace takes a range. 
                                        // If we replace lines, we need Range(startLine, 0, endLine, length)
                                        // Easier: Range(start, 0, start + count, 0) covers the full lines if we assume clean breaks.
                                        // But `diffLines` might split mid-line? No, `diffLines` is usually lines.
                                    );

                                    // Replace with `part.value` (Git Content)
                                    edits.push(vscode.TextEdit.replace(range, part.value));

                                    // Mark lines as handled
                                    for (let k = start; k < end; k++) handledLines.add(k);
                                }
                            }
                        } else if (part.added) {
                            bufLine += part.count || 0;
                        }
                    }
                }
            }
        } catch (e) {
            console.error('Git check failed', e);
        }
        // --- Git Undo Logic End ---

        // End Prince Garg | 30/12/2025, 21:02:33
        const newContent = doc.getText();
        const changes = diff.diffLines(originalContent, newContent);

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
                // Start Prince Garg | 30/12/2025, 21:02:33
                // Check if this range starts/intersects with handledLines?
                // If ANY line in the range is handled, we should probably skip the whole range or split it?
                // Simplification: checking start line.
                // Actually `handledLines` are indices in the *current* buffer.
                // `rawRanges` are also indices in the *current* buffer.

                let isHandled = false;
                for (let k = 0; k < count; k++) {
                    if (handledLines.has(currentLineIndex + k)) isHandled = true;
                }

                if (!isHandled) {
                    rawRanges.push({
                        start: currentLineIndex,
                        end: currentLineIndex + count - 1
                    });
                }
                // End Prince Garg | 30/12/2025, 21:02:33
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

            // Start Prince Garg | 30/12/2025, 20:54:33
            // Helper to check for existing enclosing block
            const checkEnclosingBlock = (startLine: number, endLine: number) => {
                let foundStart = -1;
                let foundEnd = -1;
                let existingAuthor = '';
                let existingDateStr = '';

                // Search upwards for Start
                // CHANGED: Start from startLine inclusive, in case the diff includes the comment line itself.
                for (let i = startLine; i >= 0; i--) {
                    const line = doc.lineAt(i);
                    const text = line.text.trim();
                    if (text.startsWith(commentPrefix.trim()) && text.includes('Start') && text.includes('|')) {
                        // Parse author and date
                        // Expected format: <prefix> Start <Author> | <Date> <suffix>
                        // Regex might be safer
                        const parts = text.split('|');
                        if (parts.length >= 2) {
                            const prePipe = parts[0]; // "<prefix> Start <Author> "
                            const postPipe = parts[1]; // " <Date> <suffix>"

                            // Extract Author
                            const startKeyword = 'Start';
                            const startIndex = prePipe.indexOf(startKeyword);
                            if (startIndex !== -1) {
                                existingAuthor = prePipe.substring(startIndex + startKeyword.length).trim();
                            }

                            // Extract Date
                            // Remove suffix if exists
                            let datePart = postPipe;
                            if (commentSuffix && datePart.endsWith(commentSuffix.trim())) {
                                datePart = datePart.substring(0, datePart.lastIndexOf(commentSuffix.trim()));
                            }
                            existingDateStr = datePart.trim();
                            foundStart = i;
                        }
                        break;
                    }
                    // optimize: stop if we hit another End or unrelated code structure?
                    // For now, simple scan up.
                }

                // Search downwards for End
                if (foundStart !== -1) {
                    // CHANGED: Start from endLine inclusive, in case the diff includes the comment line itself.
                    for (let i = endLine; i < doc.lineCount; i++) {
                        const line = doc.lineAt(i);
                        const text = line.text.trim();
                        // Verify matching author in End tag? Or just look for any End?
                        // Ideally "End <Author>"
                        if (text.startsWith(commentPrefix.trim()) && text.includes('End') && text.includes('|')) {
                            // Double check it matches the Start one
                            if (text.includes(existingAuthor)) {
                                foundEnd = i;
                            }
                            break;
                        }
                    }
                }

                return { foundStart, foundEnd, existingAuthor, existingDateStr };
            };

            const enclosing = checkEnclosingBlock(range.start, range.end);


            if (enclosing.foundStart !== -1 && enclosing.foundEnd !== -1) {
                // Check if Author Matches
                if (enclosing.existingAuthor === authorName) {
                    // Start Prince Garg | 30/12/2025, 21:13:38
                    // Fix: Date Comparison
                    // "30/12/2025, 21:04:38"
                    // We split by comma to ignore time deviations, assuming same locale format.
                    // A safe heuristic is that the Date part comes first.

                    const separator = timestamp.includes(',') ? ',' : ' ';
                    const currentDatePart = timestamp.split(separator)[0].trim();
                    const existingDatePart = enclosing.existingDateStr.split(separator)[0].trim();

                    // Robustness: If they are identical prefix?
                    if (currentDatePart === existingDatePart || enclosing.existingDateStr.startsWith(currentDatePart)) {
                        // UPDATE existing comments
                        // End Prince Garg | 30/12/2025, 21:13:38 // Prince Garg | 30/12/2025, 21:18:35
                        const startLine = doc.lineAt(enclosing.foundStart);
                        const newStartText = startLine.text.replace(enclosing.existingDateStr, timestamp);
                        edits.push(vscode.TextEdit.replace(startLine.range, newStartText));

                        const endLine = doc.lineAt(enclosing.foundEnd);
                        const newEndText = endLine.text.replace(enclosing.existingDateStr, timestamp); // Prince Garg | 30/12/2025, 21:13:38
                        edits.push(vscode.TextEdit.replace(endLine.range, newEndText));

                        // Start Prince Garg | 30/12/2025, 21:18:35
                        // Fix: Block Cleanup
                        // Remove any inline comments inside the block for the same author
                        for (let i = enclosing.foundStart + 1; i < enclosing.foundEnd; i++) {
                            const line = doc.lineAt(i);
                            const text = line.text;
                            const stub = `${commentPrefix} ${authorName} |`;

                            if (text.includes(stub)) {
                                // Check if it's strictly an inline comment at the end of the line
                                const parts = text.split(stub);
                                if (parts.length > 1) {
                                    // Reconstruct content without the comment
                                    // We assume the last part is the comment. 
                                    // Safest: split, pop LAST element, join back.
                                    parts.pop();
                                    const cleanText = parts.join(stub).trimEnd();

                                    if (cleanText !== text) {
                                        edits.push(vscode.TextEdit.replace(line.range, cleanText));
                                    }
                                }
                            }
                        }

                        // End Prince Garg | 30/12/2025, 21:18:35
                        return; // Prince Garg | 30/12/2025, 21:13:38
                    }
                }
            }


            // End Prince Garg | 30/12/2025, 20:54:33
            if (height === 1) {
                // Single Line Behavior
                const lineNum = range.start;
                if (lineNum >= doc.lineCount) return;

                const line = doc.lineAt(lineNum);
                const text = line.text;

                // If line is empty/whitespace, don't comment
                if (text.trim().length === 0) return;

                // Start Prince Garg | 30/12/2025, 20:58:31
                // --- Comment Merging Logic Start ---
                // Try to merge if valid inline comment style (Generic check or specific to suffix mainly)
                // We focus on Suffix style for "Inline" merging as per request.
                if (!forceCommentAbove) {
                    const checkInlineComment = (lineIndex: number, checkAuthor = true) => {
                        if (lineIndex < 0 || lineIndex >= doc.lineCount) return false;
                        const l = doc.lineAt(lineIndex);
                        const t = l.text.trim();
                        // Strict check: must start with commentPrefix?? No, inline is code <prefix> ...
                        // But we want to ensure it HAS a comment.
                        // Format: ... <prefix> <Author> | <Date> <suffix>
                        const stub = `${authorName} |`;
                        return t.includes(commentPrefix) && t.includes(stub);
                    };

                    let upCount = 0;
                    let downCount = 0;

                    // Scan Up
                    for (let i = lineNum - 1; i >= 0; i--) {
                        if (checkInlineComment(i)) upCount++;
                        else break;
                    }
                    // Scan Down
                    for (let i = lineNum + 1; i < doc.lineCount; i++) {
                        if (checkInlineComment(i)) downCount++;
                        else break;
                    }

                    const totalCount = upCount + 1 + downCount; // +1 for current line

                    if (totalCount > 3) {
                        // Perform Merge
                        const startRangeLine = lineNum - upCount;
                        const endRangeLine = lineNum + downCount;

                        // 1. Insert Start Comment
                        const firstLine = doc.lineAt(startRangeLine);
                        const match = firstLine.text.match(/^(\s*)/);
                        const indentation = match ? match[1] : '';
                        const startComment = `${indentation}${commentPrefix} Start ${authorName} | ${timestamp}${commentSuffix}\n`;
                        edits.push(vscode.TextEdit.insert(firstLine.range.start, startComment));

                        // 2. Insert End Comment
                        const lastLine = doc.lineAt(endRangeLine);
                        const endComment = `\n${indentation}${commentPrefix} End ${authorName} | ${timestamp}${commentSuffix}`;
                        edits.push(vscode.TextEdit.insert(lastLine.range.end, endComment));

                        // 3. Clean all lines (remove inline comments)
                        for (let i = startRangeLine; i <= endRangeLine; i++) {
                            const l = doc.lineAt(i);
                            let t = l.text;
                            // Remove comment part using consistent logic // Prince Garg | 30/12/2025, 20:59:12
                            const stub = `${commentPrefix} ${authorName} |`;
                            if (t.includes(stub)) {
                                const parts = t.split(stub);
                                // Start Prince Garg | 30/12/2025, 20:59:12
                                if (parts.length > 0) {
                                    t = parts[0].trimEnd();
                                }
                                // End Prince Garg | 30/12/2025, 20:59:12
                            }

                            if (t !== l.text) {
                                edits.push(vscode.TextEdit.replace(l.range, t));
                            }
                        }

                        return; // Skip adding single line comment // Prince Garg | 30/12/2025, 21:05:10
                    }
                }
                // --- Comment Merging Logic End ---


                // End Prince Garg | 30/12/2025, 20:58:31
                if (forceCommentAbove) {
                    const match = text.match(/^(\s*)/);
                    const indentation = match ? match[1] : '';
                    const commentLineText = `${indentation}${commentPrefix} ${authorName} | ${timestamp}${commentSuffix}`;

                    let alreadyCommented = false;
                    if (lineNum > 0) {
                        const prevLine = doc.lineAt(lineNum - 1);
                        const prevText = prevLine.text.trim();
                        // Check if previous line is a codestamp comment
                        if (prevText.startsWith(commentPrefix.trim()) && prevText.includes(authorName) && prevText.includes('|')) {
                            // Check if it's a "Start" block logic or just a single line comment
                            // If it says "Start", we probably shouldn't mess with it here unless we are sure.
                            // But this logic is for single line inserts. 

                            // Start Prince Garg | 30/12/2025, 20:58:31
                            // Wait, we are here because checkEnclosingBlock didn't find a block,
                            // or the author/date didn't match. So we proceed as normal.
                            // End Prince Garg | 30/12/2025, 20:58:31
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

                // 3. Clean up inline comments within the block
                for (let i = startLineNum; i <= endLineNum; i++) {
                    const l = doc.lineAt(i);
                    let t = l.text;
                    const stub = `${commentPrefix} ${authorName} |`;

                    if (t.includes(stub)) {
                        const parts = t.split(stub);
                        if (parts.length > 0) {
                            // Keep only the code part
                            const cleanText = parts[0].trimEnd();
                            if (cleanText !== t) {
                                edits.push(vscode.TextEdit.replace(l.range, cleanText));
                            }
                        }
                    }
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
