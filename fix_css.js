const fs = require('fs');
const path = require('path');
const stylePath = path.join('website', 'style.css');

try {
    const content = fs.readFileSync(stylePath, 'utf8');
    const lines = content.split(/\r?\n/);

    // Line 1786 (1-based) is the closing brace of the media query
    // Index 1785 (0-based)

    // Verify line 1785 contains '}'
    if (lines[1785] && lines[1785].trim() === '}') {
        const cleanLines = lines.slice(0, 1786);
        const newCss = `
/* Card Slide Animations */
@keyframes fadeOutLeft {
    from {
        opacity: 1;
        transform: translateX(0);
    }
    to {
        opacity: 0;
        transform: translateX(-20px);
    }
}

@keyframes fadeInRight {
    from {
        opacity: 0;
        transform: translateX(20px);
    }
    to {
        opacity: 1;
        transform: translateX(0);
    }
}

.animate-out {
    animation: fadeOutLeft 0.3s ease forwards;
}

.animate-in {
    animation: fadeInRight 0.3s ease forwards;
}
`;
        const finalContent = cleanLines.join('\n') + newCss;
        fs.writeFileSync(stylePath, finalContent, 'utf8');
        console.log("Fixed style.css");
    } else {
        console.error("Line 1786 is not the expected closing brace. Found:", lines[1785]);
        // Fallback: substring search
        const anchor = '.footer-content {\n        flex-direction: column;\n        gap: 1.5rem;\n    }\n}';
        // Normalize line endings for search implies more complexity.
        // Let's just trust absolute index for now or checking the content.
    }
} catch (e) {
    console.error("Error:", e);
}
