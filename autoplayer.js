// Minesweeper Auto Play - With Visual Popup
(function() {
  'use strict';
  
  let isActive = false;
  let gameInterval = null;
  let canvas = null;
  let ctx = null;
  let boardState = [];
  let flaggedCells = new Set(); // Track cells we've flagged - NEVER click these
  let rows = 0;
  let cols = 0;
  let cellWidth = 0;
  let cellHeight = 0;
  let boardX = 0;
  let boardY = 0;
  let popupOverlay = null;
  let nextAnalyzeAt = 0;     // timestamp (ms) when we’re allowed to analyze again
  let pendingMove = null;    
  let lastFlagDebugAt = 0;
  let awaitingApproval = false;
  let decisionOverlay = null;
  
  console.log('Minesweeper Auto Play - WITH VISUAL POPUP');
  
  function createPopupOverlay() {
    if (popupOverlay) return;
    
    popupOverlay = document.createElement('div');
    popupOverlay.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      width: 400px;
      background: rgba(0, 0, 0, 0.95);
      border: 3px solid #4CAF50;
      border-radius: 10px;
      padding: 15px;
      z-index: 999999;
      color: white;
      font-family: monospace;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;
    
    popupOverlay.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
        <h3 style="margin: 0; color: #4CAF50;">🤖 Minesweeper Bot</h3>
        <button id="closePopup" style="background: #f44336; border: none; color: white; padding: 5px 10px; border-radius: 5px; cursor: pointer;">✕</button>
      </div>
      <div id="statusText" style="margin-bottom: 10px; font-size: 14px;">Initializing...</div>
      <canvas id="boardPreview" style="width: 100%; border: 2px solid #666; border-radius: 5px; image-rendering: pixelated;"></canvas>
      <div style="margin-top: 10px; font-size: 12px; color: #aaa;">
        Press Ctrl+Shift+M to toggle bot
      </div>
    `;
    
    document.body.appendChild(popupOverlay);
    
    document.getElementById('closePopup').addEventListener('click', () => {
      popupOverlay.style.display = 'none';
    });
  }

  function createDecisionOverlay() {
    if (decisionOverlay) return;

    decisionOverlay = document.createElement('div');
    decisionOverlay.id = 'decisionOverlay';
    decisionOverlay.style.cssText = `
      position: fixed;
      left: 20px;
      bottom: 20px;
      width: 420px;
      background: rgba(20, 20, 20, 0.95);
      border: 3px solid #ff9800;
      border-radius: 10px;
      padding: 15px;
      z-index: 999999;
      color: white;
      font-family: monospace;
      box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    `;

    decisionOverlay.innerHTML = `
      <div style="display:flex; justify-content: space-between; align-items:center; margin-bottom: 10px;">
        <strong style="color:#ff9800;">🧠 Move Approval</strong>
        <span id="decisionStatus" style="font-size:12px; color:#aaa;">waiting...</span>
      </div>
      <div id="decisionText" style="font-size: 13px; line-height: 1.4; margin-bottom: 10px;"></div>
      <div style="display:flex; gap:10px;">
        <button id="approveMove" style="background:#4CAF50; border:none; color:white; padding:6px 12px; border-radius:6px; cursor:pointer;">Approve</button>
      </div>
      <div style="margin-top:8px; font-size:11px; color:#aaa;">
        Tip: Approve will execute exactly one action, then pause for the next decision.
      </div>
    `;

    document.body.appendChild(decisionOverlay);

    document.getElementById('approveMove').addEventListener('click', () => {
      if (!pendingMove) return;
      const move = pendingMove;
      pendingMove = null;
      awaitingApproval = false;
      updateDecisionOverlay(null, 'approved');
      executeMove(move);
    });
  }

  function updateDecisionOverlay(move, status = 'waiting') {
    if (!decisionOverlay) createDecisionOverlay();
    decisionOverlay.style.display = 'block';

    const statusEl = document.getElementById('decisionStatus');
    const textEl = document.getElementById('decisionText');

    if (!move) {
      textEl.textContent = '';
      statusEl.textContent = status;
      decisionOverlay.style.display = 'none';
      return;
    }

    const cellState = boardState[move.row][move.col];
    const adj = getAdjacentCells(move.row, move.col);
    const adjSummary = adj.map(a => {
      const c = boardState[a.row][a.col];
      const tag = c.type === 'revealed' ? `R${c.number}` : c.type[0].toUpperCase();
      return `${a.row},${a.col}:${tag}`;
    }).join(' ');

    const contextLines = [
      `Action: ${move.action.toUpperCase()}`,
      `Target: (${move.row}, ${move.col})`,
      `Detected: ${cellState.type}${cellState.number !== undefined ? ' #' + cellState.number : ''}`,
      `Adjacent: ${adjSummary}`
    ];

    textEl.textContent = contextLines.join(' | ');
    statusEl.textContent = status;
  }
  
  function updatePopup(nextMove) {
    if (!popupOverlay) createPopupOverlay();
    popupOverlay.style.display = 'block';
    
    const statusText = document.getElementById('statusText');
    const boardPreview = document.getElementById('boardPreview');
    const previewCtx = boardPreview.getContext('2d');
    
    // Set canvas size
    boardPreview.width = cols * 20;
    boardPreview.height = rows * 20;
    
    // Count cell types
    const unrevealed = boardState.flat().filter(c => c.type === 'unrevealed').length;
    const revealed = boardState.flat().filter(c => c.type === 'revealed').length;
    const flagged = boardState.flat().filter(c => c.type === 'flagged').length;
    
    statusText.innerHTML = `
      <strong>Status:</strong> ${isActive ? '🟢 ACTIVE' : '🔴 PAUSED'}<br>
      <strong>Board:</strong> ${rows}×${cols} grid<br>
      <strong>Unrevealed:</strong> ${unrevealed} | <strong>Revealed:</strong> ${revealed} | <strong>Flagged:</strong> ${flagged}<br>
      <strong>Locked Flags:</strong> ${flaggedCells.size} (never click these!)
    `;
    
    if (nextMove) {
      const cellState = boardState[nextMove.row][nextMove.col];
      const x = boardX + nextMove.col * cellWidth + cellWidth / 2;
      const y = boardY + nextMove.row * cellHeight + cellHeight / 2;
      
      // Get the actual pixel color at target
      let pixelInfo = '';
      try {
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        pixelInfo = `rgb(${pixel[0]}, ${pixel[1]}, ${pixel[2]})`;
      } catch (e) {
        pixelInfo = 'error';
      }
      
      statusText.innerHTML += `<br><strong>Next:</strong> ${nextMove.action.toUpperCase()} at (${nextMove.row}, ${nextMove.col})<br>`;
      statusText.innerHTML += `<strong>Detected:</strong> ${cellState.type}${cellState.number !== undefined ? ' #' + cellState.number : ''}<br>`;
      statusText.innerHTML += `<strong>Color:</strong> ${pixelInfo}`;
      
      // Show screenshot of the target cell
      showCellScreenshot(nextMove.row, nextMove.col);
    }
    
    // Draw board
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = boardState[row][col];
        const x = col * 20;
        const y = row * 20;
        
        // Draw cell background
        if (cell.type === 'unrevealed') {
          previewCtx.fillStyle = '#8AB062'; // Green
        } else if (cell.type === 'revealed') {
          previewCtx.fillStyle = '#D2B48C'; // Tan
        } else if (cell.type === 'flagged') {
          previewCtx.fillStyle = '#C83232'; // Red
        } else {
          previewCtx.fillStyle = '#666666'; // Unknown
        }
        
        previewCtx.fillRect(x, y, 20, 20);
        
        // Draw border
        previewCtx.strokeStyle = '#333';
        previewCtx.lineWidth = 1;
        previewCtx.strokeRect(x, y, 20, 20);
        
        // Draw number if revealed
        if (cell.type === 'revealed' && cell.number > 0) {
          previewCtx.fillStyle = getNumberColor(cell.number);
          previewCtx.font = 'bold 14px monospace';
          previewCtx.textAlign = 'center';
          previewCtx.textBaseline = 'middle';
          previewCtx.fillText(cell.number, x + 10, y + 10);
        }
        
        // Highlight next move
        if (nextMove && nextMove.row === row && nextMove.col === col) {
          previewCtx.strokeStyle = nextMove.action === 'flag' ? '#FF0' : '#0F0';
          previewCtx.lineWidth = 3;
          previewCtx.strokeRect(x + 2, y + 2, 16, 16);
          
          // Draw icon
          previewCtx.fillStyle = nextMove.action === 'flag' ? '#FF0' : '#0F0';
          previewCtx.font = 'bold 16px monospace';
          previewCtx.fillText(nextMove.action === 'flag' ? '🚩' : '👆', x + 10, y + 10);
        }
      }
    }
  }
  
  function showCellScreenshot(row, col) {
    // Remove old screenshot if exists
    let screenshotDiv = document.getElementById('cellScreenshot');
    if (screenshotDiv) {
      screenshotDiv.remove();
    }
    
    // Create new screenshot canvas
    screenshotDiv = document.createElement('div');
    screenshotDiv.id = 'cellScreenshot';
    screenshotDiv.style.cssText = `
      margin-top: 10px;
      border: 2px solid #4CAF50;
      border-radius: 5px;
      padding: 10px;
      background: #222;
    `;
    
    screenshotDiv.innerHTML = `
      <div style="color: #4CAF50; font-weight: bold; margin-bottom: 5px;">
        📸 3x3 Cell Area Screenshot (${row}, ${col})
      </div>
      <canvas id="cellScreenshotCanvas" style="width: 100%; border: 1px solid #666; image-rendering: pixelated;"></canvas>
      <div style="color: #aaa; font-size: 11px; margin-top: 5px;">
        🎯 Crosshairs show: center + 8 sampling points (±5px)
      </div>
    `;
    
    popupOverlay.appendChild(screenshotDiv);
    
    // Capture the cell area from the game canvas
    const cellCanvas = document.getElementById('cellScreenshotCanvas');
    const cellCtx = cellCanvas.getContext('2d');
    
    // Capture 3x3 cells area
    const captureWidth = Math.floor(cellWidth * 3);
    const captureHeight = Math.floor(cellHeight * 3);
    cellCanvas.width = captureWidth;
    cellCanvas.height = captureHeight;
    
    try {
      // Center the capture on the target cell
      const targetCellCenterX = boardX + col * cellWidth + cellWidth / 2;
      const targetCellCenterY = boardY + row * cellHeight + cellHeight / 2;
      
      // Capture from 1.5 cells left/up to 1.5 cells right/down
      const captureX = Math.floor(targetCellCenterX - captureWidth / 2);
      const captureY = Math.floor(targetCellCenterY - captureHeight / 2);
      
      // Get the image data from the game canvas
      const imageData = ctx.getImageData(captureX, captureY, captureWidth, captureHeight);
      cellCtx.putImageData(imageData, 0, 0);
      
      // Draw crosshairs at all 9 sampling points
      // Center of middle cell
      const centerX = captureWidth / 2;
      const centerY = captureHeight / 2;
      
      // Draw grid lines to show cell boundaries
      cellCtx.strokeStyle = 'rgba(255, 255, 0, 0.3)';
      cellCtx.lineWidth = 1;
      
      // Vertical lines at cell boundaries
      for (let i = 0; i <= 3; i++) {
        const x = (captureWidth / 3) * i;
        cellCtx.beginPath();
        cellCtx.moveTo(x, 0);
        cellCtx.lineTo(x, captureHeight);
        cellCtx.stroke();
      }
      
      // Horizontal lines at cell boundaries
      for (let i = 0; i <= 3; i++) {
        const y = (captureHeight / 3) * i;
        cellCtx.beginPath();
        cellCtx.moveTo(0, y);
        cellCtx.lineTo(captureWidth, y);
        cellCtx.stroke();
      }
      
      // Draw 9 crosshairs for sampling points
      const samplingPoints = [
        { x: centerX, y: centerY, color: '#FF00FF', label: 'CENTER' },           // Center
        { x: centerX - 5, y: centerY, color: '#00FFFF', label: 'L' },           // Left
        { x: centerX + 5, y: centerY, color: '#00FFFF', label: 'R' },           // Right
        { x: centerX, y: centerY - 5, color: '#00FFFF', label: 'T' },           // Top
        { x: centerX, y: centerY + 5, color: '#00FFFF', label: 'B' },           // Bottom
        { x: centerX - 5, y: centerY - 5, color: '#FFFF00', label: 'TL' },      // Top-left
        { x: centerX + 5, y: centerY - 5, color: '#FFFF00', label: 'TR' },      // Top-right
        { x: centerX - 5, y: centerY + 5, color: '#FFFF00', label: 'BL' },      // Bottom-left
        { x: centerX + 5, y: centerY + 5, color: '#FFFF00', label: 'BR' }       // Bottom-right
      ];
      
      for (let point of samplingPoints) {
        // Draw crosshair
        cellCtx.strokeStyle = point.color;
        cellCtx.lineWidth = 2;
        cellCtx.beginPath();
        cellCtx.moveTo(point.x - 8, point.y);
        cellCtx.lineTo(point.x + 8, point.y);
        cellCtx.moveTo(point.x, point.y - 8);
        cellCtx.lineTo(point.x, point.y + 8);
        cellCtx.stroke();
        
        // Draw center dot
        cellCtx.fillStyle = point.color;
        cellCtx.fillRect(point.x - 1, point.y - 1, 3, 3);
        
        // Sample and show RGB at this point
        try {
          const sampleX = captureX + Math.floor(point.x);
          const sampleY = captureY + Math.floor(point.y);
          const pixel = ctx.getImageData(sampleX, sampleY, 1, 1).data;
          
          // Draw RGB label
          cellCtx.fillStyle = 'rgba(0, 0, 0, 0.7)';
          cellCtx.fillRect(point.x + 10, point.y - 10, 80, 20);
          cellCtx.fillStyle = point.color;
          cellCtx.font = '10px monospace';
          cellCtx.fillText(`${pixel[0]},${pixel[1]},${pixel[2]}`, point.x + 12, point.y + 2);
        } catch (e) {
          // Ignore sampling errors
        }
      }
      
      // Draw label for center cell
      cellCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      cellCtx.fillRect(5, 5, 100, 20);
      cellCtx.fillStyle = '#FF00FF';
      cellCtx.font = 'bold 12px monospace';
      cellCtx.fillText(`Target: (${row},${col})`, 10, 18);
      
    } catch (e) {
      console.error('Error capturing cell screenshot:', e);
    }
  }
  
  function getNumberColor(num) {
    const colors = {
      1: '#0000FF', 2: '#008000', 3: '#FF0000',
      4: '#000080', 5: '#800000', 6: '#008080',
      7: '#000000', 8: '#808080'
    };
    return colors[num] || '#000';
  }
  
  function findGameCanvas() {
    let canvases = document.querySelectorAll('canvas');
    console.log(`Found ${canvases.length} canvas elements in main document`);
    
    const iframes = document.querySelectorAll('iframe');
    console.log(`Found ${iframes.length} iframes`);
    
    for (let iframe of iframes) {
      try {
        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
        const iframeCanvases = iframeDoc.querySelectorAll('canvas');
        console.log(`Found ${iframeCanvases.length} canvas elements in iframe`);
        
        if (iframeCanvases.length > 0) {
          canvases = iframeCanvases;
          console.log('Using canvas from iframe');
          break;
        }
      } catch (e) {
        console.log('Cannot access iframe:', e.message);
      }
    }
    
    for (let i = 0; i < canvases.length; i++) {
      const c = canvases[i];
      console.log(`Canvas ${i}: ${c.width}x${c.height}, class: ${c.className}`);
      
      if (c.className.includes('ecwpfc') || 
          (c.width >= 400 && c.height >= 300 && c.width <= 1200 && c.height <= 900)) {
        console.log(`Selected canvas ${i} as game canvas`);
        return c;
      }
    }
    
    if (canvases.length > 0) {
      let largest = canvases[0];
      for (let c of canvases) {
        if (c.width * c.height > largest.width * largest.height) {
          largest = c;
        }
      }
      console.log(`Using largest canvas: ${largest.width}x${largest.height}`);
      return largest;
    }
    
    return null;
  }
  
  function waitForCanvas(callback, maxAttempts = 10) {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      console.log(`Attempt ${attempts} to find canvas...`);
      
      const foundCanvas = findGameCanvas();
      if (foundCanvas) {
        clearInterval(interval);
        callback(foundCanvas);
      } else if (attempts >= maxAttempts) {
        clearInterval(interval);
        console.log('Could not find canvas after max attempts');
        callback(null);
      }
    }, 500);
  }
  
  function setupClickLogger() {
    console.log('🔧 Installing click logger on canvas...');
    const events = ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup', 'contextmenu'];
    
    events.forEach(eventType => {
      canvas.addEventListener(eventType, (e) => {
        const rect = canvas.getBoundingClientRect();
        const canvasX = (e.clientX - rect.left) * (canvas.width / rect.width);
        const canvasY = (e.clientY - rect.top) * (canvas.height / rect.height);
        
        console.log(`🖱️ MANUAL ${eventType}:`, {
          clientX: e.clientX,
          clientY: e.clientY,
          canvasX: Math.round(canvasX),
          canvasY: Math.round(canvasY),
          button: e.button
        });
      }, true);
    });
  }
  
  function startAutoPlay() {
    if (isActive) {
      console.log('Bot already active');
      return;
    }
  
    console.log('Starting auto play...');
    
    waitForCanvas((foundCanvas) => {
      if (!foundCanvas) {
        console.log('Game canvas not found');
        return;
      }
      
      canvas = foundCanvas;
      ctx = canvas.getContext('2d', { willReadFrequently: true });
      
      if (!ctx) {
        console.log('Could not get canvas context');
        return;
      }
  
      console.log('Canvas found:', canvas.width, 'x', canvas.height);
  
      try {
        ctx.getImageData(0, 0, 1, 1).data;
      } catch (e) {
        console.error('Cannot read canvas data:', e);
        return;
      }
  
      detectBoardDimensions();
      setupClickLogger();
      createPopupOverlay();
  
      isActive = true;
      console.log('🤖 AUTO-PLAY ENABLED');
  
      gameInterval = setInterval(analyzeAndPlay, 500); // Faster loop; throttled by nextAnalyzeAt
    });
  }
  
  function stopAutoPlay() {
    if (!isActive) return;
  
    isActive = false;
    if (gameInterval) {
      clearInterval(gameInterval);
      gameInterval = null;
    }
    
    if (popupOverlay) {
      const statusText = document.getElementById('statusText');
      statusText.innerHTML = '<strong>Status:</strong> 🔴 PAUSED<br>Press Ctrl+Shift+M to resume';
    }
    
    console.log('Auto player stopped');
  }
  
  function detectBoardDimensions() {
    const width = canvas.width;
    const height = canvas.height;
    
    console.log('Detecting board dimensions:', width, 'x', height);
    
    // ONLY SUPPORT MEDIUM MODE: 18 columns x 14 rows
    // Based on click data - adjusting to be slightly LEFT of previous estimate
    // Top-left corner: canvasX: 7, canvasY: 6
    // Bottom-right corner: canvasX: 1075, canvasY: 832
    // Adjusted to compensate for being too far right
    
    if (width === 1080 && height === 840) {
      boardX = 4;        // Moved left from 7
      boardY = 6;
      cellWidth = 59.5;  
      cellHeight = 59;   
      rows = 14;
      cols = 18;
      console.log('✅ MEDIUM MODE DETECTED: 18x14 grid, ~59x59 cells, starting at (4,6)');
    } else {
      console.error('⚠️ This bot only works with Medium mode (1080x840 canvas)');
      console.error('Current canvas:', width, 'x', height);
      return;
    }
    
    console.log(`Board config: ${cols}x${rows}, cell: ${cellWidth}x${cellHeight}px, offset: (${boardX}, ${boardY})`);
    
    // Verify with sample cells
    console.log('Cell (0,0) center should be at:', boardX + cellWidth/2, boardY + cellHeight/2);
    console.log('Cell (17,13) center should be at:', boardX + 17*cellWidth + cellWidth/2, boardY + 13*cellHeight + cellHeight/2);
  }
  
  function detectGridFromSampling() {
    cellWidth = canvas.width <= 600 ? 30 : 60;
    cellHeight = cellWidth;
    cols = Math.floor((canvas.width - boardX) / cellWidth);
    rows = Math.floor((canvas.height - boardY) / cellHeight);
    rows = Math.max(8, Math.min(20, rows));
    cols = Math.max(8, Math.min(24, cols));
  }
  
  function analyzeAndPlay() {
    try {
      if (!canvas || !ctx || !isActive) return;

      const now = performance.now();
      if (now < nextAnalyzeAt) return;
      if (awaitingApproval) {
        readBoardState();
        if (!pendingMove) {
          awaitingApproval = false;
          updateDecisionOverlay(null, 'stale');
          return;
        }
        
        const currentCell = boardState[pendingMove.row][pendingMove.col];
        const stillUnrevealed = currentCell.type === 'unrevealed' || currentCell.type === 'unknown';
        if (!stillUnrevealed) {
          pendingMove = null;
          awaitingApproval = false;
          updateDecisionOverlay(null, 'stale');
          return;
        }
        
        updatePopup(pendingMove);
        updateDecisionOverlay(pendingMove, 'waiting');
        return;
      }
  
      readBoardState();
      const move = calculateSafeMove();
      
      updatePopup(move);
      
      if (move) {
        console.log(`🎯 Move (awaiting approval): ${move.action} at (${move.row}, ${move.col})`);
        pendingMove = move;
        awaitingApproval = true;
        updateDecisionOverlay(move);
      } else {
        console.log('⚠️ No safe move found');
      }
  
    } catch (error) {
      console.error('Error in auto player:', error);
    }
  }
  
  function readBoardState() {
    boardState = [];
    
    for (let row = 0; row < rows; row++) {
      boardState[row] = [];
      for (let col = 0; col < cols; col++) {
        const x = boardX + col * cellWidth + cellWidth / 2;
        const y = boardY + row * cellHeight + cellHeight / 2;
        const cellState = analyzeCellAt(x, y);
        boardState[row][col] = cellState;
        
        if (cellState.type === 'flagged') {
          const key = `${row},${col}`;
          if (!flaggedCells.has(key)) {
            flaggedCells.add(key);
            console.log('🚩 Detected flag at', key, '- locking cell');
          }
        }
      }
    }
    
    // Debug: show samples from first row
    if (boardState[0]) {
      console.log('First row sample:', boardState[0].slice(0, 5).map((c, i) => `[${i}:${c.type}${c.number !== undefined ? ':' + c.number : ''}]`).join(' '));
    }
  }
  
  function analyzeCellAt(x, y) {
    try {
      // Sample a 5x5 grid of pixels near the center for robustness
      // This handles slight misalignment and gives us confidence in detection
      const sampleOffsets = [
        [0, 0],     // Center
        [-2, -2], [0, -2], [2, -2],  // Top row
        [-2, 0],           [2, 0],   // Middle row (left and right)
        [-2, 2],  [0, 2],  [2, 2],   // Bottom row
        [-4, 0], [4, 0], [0, -4], [0, 4], // Extended cardinal points
        [-3, -3], [3, -3], [-3, 3], [3, 3], // Extended diagonals
        [-6, 0], [6, 0], [0, -6], [0, 6], // Wider sampling for flags
        [-6, -6], [6, -6], [-6, 6], [6, 6]
      ];
      
      const colorVotes = {
        unrevealed_light: 0,  // rgb(169, 214, 79)
        unrevealed_dark: 0,   // rgb(161, 209, 71)
        number_1: 0,          // rgb(23, 116, 209)
        number_2: 0,          // rgb(56, 143, 60)
        number_3: 0,          // rgb(212, 47, 47)
        flag_red: 0,          // Red flag
        revealed_tan: 0,      // Tan background
        other_numbers: 0      // Other number colors (4-8)
      };
      
      for (let [dx, dy] of sampleOffsets) {
        try {
          const pixel = ctx.getImageData(x + dx, y + dy, 1, 1).data;
          const r = pixel[0], g = pixel[1], b = pixel[2];
          
          // Vote for what this pixel represents
          if (isColorMatch(r, g, b, 169, 214, 79, 20)) {
            colorVotes.unrevealed_light++;
          } else if (isColorMatch(r, g, b, 161, 209, 71, 20)) {
            colorVotes.unrevealed_dark++;
          } else if (isColorMatch(r, g, b, 23, 116, 209, 25)) {
            colorVotes.number_1++;
          } else if (isColorMatch(r, g, b, 56, 143, 60, 25)) {
            colorVotes.number_2++;
          } else if (isColorMatch(r, g, b, 212, 47, 47, 25)) {
            colorVotes.number_3++;
          } else if (isFlagColor(r, g, b)) {
            colorVotes.flag_red++;
          } else if (r > 180 && g > 140 && b > 90 && r > g && g > b) {
            colorVotes.revealed_tan++;
          } else if (
            (b > 100 && b > r + 30 && b > g + 30) || // Dark blue 4
            (r > 90 && r < 130 && g < 60 && b > 120) || // Purple 4 (rgb 110,29,145)
            (r > 120 && r < 180 && r > g + 40) ||     // Dark red 5
            (g > 120 && b > 120 && r < 100) ||        // Cyan 6
            (r < 60 && g < 60 && b < 60) ||          // Black 7
            (r > 100 && r < 160 && Math.abs(r - g) < 20 && Math.abs(r - b) < 20) // Gray 8
          ) {
            colorVotes.other_numbers++;
          }
        } catch (e) {
          // Skip pixels outside canvas
        }
      }
      
      // Determine cell type by majority vote
      const totalUnrevealed = colorVotes.unrevealed_light + colorVotes.unrevealed_dark;
      
      if (colorVotes.flag_red >= 1 && totalUnrevealed >= 2) {
        return { type: 'flagged' };
      }
      
      if (colorVotes.flag_red >= 1 && totalUnrevealed < 2) {
        const now = performance.now();
        if (now - lastFlagDebugAt > 1000) {
          lastFlagDebugAt = now;
          console.log('🟠 Flag-like pixels without green base:', {
            x: Math.round(x),
            y: Math.round(y),
            votes: colorVotes
          });
        }
      }
      
      if (totalUnrevealed >= 5) {
        return { type: 'unrevealed' };
      }
      
      if (colorVotes.number_1 >= 3) {
        return { type: 'revealed', number: 1 };
      }
      
      if (colorVotes.number_2 >= 3) {
        return { type: 'revealed', number: 2 };
      }
      
      if (colorVotes.number_3 >= 3) {
        return { type: 'revealed', number: 3 };
      }
      
      if (colorVotes.revealed_tan >= 5 || colorVotes.other_numbers >= 3) {
        // It's a revealed cell, try to detect the specific number
        const number = readNumberFromCell(x, y);
        return { type: 'revealed', number: number };
      }
      
      // Default: if we can't confidently say it's unrevealed, assume revealed
      if (colorVotes.revealed_tan >= 3) {
        const number = readNumberFromCell(x, y);
        return { type: 'revealed', number: number };
      }
      
      return { type: 'unknown' };
      
    } catch (e) {
      console.error(`Error analyzing cell at (${x}, ${y}):`, e);
      return { type: 'unknown' };
    }
  }

  function isFlagColor(r, g, b) {
    return (
      (r >= 200 && g <= 90 && b <= 60 && r > g + 80 && r > b + 80) ||
      (r >= 170 && g <= 70 && b <= 50 && r > g + 70 && r > b + 70)
    );
  }
  
  
  function isColorMatch(r, g, b, targetR, targetG, targetB, tolerance) {
    return Math.abs(r - targetR) <= tolerance &&
           Math.abs(g - targetG) <= tolerance &&
           Math.abs(b - targetB) <= tolerance;
  }
  
  function readNumberFromCell(x, y, r, g, b) {
    // If we already have the pixel data from analyzeCellAt, use it
    // Otherwise sample the center
    if (r === undefined) {
      try {
        const pixel = ctx.getImageData(x, y, 1, 1).data;
        r = pixel[0];
        g = pixel[1];
        b = pixel[2];
      } catch (e) {
        return -1;
      }
    }
    
    // Check for exact number colors with TIGHTER tolerance for 1, 2, 3
    
    // 1 = BLUE: rgb(23, 116, 209)
    if (isColorMatch(r, g, b, 23, 116, 209, 20)) {
      return 1;
    }
    
    // 2 = GREEN: rgb(56, 143, 60)
    if (isColorMatch(r, g, b, 56, 143, 60, 20)) {
      return 2;
    }
    
    // 3 = RED: rgb(212, 47, 47)
    if (isColorMatch(r, g, b, 212, 47, 47, 20)) {
      return 3;
    }
    
    // 4 = PURPLE (custom)
    if (isColorMatch(r, g, b, 110, 29, 145, 25)) {
      return 4;
    }
    
    // For 4-8, check nearby pixels too since center might be background
    const nearbyPixels = [];
    try {
      nearbyPixels.push(ctx.getImageData(x - 5, y, 1, 1).data);
      nearbyPixels.push(ctx.getImageData(x + 5, y, 1, 1).data);
      nearbyPixels.push(ctx.getImageData(x, y - 5, 1, 1).data);
      nearbyPixels.push(ctx.getImageData(x, y + 5, 1, 1).data);
    } catch (e) {
      // If we can't read nearby, just use center
    }
    
    const allPixels = [[r, g, b], ...nearbyPixels.map(p => [p[0], p[1], p[2]])];
    
    for (let [pr, pg, pb] of allPixels) {
      // 4 = DARK BLUE (navy) - typical minesweeper color
      if (pb > 100 && pb > pr + 30 && pb > pg + 30 && pr < 100 && pg < 100) {
        return 4;
      }
      
      // 4 = PURPLE (custom)
      if (isColorMatch(pr, pg, pb, 110, 29, 145, 25)) {
        return 4;
      }
      
      // 5 = DARK RED/MAROON
      if (pr > 120 && pr < 180 && pr > pg + 40 && pr > pb + 40 && pg < 100 && pb < 100) {
        return 5;
      }
      
      // 6 = CYAN/TEAL
      if (pg > 120 && pb > 120 && pr < 100) {
        return 6;
      }
      
      // 7 = BLACK
      if (pr < 60 && pg < 60 && pb < 60) {
        return 7;
      }
      
      // 8 = GRAY
      if (pr > 100 && pr < 160 && Math.abs(pr - pg) < 20 && Math.abs(pr - pb) < 20) {
        return 8;
      }
    }
    
    // No number found = empty revealed cell (0)
    return 0;
  }
  
  function calculateSafeMove() {
    // Find zeros
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = boardState[row][col];
        if (cell.type === 'revealed' && cell.number === 0) {
          const adjacent = getAdjacentCells(row, col);
          for (let adj of adjacent) {
            const key = `${adj.row},${adj.col}`;
            if (flaggedCells.has(key)) continue;
            if (boardState[adj.row][adj.col].type === 'unrevealed') {
              return { row: adj.row, col: adj.col, action: 'click' };
            }
          }
        }
      }
    }
    
    // Logic moves
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const cell = boardState[row][col];
        if (cell.type === 'revealed' && cell.number > 0) {
          const adjacent = getAdjacentCells(row, col);
          const unrevealed = adjacent.filter(a => {
            const key = `${a.row},${a.col}`;
            return boardState[a.row][a.col].type === 'unrevealed' &&
                   !flaggedCells.has(key);
          });
          const flagged = adjacent.filter(a => {
            const key = `${a.row},${a.col}`;
            return boardState[a.row][a.col].type === 'flagged' || flaggedCells.has(key);
          });
          
          if (unrevealed.length > 0 && flagged.length + unrevealed.length === cell.number) {
            const target = unrevealed[0];
            const key = `${target.row},${target.col}`;
            flaggedCells.add(key); // lock immediately
            return { row: target.row, col: target.col, action: 'flag' };
          }
          
          if (unrevealed.length > 0 && flagged.length === cell.number) {
            const target = unrevealed[0];
            const key = `${target.row},${target.col}`;
          
            if (!flaggedCells.has(key)) {
              return { row: target.row, col: target.col, action: 'click' };
            }
          }
        }
      }
    }
    
    // Try corners
    const corners = [[0, 0], [0, cols - 1], [rows - 1, 0], [rows - 1, cols - 1]];
    for (let [r, c] of corners) {
      if (boardState[r] && boardState[r][c] && boardState[r][c].type === 'unrevealed') {
        return { row: r, col: c, action: 'click' };
      }
    }
    
    // Random
    const unrevealed = [];
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        if (boardState[row][col].type === 'unrevealed') {
          unrevealed.push({ row, col });
        }
      }
    }
    
    if (unrevealed.length > 0) {
      const random = unrevealed[Math.floor(Math.random() * unrevealed.length)];
      return { row: random.row, col: random.col, action: 'click' };
    }
    
    return null;
  }
  
  function getAdjacentCells(row, col) {
    const adjacent = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        if (dr === 0 && dc === 0) continue;
        const newRow = row + dr;
        const newCol = col + dc;
        if (newRow >= 0 && newRow < rows && newCol >= 0 && newCol < cols) {
          adjacent.push({ row: newRow, col: newCol });
        }
      }
    }
    return adjacent;
  }
  
  function executeMove(move) {
    const key = `${move.row},${move.col}`;
    if (move.action === 'click' && flaggedCells.has(key)) {
      console.warn('🚫 Prevented click on locked flag:', key);
      return;
    }
  
    const x = boardX + move.col * cellWidth + cellWidth / 2;
    const y = boardY + move.row * cellHeight + cellHeight / 2;
  
    if (move.action === 'click') {
      simulateClick(x, y, false);
      nextAnalyzeAt = performance.now() + 120;
    } else if (move.action === 'flag') {
      simulateClick(x, y, true);
      nextAnalyzeAt = performance.now() + 250;
    }
  }
  
  function simulateClick(canvasX, canvasY, rightClick = false) {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width / canvas.width;
    const scaleY = rect.height / canvas.height;
  
    const clientX = rect.left + canvasX * scaleX;
    const clientY = rect.top + canvasY * scaleY;
  
    if (rightClick) {
      // 🚩 Use a full right-click press/release without contextmenu to avoid double toggles
      canvas.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 2,
        pointerType: 'mouse',
        isPrimary: false,
        button: 2,
        buttons: 2,
        clientX,
        clientY
      }));
      
      canvas.dispatchEvent(new MouseEvent('mousedown', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        buttons: 2,
        clientX,
        clientY
      }));
      
      canvas.dispatchEvent(new PointerEvent('pointerup', {
        bubbles: true,
        cancelable: true,
        view: window,
        pointerId: 2,
        pointerType: 'mouse',
        isPrimary: false,
        button: 2,
        buttons: 0,
        clientX,
        clientY
      }));
      
      canvas.dispatchEvent(new MouseEvent('mouseup', {
        bubbles: true,
        cancelable: true,
        view: window,
        button: 2,
        buttons: 0,
        clientX,
        clientY
      }));
      return;
    }
  
    // 👆 LEFT CLICK (with pointer + mouse sequence)
    canvas.dispatchEvent(new PointerEvent('pointerdown', {
      bubbles: true,
      cancelable: true,
      view: window,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      clientX,
      clientY
    }));
    
    canvas.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 1,
      clientX,
      clientY
    }));

    canvas.dispatchEvent(new PointerEvent('pointerup', {
      bubbles: true,
      cancelable: true,
      view: window,
      pointerId: 1,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 0,
      clientX,
      clientY
    }));
    
    canvas.dispatchEvent(new MouseEvent('mouseup', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      buttons: 0,
      clientX,
      clientY
    }));
  
    canvas.dispatchEvent(new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      view: window,
      button: 0,
      clientX,
      clientY
    }));
  }
  
  
    
  
  document.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.shiftKey && event.key === 'M') {
      event.preventDefault();
      if (isActive) {
        stopAutoPlay();
      } else {
        startAutoPlay();
      }
    }
  });
  
  window.minesweeperBot = {
    start: startAutoPlay,
    stop: stopAutoPlay,
    isActive: () => isActive,
    getBoardState: () => boardState,
    getCanvas: () => canvas
  };
  
  console.log('✅ Minesweeper bot ready! Press Ctrl+Shift+M to toggle');
  
})();
