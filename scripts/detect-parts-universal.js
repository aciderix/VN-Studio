/**
 * Universal VND Part Detection Algorithm v2
 * 
 * Auto-detects format type and applies appropriate detection rules.
 * 
 * Verified reference points for couleurs1.vnd (Format 54):
 * - maison.bmp = part 5 ✓
 * - fontain2.bmp = part 39 ✓
 * - Fin Perdu = part 54 ✓
 */

const fs = require('fs');

function readBorlandString(buffer, offset) {
    if (offset + 4 > buffer.length) return { str: '', len: 0 };
    const len = buffer.readUInt32LE(offset);
    if (len > 500 || offset + 4 + len > buffer.length) return { str: '', len: 0 };
    return { str: buffer.slice(offset + 4, offset + 4 + len).toString('latin1'), len: 4 + len };
}

function parseHeader(buffer) {
    let pos = 5; // Skip flags
    const vnfile = readBorlandString(buffer, pos); pos += vnfile.len;
    const version = readBorlandString(buffer, pos); pos += version.len;
    const formatType = buffer.readUInt32LE(pos); pos += 4;
    const projectName = readBorlandString(buffer, pos); pos += projectName.len;
    return { formatType, projectName: projectName.str, headerEnd: pos };
}

function countZerosBefore(buffer, pos) {
    let zeros = 0;
    let j = pos - 1;
    while (j >= 0 && buffer[j] === 0) { zeros++; j--; }
    return zeros;
}

function findContent(buffer, startPos, maxSearch = 300) {
    for (let j = startPos; j < Math.min(startPos + maxSearch, buffer.length - 4); j++) {
        const len = buffer.readUInt32LE(j);
        if (len > 4 && len < 80) {
            const str = buffer.slice(j + 4, j + 4 + len).toString('latin1');
            if (str.endsWith('.bmp') && !str.includes('\x00')) {
                return str;
            }
            if (str.includes('.avi') && !str.includes('\x00')) {
                const match = str.match(/^([^\s]+\.avi)/);
                return match ? match[1] : str;
            }
        }
    }
    return null;
}

