let isExporting = false;
let exportedMessages = [];
let seenIds = new Set();

// Attempt to find the main scrollable container of the active chat
function getScrollContainer() {
  const main = document.querySelector('#main');
  if (!main) return null;
  const elements = main.querySelectorAll('*');
  for (let el of elements) {
    const style = window.getComputedStyle(el);
    if (style.overflowY === 'scroll' || style.overflowY === 'auto') {
      return el;
    }
  }
  return null;
}

// Extract messages currently visible in the DOM
function extractMessages() {
  const msgElements = document.querySelectorAll('div[data-id]');
  
  let newMessages = [];

  msgElements.forEach(el => {
    const id = el.getAttribute('data-id');
    // Skip if already extracted
    if (seenIds.has(id)) return;

    let text = '';
    let timestamp = '';
    let sender = '';

    // WhatsApp often stores structured meta-data here
    const preTextEl = el.querySelector('[data-pre-plain-text]');
    if (preTextEl) {
      const preText = preTextEl.getAttribute('data-pre-plain-text');
      // Format usually looks like: "[10:30 am, 17/05/2026] John Doe: "
      const match = preText.match(/\[(.*?)\] (.*?):/);
      if (match) {
        timestamp = match[1].trim();
        sender = match[2].trim();
      }
      
      // Get the actual message text
      const msgSpan = el.querySelector('span.selectable-text.copyable-text > span');
      if (msgSpan) {
        text = msgSpan.innerText;
      } else {
        // Fallback for some types of messages
        text = preTextEl.innerText;
      }
    } else {
      // System messages or unhandled elements
      text = el.innerText.replace(/\n/g, ' | ');
    }

    if (text) {
      newMessages.push({ id, timestamp, sender, text });
      seenIds.add(id);
    }
  });

  // Since we are scrolling up, the new messages found in the DOM are OLDER than the ones we found previously.
  // The newMessages themselves are in chronological order (top to bottom of the current screen).
  // Therefore, prepending newMessages to our master list perfectly maintains chronological order!
  if (newMessages.length > 0) {
    exportedMessages = [...newMessages, ...exportedMessages];
  }
}

// Start the export process
async function startExport() {
  if (isExporting) return;
  const scroller = getScrollContainer();
  if (!scroller) {
    alert('Could not find chat container. Please open a chat first.');
    
    // Reset buttons
    const startBtn = document.getElementById('wa-start-btn');
    const stopBtn = document.getElementById('wa-stop-btn');
    if (startBtn && stopBtn) {
       startBtn.disabled = false;
       stopBtn.disabled = true;
       startBtn.innerText = 'Start Export';
    }
    return;
  }
  
  isExporting = true;
  
  // Reset for new export
  exportedMessages = [];
  seenIds.clear();

  let stuckCount = 0;

  try {
    while (isExporting) {
      extractMessages();
      
      if (scroller.scrollTop === 0) {
        // Wait a bit to see if older messages load
        await new Promise(r => setTimeout(r, 1500));
        extractMessages();
        
        if (scroller.scrollTop === 0) {
          stuckCount++;
          // If we're stuck at the top for multiple checks, we've likely reached the beginning
          if (stuckCount > 3) {
             break; 
          }
        } else {
          stuckCount = 0;
        }
      } else {
        // Scroll to top to trigger older messages loading
        scroller.scrollTop = 0; 
        stuckCount = 0;
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  } catch (err) {
    console.error('Error during export:', err);
    alert('Export encountered an error. Check console.');
  }
  
  saveMessages();
  
  // Reset UI
  isExporting = false;
  const startBtn = document.getElementById('wa-start-btn');
  const stopBtn = document.getElementById('wa-stop-btn');
  if (startBtn && stopBtn) {
     startBtn.disabled = false;
     stopBtn.disabled = true;
     startBtn.innerText = 'Start Export';
  }
}

// Generate the text file and trigger download
function saveMessages() {
  if (exportedMessages.length === 0) {
    alert('No messages found to export.');
    return;
  }
  
  // Generate text content
  let content = "--- WhatsApp Chat Export ---\n\n";
  
  exportedMessages.forEach(m => {
     if (m.sender && m.timestamp) {
         content += `[${m.timestamp}] ${m.sender}: ${m.text}\n`;
     } else {
         content += `${m.text}\n`;
     }
  });

  // Create downloadable file
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  
  // Get chat name if possible
  const chatNameEl = document.querySelector('header .copyable-text');
  let chatName = chatNameEl ? chatNameEl.innerText : 'Chat';
  chatName = chatName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  
  a.href = url;
  a.download = `whatsapp_${chatName}_export.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

let uiClosed = false;

// Inject floating UI
function injectUI() {
  if (uiClosed || document.getElementById('wa-exporter-wrapper')) return;
  
  const wrapper = document.createElement('div');
  wrapper.id = 'wa-exporter-wrapper';

  // --- FAB (Floating Action Button) ---
  const fab = document.createElement('button');
  fab.id = 'wa-exporter-fab';
  fab.title = 'WA Exporter';
  // Standard download SVG icon
  fab.innerHTML = `<svg viewBox="0 0 24 24"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>`;
  
  // --- Main Panel ---
  const panel = document.createElement('div');
  panel.id = 'wa-exporter-panel';

  const header = document.createElement('div');
  header.id = 'wa-exporter-header';

  const title = document.createElement('div');
  title.id = 'wa-exporter-title';
  title.innerText = 'WA Exporter';

  const controls = document.createElement('div');
  controls.className = 'wa-window-controls';

  const minimizeBtn = document.createElement('button');
  minimizeBtn.className = 'wa-control-btn';
  minimizeBtn.innerText = '−';
  minimizeBtn.title = 'Minimize';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'wa-control-btn';
  closeBtn.innerText = '×';
  closeBtn.title = 'Close';

  controls.appendChild(minimizeBtn);
  controls.appendChild(closeBtn);
  
  header.appendChild(title);
  header.appendChild(controls);

  const startBtn = document.createElement('button');
  startBtn.id = 'wa-start-btn';
  startBtn.className = 'wa-btn';
  startBtn.innerText = 'Start Export';
  
  const stopBtn = document.createElement('button');
  stopBtn.id = 'wa-stop-btn';
  stopBtn.className = 'wa-btn wa-stop';
  stopBtn.innerText = 'Stop & Save';
  stopBtn.disabled = true;

  // Interactions
  fab.onclick = () => {
    fab.style.display = 'none';
    panel.style.display = 'flex';
  };

  minimizeBtn.onclick = () => {
    panel.style.display = 'none';
    fab.style.display = 'flex';
  };

  closeBtn.onclick = () => {
    uiClosed = true;
    wrapper.remove();
    if (isExporting) isExporting = false; // Stop early if running
  };

  startBtn.onclick = () => {
    if (!isExporting) {
      startBtn.disabled = true;
      stopBtn.disabled = false;
      startBtn.innerText = 'Exporting...';
      startExport();
    }
  };

  stopBtn.onclick = () => {
    if (isExporting) {
      isExporting = false; // The loop in startExport will break
    }
  };

  panel.appendChild(header);
  panel.appendChild(startBtn);
  panel.appendChild(stopBtn);
  
  wrapper.appendChild(fab);
  wrapper.appendChild(panel);
  document.body.appendChild(wrapper);
}

setInterval(injectUI, 2000);
