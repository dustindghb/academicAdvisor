// optimized-vectorize.js
// Fast and concise script for vectorizing bulletin files
const { ChromaClient } = require('chromadb');
const fs = require('fs');
const path = require('path');

// Configuration
const CHROMA_URL = 'http://192.168.0.105:8000';
const EMBED_API_URL = 'http://192.168.0.105:11434/api/embeddings';
const COLLECTION_NAME = 'scu_bulletins';
const EMBED_MODEL = 'nomic-embed-text:latest';
const CHUNK_SIZE = 500;
const DELAY_MS = 150; // Reduced delay for faster processing
const CONCURRENT_FILES = 3; // Process multiple files concurrently

// Clean text for embedding
function cleanText(text) {
  return text.replace(/[^\x20-\x7E\r\n\t]/g, ' ').replace(/\s+/g, ' ').trim();
}

// Get embeddings from Ollama
async function getEmbedding(text) {
  const cleanedText = cleanText(text);
  const truncatedText = cleanedText.length > 2000 ? cleanedText.substring(0, 2000) : cleanedText;
  
  const response = await fetch(EMBED_API_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: truncatedText }),
  });
  
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  
  return (await response.json()).embedding;
}

// Split text into chunks efficiently
function splitIntoChunks(text, chunkSize) {
  const chunks = [];
  const cleanedText = cleanText(text);
  
  // Simple and efficient chunking by fixed size
  for (let i = 0; i < cleanedText.length; i += chunkSize) {
    const chunk = cleanedText.substring(i, i + chunkSize).trim();
    if (chunk.length > 0) chunks.push(chunk);
  }
  
  return chunks;
}

// Process a single file
async function processFile(filePath, collection, fileIndex, totalFiles) {
  const fileName = path.basename(filePath);
  console.log(`Processing file ${fileIndex+1}/${totalFiles}: ${fileName}`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const chunks = splitIntoChunks(content, CHUNK_SIZE);
    
    let successful = 0;
    let failed = 0;
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const id = `${fileName.replace('.txt', '')}_${i}`;
      
      try {
        const embedding = await getEmbedding(chunk);
        await collection.add({
          ids: [id],
          embeddings: [embedding],
          metadatas: [{ source: fileName }],
          documents: [chunk]
        });
        
        process.stdout.write(".");
        successful++;
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      } catch (error) {
        process.stdout.write("x");
        failed++;
      }
      
      // Minimal progress reporting
      if ((i + 1) % 20 === 0) {
        process.stdout.write(`[${i+1}/${chunks.length}]`);
      }
    }
    
    console.log(`\nFile ${fileName}: ${successful}/${chunks.length} chunks added`);
    return { successful, failed };
  } catch (error) {
    console.error(`Error with file ${fileName}: ${error.message}`);
    return { successful: 0, failed: 0 };
  }
}

// Process files in parallel batches
async function processFileBatch(fileBatch, collection, startIndex, totalFiles) {
  const promises = fileBatch.map((file, index) => {
    const filePath = path.join(__dirname, '..', 'public', 'bulletin', file);
    return processFile(filePath, collection, startIndex + index, totalFiles);
  });
  
  return await Promise.all(promises);
}

// Main function
async function vectorizeFiles() {
  console.log('Starting optimized vectorization...');
  
  // Connect to ChromaDB
  const client = new ChromaClient({ path: CHROMA_URL });
  
  // Get or create collection
  let collection;
  try {
    collection = await client.getCollection({ name: COLLECTION_NAME });
    console.log(`Using collection: ${COLLECTION_NAME}`);
  } catch (error) {
    collection = await client.createCollection({
      name: COLLECTION_NAME,
      metadata: { "hnsw:space": "cosine" }
    });
    console.log(`Created collection: ${COLLECTION_NAME}`);
  }
  
  // Get file list
  const bulletinPath = path.join(__dirname, '..', 'public', 'bulletin');
  const txtFiles = fs.readdirSync(bulletinPath).filter(file => file.endsWith('.txt'));
  console.log(`Found ${txtFiles.length} files to process`);
  
  // Process files in batches
  let totalSuccessful = 0;
  let totalFailed = 0;
  
  for (let i = 0; i < txtFiles.length; i += CONCURRENT_FILES) {
    const fileBatch = txtFiles.slice(i, i + CONCURRENT_FILES);
    console.log(`\nProcessing batch ${Math.floor(i/CONCURRENT_FILES) + 1}/${Math.ceil(txtFiles.length/CONCURRENT_FILES)}`);
    
    const results = await processFileBatch(fileBatch, collection, i, txtFiles.length);
    
    results.forEach(result => {
      totalSuccessful += result.successful;
      totalFailed += result.failed;
    });
    
    console.log(`Overall: ${totalSuccessful} successful, ${totalFailed} failed (${Math.round((i + fileBatch.length)/txtFiles.length*100)}% complete)`);
  }
  
  console.log(`\nVectorization complete: ${totalSuccessful} chunks added, ${totalFailed} failed`);
}

// Run the process
vectorizeFiles().catch(error => {
  console.error('Error:', error.message);
});