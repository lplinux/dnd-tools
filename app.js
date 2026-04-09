const express = require('express')
const path = require('path');
const fs = require('fs').promises;

const app = express()
const PORT = 3080;

// Serve static files from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve PDFs from a pdfs folder
app.use('/pdfs', express.static(path.join(__dirname, 'pdfs')));

app.get('/npc-sheet', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'npc-sheet.html'));
});

app.get('/item-cards', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'item-cards.html'));
});

app.get('/split-view', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'split-view.html'));
});

// PDF viewer route
app.get('/pdf-viewer', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'pdf-viewer.html'));
});

// Campaign Timeline — Calendar of Harptos
app.get('/timeline', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'timeline.html'));
});

// API endpoint to get list of PDFs
app.get('/api/pdfs', async (req, res) => {
  const pdfsDir = path.join(__dirname, 'pdfs');

  console.log('=== PDF API Request ===');
  console.log('Looking for PDFs in:', pdfsDir);

  try {
    // Check if directory exists
    try {
      await fs.access(pdfsDir);
      console.log('✓ PDFs directory exists');
    } catch (err) {
      console.error('✗ PDFs directory does not exist:', pdfsDir);
      console.error('Error details:', err.message);
      return res.status(404).json({
        error: 'PDFs directory not found',
        path: pdfsDir,
        suggestion: 'Create a "pdfs" folder in your project root'
      });
    }

    // Read directory
    const files = await fs.readdir(pdfsDir);
    console.log('Files found in directory:', files);

    // Filter PDF files
    const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));
    console.log('PDF files found:', pdfFiles);
    console.log('Total PDFs:', pdfFiles.length);

    res.json(pdfFiles);

  } catch (error) {
    console.error('✗ Error in /api/pdfs endpoint:');
    console.error('Error type:', error.name);
    console.error('Error message:', error.message);
    console.error('Stack trace:', error.stack);

    res.status(500).json({
      error: 'Unable to scan directory',
      details: error.message,
      path: pdfsDir
    });
  }
});

app.listen(PORT, () => {
  console.log(`D&D NPC app running at http://localhost:${PORT}`);
  console.log(`PDF viewer available at http://localhost:${PORT}/pdf-viewer`);
  console.log(`Campaign Timeline available at http://localhost:${PORT}/timeline`);
});
