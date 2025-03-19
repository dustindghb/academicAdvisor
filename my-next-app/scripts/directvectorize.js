// fresh-vectorize.js
// Script for working with a fresh ChromaDB installation
const { ChromaClient } = require('chromadb');
const fs = require('fs');
const path = require('path');

// Configuration for remote services
const CHROMA_URL = 'http://192.168.0.105:8000'; // Your remote ChromaDB IP
const EMBED_API_URL = 'http://192.168.0.105:11434/api/embeddings'; // Ollama API on the same machine
const COLLECTION_NAME = 'scu_bulletins'; // Your collection name
const EMBED_MODEL = 'nomic-embed-text:latest';
const CHUNK_SIZE = 500; // Size that worked in our test
const DELAY_MS = 300; // Delay between operations

// Function to clean text for embedding
function cleanText(text) {
  // Remove special characters and normalize whitespace
  return text
    .replace(/[^\x20-\x7E\r\n\t]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Function to get embeddings from Ollama
async function getEmbedding(text) {
  try {
    // Clean and truncate text to avoid issues
    const cleanedText = cleanText(text);
    const truncatedText = cleanedText.length > 2000 ? cleanedText.substring(0, 2000) : cleanedText;
    
    const response = await fetch(EMBED_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: EMBED_MODEL,
        prompt: truncatedText
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    
    const data = await response.json();
    return data.embedding;
  } catch (error) {
    console.error('Error getting embedding:', error.message);
    throw error;
  }
}

// Split text into chunks
function splitIntoChunks(text, chunkSize) {
  // Simple chunking approach - split by size
  const chunks = [];
  const sanitizedText = cleanText(text);
  
  for (let i = 0; i < sanitizedText.length; i += chunkSize) {
    const chunk = sanitizedText.substring(i, i + chunkSize).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }
  
  return chunks;
}

// Process a single file
async function processFile(filePath, collection) {
  const fileName = path.basename(filePath);
  console.log(`\nProcessing file: ${fileName}`);
  
  try {
    // Read file content
    const content = fs.readFileSync(filePath, 'utf-8');
    console.log(`File size: ${content.length} characters`);
    
    // Split into chunks
    const chunks = splitIntoChunks(content, CHUNK_SIZE);
    console.log(`Split into ${chunks.length} chunks`);
    
    let successful = 0;
    let failed = 0;
    
    // Process each chunk
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      console.log(`Processing chunk ${i+1}/${chunks.length} (${chunk.length} chars)`);
      
      try {
        // Get embedding
        const embedding = await getEmbedding(chunk);
        console.log(`Got embedding with ${embedding.length} dimensions`);
        
        // Add to ChromaDB
        const id = `${fileName.replace('.txt', '')}_chunk_${i}`;
        await collection.add({
          ids: [id],
          embeddings: [embedding],
          metadatas: [{ source: fileName, chunk: i }],
          documents: [chunk]
        });
        
        console.log(`Successfully added chunk ${i+1}`);
        successful++;
        
        // Delay before next chunk
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      } catch (error) {
        console.error(`Error with chunk ${i+1}: ${error.message}`);
        failed++;
        
        // Longer delay after error
        await new Promise(resolve => setTimeout(resolve, DELAY_MS * 2));
      }
    }
    
    console.log(`\nCompleted processing ${fileName}: ${successful} successful, ${failed} failed`);
    return { successful, failed, total: chunks.length };
  } catch (error) {
    console.error(`Error processing file ${fileName}: ${error.message}`);
    return { successful: 0, failed: 0, total: 0 };
  }
}

// Main function
async function vectorizeFiles() {
  console.log('Starting fresh vectorization process...');
  
  try {
    // Connect to ChromaDB
    console.log('Connecting to ChromaDB at:', CHROMA_URL);
    const client = new ChromaClient({ path: CHROMA_URL });
    
    // Verify connection with heartbeat
    try {
      const heartbeat = await client.heartbeat();
      console.log('ChromaDB is responsive:', heartbeat);
    } catch (error) {
      console.error('ChromaDB heartbeat failed:', error.message);
      console.error('Please check if the ChromaDB container is running.');
      return;
    }
    
    // Create a new collection (since we know it doesn't exist yet)
    console.log(`Creating new collection: ${COLLECTION_NAME}`);
    const collection = await client.createCollection({
      name: COLLECTION_NAME,
      metadata: { "hnsw:space": "cosine" }
    });
    console.log('Collection created successfully');
    
    // Test the collection with a simple document
    console.log('Testing collection with a sample document...');
    try {
      const testText = "This is a test document for ChromaDB";
      const testEmbedding = await getEmbedding(testText);
      
      await collection.add({
        ids: ["test_document"],
        embeddings: [testEmbedding],
        metadatas: [{ source: "test" }],
        documents: [testText]
      });
      
      console.log('Test document added successfully');
      
      // Verify with a count
      const count = await collection.count();
      console.log(`Collection now has ${count} document(s)`);
    } catch (error) {
      console.error('Failed to add test document:', error.message);
      console.error('This indicates a problem with the ChromaDB configuration');
      return;
    }
    
    // Find files to process
    const bulletinPath = path.join(__dirname, '..', 'public', 'bulletin');
    
    if (!fs.existsSync(bulletinPath)) {
      console.error(`Directory not found: ${bulletinPath}`);
      return;
    }
    
    const files = fs.readdirSync(bulletinPath);
    const txtFiles = files.filter(file => file.endsWith('.txt'));
    
    console.log(`Found ${txtFiles.length} text files to process`);
    
    if (txtFiles.length === 0) {
      console.log('No text files found. Please add .txt files to the directory.');
      return;
    }
    
    // Process first file as a test
    const firstFile = txtFiles[0];
    const filePath = path.join(bulletinPath, firstFile);
    
    console.log(`\nProcessing first file as a test: ${firstFile}`);
    const result = await processFile(filePath, collection);
    
    console.log('\n=== First File Processing Summary ===');
    console.log(`Total chunks: ${result.total}`);
    console.log(`Successful: ${result.successful}`);
    console.log(`Failed: ${result.failed}`);
    
    // Ask whether to continue with all files
    if (result.successful > 0) {
      console.log('\nFirst file was processed successfully.');
      console.log('You can now modify this script to process all files by uncommenting the code below.');
      
      /*
      // Process all remaining files
      console.log('\nProcessing remaining files...');
      
      let totalProcessed = 1; // We already processed the first file
      let overallSuccessful = result.successful;
      let overallFailed = result.failed;
      
      for (let i = 1; i < txtFiles.length; i++) {
        const file = txtFiles[i];
        const filePath = path.join(bulletinPath, file);
        
        console.log(`\nProcessing file ${i+1}/${txtFiles.length}: ${file}`);
        const fileResult = await processFile(filePath, collection);
        
        overallSuccessful += fileResult.successful;
        overallFailed += fileResult.failed;
        totalProcessed++;
        
        console.log(`Overall progress: ${totalProcessed}/${txtFiles.length} files processed`);
        console.log(`${overallSuccessful} chunks successful, ${overallFailed} chunks failed`);
      }
      
      console.log('\n=== Vectorization Complete ===');
      console.log(`Processed ${totalProcessed} files`);
      console.log(`Total successful chunks: ${overallSuccessful}`);
      console.log(`Total failed chunks: ${overallFailed}`);
      */
    } else {
      console.log('\nFirst file processing failed. Please check the logs and fix any issues before processing more files.');
    }
    
  } catch (error) {
    console.error('Vectorization process failed:', error.message);
  }
}

// Run the process
vectorizeFiles().catch(error => {
  console.error('Script failed with error:', error);
});