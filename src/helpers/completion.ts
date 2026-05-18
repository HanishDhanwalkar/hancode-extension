/** Keep only text that should be inserted at the cursor (strip echoed prefix/suffix). */
export function extractInsertion(
    completion: string,
    pre_cursor: string,
    post_cursor: string
): string {
    let text = completion;

    if (pre_cursor) {
        if (text.startsWith(pre_cursor)) {
            text = text.slice(pre_cursor.length);
        } else {
            const max = Math.min(pre_cursor.length, text.length);
            for (let len = max; len > 0; len--) {
                if (pre_cursor.endsWith(text.slice(0, len))) {
                    text = text.slice(len);
                    break;
                }
            }
        }
    }

    const suffix = post_cursor.trimEnd();
    if (suffix) {
        if (text.endsWith(suffix)) {
            text = text.slice(0, -suffix.length);
        } else {
            const max = Math.min(suffix.length, text.length);
            for (let len = max; len > 0; len--) {
                if (text.endsWith(suffix.slice(0, len))) {
                    text = text.slice(0, -len);
                    break;
                }
            }
        }
    }

    return text;
}
