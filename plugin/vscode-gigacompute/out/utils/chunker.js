"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.chunkText = chunkText;
/**
 * A simple utility to split text into smaller chunks based on a maximum character count.
 * In a real-world scenario, this might use an AST parser or tokenizer for more intelligent splitting (e.g., by function).
 */
function chunkText(text, maxCharsPerChunk = 2000) {
    const chunks = [];
    let currentChunk = '';
    // Split by newlines to try and keep lines intact
    const lines = text.split('\n');
    for (const line of lines) {
        if (currentChunk.length + line.length > maxCharsPerChunk && currentChunk.length > 0) {
            chunks.push(currentChunk);
            currentChunk = '';
        }
        currentChunk += line + '\n';
    }
    if (currentChunk.trim().length > 0) {
        chunks.push(currentChunk);
    }
    return chunks;
}
//# sourceMappingURL=chunker.js.map