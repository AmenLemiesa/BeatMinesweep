// Popup script for Minesweeper Auto Play extension

(function() {
  const startButton = document.getElementById('startButton');
  const stopButton = document.getElementById('stopButton');
  const statusDiv = document.getElementById('status');

  let activeTabId = null;

  chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
    if (!tabs[0] || !tabs[0].id) {
      statusDiv.textContent = 'Could not find active tab.';
      startButton.disabled = true;
      return;
    }
    activeTabId = tabs[0].id;

    // Check if bot is already running
    checkBotStatus();
  });

  function checkBotStatus() {
    chrome.scripting.executeScript({
      target: {tabId: activeTabId, allFrames: true},
      func: function() {
        if (window.minesweeperBot) {
          const canvases = document.querySelectorAll('canvas');
          let gameCanvas = null;
          for (let canvas of canvases) {
            if ((canvas.width === 1080 && canvas.height === 840) || 
                (canvas.width === 540 && canvas.height === 420)) {
              gameCanvas = canvas;
              break;
            }
          }
          
          return {
            available: true,
            active: window.minesweeperBot.isActive(),
            canvasFound: gameCanvas !== null,
            canvasSize: gameCanvas ? `${gameCanvas.width}x${gameCanvas.height}` : 'none',
            inIframe: window !== window.top
          };
        }
        return { available: false, inIframe: window !== window.top };
      }
    }, function(results) {
      if (results && results.length > 0) {
        // Find the frame with the game
        const gameFrame = results.find(r => r.result && r.result.canvasFound);
        const status = gameFrame ? gameFrame.result : results[0].result;
        
        if (status && status.available) {
          if (status.active) {
            statusDiv.innerHTML = '🤖 <strong>Bot is running!</strong><br>Playing Minesweeper...';
            startButton.disabled = true;
            stopButton.disabled = false;
          } else {
            statusDiv.textContent = 'Bot injected. Ready to start!';
            startButton.disabled = false;
            stopButton.disabled = true;
          }
        } else {
          statusDiv.textContent = 'Ready to inject bot. Click Start!';
          startButton.disabled = false;
          stopButton.disabled = true;
        }
      }
    });
  }

  startButton.addEventListener('click', function() {
    if (!activeTabId) {
      statusDiv.textContent = 'Could not find active tab.';
      return;
    }

    startButton.disabled = true;
    statusDiv.textContent = 'Injecting bot...';
    
    // Inject the autoplayer script into all frames
    chrome.scripting.executeScript({
      target: {tabId: activeTabId, allFrames: true},
      files: ['autoplayer.js']
    }, function(result) {
      if (chrome.runtime.lastError) {
        console.error('Script injection error:', chrome.runtime.lastError);
        statusDiv.textContent = 'Error: ' + chrome.runtime.lastError.message;
        startButton.disabled = false;
        return;
      }
      
      statusDiv.textContent = 'Bot injected! Starting...';
      
      // Start the bot in all frames
      setTimeout(() => {
        chrome.scripting.executeScript({
          target: {tabId: activeTabId, allFrames: true},
          func: function() {
            if (window.minesweeperBot) {
              window.minesweeperBot.start();
            }
          }
        });
        
        setTimeout(() => {
          checkBotStatus();
        }, 1000);
      }, 500);
    });
  });

  stopButton.addEventListener('click', function() {
    if (!activeTabId) return;

    chrome.scripting.executeScript({
      target: {tabId: activeTabId, allFrames: true},
      func: function() {
        if (window.minesweeperBot) {
          window.minesweeperBot.stop();
        }
      }
    });

    statusDiv.textContent = 'Bot stopped.';
    startButton.disabled = false;
    stopButton.disabled = true;
  });

})();