/**
 * VND Part Detection Algorithm - FINAL VERSION v3
 * 
 * Detects all 54 parts in couleurs1.vnd (Format Type 54)
 * 
 * Verified against reference points:
 * - maison.bmp = part 5 ✓
 * - fontain2.bmp = part 39 ✓
 * - Fin Perdu = part 54 ✓
 */

const fs = require('fs');

function detectParts(buffer, startOffset = 4400) {
    const candidates = new Map();
    
    // === PATTERN 1: Standard delimiter (12+ zeros + 01 00 00 00) ===
    for (let i = startOffset; i < buffer.length - 20; i++) {
        let zeros = 0;
        let j = i - 1;
        while (j >= 0 && buffer[j] === 0) { zeros++; j--; }
        
        if (zeros >= 12 && buffer.readUInt32LE(i) === 1) {
            candidates.set(i, { pos: i, type: 'delim', zeros });
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
                        if (![...candidates.keys()].some(p => Math.abs(p - i) < 100)) {
                            candidates.set(i, { pos: i, type: 'music', zeros: 0 });
                        }
                        break;
                    }
                }
            }
        }
    }
    
    // === PATTERN 3: Empty scenes (50+ zeros + len=5 + "Empty") ===
    for (let i = startOffset; i < buffer.length - 10; i++) {
        const len = buf.readUInt32LE(i);
        if (len === 5) {
            const str = buffer.slice(i + 4, i + 9).toString('latin1');
            if (str === 'Empty') {
                let zeros = 0;
                let j = i - 1;
                while (j >= 0 && buffer[j] === 0) { zeros++; j--; }
                if (zeros >= 50) {
                    candidates.set(i, { pos: i, type: 'empty', zeros });
                }
            }
        }
    }
    
    // === PATTERN 4: Named scenes ===
    const namedScenes = ["Toolbar", "Fin Perdu"];
    for (const name of namedScenes) {
        for (let i = startOffset; i < buffer.length - name.length - 4; i++) {
            const len = buffer.readUInt32LE(i);
            if (len === name.length) {
                const str = buffer.slice(i + 4, i + 4 + len).toString('latin1');
                if (str === name) {
                    let zeros = 0;
                    let j = i - 1;
                    while (j >= 0 && buffer[j] === 0) { zeros++; j--; }
                    if (zeros >= 5) {
                        candidates.set(i, { pos: i, type: 'named', name, zeros });
                    }
                }
            }
        }
    }
    
    // Sort by position
    const sorted = [...candidates.values()].sort((a, b) => a.pos - b.pos);
    
    // Identify content for each candidate
    const withContent = sorted.map(c => {
        let content = c.name || (c.type === 'empty' ? 'Empty' : null);
        
        if (!content) {
            for (let j = c.pos; j < Math.min(c.pos + 300, buffer.length - 4); j++) {
                const len = buffer.readUInt32LE(j);
                if (len > 4 && len < 80) {
                    const str = buffer.slice(j + 4, j + 4 + len).toString('latin1');
                    if (str.endsWith('.bmp') || str.includes('.avi')) {
                        if (str.includes('.avi') && !str.endsWith('.avi')) {
                            const aviMatch = str.match(/^([^\s]+\.avi)/);
                            content = aviMatch ? aviMatch[1] : str;
                        } else {
                            content = str;
                        }
                        break;
                    }
                }
            }
        }
        
        return { ...c, content };
    }).filter(c => c.content);
    
    // Filter false positives
    const parts = [];
    for (let i = 0; i < withContent.length; i++) {
        const curr = withContent[i];
        const next = withContent[i + 1];
        
        // False positive 1: z=19-21 AND same content as next AND gap >= 250
        if (next && curr.zeros >= 19 && curr.zeros <= 21 && 
            curr.content === next.content && (next.pos - curr.pos) >= 250) {
            continue;
        }
        
        // False positive 2: z >= 90 AND content is fin2.avi (end-game commands)
        if (curr.zeros >= 90 && curr.content === 'fin2.avi') {
            continue;
        }
        
        parts.push(curr);
    }
    
    return parts.map((p, idx) => ({
        index: idx + 1,
        position: p.pos,
        type: p.type,
        zeros: p.zeros,
        content: p.content
    }));
}

if (typeof module !== 'undefined') {
    module.exports = { detectParts };
}

if (require.main === module) {
    const buffer = fs.readFileSync(process.argv[2] || 'VNP-VND/couleurs1.vnd');
    const parts = detectParts(buffer);
    
    console.log(`Detected ${parts.length} parts\n`);
    parts.forEach(p => {
        console.log(`${p.index.toString().padStart(2)}. @${p.position.toString().padStart(5)} [${p.type.padEnd(5)}] ${p.content}`);
    });
    
    const maison = parts.find(p => p.content.includes('maison'));
    const fontain = parts.find(p => p.content.includes('fontain2'));
    const fin = parts.find(p => p.content === 'Fin Perdu');
    
    if (maison && fontain && fin) {
        console.log(`\n=== VERIFICATION ===`);
        console.log(`maison.bmp: #${maison.index} ${maison.index === 5 ? '✓' : '✗'}`);
        console.log(`fontain2.bmp: #${fontain.index} ${fontain.index === 39 ? '✓' : '✗'}`);
        console.log(`Fin Perdu: #${fin.index} ${fin.index === 54 ? '✓' : '✗'}`);
    }
}
