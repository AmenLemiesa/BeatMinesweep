// Background service worker for Minesweeper Auto Play extension
chrome.runtime.onInstalled.addListener(() => {
  console.log('Minesweeper Auto Play extension installed');
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'injectScript') {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      if (tabs[0]) {
        // Inject into ALL frames (including iframes)
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id, allFrames: true },
          files: ['autoplayer.js']
        }).then(() => {
          console.log('Autoplayer script injected successfully into all frames');
          sendResponse({ success: true, message: 'Script injected successfully' });
        }).catch((error) => {
          console.error('Failed to inject script:', error);
          sendResponse({ success: false, error: error.message });
        });
      } else {
        sendResponse({ success: false, error: 'No active tab found' });
      }
    });
    
    return true;
  }
});