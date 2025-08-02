import fs from 'fs';

// Read the file
const content = fs.readFileSync('src/services/GameEngine.js', 'utf8');
const lines = content.split('\n');

// Find the duplicate method (second occurrence)
let duplicateStart = -1;
let duplicateEnd = -1;
let completeRoundCount = 0;

for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('async completeRound(gameId, roundId)')) {
        completeRoundCount++;
        if (completeRoundCount === 2) {
            // Find the start of the method (including comment)
            duplicateStart = i - 3; // Include the comment block
            break;
        }
    }
}

if (duplicateStart !== -1) {
    // Find the end of the duplicate method
    let braceCount = 0;
    let inMethod = false;
    
    for (let i = duplicateStart; i < lines.length; i++) {
        const line = lines[i];
        
        if (line.includes('async completeRound(gameId, roundId)')) {
            inMethod = true;
        }
        
        if (inMethod) {
            // Count braces to find method end
            for (const char of line) {
                if (char === '{') braceCount++;
                if (char === '}') braceCount--;
            }
            
            // Method ends when braces balance out
            if (braceCount === 0 && line.includes('}')) {
                duplicateEnd = i;
                break;
            }
        }
    }
    
    if (duplicateEnd !== -1) {
        console.log(`Removing duplicate method from lines ${duplicateStart + 1} to ${duplicateEnd + 1}`);
        
        // Remove the duplicate method
        const newLines = [
            ...lines.slice(0, duplicateStart),
            ...lines.slice(duplicateEnd + 1)
        ];
        
        // Write the fixed file
        fs.writeFileSync('src/services/GameEngine.js', newLines.join('\n'));
        console.log('✓ Duplicate method removed successfully');
    } else {
        console.log('Could not find end of duplicate method');
    }
} else {
    console.log('No duplicate method found');
}