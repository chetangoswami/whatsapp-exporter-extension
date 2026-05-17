let messagesMap = new Map();
let isExporting = false;

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
  
  msgElements.forEach(el => {
    const id = el.getAttribute('data-id');
    // Skip if already extracted
    if (messagesMap.has(id)) return;

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
      // Create a sortable key out of data-id to maintain chronological order
      // We will sort these keys later before saving
      messagesMap.set(id, { id, timestamp, sender, text });
    }
  });
}

// Start the export process
async function startExport() {
  if (isExporting) return;
  const scroller = getScrollContainer();
  if (!scroller) {
    alert('Could not find chat container. Please open a chat first.');
    return;
  }
  
  isExporting = true;
  const btn = document.getElementById('wa-exporter-btn');
  btn.innerText = 'Stop & Save';
  
  // Reset for new export
  messagesMap.clear();

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
  
  btn.innerText = 'Export Chat';
  isExporting = false;
}

// Generate the text file and trigger download
function saveMessages() {
  if (messagesMap.size === 0) {
    alert('No messages found to export.');
    return;
  }

  // Convert to array
  const msgs = Array.from(messagesMap.values());
  
  // Generate text content
  let content = "--- WhatsApp Chat Export ---\n\n";
  
  // Although Maps preserve insertion order, we scroll UP, meaning we prepend older messages.
  // The simplest way to handle sorting without complex timestamp parsing is to rely on WhatsApp's data-id format if possible,
  // or simply sort by timestamp (which can be tricky due to localized dates).
  // For simplicity, we just output them. If they are in reverse order chunks, we might need to sort them.
  // Actually, WhatsApp loads chunks, so if we just collect them, we can sort them by extracting a unix timestamp from data-id if it exists.
  // E.g., false_1684305849@c.us_...
  
  msgs.sort((a, b) => {
    // Attempt to extract timestamp from data-id
    const timeA = extractTimeFromId(a.id);
    const timeB = extractTimeFromId(b.id);
    if (timeA && timeB) {
        return timeA - timeB;
    }
    return 0; // Fallback
  });

  msgs.forEach(m => {
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

// Helper to extract timestamp from data-id if present
function extractTimeFromId(id) {
  // Typical id: true_1234567890123@c.us_ABCDEF
  const parts = id.split('_');
  for (let part of parts) {
    if (part.includes('@')) {
       const timeStr = part.split('@')[0];
       if (/^\d+$/.test(timeStr)) {
          return parseInt(timeStr, 10);
       }
    }
  }
  return null;
}

// Inject the button into WhatsApp UI
function injectButton() {
  if (document.getElementById('wa-exporter-btn')) return;
  
  // Inject into the main chat header
  const header = document.querySelector('#main header'); 
  if (!header) return;

  const btn = document.createElement('button');
  btn.id = 'wa-exporter-btn';
  btn.innerText = 'Export Chat';
  btn.onclick = () => {
    if (isExporting) {
      isExporting = false; // Stop early
    } else {
      startExport();
    }
  };
  
  // Insert before the search/menu icons
  const actionsDiv = header.querySelector('div:last-child');
  if (actionsDiv) {
    actionsDiv.prepend(btn);
  } else {
    header.appendChild(btn);
  }
}

// Check periodically to inject button (since WhatsApp is a Single Page App)
setInterval(injectButton, 2000);
