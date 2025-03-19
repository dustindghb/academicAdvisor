// simplified-vectorize.js
const { ChromaClient } = require('chromadb');
const fs = require('fs');
const path = require('path');

// Configuration for remote services
const CHROMA_URL = 'http://192.168.0.105:8000'; // Your remote ChromaDB IP
const EMBED_API_URL = 'http://192.168.0.105:11434/api/embeddings'; // Ollama API on the same machine
const COLLECTION_NAME = 'scu_bulletins_test'; // Using a new test collection to avoid conflicts
const EMBED_MODEL = 'nomic-embed-text:latest';
const CHUNK_SIZE = 500;

// Function to get embeddings from remote Ollama service
async function getEmbedding(text) {
  const response = await fetch(EMBED_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: EMBED_MODEL,
      prompt: text
    }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
  }
  
  const data = await response.json();
  return data.embedding;
}

// Function to create a small sample document for testing
async function vectorizeSample() {
  console.log('Starting simplified vectorization process...');
  
  // Connect to ChromaDB
  console.log('Connecting to ChromaDB at:', CHROMA_URL);
  const client = new ChromaClient({
    path: CHROMA_URL
  });
  
  // Delete the test collection if it exists (to ensure clean test)
  try {
    await client.deleteCollection({ name: COLLECTION_NAME });
    console.log(`Deleted existing test collection: ${COLLECTION_NAME}`);
  } catch (error) {
    console.log(`No existing test collection found: ${COLLECTION_NAME}`);
  }
  
  // Create a new test collection
  console.log('Creating new test collection...');
  const collection = await client.createCollection({
    name: COLLECTION_NAME,
    metadata: { "hnsw:space": "cosine" }
  });
  console.log(`Created new test collection: ${COLLECTION_NAME}`);
  
  // Create test documents
  const testDocuments = [
    "Introduction to Computer Science is a foundational course for all computing disciplines.",
    "Artificial Intelligence and Machine Learning are transforming many industries.",
    "Web Development with JavaScript and React is popular for creating modern web applications.",
    "Algorithms and Data Structures are essential knowledge for programmers."
  ];
  
  // Process each test document
  for (let i = 0; i < testDocuments.length; i++) {
    const doc = testDocuments[i];
    console.log(`\nProcessing test document ${i+1}/${testDocuments.length}`);
    console.log(`Text: "${doc}"`);
    
    try {
      console.log('Getting embedding...');
      const embedding = await getEmbedding(doc);
      console.log(`Successfully got embedding with ${embedding.length} dimensions`);
      
      // Add to ChromaDB
      console.log('Adding to ChromaDB...');
      await collection.add({
        ids: [`test_doc_${i}`],
        embeddings: [embedding],
        metadatas: [{ source: "test" }],
        documents: [doc]
      });
      
      console.log('Successfully added document to ChromaDB');
    } catch (error) {
      console.error(`Error processing document: ${error.message}`);
    }
    
    // Add a delay between documents
    if (i < testDocuments.length - 1) {
      console.log('Waiting 2 seconds before next document...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
  
  // Try a query to verify everything is working
  try {
    console.log('\nTesting query functionality...');
    const queryText = "computer programming";
    console.log(`Query text: "${queryText}"`);
    
    const queryEmbedding = await getEmbedding(queryText);
    console.log('Successfully got query embedding');
    
    const results = await collection.query({
      queryEmbeddings: [queryEmbedding],
      nResults: 2
    });
    
    console.log('Query results:');
    console.log(JSON.stringify(results, null, 2));
    
    return true;
  } catch (error) {
    console.error(`Error in query test: ${error.message}`);
    return false;
  }
}

// Function to process a single file
async function processFile(filePath, collection) {
  console.log(`\nProcessing file: ${path.basename(filePath)}`);
  
  // Read the file
  const content = fs.readFileSync(filePath, 'utf-8');
  console.log(`File size: ${content.length} characters`);
  
  // Split into chunks (simple approach)
  const chunks = [];
  for (let i = 0; i < content.length; i += CHUNK_SIZE) {
    const chunk = content.substring(i, i + CHUNK_SIZE);
    if (chunk.trim().length > 0) {
      chunks.push(chunk);
    }
  }
  
  console.log(`Split into ${chunks.length} chunks`);
  
  // Process a limited number of chunks for testing
  const MAX_CHUNKS = 5;
  const chunksToProcess = chunks.slice(0, MAX_CHUNKS);
  
  console.log(`Processing first ${chunksToProcess.length} chunks for testing...`);
  
  for (let i = 0; i < chunksToProcess.length; i++) {
    const chunk = chunksToProcess[i];
    console.log(`\nProcessing chunk ${i+1}/${chunksToProcess.length} (${chunk.length} chars)`);
    
    try {
      // Get embedding
      console.log('Getting embedding...');
      const embedding = await getEmbedding(chunk);
      console.log(`Successfully got embedding with ${embedding.length} dimensions`);
      
      // Add to ChromaDB
      const id = `${path.basename(filePath).replace('.txt', '')}_chunk_${i}`;
      console.log(`Adding to ChromaDB with ID: ${id}`);
      
      await collection.add({
        ids: [id],
        embeddings: [embedding],
        metadatas: [{ source: path.basename(filePath) }],
        documents: [chunk]
      });
      
      console.log('Successfully added chunk to ChromaDB');
    } catch (error) {
      console.error(`Error processing chunk: ${error.message}`);
      console.error('Full error:', error);
    }
    
    // Add a delay between chunks
    if (i < chunksToProcess.length - 1) {
      console.log('Waiting 2 seconds before next chunk...');
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

// Main function
async function main() {
  // First, test with sample documents
  const sampleSuccess = await vectorizeSample();
  
  if (!sampleSuccess) {
    console.error('Sample vectorization failed. Not proceeding with file processing.');
    return;
  }
  
  console.log('\n=== Sample vectorization successful! ===');
  console.log('Now trying with a real file...');
  
  // Connect to ChromaDB again
  const client = new ChromaClient({
    path: CHROMA_URL
  });
  
  // Create or get the real collection
  let realCollection;
  try {
    realCollection = await client.getCollection({
      name: COLLECTION_NAME
    });
    console.log(`Using existing collection: ${COLLECTION_NAME}`);
  } catch (error) {
    console.log(`Collection not found: ${COLLECTION_NAME}`);
    console.log('Creating new collection...');
    realCollection = await client.createCollection({
      name: COLLECTION_NAME
    });
    console.log(`Created new collection: ${COLLECTION_NAME}`);
  }
  
  // Find a real file to process
  const bulletinPath = path.join(__dirname, '..', 'public', 'bulletin');
  
  if (!fs.existsSync(bulletinPath)) {
    console.error(`Directory not found: ${bulletinPath}`);
    return;
  }
  
  const files = fs.readdirSync(bulletinPath);
  const txtFiles = files.filter(file => file.endsWith('.txt'));
  
  if (txtFiles.length === 0) {
    console.error('No .txt files found in bulletin directory');
    return;
  }
  
  // Process the first file
  const firstFile = txtFiles[0];
  const filePath = path.join(bulletinPath, firstFile);
  
  await processFile(filePath, realCollection);
  
  console.log('\n=== Processing complete! ===');
}

main().catch(error => {
  console.error('Script failed with error:', error);
});