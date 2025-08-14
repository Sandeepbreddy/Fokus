// debug-test.js - Debug test page JavaScript

console.log('🔧 Debug test page loaded');

async function loadExtensionStatus()
{
    try
    {
        const data = await chrome.storage.local.get(['blockedKeywords', 'isActive', 'customDomains']);

        const status = document.getElementById('extension-status');
        const keywordsList = document.getElementById('keywords-list');

        const isActive = data.isActive !== undefined ? data.isActive : true;
        const keywords = data.blockedKeywords || [];

        status.innerHTML = `
            <div class="result ${isActive ? 'success' : 'error'}">
                Extension Active: ${isActive ? 'YES' : 'NO'}
            </div>
            <div class="result info">
                Blocked Keywords: ${keywords.length}
            </div>
            <div class="result info">
                Custom Domains: ${(data.customDomains || []).length}
            </div>
        `;

        keywordsList.innerHTML = keywords.length > 0 ?
            keywords.map(k => `<span style="background: #e3f2fd; padding: 4px 8px; margin: 2px; border-radius: 4px; display: inline-block;">${k}</span>`).join('') :
            '<div class="result error">No keywords configured!</div>';

    } catch (error)
    {
        document.getElementById('extension-status').innerHTML =
            `<div class="result error">Error loading extension data: ${error.message}</div>`;
    }
}

function testKeyword()
{
    const input = document.getElementById('test-input');
    const result = document.getElementById('keyword-result');
    const value = input.value.toLowerCase();

    console.log('🔧 Testing keyword:', value);

    // Test against common blocked keywords
    const testKeywords = ['porn', 'xxx', 'sex', 'adult', 'nude', 'naked'];
    const found = testKeywords.find(k => value.includes(k));

    if (found)
    {
        result.innerHTML = `<div class="result error">⚠️ Keyword "${found}" detected in "${value}"</div>`;
        console.log('🚫 Keyword detected:', found);
    } else
    {
        result.innerHTML = `<div class="result success">✅ No blocked keywords found in "${value}"</div>`;
        console.log('✅ No keywords detected');
    }
}

function testGoogleSearch()
{
    console.log('🔧 Testing Google search navigation...');
    const result = document.getElementById('url-result');
    result.innerHTML = '<div class="result info">🔄 Testing Google search URL...</div>';

    // Try to navigate to Google search
    const searchURL = 'https://www.google.com/search?q=porn&uact=5';
    console.log('🔧 Navigating to:', searchURL);

    setTimeout(() =>
    {
        window.location.href = searchURL;
    }, 1000);
}

function testDirectURL()
{
    console.log('🔧 Testing direct URL navigation...');
    const result = document.getElementById('url-result');
    result.innerHTML = '<div class="result info">🔄 Testing direct navigation...</div>';

    // Test URL that should be blocked
    window.location.href = 'https://www.google.com/search?q=adult+content&uact=5';
}

function clearConsole()
{
    console.clear();
    console.log('🔧 Console cleared - Debug test page ready');
}

// Global functions for HTML onclick handlers
window.testKeyword = testKeyword;
window.testGoogleSearch = testGoogleSearch;
window.testDirectURL = testDirectURL;
window.clearConsole = clearConsole;

// Load status on page load
document.addEventListener('DOMContentLoaded', loadExtensionStatus);

// Set up input testing
document.addEventListener('DOMContentLoaded', () =>
{
    const testInput = document.getElementById('test-input');
    if (testInput)
    {
        testInput.addEventListener('input', function ()
        {
            const value = this.value;
            if (value.includes('porn') || value.includes('sex') || value.includes('adult'))
            {
                this.style.border = '2px solid red';
                this.style.background = '#ffe6e6';
            } else
            {
                this.style.border = '';
                this.style.background = '';
            }
        });
    }
});