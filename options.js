// options.js - Fixed version with proper element IDs and CSP compliance

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', async () =>
{
    console.log('Options page DOM loaded, initializing...');

    try
    {
        // Check if all required elements exist - FIXED: use correct IDs
        const requiredElements = ['keywords-container', 'domains-list'];
        const missingElements = requiredElements.filter(id => !document.getElementById(id));

        if (missingElements.length > 0)
        {
            console.error('Missing required elements:', missingElements);
            throw new Error(`Missing elements: ${missingElements.join(', ')}`);
        }

        // Initialize options manager
        window.optionsManager = new OptionsManager();

        // Setup event listeners
        setupEventListeners();

        await window.optionsManager.init();

        console.log('Options page initialized successfully');

        // Handle URL hash for direct navigation
        const hash = window.location.hash;
        if (hash)
        {
            setTimeout(() =>
            {
                const element = document.querySelector(hash);
                if (element)
                {
                    element.scrollIntoView({ behavior: 'smooth' });
                }
            }, 500);
        }

    } catch (error)
    {
        console.error('Failed to initialize options page:', error);
        showErrorPage(error);
    }
});

function setupEventListeners()
{
    // Note: No blocklist modal functionality needed for now
    // The improved blocklist management is handled in options-core.js

    console.log('Event listeners set up successfully');
}

// Utility functions
function showSuccess(message)
{
    console.log('Success:', message);
    showGlobalMessage(message, 'success');
}

function showError(message)
{
    console.error('Error:', message);
    showGlobalMessage(message, 'error');
}

function showGlobalMessage(message, type)
{
    // Create simple toast notification
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type === 'success' ? 'toast-success' : 'toast-error'}`;
    toast.textContent = message;
    toast.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        max-width: 400px;
        padding: 15px 20px;
        border-radius: 12px;
        font-weight: 500;
        box-shadow: 0 8px 25px rgba(0, 0, 0, 0.2);
        animation: slideInRight 0.4s ease-out;
        background: ${type === 'success' ? 'linear-gradient(135deg, #d4edda, #c3e6cb)' : 'linear-gradient(135deg, #f8d7da, #f5c6cb)'};
        color: ${type === 'success' ? '#155724' : '#721c24'};
        border: 2px solid ${type === 'success' ? '#c3e6cb' : '#f5c6cb'};
    `;

    // Add animation styles if not already present
    if (!document.getElementById('toast-animations'))
    {
        const style = document.createElement('style');
        style.id = 'toast-animations';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    opacity: 0;
                    transform: translateX(30px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(toast);

    // Auto remove after 5 seconds
    setTimeout(() =>
    {
        if (toast.parentNode)
        {
            toast.style.animation = 'slideInRight 0.4s ease-out reverse';
            setTimeout(() =>
            {
                if (toast.parentNode)
                {
                    toast.parentNode.removeChild(toast);
                }
            }, 400);
        }
    }, 5000);
}

function showErrorPage(error)
{
    document.body.innerHTML = `
        <div style="padding: 40px; text-align: center; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); min-height: 100vh; color: white; font-family: 'Segoe UI', sans-serif;">
            <div style="max-width: 600px; margin: 0 auto; background: rgba(255, 255, 255, 0.95); color: #333; padding: 40px; border-radius: 20px; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);">
                <h1 style="color: #e74c3c; margin-bottom: 20px;">Settings Error</h1>
                <p style="margin-bottom: 20px; line-height: 1.6;">Failed to initialize Fokus settings page. This might be due to:</p>
                <ul style="text-align: left; margin: 20px 0; line-height: 1.8;">
                    <li>Browser extension permissions</li>
                    <li>Corrupted extension files</li>
                    <li>Browser compatibility issues</li>
                    <li>Missing configuration files</li>
                </ul>
                <button id="refresh-page-btn" style="background: #4CAF50; color: white; border: none; padding: 12px 24px; border-radius: 8px; cursor: pointer; margin: 5px; font-size: 14px;">
                    REFRESH PAGE
                </button>
                <details style="text-align: left; margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 8px;">
                    <summary style="cursor: pointer; font-weight: bold;">Technical Details</summary>
                    <pre style="margin-top: 10px; font-size: 12px; color: #666; white-space: pre-wrap;">${error.message}

Stack: ${error.stack}</pre>
                </details>
            </div>
        </div>
    `;

    // Add event listener for refresh button
    document.getElementById('refresh-page-btn')?.addEventListener('click', () =>
    {
        location.reload();
    });
}

// Handle page unload
window.addEventListener('beforeunload', () =>
{
    console.log('Options page unloading...');
});

// Handle visibility changes
document.addEventListener('visibilitychange', () =>
{
    if (!document.hidden && window.optionsManager && window.optionsManager.isInitialized)
    {
        setTimeout(() =>
        {
            window.optionsManager.loadAllSettings();
        }, 1000);
    }
});