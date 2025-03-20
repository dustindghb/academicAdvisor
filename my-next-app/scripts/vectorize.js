// semantic-vectorize.js
// Enhanced script for semantically vectorizing bulletin files
const { ChromaClient } = require('chromadb');
const fs = require('fs');
const path = require('path');

// Configuration
const CHROMA_URL = 'http://192.168.0.105:8000';
const EMBED_API_URL = 'http://192.168.0.105:11434/api/embeddings';
const COLLECTION_NAME = 'scu_bulletins';
const EMBED_MODEL = 'nomic-embed-text:latest';
const DELAY_MS = 150;
const CONCURRENT_FILES = 3;

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

// Extract metadata from chunk content
function extractMetadata(chunk, fileName) {
  // Initialize with default metadata
  const metadata = {
    source: fileName,
    chunk_type: 'general',
  };
  
  // Extract course code if present
  const courseCodeMatch = chunk.match(/\b([A-Z]{2,4})\s+(\d{1,3}[A-Z]?)\b/);
  if (courseCodeMatch) {
    metadata.course_code = courseCodeMatch[0];
    metadata.department_code = courseCodeMatch[1];
    metadata.course_number = courseCodeMatch[2];
  }
  
  // Extract course title if present
  const titleMatch = chunk.match(/(?::|^)\s*(.*?)\s*(?:\(|$)/);
  if (titleMatch && titleMatch[1].length > 0 && titleMatch[1].length < 100) {
    metadata.title = titleMatch[1].trim();
  }
  
  // Extract credits if present
  const creditsMatch = chunk.match(/\((\d+(?:\.\d+)?)\s*(?:units|credits)\)/i);
  if (creditsMatch) {
    metadata.credits = parseFloat(creditsMatch[1]);
  }
  
  // Check for prerequisites
  if (chunk.toLowerCase().includes('prerequisite')) {
    metadata.has_prerequisites = true;
  }
  
  return metadata;
}

// Split text into semantic chunks
function splitIntoSemanticChunks(text, fileName) {
  // Clean the text first
  const cleanedText = cleanText(text);
  
  // Define patterns for semantic boundaries
  const coursePattern = /\b[A-Z]{2,4}\s+\d{1,3}[A-Z]?\.?\s+[^.]+\.\s+/g;
  const sectionPattern = /(?:\n|\r\n)(?:[A-Z][a-z]+\s+)+(?:Requirements|Information|Policy|Courses|Program|Major|Minor|Concentration)/g;
  const bulletinPattern = /(?:\n|\r\n)[\s•\-*]+([A-Z])/g;
  
  // Combine patterns to find all potential split points
  const combinedPattern = new RegExp(`(${coursePattern.source}|${sectionPattern.source}|${bulletinPattern.source})`, 'g');
  
  // Split text at the identified points
  let chunks = [];
  let lastIndex = 0;
  let match;
  
  // Use the combined pattern to find split points
  const regex = new RegExp(combinedPattern);
  while ((match = regex.exec(cleanedText)) !== null) {
    // If we have a substantial amount of text since the last split
    if (match.index - lastIndex > 50) {
      const chunk = cleanedText.substring(lastIndex, match.index).trim();
      if (chunk.length > 0) {
        chunks.push(chunk);
      }
    }
    lastIndex = match.index;
  }
  
  // Add the final chunk
  if (lastIndex < cleanedText.length) {
    const finalChunk = cleanedText.substring(lastIndex).trim();
    if (finalChunk.length > 0) {
      chunks.push(finalChunk);
    }
  }
  
  // Filter out chunks that are too small and merge adjacent small chunks
  const minChunkSize = 100;
  const maxChunkSize = 2000;
  const processedChunks = [];
  let currentChunk = '';
  
  for (const chunk of chunks) {
    if (currentChunk.length + chunk.length <= maxChunkSize) {
      currentChunk += (currentChunk ? ' ' : '') + chunk;
    } else {
      if (currentChunk.length >= minChunkSize) {
        processedChunks.push(currentChunk);
      }
      currentChunk = chunk;
    }
  }
  
  if (currentChunk.length >= minChunkSize) {
    processedChunks.push(currentChunk);
  }
  
  // Create the final chunks with metadata
  return processedChunks.map(chunk => {
    return {
      text: chunk,
      metadata: extractMetadata(chunk, fileName)
    };
  });
}

// Process a single file
async function processFile(filePath, collection, fileIndex, totalFiles) {
  const fileName = path.basename(filePath);
  console.log(`Processing file ${fileIndex+1}/${totalFiles}: ${fileName}`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf-8');
    const semanticChunks = splitIntoSemanticChunks(content, fileName);
    
    let successful = 0;
    let failed = 0;
    
    for (let i = 0; i < semanticChunks.length; i++) {
      const { text, metadata } = semanticChunks[i];
      const id = `${fileName.replace('.txt', '')}_${i}`;
      
      try {
        const embedding = await getEmbedding(text);
        await collection.add({
          ids: [id],
          embeddings: [embedding],
          metadatas: [metadata],
          documents: [text]
        });
        
        process.stdout.write(".");
        successful++;
        await new Promise(resolve => setTimeout(resolve, DELAY_MS));
      } catch (error) {
        process.stdout.write("x");
        failed++;
        console.error(`\nChunk error: ${error.message.substring(0, 100)}...`);
      }
      
      // Minimal progress reporting
      if ((i + 1) % 20 === 0) {
        process.stdout.write(`[${i+1}/${semanticChunks.length}]`);
      }
    }
    
    console.log(`\nFile ${fileName}: ${successful}/${semanticChunks.length} chunks added`);
    return { successful, failed, totalChunks: semanticChunks.length };
  } catch (error) {
    console.error(`Error with file ${fileName}: ${error.message}`);
    return { successful: 0, failed: 0, totalChunks: 0 };
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
  console.log('Starting semantic vectorization...');
  
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
  let totalChunks = 0;
  
  for (let i = 0; i < txtFiles.length; i += CONCURRENT_FILES) {
    const fileBatch = txtFiles.slice(i, i + CONCURRENT_FILES);
    console.log(`\nProcessing batch ${Math.floor(i/CONCURRENT_FILES) + 1}/${Math.ceil(txtFiles.length/CONCURRENT_FILES)}`);
    
    const results = await processFileBatch(fileBatch, collection, i, txtFiles.length);
    
    results.forEach(result => {
      totalSuccessful += result.successful;
      totalFailed += result.failed;
      totalChunks += result.totalChunks;
    });
    
    console.log(`Overall: ${totalSuccessful}/${totalChunks} chunks successful (${Math.round((i + fileBatch.length)/txtFiles.length*100)}% files complete)`);
  }
  
  console.log(`\nVectorization complete: ${totalSuccessful}/${totalChunks} chunks added, ${totalFailed} failed`);
  
  // Print metadata statistics
  console.log('\nRunning query to check metadata extraction quality...');
  try {
    const sampleQuery = await collection.query({
      queryTexts: ["course information"],
      nResults: 5
    });
    
    console.log('Sample document metadata:');
    if (sampleQuery.metadatas && sampleQuery.metadatas[0]) {
      sampleQuery.metadatas[0].forEach((metadata, i) => {
        console.log(`\nDocument ${i+1}:`);
        Object.entries(metadata).forEach(([key, value]) => {
          console.log(`  ${key}: ${value}`);
        });
      });
    }
  } catch (error) {
    console.error('Error running sample query:', error.message);
  }
}

// Run the process
vectorizeFiles().catch(error => {
  console.error('Error:', error.message);
});