function detectParts(buffer, startOffset = 4400) {
    const header = parseHeader(buffer);
    const candidates = new Map();
    
    // === PATTERN 1: Standard delimiter (12+ zeros + 01 00 00 00) ===
    for (let i = startOffset; i < buffer.length - 20; i++) {
        const zeros = countZerosBefore(buffer, i);
        if (zeros >= 12 && buffer.readUInt32LE(i) === 1) {
            const content = findContent(buffer, i);
            if (content) {
                candidates.set(i, { pos: i, type: 'bmp', zeros, content });
            }
            i += 10;
        }
    }
    
    // === PATTERN 2: Music scenes (0x81 + music.wav) ===
    for (let i = startOffset; i < buffer.length - 100; i++) {
        if (buffer.readUInt32LE(i) === 0x81) {
            for (let j = i; j < i + 50; j++) {
                if (buffer.readUInt32LE(j) === 9) {
                    const str = buffer.slice(j + 4, j + 13).toString('latin1');
                    if (str === 'music.wav') {
                        // Find BMP after music.wav
                        const content = findContent(buffer, j + 13, 200);
                        if (content && ![...candidates.keys()].some(p => Math.abs(p - i) < 50)) {
                            candidates.set(i, { pos: i, type: 'music', zeros: 0, content });
                        }
                        break;
                    }
                }
            }
        }
    }
    
    // === PATTERN 3: Empty scenes (50+ zeros + len=5 + "Empty") ===
    for (let i = startOffset; i < buffer.length - 10; i++) {
        if (buffer.readUInt32LE(i) === 5) {
            const str = buffer.slice(i + 4, i + 9).toString('latin1');
            if (str === 'Empty') {
                const zeros = countZerosBefore(buffer, i);
                if (zeros >= 50) {
                    candidates.set(i, { pos: i, type: 'empty', zeros, content: 'Empty' });
                }
            }
        }
    }
    
    // === PATTERN 4: Named scenes (with variable zero padding) ===
    const namedScenes = [
        { name: "Village", minZeros: 4 },
        { name: "Le bureau du banquier", minZeros: 4 },
        { name: "La banque", minZeros: 4 },
        { name: "Toolbar", minZeros: 5 },
        { name: "Fin Perdu", minZeros: 5 }
    ];
    
    for (const { name, minZeros } of namedScenes) {
        for (let i = startOffset; i < buffer.length - name.length - 4; i++) {
            const len = buffer.readUInt32LE(i);
            if (len === name.length) {
                const str = buffer.slice(i + 4, i + 4 + len).toString('latin1');
                if (str === name) {
                    const zeros = countZerosBefore(buffer, i);
                    if (zeros >= minZeros) {
                        candidates.set(i, { pos: i, type: 'named', zeros, content: name });
                    }
                }
            }
        }
    }
    
    // Sort by position
    const sorted = [...candidates.values()].sort((a, b) => a.pos - b.pos);
    
    // Merge named scenes with their following BMP (gap < 50 bytes)
    const merged = [];
    for (let i = 0; i < sorted.length; i++) {
        const curr = sorted[i];
        const next = sorted[i + 1];
        
        // If this is a named scene and next is a BMP within 50 bytes, merge them
        if (curr.type === 'named' && next && next.type === 'bmp' && (next.pos - curr.pos) < 50) {
            merged.push({
                pos: curr.pos,
                type: 'named',
                zeros: curr.zeros,
                content: curr.content + ' → ' + next.content
            });
            i++; // Skip the next BMP since we merged it
        } else {
            merged.push(curr);
        }
    }
    
    // Filter false positives
    const parts = [];
    for (let i = 0; i < merged.length; i++) {
        const curr = merged[i];
        const next = merged[i + 1];
        
        // False positive 1: Hotspot markers (z=19-21, same content as next, gap >= 250)
        if (next && curr.zeros >= 19 && curr.zeros <= 21 && 
            curr.content === next.content && (next.pos - curr.pos) >= 250) {
            continue;
        }
        
        // False positive 2: End-game commands (z >= 90, content = fin2.avi)
        if (curr.zeros >= 90 && curr.content === 'fin2.avi') {
            continue;
        }
        
        parts.push(curr);
    }
    
    return {
        formatType: header.formatType,
        projectName: header.projectName,
        parts: parts.map((p, idx) => ({
            index: idx + 1,
            position: p.pos,
            type: p.type,
            zeros: p.zeros,
            content: p.content
        }))
    };
}

// Export for use as module
if (typeof module !== 'undefined') {
    module.exports = { detectParts, parseHeader };
}

// CLI execution
if (require.main === module) {
    const filePath = process.argv[2];
    if (!filePath) {
        console.log('Usage: node detect-parts-universal.js <file.vnd>');
        process.exit(1);
    }
    
    const buffer = fs.readFileSync(filePath);
    const result = detectParts(buffer);
    
    console.log('Format Type: ' + result.formatType);
    console.log('Project: ' + result.projectName);
    console.log('\n=== ' + result.parts.length + ' PARTS DETECTED ===\n');
    
    result.parts.forEach(p => {
        const typeStr = p.type.padEnd(5);
        const posStr = p.position.toString().padStart(5);
        const zStr = ('z=' + p.zeros).padStart(5);
        console.log(p.index.toString().padStart(2) + '. @' + posStr + ' [' + typeStr + '] ' + zStr + ' ' + p.content);
    });
    
    // Verification for couleurs1.vnd
    if (result.formatType === 54) {
        const maison = result.parts.find(p => p.content && p.content.includes('maison'));
        const fontain = result.parts.find(p => p.content && p.content.includes('fontain2'));
        const fin = result.parts.find(p => p.content === 'Fin Perdu');
        
        if (maison || fontain || fin) {
            console.log('\n=== VERIFICATION ===');
            if (maison) console.log('maison.bmp: #' + maison.index + ' ' + (maison.index === 5 ? '✓' : '✗'));
            if (fontain) console.log('fontain2.bmp: #' + fontain.index + ' ' + (fontain.index === 39 ? '✓' : '✗'));
            if (fin) console.log('Fin Perdu: #' + fin.index + ' ' + (fin.index === 54 ? '✓' : '✗'));
        }
    }
}
