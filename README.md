# 🦖 Dino Auto Play Chrome Extension

A Chrome extension that automatically plays the Chrome Dino game by detecting obstacles and simulating jump and duck key presses.

## Features

- **Automatic Game Detection**: Automatically detects when you're on the Dino game page
- **Smart Obstacle Detection**: Monitors obstacles and determines whether to jump or duck
- **Responsive Controls**: Checks game state every 10ms for smooth gameplay
- **Keyboard Shortcut**: Toggle auto play with `Ctrl + Shift + A`
- **Beautiful UI**: Modern popup interface with status indicators
- **Multiple Site Support**: Works on chromedino.com, chrome://dino, and custom game pages

## Installation

### Method 1: Load as Unpacked Extension (Recommended)

1. **Download or Clone** this repository to your local machine
2. **Open Chrome** and navigate to `chrome://extensions/`
3. **Enable Developer Mode** by toggling the switch in the top right corner
4. **Click "Load unpacked"** and select the folder containing this extension
5. **The extension should now appear** in your extensions list

### Method 2: Create Extension Icons (Optional)

If you want to add custom icons, create the following files:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels) 
- `icon128.png` (128x128 pixels)

## Usage

### Primary Usage - chromedino.com

1. **Navigate to** [https://chromedino.com/](https://chromedino.com/) in your browser
2. **Click the extension icon** in your Chrome toolbar
3. **Click "Start Auto Play"** in the popup
4. **Watch the magic happen!** The extension will automatically play the game

### Alternative Sites

You can also use the extension with:
- **Chrome Dino Game**: Navigate to `chrome://dino` in your browser
- **Custom Game**: Open the included `dino-game.html` file locally

### Keyboard Shortcut

- **Toggle Auto Play**: `Ctrl + Shift + A`
- This works anywhere on the page, not just in the popup

### How It Works

The extension works by:

1. **Detecting the Game**: Monitors for the presence of the `Runner` object (Dino game engine)
2. **Monitoring Obstacles**: Continuously checks `Runner.instance_.horizon.obstacles` array
3. **Making Decisions**: 
   - If obstacle `xPos < 150` and `xPos > 0` (within action range)
   - If obstacle is a PTERODACTYL (flying) → **Jump** (Space key)
   - For ground obstacles → **Jump** (Space key)
4. **Simulating Key Presses**: Uses `KeyboardEvent` to simulate actual key presses

## Technical Details

### Files Structure

```
BeatDinoGame/
├── manifest.json      # Extension configuration
├── background.js      # Service worker
├── autoplayer.js      # Main content script
├── popup.html         # Extension popup UI
├── popup.js           # Popup functionality
├── dino-game.html     # Custom Dino game page
└── README.md          # This file
```

### Key Components

- **`autoplayer.js`**: Main logic for detecting obstacles and simulating key presses
- **`popup.html/js`**: User interface for controlling the extension
- **`background.js`**: Service worker for extension lifecycle management
- **`dino-game.html`**: Custom Dino game implementation for testing
- **`manifest.json`**: Extension configuration and permissions

### Game Detection Logic

```javascript
// Check if we're on a page with the Runner object (Dino game)
if (typeof Runner !== 'undefined' && Runner.instance_) {
  // Game detected, start auto play
}
```

### Obstacle Detection Logic

```javascript
const obstacles = Runner.instance_.horizon.obstacles;
if (obstacles.length > 0) {
  const obstacle = obstacles[0];
  if (obstacle.xPos < 150 && obstacle.xPos > 0) {
    if (obstacle.typeConfig.type === 'PTERODACTYL') {
      simulateKey(32); // Jump (Space)
    } else {
      simulateKey(32); // Jump (Space)
    }
  }
}
```

## Supported Sites

- ✅ **chromedino.com** - Primary supported site
- ✅ **chrome://dino** - Chrome's built-in dino game
- ✅ **Custom HTML pages** - Local dino game implementations

## Troubleshooting

### Extension Not Working?

1. **Check Console**: Open Developer Tools (F12) and check for any error messages
2. **Verify Game Page**: Make sure you're on chromedino.com or a supported dino game page
3. **Reload Extension**: Go to `chrome://extensions/` and click the refresh icon on the extension
4. **Check Permissions**: Ensure the extension has the necessary permissions

### Common Issues

- **"Extension not active on this page"**: Navigate to chromedino.com first
- **"Auto player not initialized"**: Refresh the page and try again
- **Game not responding**: Try refreshing the game page

## Development

### Making Changes

1. **Edit the files** as needed
2. **Go to `chrome://extensions/`**
3. **Click the refresh icon** on the extension to reload changes
4. **Test on chromedino.com**

### Debugging

- **Content Script**: Check the browser console for logs from `autoplayer.js`
- **Popup**: Right-click the extension icon and select "Inspect popup"
- **Background**: Check the extension's background page in `chrome://extensions/`

## License

This project is open source and available under the MIT License.

## Contributing

Feel free to submit issues, feature requests, or pull requests to improve the extension!

---

**Note**: This extension is for educational purposes. Use responsibly and in accordance with Chrome's terms of service. 