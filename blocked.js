// Blocked page script for Focus Guard extension

// Parse URL parameters to show specific blocking information
const urlParams = new URLSearchParams(window.location.search);
const domain = urlParams.get('domain');
const reason = urlParams.get('reason');
const keyword = urlParams.get('keyword');
const query = urlParams.get('query');

// Update blocked info based on reason
function updateBlockedInfo()
{
    const blockedInfo = document.getElementById('blocked-info');

    if (domain)
    {
        blockedInfo.innerHTML = `
            <p><strong>Domain Blocked:</strong> ${escapeHtml(domain)}</p>
            <p>This website has been blocked to help maintain your focus and productivity.</p>
        `;
    } else if (reason === 'search' && keyword)
    {
        blockedInfo.innerHTML = `
            <p><strong>Search Blocked:</strong> Contains keyword "${escapeHtml(keyword)}"</p>
            <p>Your search: "${escapeHtml(query || 'N/A')}"</p>
            <p>This search was blocked because it contains content that could be distracting.</p>
        `;
    } else if (reason === 'keyword')
    {
        blockedInfo.innerHTML = `
            <p><strong>Content Blocked:</strong> Contains blocked keywords</p>
            <p>This page was blocked because it contains content that could be distracting.</p>
        `;
    }
}

// Load and display statistics
async function loadStats()
{
    try
    {
        const data = await chrome.storage.local.get(['blocksToday', 'focusStreak', 'totalTimeBlocked', 'lastBlockDate']);

        const today = new Date().toDateString();
        const lastBlockDate = data.lastBlockDate || '';

        // Reset daily counter if it's a new day
        let blocksToday = data.blocksToday || 0;
        if (lastBlockDate !== today)
        {
            blocksToday = 1;
            await chrome.storage.local.set({
                blocksToday: 1,
                lastBlockDate: today
            });
        } else
        {
            blocksToday++;
            await chrome.storage.local.set({ blocksToday });
        }

        // Update focus streak
        let focusStreak = data.focusStreak || 1;
        const timeSaved = Math.round((data.totalTimeBlocked || 0) / 3600) || Math.floor(blocksToday * 0.5);

        // Update display
        document.getElementById('blocks-today').textContent = blocksToday;
        document.getElementById('focus-streak').textContent = focusStreak;
        document.getElementById('time-saved').textContent = timeSaved;

    } catch (error)
    {
        console.log('Could not load stats (extension context)');
        // Fallback for demo purposes
        document.getElementById('blocks-today').textContent = Math.floor(Math.random() * 10) + 1;
        document.getElementById('focus-streak').textContent = Math.floor(Math.random() * 30) + 1;
        document.getElementById('time-saved').textContent = Math.floor(Math.random() * 20) + 1;
    }
}

function goHome()
{
    window.location.href = 'https://www.google.com';
}

function showSettings()
{
    try
    {
        if (chrome && chrome.runtime && chrome.runtime.openOptionsPage)
        {
            chrome.runtime.openOptionsPage();
        } else if (chrome && chrome.tabs)
        {
            chrome.tabs.create({ url: chrome.runtime.getURL('options.html') });
        } else
        {
            alert('Please access settings through the extension popup in your browser toolbar.');
        }
    } catch (error)
    {
        alert('Please access settings through the extension popup in your browser toolbar.');
    }
}

function setupQuoteRotation()
{
    const motivationalQuotes = [
        "The successful warrior is the average person with laser-like focus. - Bruce Lee",
        "Concentration is the secret of strength. - Ralph Waldo Emerson",
        "Where attention goes, energy flows and results show. - T. Harv Eker",
        "The art of being wise is knowing what to overlook. - William James",
        "Focus on being productive instead of busy. - Tim Ferriss",
        "You are what you choose to focus on. - Unknown",
        "Discipline is choosing between what you want now and what you want most. - Abraham Lincoln"
    ];

    // Rotate motivational quotes
    let quoteIndex = 0;
    const quoteElement = document.querySelector('.quote');

    if (quoteElement)
    {
        quoteElement.style.transition = 'opacity 0.3s ease';

        setInterval(() =>
        {
            quoteIndex = (quoteIndex + 1) % motivationalQuotes.length;
            quoteElement.style.opacity = '0';
            setTimeout(() =>
            {
                quoteElement.textContent = motivationalQuotes[quoteIndex];
                quoteElement.style.opacity = '1';
            }, 300);
        }, 8000);
    }
}

function setupEventListeners()
{
    // Set up button event listeners
    const goHomeBtn = document.getElementById('go-home');
    const showSettingsBtn = document.getElementById('show-settings');

    if (goHomeBtn)
    {
        goHomeBtn.addEventListener('click', (e) =>
        {
            e.preventDefault();
            goHome();
        });
    }

    if (showSettingsBtn)
    {
        showSettingsBtn.addEventListener('click', (e) =>
        {
            e.preventDefault();
            showSettings();
        });
    }
}

function escapeHtml(text)
{
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () =>
{
    updateBlockedInfo();
    loadStats();
    setupQuoteRotation();
    setupEventListeners();
});

// Also initialize immediately in case DOM is already loaded
if (document.readyState === 'loading')
{
    // DOM is still loading, wait for DOMContentLoaded
} else
{
    // DOM is already loaded
    updateBlockedInfo();
    loadStats();
    setupQuoteRotation();
    setupEventListeners();
}